"""Export des données du tableau de bord : data/processed -> data/dashboard.

Usage :
    python src/export_dashboard.py                  # dernier mois de la régulation courante
    python src/export_dashboard.py --mois 2026-09   # arrêter l'export à un mois précis

Le tableau de bord en ligne lit ces fichiers JSON, réécrits chaque mois après
l'ingestion (le workflow mensuel enchaîne les deux scripts) :

    pokemon.json       usage par Pokémon, une ligne par mois et par Pokémon, pour
                       tous les mois de la régulation (onglet Évolution compris)
    instantanes.json   batailles et Pokémon joués, par mois et par palier
    builds.json        objets, capacités, talents et spreads du dernier mois
    coequipiers.json   coéquipiers fréquents du dernier mois
    counters.json      menaces (section Checks and Counters) du dernier mois
    manifest.json      mois couverts, régulation, nombre de lignes et empreinte
                       SHA-256 de chaque fichier

Les pourcentages Smogon (0 à 100) deviennent des parts (0 à 1). Le script ne
fait aucun calcul d'analyse : les variations, quadrants et synthèses sont
calculés dans le tableau de bord, où chaque formule reste lisible.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import DATA_OUT, REGULATIONS, ROOT  # noqa: E402

DATA_DASHBOARD = ROOT / "data" / "dashboard"

# Palier de référence du tableau de bord, et colonne d'usage de chaque palier
PALIER_REFERENCE = 1500
COLONNES_USAGE = {0: "usage_ladder", 1500: "usage", 1630: "usage_1630", 1760: "usage_elite"}

# Libellés des types d'attributs du fichier moveset, tels qu'affichés
CATEGORIES = {"ability": "Talent", "item": "Objet", "move": "Capacité", "spread": "Spread"}

TABLES = ("fact_usage", "fact_moveset", "fact_teammate", "fact_counter", "fact_snapshot")

log = logging.getLogger("export")


class ErreurExport(Exception):
    """Données absentes ou incohérentes : rien n'est écrit."""


def part(pct) -> float | None:
    """Pourcentage Smogon (0-100) -> part (0-1). 54.73103 -> 0.5473103."""
    if pct is None or pd.isna(pct):
        return None
    return round(float(pct) / 100, 7)


def regulation_courante() -> tuple[str, str]:
    courantes = [(code, cfg["format_id"]) for code, cfg in REGULATIONS.items() if cfg["courante"]]
    if len(courantes) != 1:
        raise ErreurExport("config.REGULATIONS doit avoir exactement une régulation courante")
    return courantes[0]


def charger_tables(dossier: Path = DATA_OUT) -> dict[str, pd.DataFrame]:
    return {nom: pd.read_csv(dossier / f"{nom}.csv") for nom in TABLES}


def _filtrer(df: pd.DataFrame, format_id: str) -> pd.DataFrame:
    """Lignes de la régulation suivie, avec le mois (AAAA-MM) en colonne."""
    df = df[df["format_id"] == format_id].copy()
    df["mois"] = df["date_snapshot"].astype(str).str[:7]
    return df


def lignes_pokemon(usage: pd.DataFrame, moveset: pd.DataFrame) -> list[dict]:
    """Une ligne par mois et par Pokémon, avec l'usage des quatre paliers."""
    lignes = []
    for mois, du_mois in usage.groupby("mois", sort=True):
        par_palier = {p: d.set_index("pokemon") for p, d in du_mois.groupby("palier")}
        if PALIER_REFERENCE not in par_palier:
            raise ErreurExport(f"{mois} : palier {PALIER_REFERENCE} absent de fact_usage")
        reference = par_palier[PALIER_REFERENCE]

        mv = moveset[(moveset["mois"] == mois) & (moveset["palier"] == PALIER_REFERENCE)]
        plafond = mv.groupby("pokemon")["viability_ceiling"].first()

        for nom, ref in reference.sort_values("rang").iterrows():
            ligne = {"mois": mois, "pokemon": nom, "rang": int(ref["rang"])}
            for palier, colonne in COLONNES_USAGE.items():
                d = par_palier.get(palier)
                ligne[colonne] = part(d.at[nom, "usage_pct"]) if d is not None and nom in d.index else 0.0
            ligne["apparitions"] = int(ref["raw_count"])
            vc = plafond.get(nom)
            ligne["viability_ceiling"] = None if vc is None or pd.isna(vc) else int(vc)
            lignes.append(ligne)
    return lignes


