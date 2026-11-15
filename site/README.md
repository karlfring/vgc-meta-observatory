# Site privé

Le site sert le tableau de bord de VGC Meta Overview, calculateur compris, derrière une connexion. Il n'y a pas
d'inscription : les comptes sont créés à la main, pour un cercle d'amis. Le serveur est écrit en Rust (Axum), tient
dans un seul binaire et tourne sur Google Cloud Run, où il s'éteint quand personne ne s'en sert.

## Fonctionnement

| Élément | Rôle |
|---|---|
| `page/index.html` | la page du tableau de bord, le même fichier que dans le tableau de bord Claude |
| `static/dash-shim.js` | remplace l'API du tableau de bord Claude (`dash.data`, `dash.calc`, `dash.params`...) |
| `static/theme.css` | couleurs, polices et espacements attendus par la page, en clair et en sombre |
| `static/` | d3, sprites des Pokémon ; le moteur du calculateur vient de `calculateur/dist/` |
| `src/` | le serveur : connexion, sessions, comptes, fichiers, en-têtes de sécurité |

Au démarrage, le serveur charge tout en mémoire : la page, les scripts, les données du mois (`data/dashboard/`) et
celles du calculateur. Il assemble la page une fois : chaque script en ligne est exécuté dans sa propre portée,
comme dans le tableau de bord d'origine, et autorisé par son empreinte dans la Content-Security-Policy. Le Pokémon,
le palier et l'onglet choisis s'inscrivent dans l'adresse : un lien partagé à un ami ouvre la même vue.

**Sécurité**
- Tout est derrière la connexion (page, données, scripts), sauf la page de connexion et sa feuille de style.
- Mots de passe hachés en Argon2id. Après 10 essais ratés en 15 minutes, une adresse doit attendre, et le site
  entier se bloque au-delà de 100 échecs.
- La session tient dans un cookie chiffré et authentifié (AES-256-GCM, `HttpOnly`, `Secure`, `SameSite=Lax`), valable
  30 jours et renouvelé quand l'ami revient. Il n'y a pas de base de données : Cloud Run peut éteindre ou relancer
  le serveur sans déconnecter personne.
- En-têtes stricts : Content-Security-Policy sans `unsafe-eval`, HSTS, `noindex`, interdiction d'intégrer le site
  dans une autre page.

**Configuration**, lue dans l'environnement :

| Variable | Contenu |
|---|---|
| `VGC_SESSION_KEY` | clé des cookies, 32 caractères au moins ; la changer déconnecte tout le monde |
| `VGC_USERS` | une ligne `pseudo:empreinte` par compte |
| `VGC_ADMIN` | pseudo(s) qui ont accès à la page Comptes |
| `PORT` | port d'écoute, fourni par Cloud Run (8080 par défaut) |
| `VGC_DEV` | `1` pour accepter les cookies en HTTP, en local seulement |

## Mise en ligne, une seule fois

1. **Un projet Google Cloud avec la facturation activée.** Cloud Run l'exige, mais à l'échelle de quelques amis le
   service reste dans sa gratuité (2 millions de requêtes, 180 000 vCPU-secondes et 360 000 Gio-secondes par mois).
   Une alerte de budget à 1 € dans la console permet de dormir tranquille.
2. **Préparer le projet** dans Cloud Shell (le terminal intégré à la console Google Cloud) :
   ```bash
   git clone https://github.com/karlfring/vgc-meta-observatory && cd vgc-meta-observatory
   bash site/deploy/setup-gcp.sh <id-du-projet>
   ```
   Le script active les APIs, crée le dépôt d'images, deux comptes de service et la fédération d'identité qui
   permet à GitHub Actions de déployer sans clé stockée. Il affiche les deux variables à créer ensuite.
3. **Dans GitHub**, Settings, Secrets and variables, Actions :
   - onglet *Variables* : `GCP_PROJECT_ID` et `GCP_PROJECT_NUMBER` (affichés par le script), `VGC_ADMIN` (ton
     pseudo) et `VGC_USERS` (vide au départ) ;
   - onglet *Secrets* : `VGC_SESSION_KEY`, une longue chaîne aléatoire (un générateur de mots de passe convient), et
     `VGC_ADMIN_PASSWORD`, ton mot de passe, 10 caractères au moins. Le déploiement le transforme en empreinte : il
     n'apparaît jamais en clair sur le serveur.
4. **Onglet Actions, workflow Site, Run workflow.** L'adresse du site s'affiche dans le résumé du déploiement.

Ensuite, le site se redéploie seul : après l'ingestion du 2 de chaque mois, et à chaque modification du site, du
calculateur ou des données poussée sur `main`.

## Ajouter un ami

1. Sur le site, lien **Comptes** (visible des administrateurs) : choisis son pseudo et un mot de passe.
2. Copie la ligne affichée dans la variable `VGC_USERS`, une ligne par compte.
3. Relance le workflow Site, puis transmets le mot de passe à ton ami par un canal privé.

Pour changer un mot de passe, remplace la ligne du compte ; pour couper un accès, supprime-la ; dans les deux cas,
relance le workflow. Les pseudos et les empreintes restent dans les variables du dépôt, jamais dans le code ni dans
les journaux publics de GitHub Actions.

L'illustration d'en-tête, commandée à @walkozuki, n'est pas dans le dépôt public. Pour l'afficher sur le site, ajoute
le secret `VGC_ART_WEBP` : l'image au format WebP encodée en base64 (`base64 -w0 illustration.webp`).

## Travailler en local

```bash
cd site
cargo test                                  # 16 tests : comptes, sessions, limite d'essais, page, routes
export VGC_DEV=1 VGC_ADMIN=karl
export VGC_SESSION_KEY="$(cargo run -q -- new-key)"
export VGC_USERS="$(cargo run -q -- hash-password karl)"   # demande un mot de passe
cargo run --release                         # http://localhost:8080
```

Autres commandes : `vgc-site check` vérifie configuration, comptes et fichiers sans lancer le serveur ;
`vgc-site hash-password --stdin <pseudo>` lit le mot de passe sur l'entrée standard.

## Mises à jour

- **Données** : automatiques, après l'ingestion mensuelle.
- **Page** : modifier `page/index.html` puis pousser sur `main`. Le même fichier se publie dans le tableau de bord
  Claude, pour que les deux versions restent identiques.
- **Calculateur** : `calculateur/rebuild.sh`, puis pousser `calculateur/dist/`.
