"""Duels de vérification des réglages de l'onglet : statuts, compteur du poison grave, Supreme Overlord,
nombre de coups, puissance doublée et effets cumulés (Rage Fist, Last Respects), recul et soin.
Les objets sont pris dans la liste du mode Champions, la seule que propose la page d'origine.

Usage : python3 make_settings.py <champions_data.json> <sortie.json>
"""
import json
import random
import sys

data_f, out_f = sys.argv[1:3]
data = json.load(open(data_f))
dex, moves = data["pokedex"], data["moves"]
rng = random.Random(27)

ZERO = {"hp": 0, "at": 0, "df": 0, "sa": 0, "sd": 0, "sp": 0}


def mon(name, nature, ability, item, sps, mvs, **extra):
    assert name in dex, name
    for m in mvs:
        assert m in moves, m
    assert item == "" or item in data["items"], item
    s = {"name": name, "nature": nature, "ability": ability, "item": item, "sps": {**ZERO, **sps}, "moves": mvs}
    s.update(extra)
    return s


wall = lambda item="Leftovers", status=None, **kw: mon(
    "Incineroar", "Careful", "Intimidate", item, {"hp": 32, "df": 16, "sd": 16},
    ["Fake Out", "Flare Blitz", "Drain Punch", "Parting Shot"], **({"status": status} if status else {}), **kw)

out = []
add = lambda mid, a, b, f=None: out.append({"id": mid, "a": a, "b": b, "f": f or {"format": "Doubles"}})

# poison grave : compteur par défaut, puis 1, 3 et 8, avec Leftovers, Sitrus Berry ou Focus Sash, en tempête de sable ou non
for c in (None, 1, 3, 8):
    for item in ("Leftovers", "Sitrus Berry", "Focus Sash"):
        extra = {} if c is None else {"toxicCounter": c}
        add(f"tox{c}-{item}", mon("Garchomp", "Jolly", "Rough Skin", "Life Orb", {"at": 32, "sp": 32},
                                    ["Earthquake", "Dragon Claw", "Rock Slide", "Stomping Tantrum"]),
            wall(item, "Badly Poisoned", **extra), {"format": "Doubles", "weather": "Sand" if c == 3 else ""})

# brûlure (attaque physique divisée par deux, Guts, Facade), paralysie (vitesse), sommeil (Hex), gel
add("brul-guts", mon("Conkeldurr", "Adamant", "Guts", "", {"hp": 32, "at": 32}, ["Mach Punch", "Drain Punch", "Facade", "Knock Off"], status="Burned"), wall())
add("brul-normal", mon("Garchomp", "Adamant", "Rough Skin", "Black Glasses", {"at": 32}, ["Earthquake", "Dragon Claw", "Rock Slide", "Iron Head"], status="Burned"), wall("Sitrus Berry", "Burned"))
add("para", mon("Dragapult", "Timid", "Infiltrator", "Wise Glasses", {"sa": 32, "sp": 32}, ["Draco Meteor", "Shadow Ball", "Hex", "Thunderbolt"], status="Paralyzed"), wall("Leftovers", "Paralyzed"))
add("hex-sommeil", mon("Dragapult", "Timid", "Infiltrator", "Life Orb", {"sa": 32, "sp": 32}, ["Hex", "Shadow Ball", "Draco Meteor", "Protect"]), wall("Leftovers", "Asleep"))
add("gel", mon("Kingambit", "Adamant", "Defiant", "Black Glasses", {"at": 32}, ["Kowtow Cleave", "Sucker Punch", "Iron Head", "Low Kick"]), wall("Leftovers", "Frozen"))

# Supreme Overlord, de 0 à 5 alliés K.O.
for n in range(6):
    add(f"so{n}", mon("Kingambit", "Adamant", "Supreme Overlord", "Black Glasses", {"hp": 32, "at": 32},
                      ["Kowtow Cleave", "Sucker Punch", "Iron Head", "Low Kick"], supremeOverlord=n), wall("Sitrus Berry"))

# effets cumulés : Rage Fist et Last Respects, de 0 à 6
for n in (0, 1, 3, 6):
    add(f"rf{n}", mon("Annihilape", "Adamant", "Defiant", "Leftovers", {"hp": 32, "at": 32},
                      ["Rage Fist", "Drain Punch", "Final Gambit", "Protect"], moveOpts=[{"timesAffected": n}, {}, {}, {}]), wall())
    add(f"lr{n}", mon("Basculegion", "Adamant", "Adaptability", "Black Glasses", {"at": 32, "sp": 32},
                      ["Last Respects", "Wave Crash", "Aqua Jet", "Flip Turn"], moveOpts=[{"timesAffected": n}, {}, {}, {}]), wall())

