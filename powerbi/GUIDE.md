# Montage du modèle Power BI

Guide de mise en place, de l'import des CSV à la construction des pages.
Compte une heure pour les étapes 1 à 5, qui sont mécaniques, puis une à deux
heures pour les pages.

---

## Étape 0. Prérequis

- **Power BI Desktop**, gratuit, sous Windows (Microsoft Store ou site de
  Microsoft).
- **Rien à installer côté données** : le workflow GitHub Actions publie les CSV
  chaque mois dans `data/processed/`, et Power BI les lit directement sur
  GitHub. Python n'est utile que pour travailler hors ligne (`python src/ingest.py`).

---

## Étape 1. Charger les données depuis GitHub

Toutes les requêtes sont dans [`requetes.pq`](requetes.pq). Elles typent les
colonnes en culture **en-US** : le point des CSV (`55.69655`) est lu comme
séparateur décimal même si ton Power BI est en français. C'était le piège
principal de l'import manuel, il est réglé dans le code.

1. `Accueil > Transformer les données` pour ouvrir Power Query.
2. `Accueil > Gérer les paramètres > Nouveau paramètre` : nom `UrlDonnees`,
   type **Texte**, valeur
   `https://raw.githubusercontent.com/karlfring/vgc-meta-observatory/main/data/processed/`.
3. Pour chaque autre bloc de `requetes.pq`, dans l'ordre :
   `Accueil > Nouvelle source > Requête vide`, puis `Éditeur avancé`, colle le
   bloc, valide, et renomme la requête avec le nom indiqué en commentaire
   (`fnChargerCsv`, `dim_pokemon`, `fact_usage`...).
4. À la première requête, Power BI demande comment se connecter à
   `raw.githubusercontent.com` : choisis **Anonyme**.
5. `Fermer et appliquer`.

Tu obtiens 13 tables : les 9 fichiers du pipeline, deux copies de
`dim_pokemon` (`dim_pokemon_partenaire` et `dim_pokemon_adverse`, une seule
relation active étant permise entre deux tables), `fact_spread` et la
fonction de chargement.

**Contrôle rapide** : dans `fact_usage`, filtre `palier = 1500`. Rillaboom doit
afficher `usage_pct = 54,73` et `raw_count = 229704`.

---

## Étape 2. La table des spreads

`fact_spread` est dérivée de `fact_moveset` dans Power Query : une ligne par
spread détaillé par Smogon, avec les six statistiques en colonnes.
`Adamant:32/32/0/0/2/0` devient nature `Adamant`, `pv` 32, `attaque` 32,
`defense` 0, `atq_spe` 0, `def_spe` 2, `vitesse` 0.

Smogon ne détaille que six spreads par Pokémon et par palier ; le reste est
regroupé sous « Other ». La mesure `Autres répartitions` affiche cette part,
pour ne jamais présenter les spreads listés comme l'ensemble des joueurs.

---

## Étape 3. Construire les relations

Vue Modèle. Power BI en détecte une partie tout seul : vérifie-les et complète
pour obtenir ces vingt-quatre relations, toutes en **un vers plusieurs**, sens
de filtrage **simple** (de la dimension vers le fait).

| Depuis | Vers | Clé |
|---|---|---|
| `dim_pokemon` | `fact_usage` | `pokemon` |
| `dim_pokemon` | `fact_moveset` | `pokemon` |
| `dim_pokemon` | `fact_teammate` | `pokemon` |
| `dim_pokemon_partenaire` | `fact_teammate` | `pokemon` → `pokemon_partenaire` |
| `dim_date` | `fact_usage` | `date_snapshot` |
| `dim_date` | `fact_moveset` | `date_snapshot` |
| `dim_date` | `fact_teammate` | `date_snapshot` |
| `dim_date` | `fact_snapshot` | `date_snapshot` |
| `dim_regulation` | `fact_usage` | `regulation` |
| `dim_regulation` | `fact_moveset` | `regulation` |
| `dim_regulation` | `fact_teammate` | `regulation` |
| `dim_rating_bracket` | `fact_usage` | `palier` |
| `dim_rating_bracket` | `fact_moveset` | `palier` |
| `dim_rating_bracket` | `fact_teammate` | `palier` |
| `dim_rating_bracket` | `fact_snapshot` | `palier` |
| `dim_pokemon` | `fact_counter` | `pokemon` |
| `dim_pokemon_adverse` | `fact_counter` | `pokemon` → `pokemon_adverse` |
| `dim_date` | `fact_counter` | `date_snapshot` |
| `dim_regulation` | `fact_counter` | `regulation` |
| `dim_rating_bracket` | `fact_counter` | `palier` |
| `dim_pokemon` | `fact_spread` | `pokemon` |
| `dim_date` | `fact_spread` | `date_snapshot` |
| `dim_regulation` | `fact_spread` | `regulation` |
| `dim_rating_bracket` | `fact_spread` | `palier` |

