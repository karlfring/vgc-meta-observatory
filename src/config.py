"""Configuration centrale du pipeline d'ingestion VGC Champions."""

from pathlib import Path

# --- Chemins ---------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DATA_RAW = ROOT / "data" / "raw"        # fichiers bruts archivés (audit)
DATA_OUT = ROOT / "data" / "processed"  # CSV consommés par Power BI

# --- Source Smogon ---------------------------------------------------------
SMOGON_BASE = "https://www.smogon.com/stats"

# Régulation suivie. Le projet se concentre sur la régulation en cours :
# les précédentes ne reflètent plus le métagame joué.
#
# À la sortie de M-D : ajouter son entrée avec "courante": True et passer
# M-C à False. Le modèle Power BI absorbe la nouvelle régulation sans
# modification, grâce à la dimension dim_regulation.
REGULATIONS = {
    "M-C": {
        "format_id": "gen9championsvgc2026regmcbo3",
        "date_debut": "2026-09-01",
        "date_fin": "2026-12-31",
        "courante": True,
    },
}

# Paliers de classement publiés par Smogon
RATING_BRACKETS = {
    0: "Tout le ladder",
    1500: "Intermédiaire",
    1630: "Avancé",
    1760: "Élite",
}

# --- Politesse réseau ------------------------------------------------------
USER_AGENT = "vgc-meta-observatory/1.0 (projet portfolio data ; usage non commercial)"
REQUEST_DELAY_S = 2.0   # délai entre deux requêtes
REQUEST_TIMEOUT_S = 30
MAX_RETRIES = 3
