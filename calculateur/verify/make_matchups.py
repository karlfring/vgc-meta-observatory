"""Duels de vérification tirés des sets les plus joués du dernier mois (builds du tableau de bord, palier 1500).

Chaque Pokémon du top 24 affronte les trois suivants, puis une série de scénarios teste météo, champs,
protections, boosts, statuts, PV bas, coups critiques et talent désactivé.

Usage : python3 make_matchups.py <builds.json> <pokemon.json> <champions_data.json> <sortie.json>
"""
import json
import re
import sys
from collections import defaultdict

# noms Smogon dont l'équivalent dans le calculateur ne suit pas la règle générale
SPECIAL = {"Gourgeist": "Gourgeist-Average", "Lycanroc": "Lycanroc-Midday",
           "Meowstic-F-Mega": "Mega Meowstic", "Meowstic-M-Mega": "Mega Meowstic"}


def to_ncp(n):
    """Nom Smogon vers nom du calculateur : Charizard-Mega-Y devient Mega Charizard Y."""
    if n in SPECIAL:
        return SPECIAL[n]
    m = re.match(r"^(.*)-Mega(?:-([XYZ]))?$", n)
    if m:
        return "Mega " + m.group(1) + (" " + m.group(2) if m.group(2) else "")
    return n


class Sets:
    """Sets les plus joués au palier 1500, d'après les fichiers du tableau de bord."""

    def __init__(self, builds_f, pokemon_f, data_f):
        pokemon = json.load(open(pokemon_f, encoding="utf-8"))
        dernier = max(r["mois"] for r in pokemon)
        self.usage = sorted((r for r in pokemon if r["mois"] == dernier), key=lambda r: r["rang"])
        self.data = json.load(open(data_f, encoding="utf-8"))
        self.dex = self.data["pokedex"]
        self.by = defaultdict(lambda: defaultdict(list))
        for r in json.load(open(builds_f, encoding="utf-8")):
            if r["palier"] == 1500:
                self.by[r["pokemon"]][r["categorie"]].append(r)

    def joue(self, name):
        return bool(self.by[name]["Capacité"]) and to_ncp(name) in self.dex

    def top_set(self, name):
        b = self.by[name]
        pick = lambda c: max(b[c], key=lambda r: r["adoption"])["valeur"] if b[c] else ""
        spread = [r for r in b["Spread"] if ":" in r["valeur"]]
        nature, sps = "Serious", [0] * 6
        if spread:
            nat, evs = max(spread, key=lambda r: r["adoption"])["valeur"].split(":")
            nature, sps = nat.strip(), [int(x) for x in evs.split("/")]
        moves = [r["valeur"] for r in sorted(b["Capacité"], key=lambda r: -r["adoption"]) if r["valeur"] in self.data["moves"]][:4]
        item = pick("Objet")
        item = item if item in self.data["items"] else ""
        spec = {"name": to_ncp(name), "nature": nature, "ability": pick("Talent"), "item": item,
                "sps": dict(zip(["hp", "at", "df", "sa", "sd", "sp"], sps)), "moves": moves}
        if item == "Flame Orb":
            spec["status"] = "Burned"
        if item == "Toxic Orb":
            spec["status"] = "Badly Poisoned"
        return spec


def main(builds_f, pokemon_f, data_f, out_f):
    s = Sets(builds_f, pokemon_f, data_f)
    top = [r["pokemon"] for r in s.usage if s.by[r["pokemon"]]["Capacité"]][:24]
    sets = {n: s.top_set(n) for n in top}
    matchups = []
    # chaque Pokémon du top 24 contre les trois suivants, en double, sans effet de terrain
    for i, a in enumerate(top):
        for b in top[i + 1:i + 4]:
            matchups.append({"id": f"{a} vs {b}", "a": sets[a], "b": sets[b], "f": {"format": "Doubles"}})
    # scénarios de terrain et d'état ; un scénario dont un Pokémon n'est plus joué est sauté
    S = lambda n, **kw: {**s.top_set(n), **kw}
    scenarios = [
        ("soleil", "Charizard-Mega-Y", {}, "Incineroar", {}, {"format": "Doubles", "weather": "Sun"}),
        ("pluie", "Pelipper", {}, "Rillaboom", {}, {"format": "Doubles", "weather": "Rain"}),
        ("sable", "Kingambit", {}, "Garchomp", {}, {"format": "Doubles", "weather": "Sand"}),
        ("neige", "Sneasler", {}, "Archaludon", {}, {"format": "Doubles", "weather": "Snow"}),
        ("herbu", "Rillaboom", {}, "Garchomp", {}, {"format": "Doubles", "terrain": "Grassy"}),
        ("psy", "Farigiraf", {}, "Sneasler", {}, {"format": "Doubles", "terrain": "Psychic"}),
        ("électrique", "Raichu-Mega-Y", {}, "Basculegion", {}, {"format": "Doubles", "terrain": "Electric"}),
        ("brumeux", "Garchomp-Mega-Z", {}, "Floette-Mega", {}, {"format": "Doubles", "terrain": "Misty"}),
        ("protection", "Kingambit", {}, "Sneasler", {}, {"format": "Doubles", "sides": [{}, {"reflect": True, "lightScreen": True}]}),
        ("voile aurore", "Garchomp", {}, "Incineroar", {}, {"format": "Doubles", "sides": [{}, {"auroraVeil": True}]}),
        ("coup d'main", "Gholdengo", {}, "Rillaboom", {}, {"format": "Doubles", "sides": [{"helpingHand": True}, {"friendGuard": True}]}),
        ("simple", "Sneasler", {}, "Kingambit", {}, {"format": "Singles"}),
        ("boosts", "Kingambit", {"boosts": {"at": 2}}, "Incineroar", {"boosts": {"df": -1}}, {"format": "Doubles"}),
        ("brûlure", "Sneasler", {"status": "Burned"}, "Rillaboom", {"hpPercent": 50}, {"format": "Doubles"}),
        ("pv bas", "Garchomp", {}, "Charizard-Mega-Y", {"hpPercent": 30}, {"format": "Doubles"}),
        ("critique", "Basculegion", {"moveOpts": [{"crit": True}, {"crit": True}, {}, {}]}, "Archaludon", {}, {"format": "Doubles"}),
        ("sans intimidation", "Garchomp", {}, "Incineroar", {"abilityOn": False}, {"format": "Doubles"}),
    ]
    sautes = []
    for name, a, ka, b, kb, f in scenarios:
        if s.joue(a) and s.joue(b):
            matchups.append({"id": name, "a": S(a, **ka), "b": S(b, **kb), "f": f})
        else:
            sautes.append(name)
    json.dump(matchups, open(out_f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(matchups), "duels ;", len(top), "sets", f"; scénarios sautés : {', '.join(sautes)}" if sautes else "")


if __name__ == "__main__":
    main(*sys.argv[1:5])
