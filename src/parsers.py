"""Parsers pour les fichiers de statistiques Smogon.

Deux formats sont traités :
  - usage    : <format>-<palier>.txt        -> tableau usage / raw count / winrate
  - moveset  : moveset/<format>-<palier>.txt -> objets, moves, abilities, spreads, teammates

Les fichiers sont en texte fixe encadré de '|' et de séparateurs '+---+'.
Aucune API officielle n'existe : le parsing est défensif (une ligne
inattendue est ignorée plutôt que de faire échouer l'ingestion complète).
"""

from __future__ import annotations

import re
from typing import Iterator


# --------------------------------------------------------------------------
# Fichier d'usage
# --------------------------------------------------------------------------
# Exemple de ligne :
# | 1    | Rillaboom            | 37.18066% | 170391  | 8.977% | 165201 | 8.702% |	 |
_USAGE_ROW = re.compile(
    r"^\s*\|\s*(?P<rang>\d+)\s*"
    r"\|\s*(?P<pokemon>[^|]+?)\s*"
    r"\|\s*(?P<usage_pct>[\d.]+)%\s*"
    r"\|\s*(?P<raw_count>\d+)\s*"
    r"\|\s*(?P<raw_pct>[\d.]+)%\s*"
    r"\|\s*(?P<real_count>\d+)\s*"
    r"\|\s*(?P<real_pct>[\d.]+)%\s*\|"
)

_TOTAL_BATTLES = re.compile(r"Total battles:\s*(\d+)")
_AVG_WEIGHT = re.compile(r"Avg\. weight/team:\s*([\d.]+)")


def parse_usage(texte: str) -> tuple[list[dict], dict]:
    """Parse un fichier d'usage.

    Retourne (lignes, metadonnees) où metadonnees contient le nombre de
    batailles du mois : indispensable pour juger la fiabilité d'un snapshot.
    """
    lignes: list[dict] = []
    meta: dict = {"total_battles": None, "avg_weight_team": None}

    for ligne in texte.splitlines():
        if meta["total_battles"] is None:
            m = _TOTAL_BATTLES.search(ligne)
            if m:
                meta["total_battles"] = int(m.group(1))
                continue
        if meta["avg_weight_team"] is None:
            m = _AVG_WEIGHT.search(ligne)
            if m:
                meta["avg_weight_team"] = float(m.group(1))
                continue

        m = _USAGE_ROW.match(ligne)
        if not m:
            continue
        d = m.groupdict()
        lignes.append(
            {
                "rang": int(d["rang"]),
                "pokemon": d["pokemon"].strip(),
                "usage_pct": float(d["usage_pct"]),
                "raw_count": int(d["raw_count"]),
                "raw_pct": float(d["raw_pct"]),
                "real_count": int(d["real_count"]),
                "real_pct": float(d["real_pct"]),
            }
        )

    return lignes, meta


# --------------------------------------------------------------------------
# Fichier moveset
# --------------------------------------------------------------------------
_SEPARATEUR = re.compile(r"^\s*\+-+\+\s*$")

# Le pipe de fin est optionnel : les lignes de statistiques des sections
# « Checks and Counters » n'en ont pas (elles commencent par une tabulation).
_CONTENU = re.compile(r"^\s*\|\s*(?P<contenu>.*?)\s*\|?\s*$")

# "Life Orb 32.551%" -> ("Life Orb", 32.551)
_VALEUR_PCT = re.compile(r"^(?P<valeur>.+?)\s+(?P<pct>[\d.]+)%$")

# Sections rencontrées dans les fichiers Champions VGC.
# 'Tera Types' n'existe pas dans ce format mais reste prévue : d'autres
# formats la publient. 'Checks and Counters' est apparue avec la régulation M-C.
_SECTIONS = {
    "Abilities": "ability",
    "Items": "item",
    "Spreads": "spread",
    "Moves": "move",
    "Tera Types": "tera",
    "Teammates": "teammate",
    "Checks and Counters": "counter",
}

_META_LIGNES = {
    "Raw count": ("raw_count", int),
    "Avg. weight": ("avg_weight", float),
    "Viability Ceiling": ("viability_ceiling", int),
}

# Les sections « Checks and Counters » ont un format propre, sur deux lignes :
#   Camerupt-Mega 52.402 (59.90±1.87)
#       (31.8% KOed / 28.1% switched out)
# La première porte le score de matchup et son intervalle de confiance,
# la seconde le détail des issues de confrontation.
_COUNTER_TETE = re.compile(
    r"^(?P<adversaire>.+?)\s+(?P<score>[\d.]+)\s+"
    r"\(\s*(?P<moyenne>[\d.]+)\s*±\s*(?P<ecart>[\d.]+)\s*\)$"
)
_COUNTER_STATS = re.compile(
    r"^\(\s*(?P<ko>[\d.]+)%\s*KOed\s*/\s*(?P<switch>[\d.]+)%\s*switched out\s*\)$"
)


