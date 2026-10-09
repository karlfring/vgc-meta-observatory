# Méthode des quadrants

L'usage seul ne dit pas si un Pokémon est bon : il dit qu'il est choisi. Pour
séparer ce qui est populaire de ce que les meilleurs joueurs adoptent, on
croise deux axes, tous deux tirés des fichiers d'usage officiels de Smogon.

## Les deux axes

**Popularité : l'usage de référence.** Part des équipes qui incluent le
Pokémon, pondérée par le classement des joueurs au **palier 1500**, telle que
Smogon la publie (`usage_pct` de `fact_usage`).

**Adoption par l'élite : le ratio élite / ladder.** Smogon publie le même mois
à plusieurs paliers de pondération. Au palier 0, tous les joueurs comptent
autant ; au palier 1760, le poids se concentre sur les mieux classés. Le ratio
compare les deux :

```
ratio élite / ladder = usage au palier 1760 ÷ usage au palier 0
```

Au-dessus de 1, l'élite joue ce Pokémon davantage que l'ensemble du ladder.
Charizard-Mega-Y passe ainsi de 11,9 % d'usage sur tout le ladder à 21,1 %
chez l'élite, soit un ratio de 1,78. Golisopod-Mega fait le chemin inverse :
12,7 % sur le ladder, 6,9 % chez l'élite, ratio de 0,54.

## Les seuils

| Seuil | Valeur | Justification |
|---|---|---|
| Popularité | 10 % d'usage | environ une équipe sur dix : un Pokémon qu'on rencontre régulièrement |
| Adoption par l'élite | ratio de 1 | l'élite le joue au moins autant que l'ensemble du ladder |
| Affichage | 1 % d'usage minimum | sous ce seuil, le volume est trop faible pour que le ratio soit stable |

Le ratio s'affiche sur une échelle logarithmique : un Pokémon deux fois plus
joué par l'élite (×2) et un autre deux fois moins (×0,5) sont ainsi à égale
distance de la ligne de référence.

## Les quatre profils

| Quadrant | Règle | Lecture | Septembre 2026 |
|---|---|---|---|
| **Staple** | usage ≥ 10 % et ratio ≥ 1 | populaire et plébiscité par l'élite : le socle du format | 14 |
| **Pépite** | usage < 10 % et ratio ≥ 1 | rare, mais plébiscité par l'élite : un signal d'adoption précoce | 15 |
| **Piège** | usage ≥ 10 % et ratio < 1 | populaire, mais délaissé par l'élite | 5 |
| **Niche** | usage < 10 % et ratio < 1 | ni l'un ni l'autre | 29 |

Exemples de septembre 2026, sur 63 Pokémon au-dessus de 1 % d'usage :

- **Staples** : Rillaboom, Sneasler, Incineroar, Kingambit, Charizard-Mega-Y.
- **Pépites** : Venusaur (ratio 2,57), Kommo-o, Grimmsnarl, Gengar-Mega, Garchomp.
- **Pièges** : Salamence-Mega, Indeedee-F, Farigiraf, Milotic, Golisopod-Mega.

## Les mêmes règles en DAX

Les mesures DAX prévues pour le rapport Power BI appliquent exactement ces règles : mesure `Quadrant` pour les
tables et infobulles, colonne calculée `Quadrant (dernier snapshot)` pour la
légende du nuage de points, car Power BI n'accepte pas une mesure comme
légende. Voir [`powerbi/mesures.dax`](../powerbi/mesures.dax), section 3.

## Limites

- **Le seuil de 1 est strict.** Plusieurs Pokémon en sont très proches :
  Basculegion (1,02), Gholdengo (1,03) ou Pelipper (0,98). Un écart de
  quelques centièmes ne change pas leur profil réel ; c'est leur trajectoire
  d'un mois sur l'autre qui tranchera.
- **Le palier 1760 n'est pas un sous-ensemble de joueurs.** C'est une
  pondération qui donne plus de poids aux mieux classés. Le ratio mesure donc
  une tendance de l'élite, pas un comptage exact de ses équipes.
- **Un piège n'est pas un mauvais Pokémon.** L'élite le joue moins que la
  moyenne, ce qui peut tenir à sa facilité de prise en main ou à des réponses
  bien connues des meilleurs joueurs.
- **Les seuils sont des choix d'analyse.** Ils sont explicites pour pouvoir
  être discutés et modifiés, pas pour être tenus pour vrais.
