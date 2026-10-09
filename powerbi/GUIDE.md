# Montage du modèle Power BI

Guide de mise en place, de l'import des CSV à la construction des pages.
Compte une heure pour les étapes 1 à 5, qui sont mécaniques.

---

## Étape 0. Produire les données

Le projet suit uniquement la régulation M-C. Les statistiques de septembre
sont publiées depuis le 1er octobre :

```bash
python src/ingest.py
```

Tu obtiens neuf fichiers dans `data/processed/`.

---

## Étape 1. Importer les CSV

`Accueil > Obtenir les données > Texte/CSV`, puis répète pour les huit fichiers.

> **Le piège à ne pas manquer.** Les CSV sont écrits par pandas avec le point
> comme séparateur décimal (`55.69655`). Si ton Power BI est en locale française,
> il interprétera le point comme séparateur de milliers et transformera
> `55.69655` en `5569655`. Tous tes pourcentages seront faux, sans message
> d'erreur.
>
> Pour l'éviter : dans l'éditeur Power Query, sélectionne les colonnes
> numériques, puis `Transformer > Type de données > Utiliser les paramètres
> régionaux`, et choisis **Anglais (États-Unis)**.
>
> Vérifie après import que `usage_pct` du premier Pokémon est bien un nombre
> entre 0 et 100.

Colonnes concernées : `usage_pct`, `raw_pct`, `real_pct`, `pct`,
`teammate_pct`, `avg_weight_team`.

Pour les colonnes de date (`date_snapshot`, `date_debut`, `date_fin`), même
logique : type Date avec les paramètres régionaux anglais, le format source
étant ISO (`2026-06-30`).

---

## Étape 2. Créer la table des partenaires

`fact_teammate` doit être reliée deux fois à `dim_pokemon` : une fois par
`pokemon`, une fois par `pokemon_partenaire`. Power BI n'accepte qu'une seule
relation active entre deux tables, il faut donc une copie de la dimension.

Dans l'éditeur Power Query, clic droit sur `dim_pokemon` >
**Dupliquer** > renomme la copie `dim_pokemon_partenaire`.

Même opération une seconde fois pour `dim_pokemon_adverse`, utilisée par
`fact_counter` (table apparue avec la régulation M-C).

Puis `Fermer et appliquer`.

---

## Étape 3. Construire les relations

Vue Modèle. Crée ces vingt relations, toutes en **un vers plusieurs**, sens de
filtrage **simple** (de la dimension vers le fait).

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

Enfin, sélectionne `dim_date` puis `Outils de table > Marquer comme table de
dates`, colonne `date_snapshot`.

---

## Étape 4. Créer les mesures

Crée une table dédiée pour les regrouper : `Accueil > Entrer des données`,
nomme-la `_Mesures`, valide sans rien saisir. Supprime ensuite la colonne
vide générée.

Ouvre `mesures.dax` et copie les mesures une par une
(`Accueil > Nouvelle mesure`). Elles sont regroupées en sept sections,
commence par la section 1 qui alimente tout le reste.

Une seule exception : `Quadrant (dernier snapshot)` est une **colonne
calculée**, pas une mesure. Sélectionne `dim_pokemon` puis
`Nouvelle colonne`. Le fichier le signale à l'endroit concerné.

Formate au passage :
- `Usage %`, `Usage % élite`, `Usage % ladder`, `Adoption %`, `Affinité %`,
  `Part du top 10` : pourcentage, 2 décimales
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
- **Nuage de points** (le visuel central) :
  - détails : `dim_pokemon[pokemon]`
  - axe X : `Usage % ladder`
  - axe Y : `Écart élite / ladder`
  - légende : `dim_pokemon[Quadrant (dernier snapshot)]`, la **colonne
    calculée**, car Power BI n'accepte pas une mesure en légende
  - taille : `Apparitions`
  - infobulle : la mesure `Quadrant`, qui elle réagit aux filtres
- **Segments** : régulation, palier, date

Le nuage de points est ce qui porte ton positionnement : il ne décrit pas,
il classe. Ajoute deux lignes de référence (constante X à 15 %, constante Y
à 0) pour matérialiser les quadrants.

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
  et spreads via `Adoption %` avec un segment sur `attribut_type`
- **Menaces** (M-C uniquement) : pour le Pokémon sélectionné, table
  `dim_pokemon_adverse[pokemon]`, `Score de matchup`, `Taux de KO`,
  `Taux de switch forcé`, triée par score décroissant

### Page 4 : Qualité des données

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

Puis `Actualiser` dans Power BI. Seul le nouveau mois est téléchargé, le
modèle absorbe le snapshot sans modification.

| Données du mois | Publiées par Smogon | Snapshot n° |
|---|---|---|
| Septembre 2026 | 1er octobre (disponible) | 1 |
| Octobre 2026 | 1er novembre | 2 |
| Novembre 2026 | 1er décembre | 3 |
| Décembre 2026 | 1er janvier 2027 | 4 |

Les mesures d'évolution (section 2) commencent à produire des valeurs à
partir du snapshot n° 2, début novembre.