# nombre de coups : Bullet Seed, Population Bomb, Dragon Darts, Rock Blast par défaut, Skill Link, Beat Up
for h in (2, 3, 4, 5):
    add(f"bs{h}", mon("Rillaboom", "Adamant", "Grassy Surge", "Miracle Seed", {"at": 32}, ["Bullet Seed", "Grassy Glide", "Wood Hammer", "Fake Out"],
                      moveOpts=[{"hits": h}, {}, {}, {}]), wall())
for h in (1, 5, 10):
    add(f"pb{h}", mon("Maushold", "Jolly", "Technician", "Wide Lens", {"at": 32, "sp": 32}, ["Population Bomb", "Follow Me", "Protect", "Tidy Up"],
                      moveOpts=[{"hits": h}, {}, {}, {}]), wall("Sitrus Berry"))
add("dd2", mon("Dragapult", "Jolly", "Clear Body", "Black Glasses", {"at": 32, "sp": 32}, ["Dragon Darts", "Phantom Force", "U-turn", "Sucker Punch"],
               moveOpts=[{"hits": 2}, {}, {}, {}]), wall())
add("rb-dice", mon("Garchomp", "Jolly", "Rough Skin", "Wide Lens", {"at": 32, "sp": 32}, ["Rock Blast", "Scale Shot", "Earthquake", "Protect"]), wall())
add("skill-link", mon("Mega Heracross", "Adamant", "Skill Link", "", {"at": 32, "sp": 32}, ["Pin Missile", "Rock Blast", "Icicle Spear", "Protect"]), wall())
add("beat-up", mon("Whimsicott", "Timid", "Prankster", "Focus Sash", {"sp": 32}, ["Beat Up", "Moonblast", "Tailwind", "Encore"],
                   moveOpts=[{"hits": 6}, {}, {}, {}]), wall())

# puissance doublée, cochée puis non
for dbl in (False, True):
    add(f"double-{int(dbl)}", mon("Conkeldurr", "Brave", "Guts", "", {"hp": 32, "at": 32},
                                  ["Payback", "Stomping Tantrum", "Lash Out", "Temper Flare"], status="Burned",
                                  moveOpts=[{"double": dbl}] * 4), wall())
    add(f"double2-{int(dbl)}", mon("Mega Abomasnow", "Quiet", "Snow Warning", "Abomasite", {"hp": 32, "at": 16, "sa": 16},
                                   ["Avalanche", "Assurance", "Round", "Fickle Beam"], moveOpts=[{"double": dbl}] * 4), wall(),
        {"format": "Doubles", "weather": "Snow"})

# recul, drain, Rocky Helmet, Rough Skin, Shell Bell, Liquid Ooze, Rock Head
add("recul", mon("Talonflame", "Jolly", "Gale Wings", "Black Glasses", {"at": 32, "sp": 32}, ["Brave Bird", "Flare Blitz", "U-turn", "Double-Edge"]),
    mon("Garchomp", "Jolly", "Rough Skin", "Rocky Helmet", {"hp": 32, "df": 32}, ["Earthquake", "Dragon Claw", "Rock Slide", "Protect"]))
add("drain", mon("Venusaur", "Modest", "Chlorophyll", "Big Root", {"sa": 32, "sp": 32}, ["Giga Drain", "Sludge Bomb", "Leaf Storm", "Strength Sap"]),
    mon("Toxapex", "Calm", "Liquid Ooze", "Leftovers", {"hp": 32, "sd": 32}, ["Scald", "Sludge Bomb", "Acid Spray", "Rapid Spin"]))
add("rockhead", mon("Aggron", "Adamant", "Rock Head", "Shell Bell", {"at": 32}, ["Head Smash", "Double-Edge", "Heavy Slam", "Iron Head"]), wall())

# tirage : réglages mêlés sur des sets au hasard parmi ceux ci-dessus
for k in range(12):
    a = json.loads(json.dumps(rng.choice(out)["a"]))
    b = json.loads(json.dumps(rng.choice(out)["a"]))
    b["status"] = rng.choice(["Healthy", "Burned", "Paralyzed", "Poisoned", "Badly Poisoned", "Asleep"])
    if b["status"] == "Badly Poisoned":
        b["toxicCounter"] = rng.randint(1, 15)
    b["hpPercent"] = rng.choice([100, 81, 50, 33])
    add(f"mix{k}", a, b, {"format": rng.choice(["Doubles", "Singles"]), "weather": rng.choice(["", "Sun", "Rain", "Sand", "Snow"]),
                        "terrain": rng.choice(["", "Grassy", "Electric", "Psychic", "Misty"])})

json.dump(out, open(out_f, "w"))
print(len(out), "duels")