Ne marque pas `dim_date` comme table de dates : les instantanés sont
mensuels, donc non contigus, et les évolutions se calculent avec
`snapshot_index` plutôt qu'avec la time intelligence (voir l'étape 5).

---

## Étape 4. Créer les mesures

Crée une table dédiée pour les regrouper : `Accueil > Entrer des données`,
nomme-la `_Mesures`, valide sans rien saisir. Supprime ensuite la colonne
vide générée.

Ouvre `mesures.dax` et copie les mesures une par une
(`Accueil > Nouvelle mesure`). Elles sont regroupées en neuf sections,
commence par la section 1 qui alimente tout le reste.

Une seule exception : `Quadrant (dernier snapshot)` est une **colonne
calculée**, pas une mesure. Sélectionne `dim_pokemon` puis
`Nouvelle colonne`. Le fichier le signale à l'endroit concerné.

Formate au passage :
- `Usage %`, `Usage % élite`, `Usage % ladder`, `Usage % référence`,
  `Adoption %`, `Affinité %`, `Part du top 10`, `Part des équipes (spread)`,
  `Autres répartitions`, `Part de la nature` : pourcentage, 1 ou 2 décimales
- `Ratio adoption élite` : nombre décimal, 2 décimales
- `Points moyens ...` : nombre décimal, 1 décimale
- `Delta usage (pts)`, `Écart élite / ladder` : pourcentage, 2 décimales
- `HHI`, `Rang`, `Apparitions`, `Batailles du mois` : nombre entier

---

## Étape 5. Point d'attention sur les mesures d'évolution

Les mesures de la section 2 (`Delta usage`, `Rang N-1`, `Tendance`)
s'appuient sur `snapshot_index`, qui repart à 1 à chaque régulation.

**Elles exigent donc qu'une seule régulation soit sélectionnée.** Un garde-fou
`HASONEVALUE` est intégré : si plusieurs régulations sont actives, la mesure
renvoie vide plutôt qu'un chiffre faux.

Place un segment `dim_regulation[regulation]` sur chaque page utilisant ces
mesures, et fixe-le sur la régulation courante.

---

## Étape 6. Construire les pages

### Page 1 : Photo du métagame

L'état actuel, en un coup d'œil.

- **Bandeau de cartes** : `Batailles du mois`, `HHI`,
  `Pokémon au-dessus de 5%`, `Part du top 10`, `Date du dernier snapshot`
- **Graphique à barres horizontales** : top 25 par `Usage %`, avec
  `Delta usage (pts)` en mise en forme conditionnelle
- **Nuage de points** (le visuel central, mêmes règles que le tableau de bord
  et que `docs/methode-quadrants.md`) :
  - détails : `dim_pokemon[pokemon]`
  - axe X : `Usage % référence` (palier 1500), **échelle logarithmique**
  - axe Y : `Ratio adoption élite` (usage 1760 ÷ usage 0), **échelle
    logarithmique**
  - légende : `dim_pokemon[Quadrant (dernier snapshot)]`, la **colonne
    calculée**, car Power BI n'accepte pas une mesure en légende
  - infobulle : `Usage % ladder`, `Usage % élite`, et la mesure `Quadrant`
  - filtre du visuel : `Usage % référence` supérieur ou égal à 1 %
  - deux lignes de référence (volet Analyse) : constante X à **0,10**,
    constante Y à **1**
- **Segments** : régulation et date. Pas de segment de palier sur cette page :
  les mesures du nuage fixent elles-mêmes leurs paliers.

Le nuage de points est ce qui porte ton positionnement : il ne décrit pas,
il classe. Contrôle : tu dois retrouver 14 staples, 15 pépites, 5 pièges et
29 niches en septembre 2026.

### Page 2 : Évolution

La page qui justifie l'existence du projet, puisque aucune source publique
ne la propose.

- **Courbes** : `Usage %` par `date_snapshot`, légende `pokemon`, filtrée
  sur le top 8 via un filtre de type N premiers
