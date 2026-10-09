"""Pipeline d'ingestion : Smogon -> CSV en étoile prêts pour Power BI.

Usage :
    python src/ingest.py                      # régulation courante (M-C)
    python src/ingest.py --paliers 0 1760     # sous-ensemble de paliers

À lancer une fois par mois, après la publication Smogon du 1er
(le workflow GitHub Actions le fait automatiquement le 2). Les mois déjà
archivés ne sont jamais retéléchargés : seul le nouveau mois est ajouté.

Sorties dans data/processed/ :
    dim_pokemon.csv        dim_regulation.csv   dim_rating_bracket.csv
    dim_date.csv           fact_usage.csv       fact_moveset.csv
    fact_teammate.csv      fact_counter.csv     fact_snapshot.csv
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import DATA_OUT, RATING_BRACKETS, REGULATIONS  # noqa: E402
from fetch import (  # noqa: E402
    chemin_archive,
    mois_disponibles,
    telecharger,
    url_moveset,
    url_usage,
)
from parsers import parse_moveset, parse_usage, separer_spread  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ingest")


def _fin_de_mois(mois: str) -> date:
    """'2026-08' -> date(2026, 8, 31). Date de référence du snapshot."""
    annee, m = (int(x) for x in mois.split("-"))
    debut_suivant = date(annee + 1, 1, 1) if m == 12 else date(annee, m + 1, 1)
    return debut_suivant - timedelta(days=1)


def ingerer(regulations: list[str], paliers: list[int]) -> dict[str, pd.DataFrame]:
    usage_rows: list[dict] = []
    moveset_rows: list[dict] = []
    teammate_rows: list[dict] = []
    counter_rows: list[dict] = []
    snapshot_rows: list[dict] = []

    for code_reg in regulations:
        cfg = REGULATIONS[code_reg]
        format_id = cfg["format_id"]
        mois_liste = mois_disponibles(cfg["date_debut"], cfg["date_fin"])

        if not mois_liste:
            log.warning(
                "%s : aucun mois publie pour l'instant (regulation demarree le %s ; "
                "Smogon publie le 1er du mois suivant)",
                code_reg,
                cfg["date_debut"],
            )
            continue

        log.info("%s : %s mois a traiter %s", code_reg, len(mois_liste), mois_liste)

        for mois in mois_liste:
            date_snapshot = _fin_de_mois(mois)

            for palier in paliers:
                # ---- usage -------------------------------------------------
                res = telecharger(
                    url_usage(mois, format_id, palier),
                    chemin_archive(mois, format_id, palier, "usage"),
                )
                if res is None:
                    continue
                texte, empreinte = res
                lignes, meta = parse_usage(texte)
                if not lignes:
                    log.warning("%s %s p%s : usage vide", code_reg, mois, palier)
                    continue

                for ligne in lignes:
                    usage_rows.append(
                        {
                            "date_snapshot": date_snapshot,
                            "regulation": code_reg,
                            "format_id": format_id,
                            "palier": palier,
                            **ligne,
                        }
                    )

                snapshot_rows.append(
                    {
                        "date_snapshot": date_snapshot,
                        "mois_source": mois,
                        "regulation": code_reg,
                        "format_id": format_id,
                        "palier": palier,
                        "genre": "usage",
                        "total_battles": meta["total_battles"],
                        "avg_weight_team": meta["avg_weight_team"],
                        "nb_pokemon": len(lignes),
                        "sha256": empreinte,
                        "ingere_le": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    }
                )

                # ---- moveset -----------------------------------------------
                res = telecharger(
                    url_moveset(mois, format_id, palier),
                    chemin_archive(mois, format_id, palier, "moveset"),
                )
                if res is None:
                    continue
                texte, empreinte = res
                enregs = parse_moveset(texte)

                base = {
                    "date_snapshot": date_snapshot,
                    "regulation": code_reg,
                    "format_id": format_id,
                    "palier": palier,
                }
                meta_par_pokemon = {
                    r["pokemon"]: r for r in enregs if r["type"] == "meta"
                }

                for r in enregs:
                    if r["type"] != "attribut":
                        continue
                    if r["attribut_type"] == "teammate":
                        teammate_rows.append(
                            {
                                **base,
                                "pokemon": r["pokemon"],
                                "pokemon_partenaire": r["attribut_valeur"],
                                "teammate_pct": r["pct"],
                            }
                        )
                    elif r["attribut_type"] == "counter":
                        # Table dédiée : le score de matchup n'est pas un
                        # pourcentage et s'accompagne de métriques propres.
                        counter_rows.append(
                            {
                                **base,
                                "pokemon": r["pokemon"],
                                "pokemon_adverse": r["attribut_valeur"],
                                "score_matchup": r["pct"],
                                "moyenne": r["moyenne"],
                                "ecart_type": r["ecart_type"],
                                "ko_pct": r["ko_pct"],
                                "switch_pct": r["switch_pct"],
                            }
                        )
                    else:
                        nature, evs = (
                            separer_spread(r["attribut_valeur"])
                            if r["attribut_type"] == "spread"
                            else (None, None)
                        )
                        moveset_rows.append(
                            {
                                **base,
                                "pokemon": r["pokemon"],
                                "attribut_type": r["attribut_type"],
                                "attribut_valeur": r["attribut_valeur"],
                                "pct": r["pct"],
                                "nature": nature,
                                "evs": evs,
                                "viability_ceiling": meta_par_pokemon.get(
                                    r["pokemon"], {}
                                ).get("viability_ceiling"),
                            }
                        )

                snapshot_rows.append(
                    {
                        "date_snapshot": date_snapshot,
                        "mois_source": mois,
                        "regulation": code_reg,
                        "format_id": format_id,
                        "palier": palier,
                        "genre": "moveset",
                        "total_battles": None,
                        "avg_weight_team": None,
                        "nb_pokemon": len(meta_par_pokemon),
                        "sha256": empreinte,
                        "ingere_le": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    }
                )

    return _construire_tables(
        usage_rows, moveset_rows, teammate_rows, counter_rows, snapshot_rows
    )


def _construire_tables(
    usage, moveset, teammate, counter, snapshot
) -> dict[str, pd.DataFrame]:
    """Assemble les faits et dérive les dimensions."""
    f_usage = pd.DataFrame(usage)
    f_moveset = pd.DataFrame(moveset)
    f_teammate = pd.DataFrame(teammate)
    f_counter = pd.DataFrame(counter)
    f_snapshot = pd.DataFrame(snapshot)

    # --- index de snapshot : indispensable pour les deltas en DAX ----------
    # Les snapshots sont mensuels et peuvent avoir des trous ; un entier
    # séquentiel par régulation évite d'utiliser la time intelligence DAX,
    # qui suppose un calendrier continu.
    if not f_usage.empty:
        cles = (
            f_usage[["regulation", "date_snapshot"]]
            .drop_duplicates()
            .sort_values(["regulation", "date_snapshot"])
            .reset_index(drop=True)
        )
        cles["snapshot_index"] = cles.groupby("regulation").cumcount() + 1
        f_usage = f_usage.merge(cles, on=["regulation", "date_snapshot"], how="left")

    # --- dimensions --------------------------------------------------------
    noms = set()
    for df, col in (
        (f_usage, "pokemon"),
        (f_moveset, "pokemon"),
        (f_teammate, "pokemon"),
        (f_teammate, "pokemon_partenaire"),
        (f_counter, "pokemon"),
        (f_counter, "pokemon_adverse"),
    ):
        if not df.empty:
            noms |= set(df[col].dropna().unique())

    d_pokemon = pd.DataFrame({"pokemon": sorted(noms)})
    if not d_pokemon.empty:
        # 'Charizard-Mega-Y' -> espece 'Charizard', forme 'Mega-Y'
        decoupe = d_pokemon["pokemon"].str.split("-", n=1, expand=True)
        d_pokemon["espece"] = decoupe[0]
        d_pokemon["forme"] = decoupe[1] if decoupe.shape[1] > 1 else None
        d_pokemon["est_mega"] = d_pokemon["pokemon"].str.contains("-Mega", na=False)

    d_regulation = pd.DataFrame(
        [
            {
                "regulation": code,
                "format_id": cfg["format_id"],
                "date_debut": cfg["date_debut"],
                "date_fin": cfg["date_fin"],
                "est_courante": cfg["courante"],
            }
            for code, cfg in REGULATIONS.items()
        ]
    )

    d_palier = pd.DataFrame(
        [{"palier": p, "libelle": lib} for p, lib in RATING_BRACKETS.items()]
    )

    d_date = pd.DataFrame()
    if not f_usage.empty:
        dates = pd.to_datetime(f_usage["date_snapshot"].unique())
        d_date = pd.DataFrame({"date_snapshot": dates.sort_values()})
        d_date["annee"] = d_date["date_snapshot"].dt.year
        d_date["mois"] = d_date["date_snapshot"].dt.month
        d_date["libelle_mois"] = d_date["date_snapshot"].dt.strftime("%b %Y")

    return {
        "dim_pokemon": d_pokemon,
        "dim_regulation": d_regulation,
        "dim_rating_bracket": d_palier,
        "dim_date": d_date,
        "fact_usage": f_usage,
        "fact_moveset": f_moveset,
        "fact_teammate": f_teammate,
        "fact_counter": f_counter,
        "fact_snapshot": f_snapshot,
    }


def ecrire(tables: dict[str, pd.DataFrame]) -> None:
    DATA_OUT.mkdir(parents=True, exist_ok=True)
    for nom, df in tables.items():
        chemin = DATA_OUT / f"{nom}.csv"
        df.to_csv(chemin, index=False, encoding="utf-8")
        log.info("ecrit %-22s %6d lignes", chemin.name, len(df))


def main() -> int:
    ap = argparse.ArgumentParser(description="Ingestion des stats Smogon VGC Champions")
    ap.add_argument("--regulation", choices=list(REGULATIONS), help="une régulation précise")
    ap.add_argument(
        "--paliers",
        nargs="+",
        type=int,
        default=list(RATING_BRACKETS),
        help="paliers de classement à ingérer",
    )
    args = ap.parse_args()

    if args.regulation:
        regs = [args.regulation]
    else:
        regs = [c for c, cfg in REGULATIONS.items() if cfg["courante"]]

    log.info("regulations : %s | paliers : %s", regs, args.paliers)
    tables = ingerer(regs, args.paliers)

    if tables["fact_usage"].empty:
        log.warning(
            "aucune donnee ingeree : verifier la connexion et que le mois "
            "precedent est bien publie sur smogon.com/stats."
        )
        return 1

    ecrire(tables)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
