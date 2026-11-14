"""Non-régression du calculateur de dégâts.

Le moteur empaqueté (dist/calc-moteur.js) doit redonner, duel par duel, les résultats que la page d'origine du
calculateur NCP a calculés pour la même version (tests/reference/, écrits par rebuild.sh). Ces tests ne
demandent que Node.js ; la comparaison avec la page d'origine elle-même se fait avec rebuild.sh.

Ils sont à part des tests du pipeline (tests/), pour qu'un souci du calculateur ne bloque jamais l'ingestion
mensuelle : python -m pytest calculateur/tests -q
"""
import gzip
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ICI = Path(__file__).resolve().parent
CALC = ICI.parent
REF = ICI / "reference"
MOTEUR = CALC / "dist" / "calc-moteur.js"
DONNEES = CALC / "dist" / "champions_data.json"
JEUX = ["courants", "aleatoires", "reglages"]

sys.path.insert(0, str(CALC / "verify"))
from compare import ecarts  # noqa: E402

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="Node.js n'est pas installé")


def _decompresser(nom, dest):
    dest.write_bytes(gzip.decompress((REF / nom).read_bytes()))
    return dest


@pytest.mark.parametrize("jeu", JEUX)
def test_moteur_identique_a_la_page_d_origine(jeu, tmp_path):
    duels = _decompresser(f"{jeu}.duels.json.gz", tmp_path / "duels.json")
    sortie = tmp_path / "moteur.json"
    subprocess.run(["node", str(CALC / "verify" / "run_engine.js"), str(MOTEUR), str(DONNEES), str(duels), str(sortie)],
                   check=True, capture_output=True, text=True)
    origine = json.loads(gzip.decompress((REF / f"{jeu}.origine.json.gz").read_bytes()))
    assert len(origine) > 50
    assert ecarts(origine, json.loads(sortie.read_text(encoding="utf-8"))) == []


def test_mode_strict_et_aucune_variable_globale(tmp_path):
    duels = [str(_decompresser(f"{jeu}.duels.json.gz", tmp_path / f"{jeu}.json")) for jeu in JEUX]
    r = subprocess.run(["node", str(CALC / "verify" / "strict_check.js"), str(MOTEUR), str(DONNEES), *duels],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


def test_donnees_et_moteur_de_la_meme_version():
    source = json.loads(DONNEES.read_text(encoding="utf-8"))["source"]
    entete = MOTEUR.read_text(encoding="utf-8")[:1500]
    assert re.search(rf"\(commit {re.escape(source['commit'])} du ", entete)
    assert "Permission is hereby granted" in MOTEUR.read_text(encoding="utf-8")[:4000]
