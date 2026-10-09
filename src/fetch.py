"""Téléchargement des fichiers Smogon, avec archivage et traçabilité.

Principes :
  - un fichier déjà archivé n'est jamais re-téléchargé (idempotence) ;
  - chaque téléchargement est espacé de REQUEST_DELAY_S (politesse) ;
  - un hash SHA-256 est calculé pour détecter une republication silencieuse.
"""

from __future__ import annotations

import hashlib
import logging
import time
from datetime import date
from pathlib import Path

import requests

from config import (
    DATA_RAW,
    MAX_RETRIES,
    REQUEST_DELAY_S,
    REQUEST_TIMEOUT_S,
    SMOGON_BASE,
    USER_AGENT,
)

log = logging.getLogger(__name__)

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": USER_AGENT})
_dernier_appel = 0.0


def _attendre() -> None:
    """Garantit un délai minimum entre deux requêtes."""
    global _dernier_appel
    ecoule = time.monotonic() - _dernier_appel
    if ecoule < REQUEST_DELAY_S:
        time.sleep(REQUEST_DELAY_S - ecoule)
    _dernier_appel = time.monotonic()


def _mois_precedent(d: date) -> date:
    """Premier jour du mois précédant celui de d."""
    return date(d.year - 1, 12, 1) if d.month == 1 else date(d.year, d.month - 1, 1)


def _mois_suivant(d: date) -> date:
    return date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)


def mois_disponibles(
    depuis: str, jusqu_a: str | None = None, aujourdhui: date | None = None
) -> list[str]:
    """Liste les mois 'YYYY-MM' publiés entre deux dates.

    Smogon publie les stats d'un mois le 1er du mois suivant : le mois en
    cours n'est donc jamais disponible. Le dernier mois retournable est le
    mois précédent.

    `aujourdhui` est injectable pour les tests.
    """
    ref = aujourdhui or date.today()
    debut = date.fromisoformat(depuis).replace(day=1)
    dernier_publie = _mois_precedent(ref)

    fin = date.fromisoformat(jusqu_a).replace(day=1) if jusqu_a else dernier_publie
    fin = min(fin, dernier_publie)

    mois: list[str] = []
    courant = debut
    while courant <= fin:
        mois.append(f"{courant.year:04d}-{courant.month:02d}")
        courant = _mois_suivant(courant)
    return mois


def url_usage(mois: str, format_id: str, palier: int) -> str:
    return f"{SMOGON_BASE}/{mois}/{format_id}-{palier}.txt"


def url_moveset(mois: str, format_id: str, palier: int) -> str:
    return f"{SMOGON_BASE}/{mois}/moveset/{format_id}-{palier}.txt"


def telecharger(url: str, chemin_local: Path) -> tuple[str, str] | None:
    """Télécharge une URL vers chemin_local (si absent) et retourne (texte, hash).

    Retourne None si le fichier n'existe pas côté Smogon (404) : c'est le cas
    normal pour un mois où la régulation n'était pas encore active.
    """
    if chemin_local.exists():
        texte = chemin_local.read_text(encoding="utf-8")
        log.debug("cache: %s", chemin_local.name)
        return texte, hashlib.sha256(texte.encode("utf-8")).hexdigest()

    for tentative in range(1, MAX_RETRIES + 1):
        _attendre()
        try:
            rep = _SESSION.get(url, timeout=REQUEST_TIMEOUT_S)
        except requests.RequestException as err:
            log.warning("erreur reseau (%s/%s) %s : %s", tentative, MAX_RETRIES, url, err)
            time.sleep(2 ** tentative)
            continue

        if rep.status_code == 404:
            log.info("absent (404) : %s", url)
            return None
        if rep.status_code == 200:
            texte = rep.text
            chemin_local.parent.mkdir(parents=True, exist_ok=True)
            chemin_local.write_text(texte, encoding="utf-8")
            log.info("telecharge : %s (%s octets)", chemin_local.name, len(texte))
            return texte, hashlib.sha256(texte.encode("utf-8")).hexdigest()

        log.warning("HTTP %s (%s/%s) %s", rep.status_code, tentative, MAX_RETRIES, url)
        time.sleep(2 ** tentative)

    log.error("echec definitif : %s", url)
    return None


def chemin_archive(mois: str, format_id: str, palier: int, genre: str) -> Path:
    """Chemin d'archivage local d'un fichier brut."""
    return DATA_RAW / mois / f"{format_id}-{palier}-{genre}.txt"
