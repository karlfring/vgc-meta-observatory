# Modèle de données

Le pipeline écrit neuf fichiers CSV dans `data/processed/`, organisés en schéma
en étoile. Ce document décrit leur grain, leurs colonnes et les choix de
conception.

## Vue d'ensemble

```
                       dim_date
                           │
dim_regulation ──── fact_usage ──── dim_rating_bracket
                           │
                      dim_pokemon
                     ╱     │      ╲
          fact_moveset  fact_teammate  fact_counter
                           │              │
             dim_pokemon_partenaire   dim_pokemon_adverse   (copies, côté Power BI)

fact_snapshot : une ligne par fichier ingéré (traçabilité)
```

Toutes les tables de faits partagent les clés `date_snapshot`, `regulation`,
`format_id` et `palier`. La date d'un instantané est le **dernier jour du mois
observé** (septembre 2026 donne `2026-09-30`).

## Dimensions

| Table | Clé | Colonnes |
|---|---|---|
| `dim_pokemon` | `pokemon` | `espece`, `forme`, `est_mega` (dérivées du nom : `Charizard-Mega-Y` donne l'espèce `Charizard` et la forme `Mega-Y`) |
| `dim_date` | `date_snapshot` | `annee`, `mois`, `libelle_mois` |
| `dim_regulation` | `regulation` | `format_id`, `date_debut`, `date_fin`, `est_courante` |
| `dim_rating_bracket` | `palier` | `libelle` : 0 tout le ladder, 1500 intermédiaire, 1630 avancé, 1760 élite |

`dim_pokemon` est construite à partir de **tous** les noms rencontrés, y compris
les partenaires et les adversaires, pour qu'aucune relation ne reste orpheline.

## Faits

### `fact_usage`

Grain : un Pokémon, pour un mois, une régulation et un palier.

| Colonne | Description |
|---|---|
| `rang` | rang d'usage dans le fichier Smogon |
| `usage_pct` | usage pondéré par le classement des joueurs, en pourcentage |
| `raw_count`, `raw_pct` | apparitions brutes, sans pondération |
| `real_count`, `real_pct` | apparitions où le Pokémon a réellement été envoyé au combat |
| `snapshot_index` | entier séquentiel par régulation : 1 pour le premier mois, 2 pour le suivant… |

### `fact_moveset`

Grain : un attribut d'un Pokémon (objet, capacité, talent ou spread), pour un
mois et un palier.

| Colonne | Description |
|---|---|
| `attribut_type` | `item`, `move`, `ability` ou `spread` |
| `attribut_valeur` | nom de l'objet, de la capacité… |
| `pct` | taux d'adoption parmi les équipes qui jouent ce Pokémon |
| `nature`, `evs` | renseignés pour les spreads uniquement (`Adamant:32/32/0/0/1/1` est découpé en deux) |
| `viability_ceiling` | classement le plus élevé atteint avec ce Pokémon |

La ligne agrégée `Other` des fichiers Smogon est exclue : elle n'est pas
exploitable analytiquement.

### `fact_teammate`

Grain : une paire (Pokémon, partenaire). `teammate_pct` mesure l'affinité entre
les deux, au sens de Smogon.

### `fact_counter`

Grain : une paire (Pokémon, adversaire), section « Checks and Counters »
apparue avec la régulation M-C. Smogon ne la calcule que pour les Pokémon les
plus joués.

| Colonne | Description |
|---|---|
| `score_matchup` | score de difficulté du matchup pour le Pokémon |
| `moyenne`, `ecart_type` | estimation et incertitude publiées avec le score |
| `ko_pct` | part des confrontations où le Pokémon est mis K.O. |
| `switch_pct` | part des confrontations où il est forcé à sortir |

### `fact_snapshot`

Une ligne par fichier ingéré, pour l'audit.

| Colonne | Description |
|---|---|
| `mois_source`, `genre` | mois observé et type de fichier (`usage` ou `moveset`) |
| `total_battles` | nombre de batailles du mois : un mois à faible volume est moins représentatif |
| `avg_weight_team` | poids moyen des équipes |
| `nb_pokemon` | nombre de Pokémon dans le fichier |
| `sha256` | empreinte du fichier brut, pour détecter une republication silencieuse |
| `ingere_le` | horodatage UTC de l'ingestion |

## Choix de conception

**Format long pour les movesets.** Une colonne `attribut_type` plutôt que
quatre tables quasi identiques. Le filtrage devient trivial côté Power BI, et
une nouvelle section publiée par Smogon s'ajoute sans modifier le modèle.

**Une table dédiée aux matchups.** Le score de matchup n'est pas un pourcentage
et s'accompagne de métriques propres : le mélanger aux attributs aurait rendu
la colonne `pct` ambiguë.

**Un index de snapshot plutôt que la time intelligence DAX.** Les fonctions
comme `DATEADD` ou `PREVIOUSMONTH` supposent un calendrier continu. Avec des
instantanés mensuels qui peuvent avoir des trous, les évolutions se calculent
de façon plus fiable par rapport à `snapshot_index - 1`.

**Des copies de `dim_pokemon` côté Power BI.** `fact_teammate` et `fact_counter`
référencent deux Pokémon par ligne. Power BI n'acceptant qu'une relation active
entre deux tables, on duplique la dimension en `dim_pokemon_partenaire` et
`dim_pokemon_adverse`. Voir le [guide Power BI](../powerbi/GUIDE.md).

**Des CSV versionnés dans Git.** Les données sont commitées chaque mois par le
workflow : l'historique est reproductible et chaque chiffre est rattaché à un
commit et à une empreinte de fichier source.