- **Table des mouvements** : `pokemon`, `Rang`, `Delta rang`,
  `Usage %`, `Delta usage (pts)`, `Tendance`, triée par `Delta usage (pts)`
  décroissant
- **Deux cartes** : plus forte hausse et plus forte baisse du mois
- **Courbe du HHI** dans le temps, qui raconte si le format se verrouille

### Page 3 : Cores et archétypes

- **Matrice** : lignes `dim_pokemon[pokemon]`, colonnes
  `dim_pokemon_partenaire[pokemon]`, valeurs `Affinité %`, avec mise en forme
  conditionnelle en nuances de couleur
- **Table des associations fortes** : filtrée sur `Lift d'association > 1.5`,
  triée par `Affinité %` décroissante
- **Détail d'un Pokémon** : sélectionne-en un, affiche ses objets, capacités
  et talents via `Adoption %` avec un segment sur `attribut_type`
- **Menaces** (M-C uniquement) : pour le Pokémon sélectionné, table
  `dim_pokemon_adverse[pokemon]`, `Score de matchup`, `Taux de KO`,
  `Taux de switch forcé`, triée par score décroissant

### Page 4 : Fiche Pokémon et spreads

L'équivalent de la fiche du tableau de bord, avec un vrai filtre par palier.

- **Segments** : `dim_pokemon[pokemon]` (sélection unique) et
  `dim_rating_bracket[libelle]` (sélection unique)
- **Cartes** : `Usage %`, `Rang`, `Viability ceiling`, `Part des équipes
  (spread)` renommée « Couverture des spreads »
- **Barres** : `fact_spread[nature]` par `Part de la nature`
- **Barres groupées** : les six `Points moyens ...` ; pour comparer deux
  paliers, duplique le visuel et fixe le palier dans son volet de filtres
- **Table des spreads** : `nature`, `pv`, `attaque`, `defense`, `atq_spe`,
  `def_spe`, `vitesse` (sans agrégation : `Ne pas résumer`) et
  `Part des équipes (spread)`, triée par part décroissante, avec une mise en
  forme conditionnelle en nuances sur les six colonnes de statistiques
- **Carte** : `Autres répartitions`, la part regroupée par Smogon
- **Menaces** : déplace ici la table des menaces de la page 3 si tu préfères
  regrouper tout ce qui concerne un Pokémon

Contrôle : Rillaboom au palier 1500 doit afficher 6 spreads, le premier étant
`Adamant 32/32/0/0/2/0` à 2,47 %, et `Autres répartitions` à 88,3 %.

### Page 5 : Qualité des données

Une page discrète mais qui te distingue nettement.

- Table de `fact_snapshot` : date, mois source, palier, genre, nombre de
  batailles, `Fiabilité du snapshot`
- Carte `Nb fichiers ingérés`

C'est la page à montrer en entretien quand on te demande comment tu t'assures
que tes chiffres sont justes.

---

## Note importante sur la performance

Les statistiques de ladder Smogon ne contiennent **pas de taux de victoire**
par Pokémon. Elles fournissent l'usage, les comptes bruts et réels, et le
`viability_ceiling` (classement le plus élevé atteint avec ce Pokémon).

L'axe de performance du tableau de bord repose donc sur **l'écart élite /
ladder**, qui mesure l'adoption par les meilleurs joueurs. C'est un proxy
solide et il a un avantage : il se transpose directement en langage métier
(adoption précoce, early adopters).

Le vrai taux de victoire et le taux de conversion en top cut viendront des
données de tournois (Limitless), qui constituent l'itération suivante du
projet.

---

## Chaque mois

Le 2 du mois (ou automatiquement via GitHub Actions) :

```bash
python src/ingest.py
```

Rien à faire côté données : le workflow GitHub Actions ingère le nouveau mois
le 2 et le commite. Il suffit de cliquer sur `Actualiser` dans Power BI, qui
relit les CSV sur GitHub ; le modèle absorbe le snapshot sans modification.

| Données du mois | Publiées par Smogon | Snapshot n° |
|---|---|---|
| Septembre 2026 | 1er octobre (disponible) | 1 |
| Octobre 2026 | 1er novembre | 2 |
| Novembre 2026 | 1er décembre | 3 |
| Décembre 2026 | 1er janvier 2027 | 4 |

Les mesures d'évolution (section 2) commencent à produire des valeurs à
partir du snapshot n° 2, début novembre.
