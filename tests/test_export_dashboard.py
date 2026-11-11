"""Tests de l'export du tableau de bord, sur de petites tables construites à la main."""

import json
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import export_dashboard as ex  # noqa: E402

FMT = "gen9championsvgc2026regmcbo3"
AUTRE = "gen9championsvgc2026regmdbo3"
PALIERS = (0, 1500, 1630, 1760)
MOIS = {"2026-09": "2026-09-30", "2026-10": "2026-10-31"}


def _usage(mois, format_id=FMT, usages=None):
    """Deux Pokémon ; usages = {palier: (usage A, usage B)} en pourcentages Smogon."""
    usages = usages or {p: (54.73103, 12.5) for p in PALIERS}
    lignes = []
    for palier, (ua, ub) in usages.items():
        for rang, (nom, u, brut) in enumerate(sorted([("Rillaboom", ua, 229704), ("Garchomp", ub, 40000)],
                                                     key=lambda x: -x[1]), start=1):
            lignes.append({"date_snapshot": MOIS[mois], "regulation": "M-C", "format_id": format_id,
                           "palier": palier, "rang": rang, "pokemon": nom, "usage_pct": u,
                           "raw_count": brut, "raw_pct": 0.0, "real_count": 0, "real_pct": 0.0,
                           "snapshot_index": 1})
    return lignes


def _moveset(mois, format_id=FMT):
    base = {"date_snapshot": MOIS[mois], "regulation": "M-C", "format_id": format_id, "palier": 1500,
            "pokemon": "Rillaboom", "nature": None, "evs": None, "viability_ceiling": 87}
    return [
        {**base, "attribut_type": "ability", "attribut_valeur": "Grassy Surge", "pct": 99.564},
        {**base, "attribut_type": "item", "attribut_valeur": "Miracle Seed", "pct": 67.254},
        {**base, "attribut_type": "move", "attribut_valeur": "Fake Out", "pct": 98.1},
        {**base, "attribut_type": "spread", "attribut_valeur": "Adamant:32/32/0/0/2/0", "pct": 3.138,
         "nature": "Adamant", "evs": "32/32/0/0/2/0"},
    ]


def _teammate(mois):
    return [{"date_snapshot": MOIS[mois], "regulation": "M-C", "format_id": FMT, "palier": 0,
             "pokemon": "Rillaboom", "pokemon_partenaire": "Incineroar", "teammate_pct": 40.698}]


def _counter(mois):
    return [{"date_snapshot": MOIS[mois], "regulation": "M-C", "format_id": FMT, "palier": 0,
             "pokemon": "Rillaboom", "pokemon_adverse": "Venusaur", "score_matchup": 50.113,
             "moyenne": 55.6, "ecart_type": 1.37, "ko_pct": 27.4, "switch_pct": 28.2}]


def _snapshot(mois, batailles):
    return [{"date_snapshot": MOIS[mois], "mois_source": mois, "regulation": "M-C", "format_id": FMT,
             "palier": p, "genre": genre, "total_battles": batailles if genre == "usage" else None,
             "avg_weight_team": 1.0, "nb_pokemon": 2, "sha256": "x", "ingere_le": "2026-11-02T16:02:08+00:00"}
            for p in PALIERS for genre in ("usage", "moveset")]


def _tables(deux_mois=True):
    mois = ["2026-09", "2026-10"] if deux_mois else ["2026-09"]
    oct_usages = {0: (41.62237, 18.0), 1500: (42.22342, 18.6), 1630: (41.15008, 19.0), 1760: (38.5519, 22.0)}
    usage = _usage("2026-09") + (_usage("2026-10", usages=oct_usages) if deux_mois else [])
    usage += _usage("2026-10", format_id=AUTRE)  # une autre régulation, à ignorer
    return {
        "fact_usage": pd.DataFrame(usage),
        "fact_moveset": pd.DataFrame(sum((_moveset(m) for m in mois), []) + _moveset("2026-10", AUTRE)),
        "fact_teammate": pd.DataFrame(sum((_teammate(m) for m in mois), [])),
        "fact_counter": pd.DataFrame(sum((_counter(m) for m in mois), [])),
        "fact_snapshot": pd.DataFrame(sum((_snapshot(m, b) for m, b in zip(mois, (223477, 262609))), [])),
    }


