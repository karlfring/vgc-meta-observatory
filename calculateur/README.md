# Calculateur de dégâts

L'onglet Calculateur du tableau de bord VGC Meta Overview calcule les dégâts d'un duel en direct, avec le moteur
du [Nimbasa City Post VGC Damage Calculator](https://github.com/nerd-of-now/NCP-VGC-Damage-Calculator) (NCP) en
mode Champions. Chaque Pokémon y arrive avec son set le plus joué du dernier mois. Ce dossier contient de quoi
reconstruire ce moteur, le vérifier contre la page d'origine et le mettre à jour.

## Principe

NCP est une page web : ses formules lisent le formulaire de la page à travers jQuery. Pour les faire tourner
dans le tableau de bord, le moteur est repris tel quel et entouré de trois pièces, sans qu'aucune formule ne
soit réécrite.

| Fichier | Rôle |
|---|---|
| `build/shim.js` | remplace jQuery : le moteur n'y lit que quelques cases à cocher (Fairy Aura, talents « of Ruin »...) |
| `build/adapter.js` | construit les objets Pokémon et Terrain comme la page d'origine, champ par champ |
| `build/build_engine.js` | assemble moteur, remplaçant et adaptateur dans un seul fichier, `dist/calc-moteur.js` |

Le moteur repris : `damage_MASTER.js`, `damage_SV.js`, `ko_chance.js`, les fonctions d'`item_data.js`, et
`calcUserHP` et `userHPResultText` d'`ap_calc.js` (recul et soin). Les données du mode Champions (Pokédex,
capacités, objets, talents, natures, table des types) sont extraites par `build/extract_data.js` dans
`dist/champions_data.json`, avec le commit de NCP dont elles viennent.

Le code d'origine affecte une vingtaine de variables sans les déclarer. `build_engine.js` les repère par analyse
de portée (`build/implicit_globals.js`) et les déclare dans l'enveloppe du moteur : aucune variable globale n'est
créée et le moteur tourne aussi en mode strict. Une nouvelle version de NCP est prise en charge sans retouche.

## Vérification

`verify/` lance les mêmes duels dans la page d'origine (Chromium sans affichage et sans réseau, où chaque Pokémon
est chargé comme un set puis réglé dans le formulaire) et dans le moteur empaqueté. Pour chacune des huit attaques
d'un duel sont comparés les 16 jets de dégâts, la chance de K.O., la description et le texte de recul ou de soin ;
pour chaque Pokémon, ses PV, statistiques, objet, talent, statut et capacités.

| Jeu de duels | Contenu | Duels |
|---|---|---|
| `make_matchups.py` | top 24 des sets du dernier mois, chacun contre les trois suivants, et 17 scénarios : météo, champs, protections, boosts, statuts, PV bas, critiques | 83 |
| `make_random.py` | Pokémon, terrain et états tirés au hasard (graine fixe) | 320 |
| `make_settings.py` | réglages de l'onglet : poison grave, Supreme Overlord, nombre de coups, puissance doublée, Rage Fist, Last Respects, recul et soin | 61 |

Résultat pour la version en ligne (NCP, commit a2e408c du 24 octobre 2026) : **3 712 attaques comparées,
0 écart**. Deux différences sont tolérées car elles ne viennent pas du calcul (détail dans `verify/compare.py`) :
l'état d'une case masquée que la page d'origine garde d'un duel à l'autre, et les chances de K.O. qu'elle remplace
par un lien humoristique pour les capacités OHKO comme Sheer Cold. Le moteur est aussi exécuté en mode strict
(`verify/strict_check.js`), et un test de mutation (une formule de PV décalée d'un point) fait apparaître 629 écarts
sur 664 attaques : la comparaison détecte bien une erreur de calcul.

Les résultats de la page d'origine sont gardés dans `tests/reference/`. Les tests de non-régression
(`tests/test_engine.py`) comparent le moteur à ces références sans avoir besoin de NCP ni d'un navigateur. Ils sont
à part des tests du pipeline, pour qu'un souci du calculateur ne bloque jamais l'ingestion mensuelle.

## Commandes

```bash
cd calculateur
npm install                        # espree, eslint-scope et Playwright
npx playwright install chromium    # navigateur des comparaisons avec la page d'origine

./rebuild.sh <clone de NCP-VGC-Damage-Calculator>   # reconstruit dist/ et le vérifie, en 40 secondes environ

cd .. && python -m pytest calculateur/tests -q       # non-régression, Node.js suffit
```

## Mettre à jour après une nouvelle version de NCP

1. Cloner ou mettre à jour NCP : `git clone https://github.com/nerd-of-now/NCP-VGC-Damage-Calculator`.
2. Lancer `calculateur/rebuild.sh <clone>`. Le script extrait les données, assemble le moteur, génère les duels
   à partir des sets du dernier mois, les compare à la page d'origine, vérifie le mode strict et met à jour les
   références des tests. Il s'arrête au premier écart : `dist/` n'est alors pas à publier.
3. Commiter `dist/` et `tests/reference/`, puis publier dans le tableau de bord.

## Publier dans le tableau de bord

Le tableau de bord lit deux fichiers :

- `dist/champions_data.json`, jeu de données `calculateur` : le fichier est déposé dans les ressources du tableau de
  bord, et son adresse (`/_blob/...`) reportée dans le champ `source.url` du jeu de données, avec le nouveau commit
  dans sa description ;
- `dist/calc-moteur.js`, document `files/calc-moteur.js` (champ `text`), chargé par la page avec
  `<script src="calc-moteur.js">`.

L'interface de l'onglet (menus, sets préremplis, verdict en français, barre de rappel) est dans la page du tableau
de bord. Elle n'appelle le moteur qu'à travers `window.NCP_CALC.run(a, b, terrain)` et ne dépend pas de la version
de NCP.

## Limites

- Mode Champions seulement : ni Téracristal, ni Dynamax, ni capacités Z, absents du jeu.
- Les objets proposés sont ceux que NCP retient pour le mode Champions.
- L'ordre d'action affiché compare la Vitesse effective : priorité et Trick Room ne sont pas pris en compte.
- Le moteur gère les pièges (Stealth Rock, Spikes) et Leech Seed, mais l'onglet ne les propose pas encore.
- Un Pokémon qui apparaît chez Smogon avant d'exister dans NCP est absent de la liste jusqu'à la mise à jour.

## Crédits et licence

Moteur et données : Nimbasa City Post VGC Damage Calculator, © 2013-2021 Honko, Tapin, Firestorm, Jake White
(squirrelboyVGC), nerd-of-now et autres contributeurs, sous licence MIT (`LICENSE-NCP`, reprise aussi en tête de
`dist/calc-moteur.js`). Le reste de ce dossier suit la licence MIT du dépôt.
