"""Tests des parsers Smogon (pytest)."""

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from fetch import mois_disponibles  # noqa: E402
from parsers import parse_moveset, parse_usage, separer_spread  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


def _lire(nom: str) -> str:
    return (FIXTURES / nom).read_text(encoding="utf-8")


# --- usage -----------------------------------------------------------------
def test_usage_extrait_les_lignes_et_les_metadonnees():
    lignes, meta = parse_usage(_lire("usage_sample.txt"))
    assert len(lignes) == 7
    assert meta["total_battles"] == 179434
    assert meta["avg_weight_team"] == 0.071


def test_usage_premiere_ligne_complete():
    lignes, _ = parse_usage(_lire("usage_sample.txt"))
    assert lignes[0] == {
        "rang": 1,
        "pokemon": "Kingambit",
        "usage_pct": 55.69655,
        "raw_count": 149735,
        "raw_pct": 41.724,
        "real_count": 70359,
        "real_pct": 42.157,
    }


def test_usage_ignore_les_lignes_de_separation_et_d_entete():
    lignes, _ = parse_usage(_lire("usage_sample.txt"))
    assert all(isinstance(l["rang"], int) for l in lignes)
    assert "Pokemon" not in [l["pokemon"] for l in lignes]


def test_usage_tolere_un_fichier_vide():
    lignes, meta = parse_usage("")
    assert lignes == []
    assert meta["total_battles"] is None


# --- moveset ---------------------------------------------------------------
def test_moveset_separe_meta_et_attributs():
    enregs = parse_moveset(_lire("moveset_sample.txt"))
    metas = [r for r in enregs if r["type"] == "meta"]
    assert {r["pokemon"] for r in metas} == {
        "Kingambit",
        "Charizard-Mega-Y",
        "Incineroar",
    }
    assert metas[0]["raw_count"] == 170391
    assert metas[0]["viability_ceiling"] == 90


def test_moveset_couvre_toutes_les_sections():
    enregs = parse_moveset(_lire("moveset_sample.txt"))
    types = {r["attribut_type"] for r in enregs if r["type"] == "attribut"}
    assert types == {"ability", "item", "spread", "move", "teammate", "counter"}


# --- Checks and Counters ---------------------------------------------------
#  Section absente de la régulation M-B, présente en M-C, et dans un format
#  différent du reste du fichier : deux lignes par adversaire, pas de
#  pourcentage sur la première, pas de pipe fermant sur la seconde.


def _counters():
    return [
        r
        for r in parse_moveset(_lire("moveset_sample.txt"))
        if r.get("attribut_type") == "counter"
    ]


def test_counter_extrait_score_et_intervalle():
    c = _counters()[0]
    assert c["pokemon"] == "Incineroar"
    assert c["attribut_valeur"] == "Camerupt-Mega"
    assert c["pct"] == 52.402
    assert c["moyenne"] == 59.90
    assert c["ecart_type"] == 1.87


def test_counter_extrait_ko_et_switch():
    """La seconde ligne n'a pas de pipe fermant : elle serait perdue si le
    parser exigeait la même forme que le reste du fichier."""
    c = _counters()[0]
    assert c["ko_pct"] == 31.8
    assert c["switch_pct"] == 28.1


def test_counter_sans_ligne_de_stats_reste_exploitable():
    """Dégradation gracieuse : un adversaire sans ligne KO/switch est
    conservé avec ces champs à None, plutôt que rejeté."""
    c = _counters()[1]
    assert c["attribut_valeur"] == "Arcanine-Hisui"
    assert c["pct"] == 52.204
    assert c["ko_pct"] is None and c["switch_pct"] is None


def test_moveset_exclut_la_ligne_Other():
    """'Other' est un agrégat résiduel, non exploitable analytiquement."""
    enregs = parse_moveset(_lire("moveset_sample.txt"))
    assert not any(
        r.get("attribut_valeur") == "Other" for r in enregs if r["type"] == "attribut"
    )


def test_moveset_nom_de_pokemon_avec_tiret_non_confondu_avec_section():
    enregs = parse_moveset(_lire("moveset_sample.txt"))
    noms = {r["pokemon"] for r in enregs}
    assert "Charizard-Mega-Y" in noms


def test_separer_spread():
    assert separer_spread("Adamant:32/32/0/0/1/1") == ("Adamant", "32/32/0/0/1/1")
    assert separer_spread("sans-nature") == (None, "sans-nature")


# --- fenêtre de publication ------------------------------------------------
def test_le_mois_en_cours_est_exclu():
    """Smogon publie les stats d'un mois le 1er du mois suivant."""
    mois = mois_disponibles("2026-06-01", "2026-12-31", aujourdhui=date(2026, 9, 29))
    assert mois == ["2026-06", "2026-07", "2026-08"]


def test_le_dernier_mois_clos_est_inclus():
    mois = mois_disponibles("2026-06-01", "2026-08-31", aujourdhui=date(2026, 9, 29))
    assert "2026-08" in mois


def test_regulation_demarree_ce_mois_ci_ne_renvoie_rien():
    mois = mois_disponibles("2026-09-01", "2026-12-31", aujourdhui=date(2026, 9, 29))
    assert mois == []
