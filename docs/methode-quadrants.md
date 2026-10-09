# Méthode des quadrants

L'usage seul ne dit pas si un Pokémon est bon : il dit qu'il est choisi. Pour
séparer ce qui est populaire de ce qui est choisi par les meilleurs joueurs, on
croise deux axes.

## Les deux axes

**Popularité : l'usage.** Part des équipes qui incluent le Pokémon :

```
usage = apparitions ÷ (total des apparitions ÷ 6)
```

Chaque équipe compte six emplacements, donc le total des apparitions divisé par
six estime le nombre d'équipes.

**Niveau : le poids moyen.** Smogon pondère chaque équipe selon le classement
de son joueur. Le poids moyen d'un Pokémon (`Avg. weight` dans le fichier
moveset) indique donc le niveau moyen des joueurs qui le choisissent.

## Les seuils

| Seuil | Valeur | Justification |
|---|---|---|
| Popularité | 10 % d'usage | environ une équipe sur dix : un Pokémon qu'on rencontre régulièrement |
| Niveau | poids moyen du format, pondéré par les apparitions | sépare les Pokémon choisis par des joueurs mieux ou moins bien classés que la moyenne |
| Affichage | 1 % d'usage minimum | sous ce seuil, le volume est trop faible pour que le poids moyen soit stable |

Le poids moyen du format se calcule comme une moyenne pondérée :

```
poids du format = Σ (apparitions × poids moyen) ÷ Σ apparitions
```

En septembre 2026, il vaut **0,598**.

## Les quatre profils

| Quadrant | Règle | Lecture | Septembre 2026 |
|---|---|---|---|
| **Staple** | usage ≥ 10 % et poids ≥ format | populaire et choisi par les mieux classés : le socle du format | 13 |
| **Pépite** | usage < 10 % et poids ≥ format | peu joué, mais par les mieux classés : un signal faible à surveiller | 20 |
| **Piège** | usage ≥ 10 % et poids < format | populaire, mais choisi par des joueurs moins bien classés | 5 |
| **Niche** | usage < 10 % et poids < format | ni l'un ni l'autre | 31 |

Exemples : Rillaboom, Sneasler et Incineroar sont des staples ; Kommo-o et
Gengar-Mega des pépites ; Indeedee-F, Basculegion, Golisopod-Mega, Milotic et
Pelipper sont les cinq pièges.

## Les mêmes règles en DAX

Le modèle Power BI porte la classification dans une colonne calculée,
`Quadrant (dernier snapshot)`, car Power BI n'accepte pas une mesure comme
légende d'un nuage de points. Voir la section correspondante de
[`powerbi/mesures.dax`](../powerbi/mesures.dax).

## Limites

- **Le niveau est approché, pas mesuré.** Le poids moyen est un indicateur
  indirect. Avec les paliers 0 et 1760, on mesurera directement l'écart entre
  l'élite et le reste du ladder.
- **Un piège n'est pas un mauvais Pokémon.** Il est choisi en moyenne par des
  joueurs moins bien classés, ce qui peut tenir à sa facilité de prise en main
  plutôt qu'à sa faiblesse.
- **Les seuils sont des choix d'analyse.** Ils sont explicites pour pouvoir
  être discutés et modifiés, pas pour être tenus pour vrais.