def lignes_instantanes(snapshot: pd.DataFrame, regulation: str) -> list[dict]:
    """Batailles et Pokémon joués, une ligne par mois et par palier."""
    us = snapshot[snapshot["genre"] == "usage"].sort_values(["mois", "palier"])
    return [
        {
            "mois": r.mois,
            "regulation": regulation,
            "format_id": r.format_id,
            "palier": int(r.palier),
            "batailles": int(r.total_battles),
            "nb_pokemon": int(r.nb_pokemon),
        }
        for r in us.itertuples()
    ]


def lignes_builds(moveset: pd.DataFrame) -> list[dict]:
    inconnues = set(moveset["attribut_type"]) - set(CATEGORIES)
    if inconnues:
        raise ErreurExport(f"types d'attributs inconnus dans fact_moveset : {sorted(inconnues)}")
    return [
        {
            "pokemon": r.pokemon,
            "palier": int(r.palier),
            "categorie": CATEGORIES[r.attribut_type],
            "valeur": str(r.attribut_valeur),
            "adoption": part(r.pct),
        }
        for r in moveset.itertuples()
    ]


def lignes_coequipiers(teammate: pd.DataFrame) -> list[dict]:
    return [
        {
            "pokemon": r.pokemon,
            "palier": int(r.palier),
            "partenaire": r.pokemon_partenaire,
            "affinite": part(r.teammate_pct),
        }
        for r in teammate.itertuples()
    ]


def lignes_counters(counter: pd.DataFrame) -> list[dict]:
    return [
        {
            "pokemon": r.pokemon,
            "palier": int(r.palier),
            "adversaire": r.pokemon_adverse,
            "score_matchup": float(r.score_matchup),
            "taux_ko": part(r.ko_pct),
            "taux_switch": part(r.switch_pct),
        }
        for r in counter.itertuples()
    ]


def construire(tables: dict[str, pd.DataFrame], mois: str | None = None) -> dict[str, object]:
    """Contenu de chaque fichier, sans rien écrire."""
    regulation, format_id = regulation_courante()
    t = {nom: _filtrer(df, format_id) for nom, df in tables.items()}

    disponibles = sorted(t["fact_usage"]["mois"].unique())
    if not disponibles:
        raise ErreurExport(f"aucun mois ingéré pour {regulation} ({format_id})")
    mois = mois or disponibles[-1]
    if mois not in disponibles:
        raise ErreurExport(f"{mois} absent des données ingérées : {disponibles}")
    couverts = [m for m in disponibles if m <= mois]

    def jusqu_au_mois(df):
        return df[df["mois"] <= mois]

    def du_mois(df):
        return df[df["mois"] == mois]

    sorties: dict[str, object] = {
        "pokemon": lignes_pokemon(jusqu_au_mois(t["fact_usage"]), jusqu_au_mois(t["fact_moveset"])),
        "instantanes": lignes_instantanes(jusqu_au_mois(t["fact_snapshot"]), regulation),
        "builds": lignes_builds(du_mois(t["fact_moveset"])),
        "coequipiers": lignes_coequipiers(du_mois(t["fact_teammate"])),
        "counters": lignes_counters(du_mois(t["fact_counter"])),
    }
    sorties["manifest"] = {
        "regulation": regulation,
        "format_id": format_id,
        "mois": mois,
        "mois_precedent": couverts[-2] if len(couverts) > 1 else None,
        "mois_couverts": couverts,
        "fichiers": {
            nom: {"lignes": len(contenu), "sha256": hashlib.sha256(serialiser(contenu)).hexdigest()}
            for nom, contenu in sorties.items()
        },
    }
    return sorties


def serialiser(contenu) -> bytes:
    """JSON compact et stable : mêmes données, mêmes octets, même empreinte."""
    return json.dumps(contenu, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def ecrire(sorties: dict[str, object], dossier: Path = DATA_DASHBOARD) -> None:
    dossier.mkdir(parents=True, exist_ok=True)
    for nom, contenu in sorties.items():
        chemin = dossier / f"{nom}.json"
        if nom == "manifest":
            chemin.write_text(json.dumps(contenu, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        else:
            chemin.write_bytes(serialiser(contenu))
        log.info("ecrit %-18s %6s lignes", chemin.name, len(contenu) if isinstance(contenu, list) else "-")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
    ap = argparse.ArgumentParser(description="Export des données du tableau de bord")
    ap.add_argument("--mois", help="dernier mois exporté, au format AAAA-MM (défaut : le plus récent)")
    ap.add_argument("--sortie", type=Path, default=DATA_DASHBOARD, help="dossier de sortie")
    args = ap.parse_args()
    try:
        sorties = construire(charger_tables(), args.mois)
    except ErreurExport as e:
        log.error("%s", e)
        return 1
    ecrire(sorties, args.sortie)
    m = sorties["manifest"]
    log.info("%s : %s, mois couverts %s", m["regulation"], m["mois"], m["mois_couverts"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