def test_part_convertit_un_pourcentage_smogon():
    assert ex.part(54.73103) == 0.5473103
    assert ex.part(27.4) == 0.274
    assert ex.part(None) is None


def test_pokemon_une_ligne_par_mois_avec_les_quatre_paliers():
    s = ex.construire(_tables())
    assert [(r["mois"], r["pokemon"]) for r in s["pokemon"]] == [
        ("2026-09", "Rillaboom"), ("2026-09", "Garchomp"), ("2026-10", "Rillaboom"), ("2026-10", "Garchomp")]
    octobre = s["pokemon"][2]
    assert octobre == {"mois": "2026-10", "pokemon": "Rillaboom", "rang": 1, "usage_ladder": 0.4162237,
                       "usage": 0.4222342, "usage_1630": 0.4115008, "usage_elite": 0.385519,
                       "apparitions": 229704, "viability_ceiling": 87}


def test_viability_ceiling_absent_du_moveset_vaut_null():
    garchomp = ex.construire(_tables())["pokemon"][1]
    assert garchomp["pokemon"] == "Garchomp" and garchomp["viability_ceiling"] is None


def test_details_du_dernier_mois_seulement():
    s = ex.construire(_tables())
    assert len(s["builds"]) == 4 and len(s["coequipiers"]) == 1 and len(s["counters"]) == 1
    assert {r["categorie"] for r in s["builds"]} == {"Talent", "Objet", "Capacité", "Spread"}
    assert s["builds"][0]["adoption"] == 0.99564
    assert s["coequipiers"][0]["affinite"] == 0.40698
    assert s["counters"][0] == {"pokemon": "Rillaboom", "palier": 0, "adversaire": "Venusaur",
                                "score_matchup": 50.113, "taux_ko": 0.274, "taux_switch": 0.282}


def test_instantanes_par_mois_et_palier():
    s = ex.construire(_tables())
    assert len(s["instantanes"]) == 8
    assert s["instantanes"][-1] == {"mois": "2026-10", "regulation": "M-C", "format_id": FMT,
                                    "palier": 1760, "batailles": 262609, "nb_pokemon": 2}


def test_mois_impose_arrete_l_historique():
    s = ex.construire(_tables(), mois="2026-09")
    assert {r["mois"] for r in s["pokemon"]} == {"2026-09"}
    assert s["manifest"]["mois_couverts"] == ["2026-09"] and s["manifest"]["mois_precedent"] is None


def test_manifest_et_empreintes_stables():
    a, b = ex.construire(_tables()), ex.construire(_tables())
    assert a["manifest"] == b["manifest"]
    assert a["manifest"]["mois"] == "2026-10" and a["manifest"]["mois_precedent"] == "2026-09"
    assert a["manifest"]["fichiers"]["pokemon"]["lignes"] == 4


def test_mois_absent_refuse():
    with pytest.raises(ex.ErreurExport, match="2026-11"):
        ex.construire(_tables(), mois="2026-11")


def test_type_d_attribut_inconnu_refuse():
    t = _tables()
    mv = t["fact_moveset"]
    octobre = mv.index[(mv["date_snapshot"] == "2026-10-31") & (mv["format_id"] == FMT)][0]
    mv.loc[octobre, "attribut_type"] = "tera"
    with pytest.raises(ex.ErreurExport, match="tera"):
        ex.construire(t)


def test_ecriture_json_compacte(tmp_path):
    s = ex.construire(_tables())
    ex.ecrire(s, tmp_path)
    assert json.loads((tmp_path / "pokemon.json").read_text(encoding="utf-8")) == s["pokemon"]
    assert "Capacité" in (tmp_path / "builds.json").read_text(encoding="utf-8")
    assert json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))["mois"] == "2026-10"
