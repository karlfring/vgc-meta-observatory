"""Duels aléatoires : Pokémon du ladder avec leur set le plus joué, terrain et états tirés au hasard (graine fixe).

Usage : python3 make_random.py <builds.json> <pokemon.json> <champions_data.json> <sortie.json>
"""
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_matchups import Sets  # noqa: E402

W = ["", "", "", "Sun", "Rain", "Sand", "Snow"]
T = ["", "", "", "Grassy", "Psychic", "Electric", "Misty"]


def main(builds_f, pokemon_f, data_f, out_f, n=320, graine=14):
    s = Sets(builds_f, pokemon_f, data_f)
    random.seed(graine)
    names = [n_ for n_ in s.by if s.joue(n_)]
    out = []
    for k in range(n):
        a, b = random.sample(names, 2)
        sa, sb = s.top_set(a), s.top_set(b)
        if random.random() < .25:
            sa["boosts"] = {random.choice(["at", "sa"]): random.choice([-1, 1, 2])}
        if random.random() < .2:
            sb["boosts"] = {random.choice(["df", "sd"]): random.choice([-1, 1])}
        if random.random() < .15:
            sb["hpPercent"] = random.choice([25, 50, 75])
        if random.random() < .1 and "status" not in sa:
            sa["status"] = random.choice(["Burned", "Paralyzed", "Poisoned"])
        if random.random() < .15:
            sa["moveOpts"] = [{"crit": True}] * 4
        side = lambda: {x: True for x in ["reflect", "lightScreen", "auroraVeil", "helpingHand", "friendGuard", "tailwind"] if random.random() < .12}
        f = {"format": random.choice(["Doubles"] * 4 + ["Singles"]), "weather": random.choice(W), "terrain": random.choice(T), "sides": [side(), side()]}
        out.append({"id": f"r{k} {a} vs {b}", "a": sa, "b": sb, "f": f})
    json.dump(out, open(out_f, "w", encoding="utf-8"), ensure_ascii=False)
    print(len(out), "duels aléatoires parmi", len(names), "Pokémon")


if __name__ == "__main__":
    main(*sys.argv[1:5])