def _blocs(texte: str) -> Iterator[list[str]]:
    """Découpe le fichier en blocs de lignes de contenu séparés par '+---+'."""
    bloc: list[str] = []
    for ligne in texte.splitlines():
        if _SEPARATEUR.match(ligne):
            if bloc:
                yield bloc
                bloc = []
            continue
        m = _CONTENU.match(ligne)
        if m:
            bloc.append(m.group("contenu"))
    if bloc:
        yield bloc


def _parse_counters(pokemon: str, lignes: list[str]) -> list[dict]:
    """Parse une section « Checks and Counters ».

    Chaque adversaire occupe deux lignes. La seconde est facultative :
    si elle manque ou ne correspond pas, les champs KO et switch restent
    nuls plutôt que de faire échouer l'entrée.
    """
    resultats: list[dict] = []
    i = 0
    while i < len(lignes):
        tete = _COUNTER_TETE.match(lignes[i])
        if not tete:
            i += 1
            continue

        ko = switch = None
        if i + 1 < len(lignes):
            stats = _COUNTER_STATS.match(lignes[i + 1])
            if stats:
                ko = float(stats.group("ko"))
                switch = float(stats.group("switch"))
                i += 1  # la ligne de stats est consommée

        resultats.append(
            {
                "type": "attribut",
                "pokemon": pokemon,
                "attribut_type": "counter",
                "attribut_valeur": tete.group("adversaire").strip(),
                "pct": float(tete.group("score")),  # score de matchup, pas un %
                "ko_pct": ko,
                "switch_pct": switch,
                "moyenne": float(tete.group("moyenne")),
                "ecart_type": float(tete.group("ecart")),
            }
        )
        i += 1

    return resultats


def parse_moveset(texte: str) -> list[dict]:
    """Parse un fichier moveset.

    Retourne une liste plate d'enregistrements :
      - type 'meta'      : raw_count, avg_weight, viability_ceiling par Pokémon
      - type 'attribut'  : (pokemon, attribut_type, attribut_valeur, pct)

    Le format long évite cinq tables quasi identiques côté modèle.
    """
    resultats: list[dict] = []
    pokemon_courant: str | None = None

    for bloc in _blocs(texte):
        if not bloc:
            continue

        premiere = bloc[0]

        # Bloc d'en-tête : une seule ligne, qui est le nom du Pokémon.
        # On le distingue des sections par l'absence de ':' et de '%'.
        if (
            len(bloc) == 1
            and ":" not in premiere
            and "%" not in premiere
            and premiere not in _SECTIONS
        ):
            pokemon_courant = premiere
            continue

        if pokemon_courant is None:
            continue  # en-tête du fichier, ignoré

        # Bloc de métadonnées : "Raw count: 170391", etc.
        if any(premiere.startswith(cle) for cle in _META_LIGNES):
            enreg = {"type": "meta", "pokemon": pokemon_courant}
            for ligne in bloc:
                for cle, (champ, cast) in _META_LIGNES.items():
                    if ligne.startswith(cle + ":"):
                        brut = ligne.split(":", 1)[1].strip()
                        try:
                            enreg[champ] = cast(float(brut)) if cast is int else cast(brut)
                        except ValueError:
                            enreg[champ] = None
            resultats.append(enreg)
            continue

        # Bloc de section : première ligne = nom de section
        if premiere in _SECTIONS:
            type_attr = _SECTIONS[premiere]

            if type_attr == "counter":
                resultats.extend(_parse_counters(pokemon_courant, bloc[1:]))
                continue

            for ligne in bloc[1:]:
                m = _VALEUR_PCT.match(ligne)
                if not m:
                    continue
                valeur = m.group("valeur").strip()
                if valeur == "Other":
                    continue  # agrégat, non exploitable analytiquement
                resultats.append(
                    {
                        "type": "attribut",
                        "pokemon": pokemon_courant,
                        "attribut_type": type_attr,
                        "attribut_valeur": valeur,
                        "pct": float(m.group("pct")),
                    }
                )

    return resultats


def separer_spread(valeur: str) -> tuple[str | None, str | None]:
    """'Adamant:32/32/0/0/1/1' -> ('Adamant', '32/32/0/0/1/1')."""
    if ":" not in valeur:
        return None, valeur
    nature, evs = valeur.split(":", 1)
    return nature.strip(), evs.strip()
