"""Compare, duel par duel, les résultats du moteur empaqueté à ceux de la page d'origine du calculateur NCP.

Usage : python3 compare.py <origine.json> <moteur.json>
Code de sortie 1 s'il reste un écart réel.

Sont comparés, pour chacune des huit attaques d'un duel : les seize jets de dégâts, la chance de K.O., la
description et le texte affiché (pourcentages, recul ou soin) ; pour chaque Pokémon : nom, PV, statistiques,
objet, talent, statut et capacités. Deux écarts sont tolérés, car ils ne viennent pas du calcul :
- abilityOn : la page d'origine garde l'état d'une case masquée d'un duel à l'autre ; son effet réel sur
  les dégâts est vérifié par la comparaison des jets ;
- les chances de K.O. que la page d'origine remplace par un lien humoristique (capacités OHKO comme
  Sheer Cold, capacités de puissance nulle) : le tableau de bord affiche une phrase à la place.
"""
import json
import sys

CHAMPS = ("name", "maxHP", "raw", "item", "ability", "status", "moves")


def ecarts(origine, moteur):
    """Liste des écarts réels : (duel, élément, valeur d'origine, valeur du moteur)."""
    out = []
    for mid, r in origine.items():
        p = moteur.get(mid)
        if "error" in r or not p or "error" in p:
            out.append((mid, "erreur", r.get("error"), (p or {}).get("error")))
            continue
        for who in ("p1", "p2"):
            for k in CHAMPS:
                if r[who][k] != p[who][k]:
                    out.append((mid, f"{who}.{k}", r[who][k], p[who][k]))
        for s in range(2):
            for i in range(4):
                a, b = r["out"][s][i], p["out"][s][i]
                if a["damage"] != b["damage"]:
                    out.append((mid, f"dégâts {s}.{i}", a["damage"], b["damage"]))
                if a["ko"] != b["ko"] and not str(a["ko"]).startswith("<a "):
                    out.append((mid, f"K.O. {s}.{i}", a["ko"], b["ko"]))
                if a["description"] != b["description"]:
                    out.append((mid, f"description {s}.{i}", a["description"], b["description"]))
                if "dmgText" in a and a["dmgText"] != b.get("dmgText"):
                    out.append((mid, f"texte {s}.{i}", a["dmgText"], b.get("dmgText")))
    return out


def main(origine_f, moteur_f):
    origine = json.load(open(origine_f, encoding="utf-8"))
    moteur = json.load(open(moteur_f, encoding="utf-8"))
    e = ecarts(origine, moteur)
    print(f"{len(origine)} duels, {8 * len(origine)} attaques comparées : {len(e)} écart(s)")
    for d in e[:25]:
        print(" -", d[0], "|", d[1], "|", str(d[2])[:160], "||", str(d[3])[:160])
    return 1 if e else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
