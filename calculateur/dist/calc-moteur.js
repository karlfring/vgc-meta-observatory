/* Calculateur de dégâts de VGC Meta Overview : moteur du Nimbasa City Post VGC Damage Calculator,
 * mode Champions (génération 10), repris sans modification de ses formules.
 * Source : https://github.com/nerd-of-now/NCP-VGC-Damage-Calculator (commit a2e408c du 24 octobre 2026),
 * fichiers damage_MASTER.js, damage_SV.js, ko_chance.js, les fonctions d'item_data.js, et calcUserHP et
 * userHPResultText d'ap_calc.js.
 * Ajouts propres au tableau de bord : l'enveloppe ci-dessous, un remplaçant de jQuery (les cases que le
 * moteur lit) et un adaptateur qui construit les objets Pokémon et Terrain comme le fait ap_calc.js.
 * Fichier construit par calculateur/build/build_engine.js (dépôt vgc-meta-observatory).
 *
 * Licence du moteur d'origine :
 *
 * MIT License
 *
 * Copyright (c) 2013-2021 Honko, Tapin, Firestorm, Jake White (squirrelboyVGC), nerd-of-now, and other contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(function () {
  // État global attendu par le moteur, en mode Champions
  var gen = 10, resultDisplayMode = 'SPs', transformSpecies = { p1: '', p2: '' };
  var pokedex = {}, typeChart = {}, moves = {}, items = [], abilities = [], NATURES = {};
  var ZMOVES_LOOKUP = {}, MAXMOVES_LOOKUP = {}, G_MAXMOVES_TYPE = {}, G_MAXMOVES_LOOKUP = {};
  var AT = 'at', DF = 'df', SA = 'sa', SD = 'sd', SP = 'sp', SL = 'sl';
  var STATS = [AT, DF, SA, SD, SP];
  var lastHighestStat = [0, 0], manualProtoQuark = false, mechanicsTests = {}, turnOffOverflow = false, isCustomMods = false;
  var setHasTypeFunc = function () {
    for (var i = 0; i < arguments.length; i++) { if ([this.type1, this.type2].indexOf(arguments[i]) !== -1) return true; }
    return false;
  };
  // Variables que le moteur d'origine affecte sans les déclarer. Déclarées ici, elles restent dans cette
  // enveloppe : aucune variable globale n'est créée, et le moteur fonctionne aussi en mode strict.
  var addedNum, allStats, atMods, attacker_name, autoLevel, check, counteredResult, damageNum, defender_name, defense, eachVal, eotType, finalMods, finalNum, i, immuneBuildDesc, isInt, overlordBoost, pivotNum, randIndex, setDamageBuildDesc, spreadNum;
  // Une alerte du moteur (cas prévu comme impossible) part dans la console au lieu d'ouvrir une boîte de dialogue.
  var alert = function (msg) { if (typeof console !== 'undefined') console.warn('[calculateur] ' + msg); };

/* ---- remplaçant de jQuery ---- */
// Remplace jQuery pour le moteur NCP. Le moteur ne lit la page qu'à quelques endroits : des cases à cocher
// (Fairy Aura, Dark Aura, Aura Break, les quatre talents « of Ruin », Weakness Policy activée...).
// Ces cases sont lues ici dans NCP_FLAGS, que l'adaptateur remplit avant chaque calcul ; tout le reste est inerte.
var NCP_FLAGS = {};
var $ = (function () {
  function inert() {
    var q = {
      length: 0,
      is: function () { return false; }, prop: function () { return false; }, val: function () { return undefined; },
      text: function () { return q; }, find: function () { return q; },
    };
    return q;
  }
  function query(selector) {
    var sel = String(selector);
    var m = sel.match(/^input:checkbox\[id='([^']+)'\]:checked$/);
    if (m) {
      var on = !!NCP_FLAGS[m[1]];
      return { length: on ? 1 : 0, val: function () { return on ? 'on' : undefined; } };
    }
    m = sel.match(/^#([A-Za-z0-9_-]+)$/);
    if (m && Object.prototype.hasOwnProperty.call(NCP_FLAGS, m[1])) {
      var flag = !!NCP_FLAGS[m[1]];
      var q = inert();
      q.prop = function (name) { return name === 'checked' ? flag : false; };
      q.is = function (s) { return s === ':checked' ? flag : false; };
      return q;
    }
    return inert();
  }
  query.isEmptyObject = function (o) { return !o || Object.keys(o).length === 0; };
  return query;
})();


/* ---- item_data.js (fonctions et tables) ---- */
function getItemBoostType(item) {
    switch (item) {
        case 'Draco Plate':
        case 'Dragon Fang':
            return 'Dragon';
        case 'Dread Plate':
        case 'BlackGlasses':
        case 'Black Glasses':
            return 'Dark';
        case 'Earth Plate':
        case 'Soft Sand':
            return 'Ground';
        case 'Fist Plate':
        case 'Black Belt':
            return 'Fighting';
        case 'Flame Plate':
        case 'Charcoal':
            return 'Fire';
        case 'Icicle Plate':
        case 'NeverMeltIce':
        case 'Never-Melt Ice':
            return 'Ice';
        case 'Insect Plate':
        case 'SilverPowder':
        case 'Silver Powder':
            return 'Bug';
        case 'Iron Plate':
        case 'Metal Coat':
            return 'Steel';
        case 'Meadow Plate':
        case 'Rose Incense':
        case 'Miracle Seed':
            return 'Grass';
        case 'Mind Plate':
        case 'Odd Incense':
        case 'TwistedSpoon':
        case 'Twisted Spoon':
            return 'Psychic';
        case 'Pixie Plate':
        case 'Fairy Feather':
            return 'Fairy';
        case 'Sky Plate':
        case 'Sharp Beak':
            return 'Flying';
        case 'Splash Plate':
        case 'Sea Incense':
        case 'Wave Incense':
        case 'Mystic Water':
            return 'Water';
        case 'Spooky Plate':
        case 'Spell Tag':
            return 'Ghost';
        case 'Stone Plate':
        case 'Rock Incense':
        case 'Hard Stone':
            return 'Rock';
        case 'Toxic Plate':
        case 'Poison Barb':
            return 'Poison';
        case 'Zap Plate':
        case 'Magnet':
            return 'Electric';
        case 'Silk Scarf':
        case 'Pink Bow':
        case 'Polkadot Bow':
            return 'Normal';
        default:
            return '';
    }
}

function getItemDualTypeBoost(item, species) {
    switch (item) {
        case 'Adamant Orb':
            if (species === 'Dialga') return 'Steel Dragon';
        case 'Lustrous Orb':
            if (species === 'Palkia') return 'Water Dragon';
        case 'Griseous Orb':
            if ((species === 'Giratina-Origin' && gen <= 8) || (species === 'Giratina' && gen >= 9)) return 'Ghost Dragon';
        case 'Soul Dew':
            if ((species === 'Latias' || species === 'Latios') && gen >= 7) return 'Dragon Psychic';
        case 'Adamant Crystal':
            if (species === 'Dialga-Origin') return 'Steel Dragon';
        case 'Lustrous Globe':
            if (species === 'Palkia-Origin') return 'Water Dragon';
        case 'Griseous Core':
            if (species === 'Giratina-Origin') return 'Ghost Dragon';
        default:
            return '';
    }
}

function getBerryResistType(berry) {
    switch (berry) {
        case 'Chilan Berry':
            return 'Normal';
        case 'Occa Berry':
            return 'Fire';
        case 'Passho Berry':
            return 'Water';
        case 'Wacan Berry':
            return 'Electric';
        case 'Rindo Berry':
            return 'Grass';
        case 'Yache Berry':
            return 'Ice';
        case 'Chople Berry':
            return 'Fighting';
        case 'Kebia Berry':
            return 'Poison';
        case 'Shuca Berry':
            return 'Ground';
        case 'Coba Berry':
            return 'Flying';
        case 'Payapa Berry':
            return 'Psychic';
        case 'Tanga Berry':
            return 'Bug';
        case 'Charti Berry':
            return 'Rock';
        case 'Kasib Berry':
            return 'Ghost';
        case 'Haban Berry':
            return 'Dragon';
        case 'Colbur Berry':
            return 'Dark';
        case 'Babiri Berry':
            return 'Steel';
        case 'Roseli Berry':
            return 'Fairy';
        default:
            return '';
    }
}

function getFlingPower(item) {
    isInt = parseInt(item);
    return isNaN(isInt) ?
        (item === 'Iron Ball' || (item === 'Big Nugget' && gen >= 8) || (gen == 4 && item === 'Klutz Iron Ball') ? 130
            : ['Hard Stone', 'Room Service'].indexOf(item) !== -1 ? 100
                : item.indexOf('Plate') !== -1 || ['Deep Sea Tooth', 'Thick Club', 'Grip Claw'].indexOf(item) !== -1 ? 90
                    : (item.indexOf('ite') !== -1 && item == 'Eviolite') || ['Assault Vest', 'Weakness Policy', 'Blunder Policy',
                        'Heavy-Duty Boots', 'Quick Claw', 'Razor Claw', 'Safety Goggles'].indexOf(item) !== -1 ? 80
                        : ['Poison Barb', 'Dragon Fang', 'Power Anklet', 'Power Band', 'Power Belt', 'Power Bracer', 'Power Lens',
                            'Power Weight', 'Burn Drive', 'Chill Drive', 'Douse Drive', 'Shock Drive'].indexOf(item) !== -1 ? 70
                            : ['Adamant Orb', 'Lustrous Orb', 'Macho Brace', 'Leek', 'Rocky Helmet', 'Utility Umbrella', 'Terrain Extender',
                                'Damp Rock', 'Heat Rock'].indexOf(item) !== -1 ? 60
                                : item.indexOf('Memory') !== -1 || ['Sharp Beak', 'Eject Pack'].indexOf(item) !== -1 ? 50
                                    : ['Eviolite', 'Icy Rock', 'Lucky Punch'].indexOf(item) !== -1 ? 40
                                        : ['Black Belt', 'Black Sludge', 'Black Glasses', 'Charcoal', 'Deep Sea Scale', 'Flame Orb', "King's Rock",
                                            'Life Orb', 'Light Ball', 'Magnet', 'Metal Coat', 'Miracle Seed', 'Mystic Water', 'Never-Melt Ice',
                                            'Razor Fang', 'Soul Dew', 'Spell Tag', 'Toxic Orb', 'Twisted Spoon', 'Absorb Bulb', 'Adrenaline Orb',
                                            'Berry Juice', 'Binding Band', 'Eject Button', 'Float Stone', 'Light Clay', 'Luminous Moss',
                                            'Metronome', 'Protective Pads', 'Shell Bell', 'Throat Spray', 'Covert Cloak', 'Loaded Dice',
                                            'Ability Shield', 'Booster Energy', 'Clear Amulet', 'Punching Glove', 'Big Nugget'].indexOf(item) !== -1 ? 30
                                            : 10)
        : isInt;
}

function getNaturalGift(item) {
    var gift = {
        'Aguav Berry': { 't': 'Dragon', 'p': 80 },
        'Apicot Berry': { 't': 'Ground', 'p': 100 },
        'Aspear Berry': { 't': 'Ice', 'p': 80 },
        'Babiri Berry' : {'t':'Steel','p':80},
        'Belue Berry': { 't': 'Electric', 'p': 100 },
        'Bluk Berry': { 't': 'Fire', 'p': 90 },
        'Charti Berry': { 't': 'Rock', 'p': 80 },
        'Cheri Berry': { 't': 'Fire', 'p': 80 },
        'Chesto Berry' : {'t':'Water','p':80},
        'Chilan Berry' : {'t':'Normal','p':80},
        'Chople Berry' : {'t':'Fighting','p':80},
        'Coba Berry' : {'t':'Flying','p':80},
        'Colbur Berry': { 't': 'Dark', 'p': 80 },
        'Cornn Berry': { 't': 'Bug', 'p': 90 },
        'Custap Berry' : {'t':'Ghost','p':100},
        'Durin Berry' : {'t':'Water','p':100},
        'Enigma Berry': { 't': 'Bug', 'p': 100 },
        'Figy Berry': { 't': 'Bug', 'p': 80 },
        'Ganlon Berry': { 't': 'Ice', 'p': 100 },
        'Grepa Berry': { 't': 'Flying', 'p': 90 },
        'Haban Berry': { 't': 'Dragon', 'p': 80 },
        'Hondew Berry': { 't': 'Ground', 'p': 90 },
        'Iapapa Berry': { 't': 'Dark', 'p': 80 },
        'Jaboca Berry' : {'t':'Dragon','p':100},
        'Kasib Berry' : {'t':'Ghost','p':80},
        'Kebia Berry' : {'t':'Poison','p':80},
        'Kee Berry' : {'t':'Fairy','p':100},
        'Lansat Berry' : {'t':'Flying','p':100},
        'Leppa Berry' : {'t':'Fighting','p':80},
        'Liechi Berry' : {'t':'Grass','p':100},
        'Lum Berry': { 't': 'Flying', 'p': 80 },
        'Mago Berry': { 't': 'Ghost', 'p': 80 },
        'Magost Berry': { 't': 'Rock', 'p': 90 },
        'Maranga Berry' : {'t':'Dark','p':100},
        'Micle Berry': { 't': 'Rock', 'p': 100 },
        'Nanab Berry': { 't': 'Water', 'p': 90 },
        'Nomel Berry': { 't': 'Dragon', 'p': 90 },
        'Occa Berry' : {'t':'Fire','p':80},
        'Oran Berry': { 't': 'Poison', 'p': 80 },
        'Pamtre Berry': { 't': 'Steel', 'p': 90 },
        'Passho Berry' : {'t':'Water','p':80},
        'Payapa Berry': { 't': 'Psychic', 'p': 80 },
        'Pecha Berry': { 't': 'Electric', 'p': 80 },
        'Persim Berry': { 't': 'Ground', 'p': 80 },
        'Petaya Berry': { 't': 'Poison', 'p': 100 },
        'Pinap Berry': { 't': 'Grass', 'p': 90 },
        'Pomeg Berry': { 't': 'Ice', 'p': 90 },
        'Qualot Berry': { 't': 'Poison', 'p': 90 },
        'Rabuta Berry': { 't': 'Ghost', 'p': 90 },
        'Rawst Berry': { 't': 'Grass', 'p': 80 },
        'Razz Berry': { 't': 'Steel', 'p': 80 },
        'Rindo Berry' : {'t':'Grass','p':80},
        'Roseli Berry' : {'t':'Fairy','p':80},
        'Rowap Berry' : {'t':'Dark','p':100},
        'Salac Berry' : {'t':'Fighting','p':100},
        'Shuca Berry' : {'t':'Ground','p':80},
        'Sitrus Berry': { 't': 'Psychic', 'p': 80 },
        'Spelon Berry': { 't': 'Dark', 'p': 90 },
        'Starf Berry': { 't': 'Psychic', 'p': 100 },
        'Tamato Berry': { 't': 'Psychic', 'p': 90 },
        'Tanga Berry' : {'t':'Bug','p':80},
        'Wacan Berry' : {'t':'Electric','p':80},
        'Watmel Berry': { 't': 'Fire', 'p': 100 },
        'Wepear Berry': { 't': 'Electric', 'p': 90 },
        'Wiki Berry': { 't': 'Rock', 'p': 80 },
        'Yache Berry' : {'t':'Ice','p':80}
    }[item];
    if (gift) {
        if (gen < 6) {
            gift.p -= 20;
        }
        return gift;
    }
    return {'t':'Normal','p':1};


}

function getMemoryType(item) {
    switch (item) {
        case 'Bug Memory': return 'Bug';
        case 'Dark Memory': return 'Dark';
        case 'Dragon Memory': return 'Dragon';
        case 'Electric Memory': return 'Electric';
        case 'Fairy Memory': return 'Fairy';
        case 'Fighting Memory': return 'Fighting';
        case 'Fire Memory': return 'Fire';
        case 'Flying Memory': return 'Flying';
        case 'Ghost Memory': return 'Ghost';
        case 'Grass Memory': return 'Grass';
        case 'Ground Memory': return 'Ground';
        case 'Ice Memory': return 'Ice';
        case 'Poison Memory': return 'Poison';
        case 'Psychic Memory': return 'Psychic';
        case 'Rock Memory': return 'Rock';
        case 'Steel Memory': return 'Steel';
        case 'Water Memory': return 'Water';
    }
}

function getZType(item) {
    switch (item) {
        case 'Buginium Z': return 'Bug';
        case 'Darkinium Z': return 'Dark';
        case 'Dragonium Z': return 'Dragon';
        case 'Electrium Z': return 'Electric';
        case 'Fairium Z': return 'Fairy';
        case 'Fightinium Z': return 'Fighting';
        case 'Firium Z': return 'Fire';
        case 'Flyinium Z': return 'Flying';
        case 'Ghostium Z': return 'Ghost';
        case 'Grassium Z': return 'Grass';
        case 'Groundium Z': return 'Ground';
        case 'Icium Z': return 'Ice';
        case 'Poisonium Z': return 'Poison';
        case 'Psychium Z': return 'Psychic';
        case 'Rockium Z': return 'Rock';
        case 'Steelium Z': return 'Steel';
        case 'Waterium Z': return 'Water';
        default: return '';
    }
}

var MEGA_STONE_USER_LOOKUP = {
    'Abomasite': 'Abomasnow',
    'Absolite': 'Absol',
    'Aerodactylite': 'Aerodactyl',
    'Aggronite': 'Aggron',
    'Alakazite': 'Alakazam',
    'Ampharosite': 'Ampharos',
    'Banettite': 'Banette',
    'Blastoisinite': 'Blastoise',
    'Blazikenite': 'Blaziken',
    'Charizardite X': 'Charizard',
    'Charizardite Y': 'Charizard',
    'Garchompite': 'Garchomp',
    'Gardevoirite': 'Gardevoir',
    'Gengarite': 'Gengar',
    'Gyaradosite': 'Gyarados',
    'Heracronite': 'Heracross',
    'Houndoominite': 'Houndoom',
    'Kangaskhanite': 'Kangaskhan',
    'Latiasite': 'Latias',
    'Latiosite': 'Latios',
    'Lucarionite': 'Lucario',
    'Manectite': 'Manectric',
    'Mawilite': 'Mawile',
    'Medichamite': 'Medicham',
    'Mewtwonite X': 'Mewtwo',
    'Mewtwonite Y': 'Mewtwo',
    'Pinsirite': 'Pinsir',
    'Scizorite': 'Scizor',
    'Tyranitarite': 'Tyranitar',
    'Venusaurite': 'Venusaur',
    'Altarianite': 'Altaria',
    'Audinite': 'Audino',
    'Beedrillite': 'Beedrill',
    'Cameruptite': 'Camerupt',
    'Diancite': 'Diancie',
    'Galladite': 'Gallade',
    'Glalitite': 'Glalie',
    'Lopunnite': 'Lopunny',
    'Metagrossite': 'Metagross',
    'Pidgeotite': 'Pidgeot',
    'Sablenite': 'Sableye',
    'Salamencite': 'Salamence',
    'Sceptilite': 'Sceptile',
    'Sharpedonite': 'Sharpedo',
    'Slowbronite': 'Slowbro',
    'Steelixite': 'Steelix',
    'Swampertite': 'Swampert',
    'Red Orb': 'Groudon',
    'Blue Orb': 'Kyogre',
    'Clefablite': 'Clefable',
    'Victreebelite': 'Victreebel',
    'Starminite': 'Starmie',
    'Dragoninite': 'Dragonite',
    'Meganiumite': 'Meganium',
    'Feraligite': 'Feraligatr',
    'Skarmorite': 'Skarmory',
    'Froslassite': 'Froslass',
    'Emboarite': 'Emboar',
    'Excadrite': 'Excadrill',
    'Scolipite': 'Scolipede',
    'Scraftinite': 'Scrafty',
    'Eelektrossite': 'Eelektross',
    'Chandelurite': 'Chandelure',
    'Chesnaughtite': 'Chesnaught',
    'Delphoxite': 'Delphox',
    'Greninjite': 'Greninja',
    'Pyroarite': 'Pyroar',
    'Floettite': 'Floette-Eternal',
    'Malamarite': 'Malamar',
    'Barbaracite': 'Barbaracle',
    'Dragalgite': 'Dragalge',
    'Hawluchanite': 'Hawlucha',
    'Zygardite': ['Zygarde', 'Zygarde-10%', 'Zygarde-Complete'],
    'Drampanite': 'Drampa',
    'Falinksite': 'Falinks',
    'Heatranite': 'Heatran',
    'Darkranite': 'Darkrai',
    'Zeraorite': 'Zeraora',
    'Raichunite X': 'Raichu',
    'Raichunite Y': 'Raichu',
    'Chimechite': 'Chimecho',
    'Absolite Z': 'Absol',
    'Staraptite': 'Staraptor',
    'Garchompite Z': 'Garchomp',
    'Lucarionite Z': 'Lucario',
    'Golurkite': 'Golurk',
    'Meowsticite': ['Meowstic', 'Meowstic-F'],
    'Crabominite': 'Crabominable',
    'Golisopite': 'Golisopod',
    'Magearnite': 'Magearna',
    'Scovillainite': 'Scovillain',
    'Baxcalibrite': 'Baxcalibur',
    'Tatsugirinite': 'Tatsugiri',
    'Glimmoranite': 'Glimmora',
};

function canMega(item, species) {
    return item in MEGA_STONE_USER_LOOKUP && MEGA_STONE_USER_LOOKUP[item].includes(species);
}

var SIGNATURE_Z_MOVE_LOOKUP = {
    'Pikanium Z': { 'user': 'Pikachu', 'move': 'Volt Tackle', 'zMove': 'Catastropika' },
    'Decidium Z': { 'user': 'Decidueye', 'move': 'Spirit Shackle', 'zMove': 'Sinister Arrow Raid' },
    'Incinium Z': { 'user': 'Incineroar', 'move': 'Darkest Lariat', 'zMove': 'Malicious Moonsault' },
    'Primarium Z': { 'user': 'Primarina', 'move': 'Sparkling Aria', 'zMove': 'Oceanic Operetta' },
    'Tapunium Z': { 'user': ['Tapu Koko', 'Tapu Lele', 'Tapu Bulu', 'Tapu Fini'], 'move': "Nature's Madness", 'zMove': 'Guardian of Alola' },
    'Marshadium Z': { 'user': 'Marshadow', 'move': 'Spectral Thief', 'zMove': 'Soul-Stealing 7-Star Strike' },
    'Aloraichium Z': { 'user': 'Raichu-Alola', 'move': 'Thunderbolt', 'zMove': 'Stoked Sparksurfer' },
    'Snorlium Z': { 'user': 'Snorlax', 'move': 'Giga Impact', 'zMove': 'Pulverizing Pancake' },
    'Eevium Z': { 'user': 'Eevee', 'move': 'Last Resort', 'zMove': 'Extreme Evoboost' },
    'Mewnium Z': { 'user': 'Mew', 'move': 'Psychic', 'zMove': 'Genesis Supernova' },
    'Pikashunium Z': { 'user': 'Pikachu', 'move': 'Thunderbolt', 'zMove': '10,000,000 Volt Thunderbolt' },
    'Solganium Z': { 'user': ['Solgaleo', 'Necrozma-Dusk-Mane'], 'move': 'Sunsteel Strike', 'zMove': 'Searing Sunraze Smash' },
    'Lunalium Z': { 'user': ['Lunala', 'Necrozma-Dawn-Wings'], 'move': 'Moongeist Beam', 'zMove': 'Menacing Moonraze Maelstrom' },
    'Ultranecrozium Z': { 'user': 'Ultra Necrozma', 'move': 'Photon Geyser', 'zMove': 'Light That Burns the Sky' },
    'Mimikium Z': { 'user': 'Mimikyu', 'move': 'Play Rough', 'zMove': "Let's Snuggle Forever" },
    'Lycanium Z': { 'user': ['Lycanroc-Midday', 'Lycanroc-Midnight', 'Lycanroc-Dusk'], 'move': 'Stone Edge', 'zMove': 'Splintered Stormshards' },
    'Kommonium Z': { 'user': 'Kommo-o', 'move': 'Clanging Scales', 'zMove': 'Clangorous Soulblaze' },
};

function getSignatureZMove(item, species, move) {
    var isSigZ = item in SIGNATURE_Z_MOVE_LOOKUP && SIGNATURE_Z_MOVE_LOOKUP[item]['user'].includes(species) && move == SIGNATURE_Z_MOVE_LOOKUP[item]['move']
        ? SIGNATURE_Z_MOVE_LOOKUP[item]['zMove'] : -1;
    return isSigZ;
}

var LOCK_ITEM_LOOKUP = {
    'Giratina-Origin': 'Griseous Orb',
    'Mega Abomasnow': 'Abomasite',
    'Mega Absol': 'Absolite',
    'Mega Aerodactyl': 'Aerodactylite',
    'Mega Aggron': 'Aggronite',
    'Mega Alakazam': 'Alakazite',
    'Mega Ampharos': 'Ampharosite',
    'Mega Banette': 'Banettite',
    'Mega Blastoise': 'Blastoisinite',
    'Mega Blaziken': 'Blazikenite',
    'Mega Charizard X': 'Charizardite X',
    'Mega Charizard Y': 'Charizardite Y',
    'Mega Garchomp': 'Garchompite',
    'Mega Gardevoir': 'Gardevoirite',
    'Mega Gengar': 'Gengarite',
    'Mega Gyarados': 'Gyaradosite',
    'Mega Heracross': 'Heracronite',
    'Mega Houndoom': 'Houndoominite',
    'Mega Kangaskhan': 'Kangaskhanite',
    'Mega Latias': 'Latiasite',
    'Mega Latios': 'Latiosite',
    'Mega Lucario': 'Lucarionite',
    'Mega Manectric': 'Manectite',
    'Mega Mawile': 'Mawilite',
    'Mega Medicham': 'Medichamite',
    'Mega Mewtwo X': 'Mewtwonite X',
    'Mega Mewtwo Y': 'Mewtwonite Y',
    'Mega Pinsir': 'Pinsirite',
    'Mega Scizor': 'Scizorite',
    'Mega Tyranitar': 'Tyranitarite',
    'Mega Venusaur': 'Venusaurite',
    'Mega Altaria': 'Altarianite',
    'Mega Audino': 'Audinite',
    'Mega Beedrill': 'Beedrillite',
    'Mega Camerupt': 'Cameruptite',
    'Mega Diancie': 'Diancite',
    'Mega Gallade': 'Galladite',
    'Mega Glalie': 'Glalitite',
    'Mega Lopunny': 'Lopunnite',
    'Mega Metagross': 'Metagrossite',
    'Mega Pidgeot': 'Pidgeotite',
    'Mega Sableye': 'Sablenite',
    'Mega Salamence': 'Salamencite',
    'Mega Sceptile': 'Sceptilite',
    'Mega Sharpedo': 'Sharpedonite',
    'Mega Slowbro': 'Slowbronite',
    'Mega Steelix': 'Steelixite',
    'Mega Swampert': 'Swampertite',
    'Primal Groudon': 'Red Orb',
    'Primal Kyogre': 'Blue Orb',
    'Ultra Necrozma': 'Ultranecrozium Z',
    'Zacian-Crowned': 'Rusted Sword',
    'Zamazenta-Crowned': 'Rusted Shield',
    'Dialga-Origin': 'Adamant Crystal', 
    'Palkia-Origin': 'Lustrous Globe',
    'Ogerpon-Wellspring': 'Wellspring Mask',
    'Ogerpon-Hearthflame': 'Hearthflame Mask',
    'Ogerpon-Cornerstone': 'Cornerstone Mask',
    'Mega Clefable': 'Clefablite',
    'Mega Victreebel': 'Victreebelite',
    'Mega Starmie': 'Starminite',
    'Mega Dragonite': 'Dragoninite',
    'Mega Meganium': 'Meganiumite',
    'Mega Feraligatr': 'Feraligite',
    'Mega Skarmory': 'Skarmorite',
    'Mega Froslass': 'Froslassite',
    'Mega Emboar': 'Emboarite',
    'Mega Excadrill': 'Excadrite',
    'Mega Scolipede': 'Scolipite',
    'Mega Scrafty': 'Scraftinite',
    'Mega Eelektross': 'Eelektrossite',
    'Mega Chandelure': 'Chandelurite',
    'Mega Chesnaught': 'Chesnaughtite',
    'Mega Delphox': 'Delphoxite',
    'Mega Greninja': 'Greninjite',
    'Mega Pyroar': 'Pyroarite',
    'Mega Floette': 'Floettite',
    'Mega Malamar': 'Malamarite',
    'Mega Barbaracle': 'Barbaracite',
    'Mega Dragalge': 'Dragalgite',
    'Mega Hawlucha': 'Hawluchanite',
    'Mega Zygarde': 'Zygardite',
    'Mega Drampa': 'Drampanite',
    'Mega Falinks': 'Falinksite',
    'Mega Heatran': 'Heatranite',
    'Mega Darkrai': 'Darkranite',
    'Mega Zeraora': 'Zeraorite',
    'Mega Raichu X': 'Raichunite X',
    'Mega Raichu Y': 'Raichunite Y',
    'Mega Chimecho': 'Chimechite',
    'Mega Absol Z': 'Absolite Z',
    'Mega Staraptor': 'Staraptite',
    'Mega Garchomp Z': 'Garchompite Z',
    'Mega Lucario Z': 'Lucarionite Z',
    'Mega Golurk': 'Golurkite',
    'Mega Meowstic': 'Meowsticite',
    'Mega Crabominable': 'Crabominite',
    'Mega Golisopod': 'Golisopite',
    'Mega Magearna': 'Magearnite',
    'Mega Scovillain': 'Scovillainite',
    'Mega Baxcalibur': 'Baxcalibrite',
    'Mega Tatsugiri': 'Tatsugirinite',
    'Mega Glimmora': 'Glimmoranite',
};

function cantRemoveItem(defItem, defSpecies, terrain) {
    return defItem === null || defItem === "" || defItem.indexOf("ium Z") !== -1
        || LOCK_ITEM_LOOKUP[defSpecies] === defItem
        || (defSpecies === "Arceus" && defItem.indexOf(" Plate") !== -1)
        || (defSpecies === "Genesect" && defItem.indexOf(" Drive") !== -1)
        || (defSpecies === "Silvally" && defItem.indexOf(" Memory") !== -1);
}

function cantFlingItem(atItem, atSpecies, defAbility) {
    return atItem === "" || atItem === 'Klutz' || atItem.indexOf(" Gem") !== -1 || atItem.indexOf(" ium Z") !== -1 || ["Red Orb", "Blue Orb", "Rusted Sword", "Rusted Shield"].indexOf(atItem) !== -1
        || (atSpecies === 'Giratina-Origin' && atItem === "Griseous Orb")
        || (atSpecies === 'Arceus' && atItem.indexOf(" Plate") !== -1)
        || (atSpecies === 'Genesect' && atItem.indexOf(" Drive") !== -1)
        || (atSpecies === 'Silvally' && atItem.indexOf(" Memory") !== -1)
        || canMega(atItem, atSpecies)
        || (["As One", "Unnerve"].indexOf(defAbility) !== -1 && atItem.indexOf(" Berry") !== -1);
}

/* ---- damage_MASTER.js ---- */
/* Damage calculation for the Generation VIII games: Sword, Shield, Isle of Armor, and Crown Tundra; 
 * and for the Generation VII games: Sun, Moon, Ultra Sun, and Ultra Moon*/

function GET_DAMAGE_HANDLER(attacker, defender, move, field) {
    switch (gen) {
        case 1:
            return CALCULATE_DAMAGE_RBY(attacker, defender, move, field);
        case 2:
            return CALCULATE_DAMAGE_GSC(attacker, defender, move, field);
        case 3:
            return CALCULATE_DAMAGE_ADV(attacker, defender, move, field);
        case 4:
            return CALCULATE_DAMAGE_DPP(attacker, defender, move, field);
        case 5:
        case 6:
            return GET_DAMAGE_XY(attacker, defender, move, field);
        case 7:
        case 8:
        case 9:
        case 10:
            return GET_DAMAGE_SV(attacker, defender, move, field);
        default:
            return -1;
    }
}

function numericSort(a, b) {
    return a - b;
}

function buildDescription(description) {
    var output = "";
    if (description.attackBoost) {
        if (description.attackBoost > 0) {
            output += "+";
        }
        output += description.attackBoost + " ";
    }
    if (description.redItem) {
        output += "Red Item-boosted ";
    }
    if (description.attackerLevel) {
        output = output + 'Lv. ' + description.attackerLevel + ' ';
    }
    if (!description.usesOppAtkStat) {
        output = appendIfSet(output, description.attackEVs);
    }
    output = appendIfSet(output, description.attackerItem);
    output = appendIfSet(output, description.attackerAbility);
    if (description.ruinSwordBeads) {
        output += description.ruinSwordBeads + " of Ruin ";
    }
    if (description.attackerTera) {
        output += "Tera-" + description.attackerTera + " ";
    }
    if (description.isBurned) {
        output += "burned ";
    }
    output += description.attackerName + " ";
    if (description.isHelpingHand) {
        output += "Helping Hand ";
    }
    if (description.isPowerSpot) {
        output += "Power Spot ";
    }
    if (description.isBattery) {
        output += "Battery ";
    }
    if (description.isSteelySpirit) {
        output += "Ally Steely Spirit ";
    }
    if (description.isFlowerGiftAtk) {
        output += "Flower Gift ";
    }
    if (description.meFirst) {
        output += "Me First ";
    }
    if (description.charged) {
        output += "Charged ";
    }
    output += description.moveName + " ";
    if (description.moveBP && description.moveType) {
        output += "(" + description.moveBP + " BP " + description.moveType + ") ";
    } else if (description.moveBP) {
        output += "(" + description.moveBP + " BP) ";
    } else if (description.moveType) {
        output += "(" + description.moveType + ") ";
    }
    if (description.hits) {
        output += "(" + description.hits + " hits) ";
    }
    if (description.courseDriftSE) {
        output += "(Super Effective) ";
    }
    if (description.teraBPBoost) {
        output += "(Tera 60 BP Boost) ";
    }
    if (description.maskBoost) {
        output += "(1.2x Mask Boost) ";
    }
    if (description.stellarBoost) {
        output += "(1st Use) ";
    }
    output += "vs. ";
    if (description.defenseBoost) {
        if (description.defenseBoost > 0) {
            output += "+";
        }
        output += description.defenseBoost + " ";
    }
    if (description.blueItem) {
        output += "Blue Item-boosted ";
    }
    if (description.defenderLevel) {
        output = output + 'Lv. ' + description.defenderLevel + ' ';
    }
    output = appendIfSet(output, description.HPEVs);
    if (description.usesOppAtkStat && description.attackEVs) {
        output += "/ " + description.attackEVs + " ";
    }
    if (description.defenseEVs) {
        output += "/ " + description.defenseEVs + " ";
    }
    if (description.isForesight) {
        output += "revealed ";
    }
    output = appendIfSet(output, description.defenderItem);
    if (description.isFlowerGiftSpD) {
        output += " Flower Gift ";
    }
    output = appendIfSet(output, description.defenderAbility);
    if (description.ruinTabletsVessel) {
        output += description.ruinTabletsVessel + " of Ruin ";
    }
    if (description.isDynamax) output += " Dynamax ";
    if (description.defenderTera) {
        output += "Tera-" + description.defenderTera + " ";
    }
    output += description.defenderName;
    if (description.weather && description.terrain) {
        output += " in " + description.weather + " and " + description.terrain + " Terrain";
    }
    else if (description.weather) {
        output += " in " + description.weather;
    } else if (description.terrain) {
        output += " in " + description.terrain + " Terrain";
    }
    if (description.isAuroraVeil) {
        output += " through Aurora Veil";
    } else if (description.isReflect) {
        output += " through Reflect";
    } else if (description.isLightScreen) {
        output += " through Light Screen";
    }
    if (description.isCritical) {
        output += " on a critical hit";
    }
    if (description.isGravity) {
        output += " under Gravity";
    }
    if (description.isGlaiveMod) {
        output += " after using Glaive Rush";
    }
    if (description.isFriendGuard) {
        output += " with Friend Guard";
    }
    if (description.isQuarteredByProtect) {
        output += " through Protect";
    }
    if (description.isMechanicsTest) {
        output += " with custom modifiers";
    }

    return output;
}

function appendIfSet(str, toAppend) {
    if (toAppend) {
        return str + toAppend + " ";
    }
    return str;
}

function toSmogonStat(stat) {
    return stat === AT ? "Atk"
            : stat === DF ? "Def"
            : stat === SA ? "SpA"
            : stat === SD ? "SpD"
            : stat === SP ? "Spe"
            : "wtf";
}

function chainMods(mods) {
    var M = 0x1000;
    for(var i = 0; i < mods.length; i++) {
        if(mods[i] !== 0x1000) {
            M = Math.round((M * mods[i]) / 0x1000);
        }
    }
    return M;
}

function addLevelDesc(attacker, defender, description) {
    autoLevel = $('#douswitch').is(':checked') || gen == 10 ? 50 : 100;
    if (attacker.level !== autoLevel)
        description.attackerLevel = attacker.level;
    if (defender.level !== autoLevel)
        description.defenderLevel = defender.level;
}

function getMoveEffectiveness(move, type1, type2, description, isForesight, isScrappy, isGravity, defItem, isStrongWinds, defIsTera, isTeraShell) {
    var type1Effect = getSingleTypeEffectiveness(move, type1, description, isForesight, isScrappy, isGravity, defItem, isStrongWinds);
    var type2Effect = type2 && type2 != type1 ? getSingleTypeEffectiveness(move, type2, description, isForesight, isScrappy, isGravity, defItem, isStrongWinds) : 1;
    var typeEffectiveness = type1Effect * type2Effect;
    var usesTeraShell = isTeraShell && typeEffectiveness > 0.5;
    var effectiveOverride = overrideTypeEffectiveness(move, [type1, type2].includes("Flying"), defItem, isGravity, defIsTera, usesTeraShell);
    if (effectiveOverride != -1) {
        typeEffectiveness = effectiveOverride;
        if (usesTeraShell) {
            description.attackerAbility = "Tera Shell";
        }
    }
    if (gen == 9.5) {
        typeEffectiveness = additionalTypeEffectModsLegendsZA(move, typeEffectiveness, description);
    }
    return typeEffectiveness;
}

function getSingleTypeEffectiveness(move, type, description, isForesight, isScrappy, isGravity, defItem, isStrongWinds) {
    if ((isForesight || isScrappy) && type === "Ghost" && (["Normal", "Fighting"].includes(move.type))) {
        if (isScrappy)
            description.attackerAbility = isScrappy;
        else
            description.isForesight = true;
        return 1;
    }
    else if ((isGravity || defItem == "Iron Ball") && type === "Flying" && move.type === "Ground") {
        if (isGravity)
            description.isGravity = true;
        else if (defItem == "Iron Ball")
            description.defenderItem = "Iron Ball";
        return 1;
    }
    else if (move.name === "Freeze-Dry" && type === "Water") {
        return 2;
    }
    else if (move.name === "Nihil Light" && type === "Fairy") {
        return 1;
    }
    else {
        var effectiveness = typeChart[move.type][type];
        if (isStrongWinds && type == "Flying" && effectiveness > 1) {
            effectiveness = 1;
        }
        else if (defItem == "Ring Target" && effectiveness == 0) {
            description.defenderItem = "Ring Target";
            effectiveness = 1;
        }
        if (move.name === "Flying Press") {
            effectiveness *= typeChart["Flying"][type];
        }
        return effectiveness;
    }
}
function overrideTypeEffectiveness(move, defIsFlyingType, defItem, isGravity, defIsTera, usesTeraShell) {
    if (usesTeraShell) {
        return 0.5;
    }
    else if (move.type == "Stellar" && defIsTera) {
        return 2;
    }
    else if (defIsFlyingType && move.type === "Ground" && (move.name == "Thousand Arrows" || defItem == "Iron Ball") && !isGravity && gen >= 5) {
        return 1;
    }
    else {
        return -1;
    }
}

function additionalTypeEffectModsLegendsZA(move, typeEffectiveness, description) {
    if (typeEffectiveness < 0) {
        typeEffectiveness = typeEffectiveness * 1.2;
    }
    if (move.isPlusMove) {
        if (typeEffectiveness <= 1) {
            typeEffectiveness = typeEffectiveness * 1.2;
        }
        else {
            typeEffectiveness = typeEffectiveness * 1.3;
        }
        description.moveName += '+';
    }
    return typeEffectiveness;
}

function getModifiedStat(stat, mod) {
    return mod > 0 ? Math.floor(stat * (2 + mod) / 2)
            : mod < 0 ? Math.floor(stat * 2 / (2 - mod))
            : stat;
}

function getHPInfo(description, defender) {
    description.HPEVs = gen < 10 ? defender.HPEVs + " HP " + (defender.HPIVs < 31 ? defender.HPIVs + " IVs" : "") : resultDisplayMode == "SPs" ? defender.HPSPs + " HP " : resultDisplayMode == "EVs" ? (Math.max(0, defender.HPSPs * 8 - 4)) + " HP " : defender.HPraw + " HP ";
}

//Speed Mods
function getFinalSpeed(pokemon, weather, tailwind, swamp, terrain) {

    //1. Speed boosts and drops
    var speed = getModifiedStat(pokemon.rawStats[SP], pokemon.boosts[SP]);
    //2. Other Speed mods
    var otherSpeedMods = 1;
    //a. Scarf
    if (pokemon.item === "Choice Scarf" && !pokemon.isDynamax) {
        otherSpeedMods *= 1.5;
    } //b. Macho Brace, Iron Ball, Power items
    else if (["Macho Brace", "Iron Ball", "Power Anklet", "Power Band", "Power Belt", "Power Bracer", "Power Lens", "Power Weight", "Klutz Iron Ball"].indexOf(pokemon.item) !== -1) {
        otherSpeedMods *= 0.5;
    } //c. Quick Powder
    else if (pokemon.name === "Ditto" && pokemon.item === "Quick Powder") {
        otherSpeedMods *= 2;
    }
    //d. Quick Feet
    if (pokemon.ability === "Quick Feet" && pokemon.status !== "Healthy")
    {
        otherSpeedMods *= 1.5;
    } //e. Slow Start
    else if (pokemon.ability === "Slow Start")
    {
        otherSpeedMods *= 0.5;
    } //f. 2x Abilities
    else if ((((pokemon.ability === "Chlorophyll" && weather.indexOf("Sun") > -1) ||
            (pokemon.ability === "Swift Swim" && weather.indexOf("Rain") > -1)) && pokemon.item !== 'Utility Umbrella') ||
            (pokemon.ability === "Sand Rush" && weather === "Sand") ||
            (pokemon.ability === "Slush Rush" && ["Hail", "Snow"].indexOf(weather) > -1) ||
            (pokemon.ability === "Surge Surfer" && terrain === "Electric") ||
            (pokemon.ability === "Unburden" && pokemon.item === "")) {
        otherSpeedMods *= 2;
    }
    //g. Tailwind
    if (tailwind) otherSpeedMods *= 2;
    //h. Grass/Water Pledge Swamp
    if (swamp) otherSpeedMods *= 0.25;
    //i. Protosynthesis, Quark Drive
    if (pokemon.paradoxAbilityBoost && pokemon.highestStat === 'sp')
        otherSpeedMods *= 1.5;

    speed = pokeRound(speed * otherSpeedMods);

    //3. Paralysis
    if (pokemon.status === "Paralyzed" && pokemon.ability !== "Quick Feet") {
        if (gen >= 7)
            speed = Math.floor(speed / 2);
        else speed = Math.floor(speed / 4);
    }
    //4. 65536 Speed check
    if (speed > 65535) { speed %= 65536; }
    //5. 10000 Speed check
    if (speed > 10000) { speed = 10000; }
    return speed;
}

//Currently used for determining Protosynthesis/Quark Drive boost, may be expanded upon depending on future releases
function setHighestStat(pokemon, pPosition) {
    if (pokemon.highestStat == -1) {
        allStats = [pokemon.stats[AT], pokemon.stats[DF], pokemon.stats[SA], pokemon.stats[SD], pokemon.stats[SP]];
        pokemon.highestStat = allStats.indexOf(Math.max(...allStats));
    }
    lastHighestStat[pPosition] = pokemon.highestStat;
    pokemon.highestStat = pokemon.highestStat == 0 ? 'at'
        : pokemon.highestStat == 1 ? 'df'
            : pokemon.highestStat == 2 ? 'sa'
                : pokemon.highestStat == 3 ? 'sd'
                    : pokemon.highestStat == 4 ? 'sp'
                        : 'oh dear this should not happen';
}

function usesPhysicalAttack(attacker, defender, move) {
    var userStatsMove = move.name == "Photon Geyser" || move.name == "Light That Burns the Sky"
        || (move.name == "Tera Blast" && attacker.isTerastalize) || (move.name == "Tera Starstorm" && attacker.name == "Terapagos-Stellar");
    var smartMove = move.name == "Shell Side Arm";

    return (userStatsMove && attacker.stats[AT] > attacker.stats[SA]) || (smartMove && (attacker.stats[AT] / defender.stats[DF]) > (attacker.stats[SA] / defender.stats[SD]));
}

function checkTrace(source, target) {
    var cannotCopy = ["As One", "Battle Bond", "Comatose", "Commander", "Disguise", "Flower Gift", "Forecast", "Gulp Missile",
        "Ice Face", "Illusion", "Imposter", "Multitype", "Power of Alchemy", 'Protosynthesis', 'Quark Drive', "Receiver", "RKS System", "Schooling",
        "Shields Down", "Stance Change", "Trace", "Wonder Guard", "Zen Mode", "Zero to Hero"];
    if (gen <= 4) {
        if (gen == 3) {
            cannotCopy.splice(cannotCopy.indexOf('Forecast'), 1);
            cannotCopy.splice(cannotCopy.indexOf('Trace'), 1);
        }
        else cannotCopy.splice(cannotCopy.indexOf('Flower Gift'), 1);
    }
    if (source.ability === "Trace" && source.abilityOn && cannotCopy.indexOf(target.ability) === -1 && source.item !== "Ability Shield") {
        source.ability = target.ability;
    }
}

function checkNeutralGas(p1, p2, isNGas) {
    var cannotSupress = ['As One', 'Battle Bond', 'Comatose', 'Disguise', 'Gulp Missile', 'Ice Face', 'Multitype',
        'Power Construct', 'RKS System', 'Schooling', 'Shields Down', 'Stance Change', 'Tera Shift', 'Zen Mode', 'Zero to Hero'];
    if (isNGas) {
        if (cannotSupress.indexOf(p1.ability) == -1 && p1.item !== 'Ability Shield') p1.ability = '';
        if (cannotSupress.indexOf(p2.ability) == -1 && p2.item !== 'Ability Shield') p2.ability = '';
    }
}
function checkAirLock(pokemon, field) {
    if (['Air Lock', 'Cloud Nine'].indexOf(pokemon.ability) !== -1) {
        field.clearWeather();
    }
}
function checkForecast(pokemon, weather) {
    if (pokemon.ability === "Forecast" && pokemon.name === "Castform") {
        if (weather.indexOf("Sun") > -1) {
            pokemon.type1 = "Fire";
        } else if (weather.indexOf("Rain") > -1) {
            pokemon.type1 = "Water";
        } else if (["Hail", "Snow"].indexOf(weather) > -1) {
            pokemon.type1 = "Ice";
        } else {
            pokemon.type1 = "Normal";
        }
        pokemon.type2 = "";
    }
}
function checkMimicry(pokemon, terrain) {
    if (pokemon.ability === "Mimicry" && terrain !== "") {
        pokemon.type1 = terrain === "Electric" ? 'Electric'
            : terrain === "Grassy" ? 'Grass'
                : terrain === "Misty" ? 'Fairy'
                    : 'Psychic';
        pokemon.type2 = '';
    }
}
function checkTerastal(pokemon) {
    if (pokemon.isTerastalize && pokemon.tera_type !== 'Stellar') {
        pokemon.teraSTAB1 = pokemon.type1;
        pokemon.teraSTAB2 = pokemon.type2;
        pokemon.type1 = pokemon.tera_type;
        pokemon.type2 = '';
    }
}

function checkKlutz(pokemon) {
    if (pokemon.ability === "Klutz") {
        if (['Macho Brace', 'Power Anklet', 'Power Band', 'Power Belt', 'Power Bracer', 'Power Lens', 'Power Weight'].indexOf(pokemon.item) === -1) {
            if (gen == 4) {
                if (pokemon.item === 'Iron Ball') {
                    pokemon.item = "Klutz Iron Ball";
                }
                else {
                    pokemon.item = getFlingPower(pokemon.item).toString();
                }
            }
            else {
                pokemon.item = "Klutz";
            }
        }
    }
}

//UNUSED CURRENTLY
function checkWhiteHerb(pokemon) {
    if (pokemon.item === 'White Herb') {
        var boostsLen = pokemon.boosts.length;
        for (i = 0; i < boostsLen; i++) {
            if (pokemon.boosts[i] < 0) {
                pokemon.boosts[i] = 0;
            }
        }
        pokemon.item = '';
    }
}

function checkSeeds(pokemon, terrain) {
    if (pokemon.item === terrain + ' Seed') {
        if (['Electric', 'Grassy'].indexOf(terrain) !== -1)
            pokemon.boosts[DF] = Math.min(6, pokemon.boosts[DF] + 1);
        else
            pokemon.boosts[SD] = Math.min(6, pokemon.boosts[SD] + 1);
        pokemon.item = '';
    }
}

function checkParadoxAbilities(pokemon, terrain, weather) {
    if (['Protosynthesis', 'Quark Drive'].indexOf(pokemon.ability) !== -1) {
        if ((pokemon.ability === 'Protosynthesis' && weather === 'Sun')
            || (pokemon.ability === 'Quark Drive' && terrain === 'Electric')
            || (manualProtoQuark && pokemon.item !== 'Booster Energy'))
            pokemon.paradoxAbilityBoost = true;
        else if (pokemon.item === 'Booster Energy') {
            pokemon.paradoxAbilityBoost = true;
            pokemon.item = '';
        }
    }
}

/**
 * Handles all stat boost changes (Unused currently)
 * @param {any} interactionArray list of all mons involved. If its length is only 1, then it's a self-targetting boost.
 * @param {any} stat the stat affected. Only supports a single stat as is implemented currently, may change in the future.
 * @param {any} numStages number of intended stages to boost/drop the stat. The function will adjust actual number of stages.
 * @returns
 */
function changeStatBoosts(interactionArray, stat, numStages) {
    var isNotSelf = interactionArray.length == 2;
    var source = interactionArray[0], target = isNotSelf ? interactionArray[1] : interactionArray[0];
    if (target.ability == 'Mirror Armor' && isNotSelf && numStages < 0) {
        var mirrorSwitch = source;
        source = target;
        target = mirrorSwitch;
    }
    var statMultiplier = target.ability == 'Simple' ? 2 : target.ability == 'Contrary' ? -1 : 1;
    numStages *= statMultiplier;
    if (numStages < 0) {
        if (isNotSelf && (['Clear Body', 'White Smoke', 'Full Metal Body'].includes(target.ability) || (target.ability == 'Hyper Cutter' && stat == AT) || (target.ability == 'Big Pecks' && stat == DF) || target.item == 'Clear Amulet')) {
            //no effect
        }
        else {
            target.boosts[stat] = Math.max(-6, target.boosts[stat] + numStages);

            if (target.ability == 'Defiant') {
                target.boosts[AT] = Math.min(6, target.boosts[AT] + 2);
            }
            else if (target.ability == 'Competitive') {
                target.boosts[SA] = Math.min(6, target.boosts[SA] + 2);
            }

            if (numStages < 0 && target.item == 'White Herb') {
                target.boosts[stat] = 0;
                target.item == '';
            }
        }
    }
    else if (numStages > 0) {
        target.boosts[stat] = Math.min(6, target.boosts[stat] + numStages);
    }
    else {
        alert("Entered changeStatBoosts with zero stat changes");
    }

    return !isNotSelf ? source : !mirrorSwitch ? [source, target] : [target, source];
}

function checkSupersweetSyrup(source, target) {
    if (source.ability === 'Supersweet Syrup' && source.abilityOn && target.item !== 'Clear Amulet') {
        if (target.ability === "Defiant") {
            target.boosts[AT] = Math.min(6, target.boosts[AT] + 2);
        }
        else if (target.ability === "Competitive") {
            target.boosts[AT] = Math.min(6, target.boosts[SA] + 2);
        }
    }
}

function checkIntimidate(source, target) {
    if (source.ability === "Intimidate" && source.abilityOn) {
        var checkSimple = target.ability === "Simple" ? 1 : 0;

        //Contrary & Guard Dog need to be first; these abilities supersede Clear Amulet but not Mirror Armor for some reason
        if (["Contrary", "Guard Dog"].indexOf(target.ability) !== -1) {
            target.boosts[AT] = Math.min(6, target.boosts[AT] + 1);
        }
        else if (["Clear Body", "White Smoke", "Hyper Cutter", "Full Metal Body"].indexOf(target.ability) !== -1
            || (["Inner Focus", "Oblivious", "Own Tempo", "Scrappy"].indexOf(target.ability) !== -1 && gen >= 8)
            || target.item === "Clear Amulet") {
            // no effect
        }
        else if (target.ability === "Mirror Armor") {
            source.boosts[AT] = Math.max(-6, source.boosts[AT] - 1);
        }
        else {
            target.boosts[AT] = Math.max(-6, target.boosts[AT] - 1 * (1 + checkSimple));
            if (target.ability === "Defiant") {
                target.boosts[AT] = Math.min(6, target.boosts[AT] + 2);
            }
            else if (target.ability === "Competitive") {
                target.boosts[SA] = Math.min(6, target.boosts[SA] + 2);
            }
        }
        if (target.item === "Adrenaline Orb" && target.ability !== "Mirror Armor") {
            target.boosts[SP] = Math.min(6, target.boosts[SP] + 1 * (1 + checkSimple));
            target.item = '';
        }
        if (target.ability === "Rattled" && gen >= 8 && target.item !== "Clear Amulet") {
            target.boosts[SP] = Math.min(6, target.boosts[SP] + 1);
        }
    }
}

function checkSwordShield(pokemon) {
    if (pokemon.ability === "Intrepid Sword" && (gen !== 9 || pokemon.abilityOn)) {
        pokemon.boosts[AT] = Math.min(6, pokemon.boosts[AT] + 1);
    }
    else if (pokemon.ability === "Dauntless Shield" && (gen !== 9 || pokemon.abilityOn)) {
        pokemon.boosts[DF] = Math.min(6, pokemon.boosts[DF] + 1);
    }
}

function checkWindRider(pokemon, tailwind) {
    if (pokemon.ability === "Wind Rider" && tailwind)
        pokemon.boosts[AT] = Math.min(6, pokemon.boosts[AT] + 1);
}

function checkEvo(p1, p2) {
    var maxBoosts = gen == 9.5 ? 1 : 6;
    if ($('#evoL').prop("checked") || $('#tatsuL').prop("checked")){
        p1.boosts[AT] = Math.min(maxBoosts, p1.boosts[AT] + 2);
        p1.boosts[DF] = Math.min(maxBoosts, p1.boosts[DF] + 2);
        p1.boosts[SA] = Math.min(maxBoosts, p1.boosts[SA] + 2);
        p1.boosts[SD] = Math.min(maxBoosts, p1.boosts[SD] + 2);
        p1.boosts[SP] = Math.min(maxBoosts, p1.boosts[SP] + 2);
    }
    if ($('#evoR').prop("checked") || $('#tatsuR').prop("checked")){
        p2.boosts[AT] = Math.min(maxBoosts, p2.boosts[AT] + 2);
        p2.boosts[DF] = Math.min(maxBoosts, p2.boosts[DF] + 2);
        p2.boosts[SA] = Math.min(maxBoosts, p2.boosts[SA] + 2);
        p2.boosts[SD] = Math.min(maxBoosts, p2.boosts[SD] + 2);
        p2.boosts[SP] = Math.min(maxBoosts, p2.boosts[SP] + 2);
    }

    if($('#clangL').prop("checked")){
        p1.boosts[SA] = Math.min(6, p1.boosts[SA] + 2);
        p1.boosts[SD] = Math.min(6, p1.boosts[SD] + 2);
        p1.boosts[SP] = Math.min(6, p1.boosts[SP] + 2);
    }
    if($('#clangR').prop("checked")){
        p2.boosts[SA] = Math.min(6, p2.boosts[SA] + 2);
        p2.boosts[SD] = Math.min(6, p2.boosts[SD] + 2);
        p2.boosts[SP] = Math.min(6, p2.boosts[SP] + 2);
    }
    if ($('#weakL').prop("checked")) {
        p1.boosts[AT] = Math.min(6, p1.boosts[AT] + 2);
        p1.boosts[SA] = Math.min(6, p1.boosts[SA] + 2);
    }
    if ($('#weakR').prop("checked")) {
        p2.boosts[AT] = Math.min(6, p2.boosts[AT] + 2);
        p2.boosts[SA] = Math.min(6, p2.boosts[SA] + 2);
    }

}

function checkDownload(source, target) {
    if (source.ability === "Download") {
        if (target.stats[DF] && target.stats[SD]) {
            if (target.stats[SD] <= target.stats[DF]) {
                source.boosts[SA] = Math.min(6, source.boosts[SA] + 1);
            } else {
                source.boosts[AT] = Math.min(6, source.boosts[AT] + 1);
            }
        }
        else {
            if (getModifiedStat(target.rawStats[SD], target.boosts[SD]) <= getModifiedStat(target.rawStats[DF], target.boosts[DF])) {
                source.boosts[SA] = Math.min(6, source.boosts[SA] + 1);
            } else {
                source.boosts[AT] = Math.min(6, source.boosts[AT] + 1);
            }
        }
    }
}

function checkEmbodyAspect(pokemon) {
    if (pokemon.ability === 'Embody Aspect') {
        if (pokemon.name === 'Ogerpon') {
            pokemon.boosts[SP] = Math.min(6, pokemon.boosts[SP] + 1);
        }
        else if (pokemon.name === 'Ogerpon-Wellspring' && pokemon.item === 'Wellspring Mask') {
            pokemon.boosts[SD] = Math.min(6, pokemon.boosts[SD] + 1);
        }
        else if(pokemon.name === 'Ogerpon-Hearthflame' && pokemon.item === 'Hearthflame Mask') {
            pokemon.boosts[AT] = Math.min(6, pokemon.boosts[AT] + 1);
        }
        else if (pokemon.name === 'Ogerpon-Cornerstone' && pokemon.item === 'Cornerstone Mask') {
            pokemon.boosts[DF] = Math.min(6, pokemon.boosts[DF] + 1);
        }
    }
}

//If we play VGC on a game with Ash Greninja I should just delete this function
function checkBattleBond(pokemon) {
    if (pokemon.ability === 'Battle Bond' && pokemon.abilityOn && gen == 9) {
        pokemon.boosts[AT] = Math.min(6, pokemon.boosts[AT] + 1);
        pokemon.boosts[SA] = Math.min(6, pokemon.boosts[SA] + 1);
        pokemon.boosts[SP] = Math.min(6, pokemon.boosts[SP] + 1);
    }
}

//CONSIDER AN ALL ENCOMPASSING FUNCTION FOR BOOSTS

function checkInfiltrator(attacker, affectedSide) {
    if (attacker.ability === "Infiltrator") {
        affectedSide.isAuroraVeil = false;
        affectedSide.isReflect = false;
        affectedSide.isLightScreen = false;
    }
}

function countBoosts(boosts) {
    var sum = 0;
    for (var i = 0; i < STATS.length; i++) {
        if (boosts[STATS[i]] > 0) {
            sum += boosts[STATS[i]];
        }
    }
    return sum;
}

// GameFreak rounds DOWN on .5
function pokeRound(num) {
    return (num % 1 > 0.5) ? Math.ceil(num) : Math.floor(num);
}

function getWeightMods(p1, p2) {
    if (p1.ability == "Heavy Metal") p1.weight *= 2;
    else if (p1.ability == "Light Metal") p1.weight /= 2;

    if (p2.ability == "Heavy Metal") p2.weight *= 2;
    else if (p2.ability == "Light Metal") p2.weight /= 2;

    if (p1.item == "Float Stone") p1.weight /= 2;
    if (p2.item == "Float Stone") p2.weight /= 2;
}

function checkMoveTypeChange(move, field, attacker) {
    if (move.name == "Weather Ball") {
        move.type = (field.weather.indexOf("Sun") > -1 && attacker.item !== 'Utility Umbrella') || attacker.ability == 'Mega Sol' ? "Fire"
            : field.weather.indexOf("Rain") > -1 && attacker.item !== 'Utility Umbrella' ? "Water"
                : field.weather === "Sand" ? "Rock"
                    : ["Hail", "Snow"].indexOf(field.weather) > -1 ? "Ice"
                        : "Normal";
    }
    else if (move.name == "Terrain Pulse") {
        move.type = field.terrain === "" || !pIsGrounded(attacker, field) ? "Normal"
            : field.terrain === "Electric" ? "Electric"
                : field.terrain === "Grassy" ? "Grass"
                    : field.terrain === "Misty" ? "Fairy"
                        : field.terrain === "Psychic" ? "Psychic"
                            : "Typeless";  //last case should never happen, just there to help with debugging
    }
    else if (move.name == "Techno Blast") {
        move.type = attacker.item === "Burn Drive" ? "Fire"
            : attacker.item === "Chill Drive" ? "Ice"
                : attacker.item === "Douse Drive" ? "Water"
                    : attacker.item === "Shock Drive" ? "Electric"
                        : "Normal";
    }
    else if (move.name == "Natural Gift" && attacker.item.includes(" Berry")) {
        move.type = getNaturalGift(attacker.item).t;
    }
    else if (move.name === "Multi-Attack" && attacker.item.indexOf("Memory") !== -1) {
        move.type = getMemoryType(attacker.item);
    }
    else if (move.name === "Judgment" && attacker.item.indexOf("Plate") !== -1) {
        move.type = getItemBoostType(attacker.item);
    }
    else if (move.name === "Revelation Dance") {
        move.type = attacker.type1 !== 'Typeless' ? attacker.type1
            : attacker.type2 !== 'Typeless' && attacker.type2 !== "" ? attacker.type2
                : 'Typeless';
    }
    else if (move.isPledge && move.name !== move.combinePledge) {
        var bothPledgeNames = move.name + " " + move.combinePledge;
        move.type = bothPledgeNames.includes("Grass") && bothPledgeNames.includes("Fire") ? 'Fire'
            : bothPledgeNames.includes("Grass") && bothPledgeNames.includes("Water") ? 'Grass'
                : bothPledgeNames.includes("Water") && bothPledgeNames.includes("Fire") ? 'Water'
                    : 'Typeless';   //last case should never happen, just there to help with debugging
    }
    else if (move.name === 'Aura Wheel' && attacker.name === 'Morpeko-Hangry') {
        move.type = 'Dark';
    }
    else if (move.name === "Tera Blast" && attacker.isTerastalize) {
        move.type = attacker.tera_type;
    }
    else if (move.name === "Raging Bull") {
        switch (attacker.name) {
            case "Tauros-Paldea-Combat":
                move.type = "Fighting";
                break;
            case "Tauros-Paldea-Blaze":
                move.type = "Fire";
                break;
            case "Tauros-Paldea-Aqua":
                move.type = "Water";
                break;
            default:
                move.type = "Normal";
        }
    }
    else if (move.name === "Ivy Cudgel") {
        switch (attacker.name) {
            case "Ogerpon-Wellspring":
                move.type = "Water";
                break;
            case "Ogerpon-Hearthflame":
                move.type = "Fire";
                break;
            case "Ogerpon-Cornerstone":
                move.type = "Rock";
                break;
            default:
                move.type = "Grass";
        }
    }
    else if ((move.name == "Struggle" && gen >= 2) || (['Beat Up', 'Future Sight', 'Doom Desire'].indexOf(move.name) != -1 && gen <= 4)) {
        move.type = 'Typeless';
    }
    else if (move.name === 'Tera Starstorm' && attacker.name === 'Terapagos-Stellar') {
        move.type = 'Stellar';
    }
}

function checkConditionalPriority(move, terrain, attacker, attIsGrounded) {
    if ((move.isHealing && attacker.ability == "Triage") || (move.name == "Grassy Glide" && terrain == "Grassy" && attIsGrounded)
        || (move.type == "Flying" && attacker.ability == "Gale Wings" && (gen == 6 || attacker.curHP == attacker.maxHP)))
        move.isPriority = true;
}

function checkConditionalSpread(move, terrain, attacker, attIsGrounded) {
    if ((move.name == "Expanding Force" && terrain == "Psychic" && attIsGrounded) || (move.name == "Tera Starstorm" && attacker.name == "Terapagos-Stellar"))
        move.isSpread = true;
}

function checkContactOverride(move, attacker) {
    if (move.makesContact && (attacker.item === 'Protective Pads' || (attacker.item === 'Punching Glove' && move.isPunch) || attacker.ability === "Long Reach"))
        move.makesContact = false;
    else if (move.name === "Shell Side Arm" && move.category === "Physical")
        move.makesContact = true;
}

function setIsQuarteredByProtect(attacker, defender, field, move, description) {
    let qualifiedAbility = (attacker.ability === 'Piercing Drill' || (attacker.ability === 'Unseen Fist' && gen >= 10)) && move.makesContact;
    let qualifiedQuartered = field.isProtect && (move.isZ || move.isSignatureZ || attacker.isDynamax || qualifiedAbility);
    if (qualifiedQuartered && qualifiedAbility) description.attackerAbility = attacker.ability;
    return qualifiedQuartered;
}

function ZMoves(move, field, attacker, moveDescName) {
    if (move.isSignatureZ) {
        move.isZ = true;
        if (attacker.ability == 'Parental Bond') attacker.ability = '';
    }
    else if (move.isZ) {
        var tempMove = move;

        if (move.name.includes("Hidden Power") || move.name === 'Revelation Dance') {
            move.type = "Normal";
        }
        else move.type = tempMove.type;

        var ZName = ZMOVES_LOOKUP[tempMove.type];
        var SigZ;
        if (attacker.isTransformed) {
            var tempSpecies = $("#p1").find(".transform").prop("checked") ? transformSpecies["p1"] : transformSpecies["p2"];
            SigZ = getSignatureZMove(attacker.item, tempSpecies, move.name);
        }
        else
            SigZ = getSignatureZMove(attacker.item, attacker.name, tempMove.name);
        if (SigZ !== -1) ZName = SigZ;
        //turning it into a generic single-target Z-move
        move = moves[ZName];
        if (move == undefined) move = tempMove;
        move.name = ZName;
        if (SigZ == -1) {
            if (tempMove.zp) move.bp = tempMove.zp; //for any moves that don't fit into the bracketed z-move bp
            else if (tempMove.bp <= 55) move.bp = 100;
            else if (tempMove.bp <= 65) move.bp = 120;
            else if (tempMove.bp <= 75) move.bp = 140;
            else if (tempMove.bp <= 85) move.bp = 160;
            else if (tempMove.bp <= 95) move.bp = 175;
            else if (tempMove.bp <= 100) move.bp = 180;
            else if (tempMove.bp <= 110) move.bp = 185;
            else if (tempMove.bp <= 125) move.bp = 190;
            else if (tempMove.bp <= 130) move.bp = 195;
            else move.bp = 200;
            move.name = "Z-" + tempMove.name;
            move.isZ = true;
            move.category = tempMove.category;
            moveDescName = ZName + " (" + move.bp + " BP)";
        }
        else
            moveDescName = ZName;
        move.isCrit = tempMove.isCrit;
        move.hits = 1;
        if (attacker.ability == 'Parental Bond') attacker.ability = '';
    }
    return [move, moveDescName];
}

function MaxMoves(move, attacker, isQuarteredByProtect, moveDescName, field) {
    var exceptions_100_fight = ["Low Kick", "Reversal", "Final Gambit"];
    var exceptions_80_fight = ["Double Kick", "Triple Kick"];
    var exceptions_75_fight = ["Counter", "Seismic Toss"];
    var exceptions_140 = ["Crush Grip", "Wring Out", "Magnitude", "Double Iron Bash", "Rising Voltage", "Triple Axel"];
    var exceptions_130 = ["Pin Missile", "Power Trip", "Punishment", "Dragon Darts", "Dual Chop", "Electro Ball", "Heat Crash",
        "Bullet Seed", "Grass Knot", "Bonemerang", "Bone Rush", "Fissure", "Icicle Spear", "Sheer Cold", "Weather Ball", "Tail Slap", "Guillotine", "Horn Drill",
        "Flail", "Return", "Frustration", "Endeavor", "Natural Gift", "Trump Card", "Stored Power", "Rock Blast", "Gear Grind", "Gyro Ball", "Heavy Slam",
        "Dual Wingbeat", "Terrain Pulse", "Surging Strikes", "Scale Shot"];
    var exceptions_120 = ["Double Hit", "Spike Cannon"];
    var exceptions_100 = ["Twineedle", "Beat Up", "Fling", "Dragon Rage", "Nature's Madness", "Night Shade", "Comet Punch", "Fury Swipes", "Sonic Boom", "Bide",
        "Super Fang", "Present", "Spit Up", "Psywave", "Mirror Coat", "Metal Burst"];
    var tempMove = move;
    var maxName = MAXMOVES_LOOKUP[tempMove.type];
    if (G_MAXMOVES_TYPE[attacker.name] == tempMove.type && attacker.gmax_factor) {
        maxName = G_MAXMOVES_LOOKUP[attacker.name];
    }
    move = moves[maxName];
    if (move == undefined) move = tempMove; //prevents crashing when switching between Gen VII and VIII, as well as for Typeless Max Moves
    else {
        move.type = tempMove.type;
        move.name = maxName;
    }
    if (['G-Max Drum Solo', 'G-Max Fireball', 'G-Max Hydrosnipe'].indexOf(maxName) == -1) {
        if (move.type == "Fighting" || move.type == "Poison") {
            if (tempMove.bp >= 150 || exceptions_100_fight.includes(tempMove.name)) move.bp = 100;
            else if (tempMove.bp >= 110) move.bp = 95;
            else if (tempMove.bp >= 75) move.bp = 90;
            else if (tempMove.bp >= 65) move.bp = 85;
            else if (tempMove.bp >= 55 || exceptions_80_fight.includes(tempMove.name)) move.bp = 80;
            else if (tempMove.bp >= 45 || exceptions_75_fight.includes(tempMove.name)) move.bp = 75;
            else move.bp = 70;
        }
        else {
            if (tempMove.bp >= 150) move.bp = 150;
            else if (tempMove.bp >= 110 || exceptions_140.includes(tempMove.name)) move.bp = 140;
            else if (tempMove.bp >= 75 || exceptions_130.includes(tempMove.name)) move.bp = 130;
            else if (tempMove.bp >= 65 || exceptions_120.includes(tempMove.name)) move.bp = 120;
            else if (tempMove.bp >= 55 || exceptions_100.includes(tempMove.name)) move.bp = 110;
            else if (tempMove.bp >= 45) move.bp = 100;
            else move.bp = 90;
        }
    }
    if (move.name === "G-Max Wind Rage")
        move.ignoresScreens = true;
    if (maxName != undefined)
        moveDescName = maxName + " (" + move.bp + " BP)";
    if (tempMove.name == "(No Move)") {
        moveDescName = "(No Move)";
        move.bp = 0;
        move.isCrit = false;
    }
    else if (tempMove.category == "Status") {
        moveDescName = "Max Guard";
        move.name = moveDescName;
        move.bp = 0;
        move.isCrit = false;
    }
    else move.isCrit = tempMove.isCrit;
    move.category = tempMove.category;
    move.hits = 1;
    if (isQuarteredByProtect && ["G-Max One Blow", "G-Max Rapid Flow"].includes(maxName)) isQuarteredByProtect = false;
    if (attacker.ability == 'Parental Bond') attacker.ability = '';

    return [move, isQuarteredByProtect, moveDescName];
}

function NaturePower(move, field, moveDescName) {         //Rename Nature Power to its appropriately called moves; needs to be done after Max Moves since Nature Power becomes Max Guard
    move.category = "Special";
    var natureZ = move.isZ;
    var npMove = gen == 3 ? "Swift" : gen == 5 ? "Earthquake"
        : (field.terrain == "Electric") ? "Thunderbolt"
            : (field.terrain == "Grassy") ? "Energy Ball"
                : (field.terrain == "Psychic") ? "Psychic"
                    : (field.terrain == "Misty") ? "Moonblast"
                        : "Tri Attack";
    move = moves[npMove];
    move.name = npMove;
    move.isZ = natureZ;
    move.hits = 1;
    moveDescName = npMove;
    return [move, moveDescName];
}

function checkMeFirst(move, moveDescName, defender, isDynamax) {
    var moveName = defender.moves[move.usedOppMoveIndex].name;
    var cannotCall = ['Beak Blast', 'Belch', 'Chatter', 'Counter', 'Covet', 'Focus Punch', 'Metal Burst', 'Mirror Coat', 'Shell Trap', 'Struggle', 'Thief'].includes(moveName);
    var meFirstZ = move.isZ, isMeFirst = false, tempCrit = move.isCrit;
    if (!cannotCall && moves[moveName].category !== 'Status' && !isDynamax) {
        move = moves[moveName];
        move.name = moveName;
        isMeFirst = true;
        move.isZ = meFirstZ;
        move.isCrit = tempCrit;
        moveDescName = moveName;
    }
    return [move, moveDescName, isMeFirst];
}

function statusMoves(move, attacker, defender, description) {
    if (move.name === "Pain Split" && attacker.item !== "Assault Vest") {
        return { "damage": [defender.curHP - Math.floor((defender.curHP + attacker.curHP) / 2)], "description": buildDescription(description) };
    }
    else if (move.bp === 0 || move.category === "Status") {
        return { "damage": [0], "description": buildDescription(description) };
    }
}

function abilityIgnore(attacker, move, defAbility, description, defItem = "") {
    var isIgnoreable = ['Shadow Shield', 'Full Metal Body', 'Prism Armor', 'As One', 'Protosynthesis', 'Quark Drive',
        'Tablets of Ruin', 'Vessel of Ruin', 'Sword of Ruin', 'Beads of Ruin'].indexOf(defAbility) == -1 && defItem !== "Ability Shield";
    var isMoldBreaker = ["Mold Breaker", "Teravolt", "Turboblaze"].indexOf(attacker.ability) !== -1;
    var isIgnoreMove = ["Moongeist Beam", "Sunsteel Strike", "Photon Geyser", "Searing Sunraze Smash", "Menacing Moonraze Maelstrom",
        "Light That Burns the Sky", 'G-Max Drum Solo', 'G-Max Fireball', 'G-Max Hydrosnipe'].indexOf(move.name) !== -1;

    if (isMoldBreaker || isIgnoreMove) {
        move.ignoresFriendGuard = true;
        if (isIgnoreable) {
            defAbility = "[ignored]";
            if (isMoldBreaker)
                description.attackerAbility = attacker.ability;
        }
    }

    return [defAbility, description];
}

function critMove(move, defAbility) {
    return move.isCrit && ["Battle Armor", "Shell Armor"].indexOf(defAbility) === -1;
}

//UNUSED CURRENTLY
function HiddenPower(move, attacker, description) {
    var typeOrder = ['Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', 'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark'];
    var typeIndex = Math.floor(((attacker.ivs['hp'] & 1) + (attacker.ivs[AT] & 1) * 2 + (attacker.ivs[DF] & 1) * 4 + (attacker.ivs[SP] & 1) * 8 + (attacker.ivs[SA] & 1) * 16 + (attacker.ivs[SD] & 1) * 32) * 15 / 63);
    move.type = typeOrder[typeIndex];
    if (gen < 6) {
        move.bp = Math.floor((secondLeastSigBit(attacker.ivs['hp']) + (secondLeastSigBit(attacker.ivs[AT]) * 2) + (secondLeastSigBit(attacker.ivs[DF]) * 4) + (secondLeastSigBit(attacker.ivs[SP]) * 8) + (secondLeastSigBit(attacker.ivs[SA]) * 16) + (secondLeastSigBit(attacker.ivs[SD]) * 32)) * 40 / 63) + 30;
        description.moveBP = move.bp;
    }
    description.moveType = move.type;

    return [move, description];
}

function secondLeastSigBit(val) {
    if (val & 2) {
        return 1;
    }
    return 0;
}

function NaturalGift(move, attacker, description) {
        var gift = getNaturalGift(attacker.item);
        move.type = gift.t;
        move.bp = gift.p;
        description.attackerItem = attacker.item;
        description.moveBP = move.bp;
        description.moveType = move.type;
    
    return [move, description];
}

const TYPE_CHANGE_BOOST_ABILITIES = [
    'Normalize',
    'Aerilate',
    'Pixilate',
    'Refrigerate',
    'Galvanize',
    'Dragonize'
];
function checkAbilityTypeChange(move, attacker, description) {
    var isBoosted = false;
    if (attacker.ability === "Liquid Voice") {
        if (move.isSound) {
            move.type = "Water";
            description.attackerAbility = attacker.ability;
        }
    }
    else {
        if (attacker.ability !== "Normalize" && move.type === "Normal") { //Z-Moves don't receive -ate type changes
            switch (attacker.ability) {
                case "Aerilate":
                    move.type = "Flying";
                    break;
                case "Pixilate":
                    move.type = "Fairy";
                    break;
                case "Refrigerate":
                    move.type = "Ice";
                    break;
                case "Galvanize":
                    move.type = "Electric";
                    break;
                case "Dragonize":
                    move.type = "Dragon";
            }
            if (attacker.isDynamax)
                description.moveName = MAXMOVES_LOOKUP[move.type] + " (" + move.bp + " BP)";
            isBoosted = true;     //indicates whether the move gets the boost or not
        }
        else if (attacker.ability === "Normalize") {
            move.type = "Normal";
            if (attacker.isDynamax)
                description.moveName = "Max Strike (" + move.bp + " BP)";
            isBoosted = gen >= 7 ? true : false;     //indicates whether the move gets the boost or not
        }
    }

    return [move, description, isBoosted];
}


function immunityChecks(move, attacker, defender, field, description, defAbility, typeEffectiveness) {
    if (typeEffectiveness === 0 || (gen === 3 && move.type === '???')) {
        return { "damage": [0], "description": buildDescription(description) };
    }
    if ((defAbility === "Wonder Guard" && typeEffectiveness <= 1 && move.type !== 'Typeless' && (gen !== 4 || move.name !== 'Fire Fang')) ||
        (move.type === "Grass" && defAbility === "Sap Sipper") ||
        (move.type === "Fire" && ["Flash Fire", "Well-Baked Body"].indexOf(defAbility) !== -1) ||
        (move.type === "Water" && (["Dry Skin", "Water Absorb"].indexOf(defAbility) !== -1 || (defAbility === 'Storm Drain' && gen !== 4))) ||
        (move.type === "Electric" && (["Motor Drive", "Volt Absorb"].indexOf(defAbility) !== -1 || (defAbility === 'Lightning Rod' && gen > 4))) ||
        (move.type === "Ground" && ((!field.isGravity && defender.item !== "Iron Ball" && ['Levitate','Eelevate'].includes(defAbility)) || defAbility === "Earth Eater")) ||
        (move.isBullet && defAbility === "Bulletproof") ||
        (move.isSound && defAbility === "Soundproof") ||
        (move.isWind && defAbility === "Wind Rider")) {
        description.defenderAbility = defAbility;
        return { "damage": [0], "description": buildDescription(description) };
    }
    if (move.type === "Ground" && !field.isGravity && defender.item === "Air Balloon" && move.name !== "Thousand Arrows") {
        description.defenderItem = defender.item;
        return { "damage": [0], "description": buildDescription(description) };
    }
    if ((field.weather === "Harsh Sun" && move.type === "Water") || (field.weather === "Heavy Rain" && move.type === "Fire")) {
        return { "damage": [0], "description": buildDescription(description) };
    }
    if (move.name === "Sky Drop" &&
        (defender.hasType("Flying") ||
            (gen >= 6 && defender.weight >= 200.0) || field.isGravity)) {
        return { "damage": [0], "description": buildDescription(description) };
    }
    if (move.name === "Synchronoise" && !(defender.hasType(attacker.type1, attacker.type2))) {
        return { "damage": [0], "description": buildDescription(description) };
    }
    if (defender.isDynamax && ["Grass Knot", "Low Kick", "Heat Crash", "Heavy Slam"].indexOf(move.name) !== -1) {
        return { "damage": [0], "description": buildDescription(description) };
    }
    if ((defAbility === "Damp" || attacker.ability === "Damp") && ["Self-Destruct", "Explosion", "Mind Blown", "Misty Explosion"].indexOf(move.name) !== -1) {
        if (defAbility === "Damp")
            description.defenderAbility = defAbility;
        if (attacker.ability === "Damp")
            description.attackerAbility = attacker.ability;
        return { "damage": [0], "description": buildDescription(description) };
    }
    if (move.isOHKO && defAbility === "Sturdy") {
        description.defenderAbility = defAbility;
        return { "damage": [0], "description": buildDescription(description) };
    }
    if (move.name === "Fling" && cantFlingItem(attacker.item, attacker.name, defAbility)) {
        description.attackerItem = attacker.item;
        return { "damage": [0], "description": buildDescription(description) };
    }
    if (move.name === "Natural Gift" && attacker.item.indexOf(" Berry") === -1) {
        return { "damage": [0], "description": buildDescription(description) };
    }
    if (["Queenly Majesty", "Dazzling", "Armor Tail"].indexOf(defAbility) !== -1 && move.isPriority) {
        description.defenderAbility = defAbility;
        return { "damage": [0], "description": buildDescription(description) };
    }
    if (field.terrain === "Psychic" && move.isPriority && pIsGrounded(defender, field)) {
        description.terrain = field.terrain;
        return { "damage": [0], "description": buildDescription(description) };
    }
    if (move.name === 'Dream Eater' && defender.status !== 'Asleep' && defAbility !== 'Comatose') {
        return { "damage": [0], "description": buildDescription(description) };
    }

    return -1;
}

//Special Cases
function setDamage(move, attacker, defender, description, isQuarteredByProtect, field) {
    var isParentBond = attacker.ability === "Parental Bond";
    //a. Counterattacks (Counter, Mirror Coat, Metal Burst, Comeuppance, Bide)
    if (['Counter', 'Mirror Coat', 'Metal Burst', 'Comeuppance'].indexOf(move.name) !== -1) {
        var counteredMove = defender.moves[move.usedOppMoveIndex];
        if (counteredMove.category !== 'Status') {
            if (gen <= 3) counteredMove.category = typeChart[counteredMove.type].category;
            counteredResult = GET_DAMAGE_HANDLER(defender, attacker, counteredMove, field);
            if (Array.isArray(counteredResult.damage[0]))
                counteredResult.damage = counteredResult.damage[counteredResult.damage.length - 1];
            if (gen > 3 || counteredMove.name.indexOf('Hidden Power') === -1) {
                if (['Counter', 'Mirror Coat'].indexOf(move.name) !== -1 && move.category == counteredMove.category) {
                    for (i = 0; i < counteredResult.damage.length; i++) {
                        counteredResult.damage[i] *= 2;
                    }
                    counteredResult.description = '2x ' + move.name + ' (' + counteredResult.description + ') vs. ' + description.HPEVs + ' ' + description.defenderName;
                }
                else if (['Metal Burst', 'Comeuppance'].indexOf(move.name) !== -1) {
                    for (i = 0; i < counteredResult.damage.length; i++) {
                        counteredResult.damage[i] = Math.floor(counteredResult.damage[i] * 1.5);
                    }
                    counteredResult.description = '1.5x ' + move.name + ' (' + counteredResult.description + ') vs. ' + description.HPEVs + ' ' + description.defenderName;
                }
                else {
                    return { "damage": [0], "description": buildDescription(description) };
                }
            }
            else if (move.name === 'Counter') {
                for (i = 0; i < counteredResult.damage.length; i++) {
                    counteredResult.damage[i] *= 2;
                }
                counteredResult.description = '2x ' + move.name + ' (' + counteredResult.description + ') vs. ' + description.HPEVs + ' ' + description.defenderName;
            }
            else {
                return { "damage": [0], "description": buildDescription(description) };
            }
            if (isParentBond) {
                for (var i = 0; i < counteredResult.damage.length; i++) {
                    counteredResult.damage[i] *= 2;
                }
            }
            return counteredResult;
        }
        else {
            return { "damage": [0], "description": buildDescription(description) };
        }
        //Bide ain't being added it's too niche
    }

    //b. Defender HP Dependent (Super Fang/Nature's Madness/Ruination, Guardian of Alola)
    var def_curHP;
    if (["Super Fang", "Nature's Madness", "Ruination"].indexOf(move.name) !== -1) {
        def_curHP = Math.floor(defender.curHP / 2);
        if (isParentBond) {
            def_curHP = Math.floor(def_curHP * 3 / 2);
        }
        if (defender.isDynamax) {
            def_curHP = Math.floor(def_curHP / 2);
        }
        if (gen == 9.5) {
            def_curHP = Math.floor(def_curHP * 0.75);
        }
        return { "damage": [def_curHP], "description": buildDescription(description) };
    }
    else if (move.name === "Guardian of Alola") {
        if (!isQuarteredByProtect) {
            def_curHP = Math.floor(defender.curHP * 3 / 4);
        }
        else {
            def_curHP = Math.floor(defender.curHP * 3 / 16);
        }
        return { "damage": [def_curHP], "description": buildDescription(description) };
    }

    //c. Attacker HP Dependent (Endeavor, Final Gambit)
    if (move.name === "Endeavor") {
        var endvr_dmg = 0;
        if (attacker.curHP < defender.curHP) endvr_dmg = defender.curHP - attacker.curHP;
        return { "damage": [endvr_dmg], "description": buildDescription(description) };
    }
    if (move.name === "Final Gambit") {
        var at_curHP = attacker.curHP;
        return { "damage": [at_curHP], "description": buildDescription(description) };
    }

    //d. Set Damage (Sonic Boom, Dragon Rage)
    if (move.name === "Sonic Boom") {
        return !isParentBond
            ? { "damage": [20], "description": buildDescription(description) }
            : { "damage": [40], "description": buildDescription(description) };
    }
    if (move.name === "Dragon Rage") {
        return !isParentBond
            ? { "damage": [40], "description": buildDescription(description) }
            : { "damage": [80], "description": buildDescription(description) };
    }

    //e. Level Dependent Damage (Seismic Toss, Night Shade)
    if (move.name === "Seismic Toss" || move.name === "Night Shade") {
        var lv = attacker.level;
        if (isParentBond) {
            lv *= 2;
        }
        return { "damage": [lv], "description": buildDescription(description) };
    }

    //f. OHKO moves
    if (move.isOHKO) {
        if (move.name == 'Sheer Cold' && defender.hasType("Ice"))
            return { "damage": [0], "description": buildDescription(description) };
        else
            return { "damage": [defender.curHP], "description": buildDescription(description) };
    }
    //g. Psywave

    return -1;
}

/**
 * Returns true if the Pokemon is grounded, and false if it is airborne. Cases not covered:
 * - Klutz + Iron Ball/Air Balloon (handled in function checkKlutz)
 * - Levitate + ignoring/negating abilities (handled before; ability should be blank by the time this function is called)
 * - Flying type + Ring Target (handled in function getMoveEffectiveness)
 * - Thousand Arrows (handled in function getMoveEffectiveness)
 * - Flying type + Roost (not implemented, not planning on implementing, wouldn't be handled here anyway)
 */
function pIsGrounded(mon, field) {
    return field.isGravity || mon.item == "Iron Ball" || (mon.item != "Air Balloon" && !(["Levitate", "Eelevate"].includes(mon.ability)) && !(mon.hasType("Flying"))) || field.isIngrain;
}

//1. Custom BP
function basePowerFunc(move, description, turnOrder, attacker, defender, field, attIsGrounded, defIsGrounded, defAbility) {
    var basePower;
    switch (move.name) {
        //a. Speed based
        //a.i. Gyro Ball
        case "Gyro Ball":
            basePower = Math.min(150, Math.floor(25 * defender.stats[SP] / attacker.stats[SP]) + 1);
            description.moveBP = basePower;
            break;
        //a.ii. Electro Ball
        case "Electro Ball":
            var r = (defender.stats[SP] == 0) ? 0 : Math.floor(attacker.stats[SP] / defender.stats[SP]);
            basePower = r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40;
            description.moveBP = basePower;
            break;

        //b. Weight based
        //b.i. Low Kick, Grass Knot
        case "Low Kick":
        case "Grass Knot":
            if (gen >= 3) {
                var w = defender.weight;
                basePower = w >= 200 ? 120 : w >= 100 ? 100 : w >= 50 ? 80 : w >= 25 ? 60 : w >= 10 ? 40 : 20;
                description.moveBP = basePower;
                if (defAbility == "Heavy Metal" || defAbility == "Light Metal")
                    description.defenderAbility = defAbility;
                if (defender.item == "Float Stone")
                    description.defenderItem = defender.item;
            }
            else basePower = move.bp;
            break;
        //b.ii. Heavy Slam, Heat Crash
        case "Heavy Slam":
        case "Heat Crash":
            var wr = attacker.weight / defender.weight;
            basePower = wr >= 5 ? 120 : wr >= 4 ? 100 : wr >= 3 ? 80 : wr >= 2 ? 60 : 40;
            description.moveBP = basePower;
            if (defAbility == "Heavy Metal" || defAbility == "Light Metal")
                description.defenderAbility = defAbility;
            if (defender.item == "Float Stone")
                description.defenderItem = defender.item;
            if (attacker.ability == "Heavy Metal" || attacker.ability == "Light Metal")
                description.attackerAbility = attacker.ability;
            if (attacker.item == "Float Stone")
                description.attackerItem = attacker.item;
            break;

        //c. HP based
        //c.i. Eruption, Water Spout, Dragon Energy
        case "Eruption":
        case "Water Spout":
        case "Dragon Energy":
            basePower = Math.max(1, Math.floor(150 * attacker.curHP / attacker.maxHP));
            description.moveBP = basePower;
            break;
        //c.ii. Flail, Reversal
        case "Flail":
        case "Reversal":
            var p = Math.floor(48 * attacker.curHP / attacker.maxHP);
            basePower = p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20;
            description.moveBP = basePower;
            break;
        //c.iii. Crush Grip, Wring Out, Hard Press
        case "Crush Grip":
        case "Wring Out":
            basePower = Math.floor(pokeRound(120 * 100 * Math.floor(defender.curHP * 0x1000 / defender.maxHP) / 0x1000) / 100);
            description.moveBP = basePower;
            break;
        case "Hard Press":
            basePower = Math.floor(pokeRound(100 * 100 * Math.floor(defender.curHP * 0x1000 / defender.maxHP) / 0x1000) / 100);
            description.moveBP = basePower;
            break;

        //d. Friendship based   (not done under the assumption that it will always deal max damage)
        //d.i. Return
        //d.ii. Frustration

        //e. Counter based
        //e.i. Fury Cutter
        //e.ii. Rollout, Ice Ball
        //e.iii. Spit Up

        //f. Boost based
        //f.i. Stored Power, Power Trip
        case "Stored Power":
        case "Power Trip":
            basePower = 20 + 20 * countBoosts(attacker.boosts);
            description.moveBP = basePower;
            break;
        //f.ii. Punishment
        case "Punishment":
            basePower = Math.min(200, 60 + 20 * countBoosts(defender.boosts));
            description.moveBP = basePower;
            break;

        //g. Dichotomous BP
        //g.i. Acrobatics
        case "Acrobatics":
            basePower = attacker.item === 'Flying Gem'
                || attacker.item === "" ? 110 : 55;
            if (basePower !== move.bp) description.moveBP = basePower;
            break;
        //g.ii. Hex
        case "Hex":
        case "Infernal Parade":
            basePower = move.bp * (defender.status !== "Healthy" || defAbility === 'Comatose' ? 2 : 1);
            if (basePower !== move.bp) description.moveBP = basePower;
            break;
        //g.iii. Smelling Salts
        case "Smelling Salts":
            basePower = move.bp * (defender.status === "Paralyzed" ? 2 : 1);
            if (basePower !== move.bp) description.moveBP = basePower;
            break;
        //g.iv. Wake-Up Slap
        case "Wake-Up Slap":
            basePower = move.bp * (defender.status === "Asleep" || defAbility === 'Comatose' ? 2 : 1);
            if (basePower !== move.bp) description.moveBP = basePower;
            break;
        //g.v. Weather Ball
        case "Weather Ball":
            let isWeatherBoost = !(['', 'Strong Winds'].includes(field.weather));
            let isMegaSol = attacker.ability === 'Mega Sol';
            basePower = move.bp * (isWeatherBoost || isMegaSol ? 2 : 1);
            if (basePower !== move.bp) {
                description.moveBP = basePower;
                if (isWeatherBoost) {
                    description.weather = field.weather;
                }
                else if (isMegaSol) {
                    description.attackerAbility = attacker.ability;
                }
                description.moveType = move.type;
            }
            break;
        //g.vi. Water Shuriken
        case "Water Shuriken":
            basePower = (attacker.name === "Ash-Greninja" && attacker.ability === "Battle Bond") ? 20 : move.bp;
            if (basePower !== move.bp) description.moveBP = basePower;
            break;
        //g.vii. Terrain Pulse
        case "Terrain Pulse":
            basePower = (field.terrain !== "" && attIsGrounded) ? move.bp * 2 : move.bp;
            if (basePower !== move.bp) {
                description.moveBP = basePower;
                description.terrain = field.terrain;
                description.moveType = move.type;
            }
            break;
        //g.viii. Rising Voltage
        case "Rising Voltage":
            basePower = (field.terrain === "Electric" && defIsGrounded) ? move.bp * 2 : move.bp;
            if (basePower !== move.bp) description.moveBP = basePower;
            break;
        //g.ix. Grass Pledge, Fire Pledge, Water Pledge combined
        case "Grass Pledge":
        case "Fire Pledge":
        case "Water Pledge":
            basePower = move.combinePledge !== move.name ? 150 : move.bp;
            description.moveBP = basePower;
            if (move.combinePledge !== move.name)
                description.moveType = move.type;
            break;
        //g.x. Tera Blast Tera-Stellar
        case "Tera Blast":
            basePower = move.type == 'Stellar' ? 100 : 80;
            if (basePower !== move.bp) description.moveBP = basePower;
            break;
        //g.xi. Brine (Gen 4)
        case "Brine":
            if (gen == 4 && defender.curHP <= (defender.maxHP / 2)) {
                basePower = move.bp * 2;
                description.moveBP = basePower;
            }
            else basePower = move.bp;
            break;
        //g.xii. Facade (Gens 3-4)
        case "Facade":
            if (gen <= 4 && ["Burned", "Paralyzed", "Poisoned", "Badly Poisoned"].indexOf(attacker.status) !== -1) {
                basePower = move.bp * 2;
                description.moveBP = basePower;
            }
            else basePower = move.bp;
            break;
        //g.xiii. Payback, Fisheous Rend, Bolt Beak                                            CURRENTLY USING ISDOUBLE IN DEFAULT
        //case "Payback":
        //case "Fisheous Rend":
        //case "Bolt Beak":
        //    basePower = turnOrder === "LAST" ? move.bp * 2 : move.bp;
        //    if (basePower !== move.bp) description.moveBP = basePower;
        //    break;
        //g.xvi. Everything else (Assurance, Avalanche, Revenge, Gust, Twister, Pursuit, Round, Stomping Tantrum, Temper Flare)    CHECK DEFAULT

        //h. Item based
        //h.i. Fling
        case "Fling":
            basePower = getFlingPower(attacker.item);
            description.moveBP = basePower;
            if (gen !== 4 || attacker.ability !== "Klutz")
                description.attackerItem = attacker.item;
            break;
        //h.ii. Natural Gift
        case "Natural Gift":
            if (attacker.item.indexOf(" Berry") !== -1) {
                [move, description] = NaturalGift(move, attacker, description);
                basePower = move.bp;
            }
            break;

        //i. Other
        //i.i. Beat Up
        //i.ii. Echoed Voice
        //i.iii. Hidden Power (ONLY APPLIES TO THE HIDDEN POWER THAT DOESN'T SPECIFY ITS TYPE; BP is actually calculated earlier for ease of use, so this is just for the description)
        case "Hidden Power":
            basePower = move.bp;
            if (gen < 6) {
                description.moveBP = basePower;
            }
            description.moveType = move.type;
            break;
        //i.iv. Magnitude
        //i.v. Present
        //i.vi. Triple Kick, Triple Axel 
        case "Triple Kick":
        case "Triple Axel":
            if (move.currTripleHit)
                basePower = move.bp * move.currTripleHit;
            else
                basePower = move.bp;
            break;
        //i.vii. Trump Card
        //i.viii. Last Respects, Rage Fist
        case "Last Respects":
        case "Rage Fist":
            basePower = move.bp * (move.timesAffected + 1);
            if (move.timesAffected)
                description.moveBP = basePower;
            break;
        //i.ix. Dark Void (Legends Z-A)         NEEDS TO BE VERIFIED
        case "Dark Void":
            if (gen == 9.5 && defender.status == "Drowsy") {
                basePower = 2 * move.bp;
                description.moveBP = basePower;
            }
            else {
                basePower = move.bp;
            }
            break;
        default:
            if (move.isDouble && ['Retaliate', 'Fusion Bolt', 'Fusion Flare', 'Lash Out'].indexOf(move.name) === -1) {
                basePower = 2 * move.bp;
                if (basePower !== move.bp) description.moveBP = basePower;
            }
            else {
                basePower = move.bp;
                if (!move.isZ && basePower !== moves[move.name].bp && !description.moveBP) {
                    description.moveBP = basePower;
                }
            }
    }

    return [basePower, description];
}

//2. BP Mods
function calcBPMods(attacker, defender, field, move, description, ateIzeBoosted, basePower, attIsGrounded, defIsGrounded, turnOrder, defAbility, isMeFirst) {
    var bpMods = [];
    var isAttackerAura = attacker.ability === (move.type + " Aura");
    var isDefenderAura = defAbility === (move.type + " Aura");
    var auraActive = ($("input:checkbox[id='" + move.type.toLowerCase() + "-aura']:checked").val() != undefined);
    var auraBreak = ($("input:checkbox[id='aura-break']:checked").val() != undefined);

    //a. Aura Break
    if (auraActive && auraBreak && !field.isNeutralizingGas && defAbility !== '[ignored]') {
        bpMods.push(0x0C00);
        if (isAttackerAura || attacker.ability == "Aura Break") {
            description.attackerAbility = attacker.ability;
        }
        else if (isDefenderAura || defAbility == "Aura Break") {
            description.defenderAbility = defAbility;
        }
    }

    //b. Rivalry
    if (attacker.ability == "Rivalry" && attacker.rivalryGender != '') {
        if (attacker.rivalryGender == 'Same') {
            bpMods.push(0x1400);
            description.attackerAbility = 'Rivalry (1.25x)';
        }
        else if (attacker.rivalryGender == 'Opposite') {
            bpMods.push(0x0C00);
            description.attackerAbility = 'Rivalry (0.75x)';
        }
    }

    //c. 1.2x Abilities
    //c.i. Galvanize, Aerilate, Pixilate, Refrigerate, Dragonize, Normalize        (Technically Normalize is separate but it doesn't hurt to handle it where it is now)
    if (!move.isZ && !attacker.isDynamax && ateIzeBoosted) {     //function checkAbilityTypeChange sets this value
        var ateIzeMultiplier = gen > 6 ? 0x1333 : 0x14CD;
        bpMods.push(ateIzeMultiplier);
        description.attackerAbility = attacker.ability;
    }
    //c.ii Reckless, Iron Fist                                          (Same deal; hasRecoil shouldn't ever be true, but it's still checked for unknown recoil amount)
    else if ((attacker.ability === "Reckless" && (move.hasRecoil || move.recoilHP || move.hasCrash)) || (attacker.ability === "Iron Fist" && move.isPunch)) {
        bpMods.push(0x1333);
        description.attackerAbility = attacker.ability;
    }

    //d. Field Abilities
    //d.i. Battery
    if (field.isBattery && move.category === "Special") {
        bpMods.push(0x14CD);
        description.isBattery = true;
    }
    //d.ii. Power Spot
    if (field.isPowerSpot) {
        bpMods.push(0x14CD);
        description.isPowerSpot = true;
    }
    //d.iii. Ally Steely Spirit (probably doesn't go here but Smogon makes Doubles research a pain to find)
    if (field.isSteelySpirit && move.type === "Steel") {
        bpMods.push(0x1800);
        description.isSteelySpirit = true;
    }

    //e. 1.3x Abilities
    //e.i. Sheer Force
    if (attacker.ability === "Sheer Force" && move.hasSecondaryEffect) {
        bpMods.push(0x14CD);
        description.attackerAbility = attacker.ability;
    }
    //e.ii. Sand Force
    else if (attacker.ability === "Sand Force" && field.weather === "Sand" && ["Rock", "Ground", "Steel"].indexOf(move.type) !== -1) {
        bpMods.push(0x14CD);
        description.attackerAbility = attacker.ability;
        description.weather = field.weather;
    }
    //e.iii. Analytic
    else if (attacker.ability === "Analytic" && turnOrder !== "FIRST") {
        bpMods.push(0x14CD);
        description.attackerAbility = attacker.ability;
    }
    //e.iv. Tough Claws
    else if (attacker.ability === "Tough Claws" && move.makesContact) {
        bpMods.push(0x14CD);
        description.attackerAbility = attacker.ability;
    }
    //e.v. Punk Rock
    else if (attacker.ability == "Punk Rock" && move.isSound) {
        bpMods.push(0x14CD);
        description.attackerAbility = attacker.ability;
    }

    //f. Fairy Aura, Dark Aura
    if (auraActive && !auraBreak && !field.isNeutralizingGas && (gen > 7 || defAbility !== '[ignored]')) {
        bpMods.push(0x1548);
        if (isAttackerAura) {
            description.attackerAbility = attacker.ability;
        }
        else if (isDefenderAura) {
            description.defenderAbility = defAbility;
        }
    }

    //If the BP before this point would trigger Technician, don't apply it
    var tempBP = pokeRound(basePower * chainMods(bpMods) / 0x1000);

    //g. 1.5x Abilities (Technician, Flare Boost, Toxic Boost, Strong Jaw, Mega Launcher, Steely Spirit)
    if ((attacker.ability === "Technician" && tempBP <= 60) ||
        (attacker.ability === "Flare Boost" && attacker.status === "Burned" && move.category === "Special") ||
        (attacker.ability === "Toxic Boost" && (attacker.status === "Poisoned" || attacker.status === "Badly Poisoned") && move.category === "Physical") ||
        (attacker.ability === "Mega Launcher" && move.isPulse) ||
        (attacker.ability === "Strong Jaw" && move.isBite) ||
        (attacker.ability === "Steely Spirit" && move.type === "Steel")) {
        bpMods.push(0x1800);
        description.attackerAbility = attacker.ability;
    }

    //h. Heatproof (pre Gen 9)
    if (defAbility === "Heatproof" && move.type === "Fire" & gen < 9) {
        bpMods.push(0x800);
        description.defenderAbility = defAbility;
    }

    //i. Dry Skin
    else if (defAbility === "Dry Skin" && move.type === "Fire") {
        bpMods.push(0x1400);
        description.defenderAbility = defAbility;
    }

    //j. 1.1x Items
    if ((attacker.item === "Muscle Band" && move.category === "Physical")
        || (attacker.item === "Wise Glasses" && move.category === "Special")) {
        bpMods.push(0x1199);
        description.attackerItem = attacker.item;
    }

    //k. 1.2x Items
    else if (getItemBoostType(attacker.item) === move.type) {
        var itemTypeMultiplier = 0x1333;
        bpMods.push(itemTypeMultiplier);
        description.attackerItem = attacker.item;
    }
    else if (getItemDualTypeBoost(attacker.item, attacker.name).indexOf(move.type) !== -1) {
        bpMods.push(0x1333);
        description.attackerItem = attacker.item;
    }
    else if (attacker.item && attacker.item.indexOf(' Mask') !== -1 && attacker.name && attacker.name.indexOf('Ogerpon-') !== -1
        && attacker.item.substring(0, attacker.item.indexOf(' Mask')) === attacker.name.substring(8) && attacker.name.indexOf('(') === -1) {
        bpMods.push(0x1333);
        description.maskBoost = true;
    }

    //l. Gems
    else if (attacker.item === move.type + " Gem" && !move.isPledge) {
        var gemMultiplier = gen > 5 ? 0x14CD : 0x1800;
        bpMods.push(gemMultiplier);
        description.attackerItem = attacker.item;
    }

    //m. Solar Beam, Solar Blade
    if ((move.name === "Solar Beam" || move.name === "Solar Blade") && !(["None", "Sun", "Harsh Sun", "Strong Winds", ""].includes(field.weather)) && attacker.item !== 'Utility Umbrella' && attacker.ability !== 'Mega Sol') {
        bpMods.push(0x800);
        description.moveBP = move.bp / 2;
        description.weather = field.weather;
    }

    //n. Me First
    if (isMeFirst) {
        bpMods.push(0x1800);
        description.meFirst = true;
    }

    //o. Knock Off
    if (gen > 5 && move.name === "Knock Off" && defender.name !== null && !cantRemoveItem(defender.item, defender.name, field.terrain)) {
        bpMods.push(0x1800);
        description.moveBP = move.bp * 1.5;
    }
    //p. Psyblade
    else if (field.terrain === "Electric" && move.name === "Psyblade") {
        bpMods.push(0x1800);
        description.moveBP = move.bp * 1.5;
        description.terrain = field.terrain;
    }
    //q. Misty Explosion
    else if ((move.name === "Misty Explosion" && field.terrain == "Misty" && attIsGrounded) ||
        (move.name === "Grav Apple" && field.isGravity)) {
        bpMods.push(0x1800);
        description.moveBP = move.bp * 1.5;
    }
    //r. Expanding Force
    else if (move.name === "Expanding Force" && field.terrain == "Psychic" && attIsGrounded) {
        bpMods.push(0x1800);
        description.moveBP = move.bp * 1.5;
    }

    //s. Helping Hand
    if (field.isHelpingHand) {
        bpMods.push(0x1800);
        description.isHelpingHand = true;
    }

    //t. Charge, Electromorphosis, Wind Power
    if ((((attacker.ability === "Electromorphosis" || attacker.ability === "Wind Power") && attacker.abilityOn) || field.isCharge) && move.type === "Electric") {
        bpMods.push(0x2000);
        description.charged = true;
    }

    //u. Double power (Facade, Brine, Venoshock, Retaliate, Fusion Bolt, Fusion Flare, Lash Out)
    if ((move.name === "Facade" && ["Burned", "Paralyzed", "Poisoned", "Badly Poisoned"].indexOf(attacker.status) !== -1) ||
        (move.name === "Brine" && defender.curHP <= defender.maxHP / 2) ||
        (["Venoshock", "Barb Barrage"].indexOf(move.name) !== -1 && (defender.status === "Poisoned" || defender.status === "Badly Poisoned")) ||
        (['Retaliate', 'Fusion Bolt', 'Fusion Flare', 'Lash Out'].indexOf(move.name) !== -1 && move.isDouble)) {
        bpMods.push(0x2000);
        description.moveBP = move.bp * 2;
    }

    //v. Offensive Terrain
    if (attIsGrounded) {
        var terrainMultiplier = gen > 7 ? 0x14CD : 0x1800;
        if (field.terrain === "Electric" && move.type === "Electric") {
            bpMods.push(terrainMultiplier);
            description.terrain = field.terrain;
        } else if (field.terrain === "Grassy" && move.type == "Grass") {
            bpMods.push(terrainMultiplier);
            description.terrain = field.terrain;
        } else if (field.terrain === "Psychic" && move.type == "Psychic") {
            bpMods.push(terrainMultiplier);
            description.terrain = field.terrain;
        }
    }
    //w. Defensive Terrain
    if (defIsGrounded) {
        if ((field.terrain === "Misty" && move.type === "Dragon") ||
            (field.terrain === "Grassy" && (move.name === "Earthquake" || move.name === "Bulldoze"))) {
            bpMods.push(0x800);
            description.terrain = field.terrain;
        }
    }

    //x. Mud Sport, Water Sport

    //y. Supreme Overlord
    if (attacker.ability === "Supreme Overlord" && attacker.supremeOverlord > 0) {
        overlordBoost = [0x119A, 0x1333, 0x14CD, 0x1666, 0x1800];
        bpMods.push(overlordBoost[attacker.supremeOverlord - 1]);
        description.attackerAbility = attacker.supremeOverlord > 1 ? attacker.ability + " (" + attacker.supremeOverlord + " allies down)"
            : attacker.ability + " (1 ally down)";
    }
    //z. Punching Glove
    if (attacker.item === "Punching Glove" && move.isPunch) {
        bpMods.push(0x119A);
        description.attackerItem = attacker.item;
    }

    //If the BP before this point would exceed 60 BP, don't apply it
    tempBP = pokeRound(basePower * chainMods(bpMods) / 0x1000);

    //aa. Tera boost for moves with <60 BP
    if (attacker.isTerastalize && (move.type === attacker.tera_type || (attacker.tera_type === 'Stellar' && move.getsStellarBoost)) && tempBP < 60 && canTeraBoost60BP(move)) {
        bpMods.push(60 / tempBP * 0x1000);
        description.teraBPBoost = true;
    }

    //MECHANICS TESTING
    if (attacker.hasCustomModifiers && attacker.customModifiers['bpMods']) {
        let customBPMods = attacker.customModifiers['bpMods'];
        for (let i = 0; i < customBPMods.length; i++) {
            bpMods.push(customBPMods[i]);
        }
        description.isMechanicsTest = true;
    }

    return [bpMods, description, move];
}

function canTeraBoost60BP(move) {
    var priority = move.isPriority;
    var multiHit = move.hitRange ? true : false;
    var otherExceptions = ["Crush Grip", "Dragon Energy", "Electro Ball", "Eruption", "Flail", "Fling", "Grass Knot", "Gyro Ball",
        "Heat Crash", "Heavy Slam", "Low Kick", "Reversal", "Water Spout", "Hard Press"].indexOf(move.name) !== -1;
    return !priority && !multiHit && !otherExceptions;
}

//3. Attack
function calcAttack(move, attacker, defender, description, isCritical, defAbility) {
    //a. Foul Play, Photon Geyser, Light That Burns The Sky, Shell Side Arm, Body Press, Tera Blast
    var attack;
    var attackSource = move.name === "Foul Play" ? defender : attacker;
    var usesDefenseStat = move.name === "Body Press";
    var attackStat = usesDefenseStat ? DF : move.category === "Physical" ? AT : SA;
    var isMidMoveAtkBoost = false;
    var isContrary = attacker.ability === 'Contrary' ? -1 : 1;
    var maxBoost = gen == 9.5 ? 1 : 6;
    var attackInvest = gen < 10 ? attackSource.evs[attackStat] : resultDisplayMode == "SPs" ? attackSource.sps[attackStat] : resultDisplayMode == "EVs" ? Math.max(0, attackSource.sps[attackStat] * 8 - 4) : attackSource.rawStats[attackStat];
    description.attackEVs = attackInvest +
        ((gen < 10 || resultDisplayMode !='raw') && NATURES[attackSource.nature][0] === attackStat ? "+" : (gen < 10 || resultDisplayMode !='raw') && NATURES[attackSource.nature][1] === attackStat ? "-" : "") + " " +
        toSmogonStat(attackStat) + (attackSource.ivs[attackStat] < 31 ? " " + attackSource.ivs[attackStat] + " IV" : "");
    description.usesOppAtkStat = move.name === "Foul Play";
    //Spectral Thief and Meteor Beam aren't part of the calculations but are instead here to properly account for the boosts they give
    if (move.name === "Spectral Thief" && defender.boosts[attackStat] > 0) {
        attacker.boosts[attackStat] = Math.min(maxBoost, attacker.boosts[attackStat] + defender.boosts[attackStat]);
        isMidMoveAtkBoost = true;
    }
    else if (["Meteor Beam", "Electro Shot"].indexOf(move.name) !== -1 && ((isContrary === -1 && attacker.boosts[attackStat] > -1 * maxBoost) || attacker.boosts[attackStat] < maxBoost)) {
        attacker.boosts[attackStat] += (1 * isContrary);
        isMidMoveAtkBoost = true;
    }
    //b. Unaware
    if (defAbility === "Unaware" && attackSource.boosts[attackStat] !== 0) {
        attack = attackSource.rawStats[attackStat];
        description.defenderAbility = defAbility;
        description.attackBoost = attackSource.boosts[attackStat];
    }
    else if (isMidMoveAtkBoost) {
        description.attackBoost = attacker.boosts[attackStat];
        //explore a possible better implementation
        if (attackSource.boosts[attackStat] === 0 || (isCritical && attackSource.boosts[attackStat] < 0)) {
            attack = attackSource.rawStats[attackStat];
        }
        else {
            attack = getModifiedStat(attackSource.rawStats[attackStat], attacker.boosts[attackStat]);
        }
        attacker.boosts[attackStat] -= (1 * isContrary);
    }
    //c. Crit
    else if (attackSource.boosts[attackStat] === 0 || (isCritical && attackSource.boosts[attackStat] < 0)) {
        attack = attackSource.rawStats[attackStat];
    }
    //THIS IS NEEDED TO GUARANTEE CATCH ALL UNAWARE CONDITIONS, WITHOUT IT SOME WILL SLIP BY!!!
    else if (defAbility === "Unaware") {
        attack = attackSource.rawStats[attackStat];
    }
    //d. Attack boosts and drops
    else {
        attack = attackSource.stats[attackStat];
        description.attackBoost = attackSource.boosts[attackStat];
    }

    //e. Hustle
    // unlike all other attack modifiers, Hustle gets applied directly
    if (attacker.ability === "Hustle" && move.category === "Physical") {
        attack = pokeRound(attack * 3 / 2);
        description.attackerAbility = attacker.ability;
    }

    return [attack, description];
}

//4. Attack Mods
function calcAtMods(move, attacker, defAbility, description, field) {
    atMods = [];
    var ruinActive = {
        "Tablets of Ruin": $("input:checkbox[id='tablets-of-ruin']:checked").val() != undefined && !field.isNeutralizingGas,
        "Vessel of Ruin": $("input:checkbox[id='vessel-of-ruin']:checked").val() != undefined && !field.isNeutralizingGas,
    };

    //a. Tablets of Ruin, Vessel of Ruin
    if (ruinActive["Tablets of Ruin"] && move.category === "Physical" && attacker.ability !== "Tablets of Ruin") {
        atMods.push(0x0C00);
        description.ruinTabletsVessel = "Tablets";
    }
    else if (ruinActive["Vessel of Ruin"] && move.category === "Special" && attacker.ability !== "Vessel of Ruin") {
        atMods.push(0x0C00);
        description.ruinTabletsVessel = "Vessel";
    }

    //b. 0.5x Abilities
    //Slow Start also halves damage with special Z-moves
    if ((attacker.ability === "Slow Start" && attacker.abilityOn && (move.category === "Physical" || (move.category === "Special" && move.isZ))) ||
        (attacker.ability === "Defeatist" && attacker.curHP <= attacker.maxHP / 2)) {
        atMods.push(0x800);
        description.attackerAbility = attacker.ability;
    }
    //c. Flower Gift
    if (attacker.ability === "Flower Gift" && attacker.name === "Cherrim" && field.weather.indexOf("Sun") > -1 && move.category === "Physical" && attacker.item !== 'Utility Umbrella') {
        atMods.push(0x1800);
        description.attackerAbility = attacker.ability;
        description.weather = field.weather;
    }
    else if (field.isFlowerGiftAtk && field.weather.indexOf("Sun") > -1 && move.category === "Physical" && attacker.item !== 'Utility Umbrella') {
        atMods.push(0x1800);
        description.isFlowerGiftAtk = true;
        description.weather = field.weather;
    }
    //d. 1.5x Offensive Abilities
    if ((attacker.ability === "Guts" && attacker.status !== "Healthy" && move.category === "Physical")
        || (attacker.ability === "Overgrow" && attacker.curHP <= attacker.maxHP / 3 && move.type === "Grass")
        || (attacker.ability === "Blaze" && attacker.curHP <= attacker.maxHP / 3 && move.type === "Fire")
        || (attacker.ability === "Torrent" && attacker.curHP <= attacker.maxHP / 3 && move.type === "Water")
        || (attacker.ability === "Swarm" && attacker.curHP <= attacker.maxHP / 3 && move.type === "Bug")
        || (attacker.ability === "Transistor" && move.type === "Electric" && gen == 8)
        || (attacker.ability === "Dragon's Maw" && move.type === "Dragon")
        || (attacker.ability === "Flash Fire" && attacker.abilityOn && move.type === "Fire")
        || (attacker.ability === "Steelworker" && move.type === "Steel")
        || (attacker.ability === "Gorilla Tactics" && move.category === "Physical" && !attacker.isDynamax)
        || (["Plus", "Minus"].indexOf(attacker.ability) !== -1 && attacker.abilityOn && move.category === "Special")
        || (attacker.ability === "Sharpness" && move.isSlice)
        || (attacker.ability === "Rocky Payload" && move.type === "Rock")
        || (attacker.ability === "Fire Mane" && move.type === "Fire")) {
        atMods.push(0x1800);
        description.attackerAbility = attacker.ability;
    }
    else if (attacker.ability === "Solar Power" && field.weather.indexOf("Sun") > -1 && move.category === "Special" && attacker.item !== 'Utility Umbrella') {
        atMods.push(0x1800);
        description.attackerAbility = attacker.ability;
        description.weather = field.weather;
    }
    //e. 1.3x Abilities
    else if (attacker.paradoxAbilityBoost && ((attacker.highestStat === 'at' && move.category === "Physical") || (attacker.highestStat === 'sa' && move.category === "Special"))
        || (attacker.ability === "Transistor" && move.type === "Electric" && gen >= 9)) {
        atMods.push(0x14CD);
        description.attackerAbility = attacker.ability;
    }
    //f. Orichalcum Pulse, Hadron Engine
    else if ((attacker.ability == "Orichalcum Pulse" && field.weather === "Sun" && move.category === "Physical" && attacker.item !== "Utility Umbrella")
        || (attacker.ability == "Hadron Engine" && field.terrain === "Electric" && move.category === "Special")) {
        atMods.push(0x1555);
        description.attackerAbility = attacker.ability;
    }

    //g. 2.0x Offensive Abilities
    if ((attacker.ability === "Water Bubble" && move.type === "Water") ||
        ((attacker.ability === "Huge Power" || attacker.ability === "Pure Power") && move.category === "Physical")
        || (attacker.ability === "Stakeout" && attacker.abilityOn)) {
        atMods.push(0x2000);
        description.attackerAbility = attacker.ability;
    }
    //h. 0.5x Defensive Abilities
    if ((defAbility === "Thick Fat" && (move.type === "Fire" || move.type === "Ice"))
        || (defAbility === "Water Bubble" && move.type === "Fire")
        || (defAbility === "Purifying Salt" && move.type === "Ghost")
        || (defAbility === 'Heatproof' && move.type === 'Fire' && gen >= 9)) {
        atMods.push(0x800);
        description.defenderAbility = defAbility;
    }

    //i. 2.0x Items
    if ((attacker.item === "Thick Club" && (attacker.name === "Cubone" || attacker.name === "Marowak" || attacker.name === "Marowak-Alola") && move.category === "Physical") ||
        (attacker.item === "Deep Sea Tooth" && attacker.name === "Clamperl" && move.category === "Special") ||
        (attacker.item === "Light Ball" && (attacker.name === "Pikachu" || attacker.name === "Pikachu-Gmax"))) {
        atMods.push(0x2000);
        description.attackerItem = attacker.item;
    } //j. 1.5x Items
    else if ((attacker.item === "Choice Band" && move.category === "Physical" && !attacker.isDynamax) ||
        (attacker.item === "Choice Specs" && move.category === "Special" && !attacker.isDynamax) ||
        (attacker.item === "Soul Dew" && ["Latias", "Latios"].indexOf(attacker.name) !== -1 && move.category === 'Special' && gen <= 6)) {
        atMods.push(0x1800);
        description.attackerItem = attacker.item;
    }
    //k. Link Battle Red Item (LEGENDS Z-A ONLY)
    if (field.isRedItem) {
        atMods.push(0x2000);
        description.redItem = true;
    }

    //MECHANICS TESTING
    if (attacker.hasCustomModifiers && attacker.customModifiers['atMods']) {
        let customATMods = attacker.customModifiers['atMods'];
        for (let i = 0; i < customATMods.length; i++) {
            atMods.push(customATMods[i]);
        }
        description.isMechanicsTest = true;
    }

    return [atMods, description];
}

//5. Defense
function calcDefense(move, attacker, defender, description, hitsPhysical, isCritical, field) {
    //a. Psyshock, Psystrike, Secret Sword (handled in hitsPhysical declaration)
    var defenseStat = hitsPhysical ? DF : SD;
    var defenseInvest = gen < 10 ? defender.evs[defenseStat] : resultDisplayMode == "SPs" ? defender.sps[defenseStat] : resultDisplayMode == "EVs" ? Math.max(0, defender.sps[defenseStat] * 8 - 4) : defender.rawStats[defenseStat];
    description.defenseEVs = defenseInvest +
        ((gen < 10 || resultDisplayMode !='raw') && NATURES[defender.nature][0] === defenseStat ? "+" : (gen < 10 || resultDisplayMode !='raw') && NATURES[defender.nature][1] === defenseStat ? "-" : "") + " " +
        toSmogonStat(defenseStat) + (defender.ivs[defenseStat] < 31 ? " " + defender.ivs[defenseStat] + " IV" : "");

    //b. Wonder Room

    //Spectral Thief isn't part of the calculations but is instead here to properly account for the boosts it takes
    if (move.name === "Spectral Thief" && defender.boosts[defenseStat] > 0) {
        defense = defender.rawStats[defenseStat];
    }
    //c. Unaware
    else if (attacker.ability === "Unaware" && defender.boosts[defenseStat] !== 0) {
        defense = defender.rawStats[defenseStat];
        description.attackerAbility = attacker.ability;
        description.defenseBoost = defender.boosts[defenseStat];
    }
    //d. Chip Away, Sacred Sword
    else if (move.ignoresDefenseBoosts && defender.boosts[defenseStat] !== 0) {
        defense = defender.rawStats[defenseStat];
        description.defenseBoost = defender.boosts[defenseStat];
    }
    //e. Crits
    else if (defender.boosts[defenseStat] === 0 || (isCritical && defender.boosts[defenseStat] > 0)) {
        defense = defender.rawStats[defenseStat];
    }
    //THIS IS NEEDED TO GUARANTEE CATCH ALL UNAWARE AND SACRED SWORD CONDITIONS, WITHOUT IT SOME WILL SLIP BY!!!
    else if (move.ignoresDefenseBoosts || attacker.ability === "Unaware") {
        defense = defender.rawStats[defenseStat];
    }
    // f. Defense drops and boosts
    else {
        defense = defender.stats[defenseStat];
        description.defenseBoost = defender.boosts[defenseStat];
    }

    //g. Sandstorm Rock types, Snowstorm Ice Types
    // unlike all other defense modifiers, Sandstorm SpD boost gets applied directly
    if (((field.weather === "Sand" && defender.hasType("Rock") && !hitsPhysical) || (field.weather === "Snow" && defender.hasType("Ice") && hitsPhysical))
        && attacker.ability !== 'Mega Sol') {
        defense = pokeRound(defense * 3 / 2);
        description.weather = field.weather;
    }
    return [defense, description];
}

//6. Defense Mods
function calcDefMods(move, defender, field, description, hitsPhysical, defAbility) {
    var dfMods = [];
    var ruinActive = {
        "Sword of Ruin": $("input:checkbox[id='sword-of-ruin']:checked").val() != undefined && !field.isNeutralizingGas,
        "Beads of Ruin": $("input:checkbox[id='beads-of-ruin']:checked").val() != undefined && !field.isNeutralizingGas,
    };

    //a. Sword of Ruin, Beads of Ruin
    if (ruinActive["Sword of Ruin"] && hitsPhysical && defAbility !== "Sword of Ruin") {
        dfMods.push(0x0C00);
        description.ruinSwordBeads = "Sword";
    }
    else if (ruinActive["Beads of Ruin"] && !hitsPhysical && defAbility !== "Beads of Ruin") {
        dfMods.push(0x0C00);
        description.ruinSwordBeads = "Beads";
    }

    //b. Flower Gift
    if (defAbility === "Flower Gift" && defender.name === "Cherrim" && field.weather.indexOf("Sun") > -1 && !hitsPhysical && defender.item !== 'Utility Umbrella') {
        dfMods.push(0x1800);
        description.defenderAbility = defAbility;
        description.weather = field.weather;
    }
    else if (field.isFlowerGiftSpD && field.weather.indexOf("Sun") > -1 && !hitsPhysical && defender.item !== 'Utility Umbrella') {
        dfMods.push(0x1800);
        description.isFlowerGiftSpD = true;
        description.weather = field.weather;
    }
    //c. 1.5x Abilities
    if ((defAbility === "Marvel Scale" && defender.status !== "Healthy" && hitsPhysical) ||
        (defAbility === "Grass Pelt" && field.terrain === "Grassy" && hitsPhysical)) {
        dfMods.push(0x1800);
        description.defenderAbility = defAbility;
    }
    //d. 1.3x Abilities
    else if (defender.paradoxAbilityBoost && ((defender.highestStat === 'df' && hitsPhysical) || (defender.highestStat === 'sd' && !hitsPhysical))) {
        dfMods.push(0x14CD);
        description.defenderAbility = defAbility;
    }
    //e. 2x Abilities
    else if (defAbility === "Fur Coat" && hitsPhysical) {
        dfMods.push(0x2000);
        description.defenderAbility = defAbility;
    }
    //f. 1.5x Items
    if ((defender.item === "Assault Vest" && !hitsPhysical) ||
        (defender.item === "Eviolite" && defender.canEvolve) ||
        (defender.item === "Soul Dew" && ["Latias", "Latios"].indexOf(defender.name) !== -1 && !hitsPhysical && gen <= 6)) {
        dfMods.push(0x1800);
        description.defenderItem = defender.item;
    } //g. 2.0x Items
    else if ((defender.item === "Deep Sea Scale" && defender.name === "Clamperl" && !hitsPhysical) ||
        (defender.item === "Metal Powder" && defender.name === "Ditto" && hitsPhysical)) {
        dfMods.push(0x2000);
        description.defenderItem = defender.item;
    }
    //h. Link Battle Blue Item (LEGENDS Z-A ONLY)
    if (field.isBlueItem) {
        dfMods.push(0x2000);
        description.blueItem = true;
    }

    //MECHANICS TESTING
    if (defender.hasCustomModifiers && defender.customModifiers['dfMods']) {
        let customDFMods = defender.customModifiers['dfMods'];
        for (let i = 0; i < customDFMods.length; i++) {
            dfMods.push(customDFMods[i]);
        }
        description.isMechanicsTest = true;
    }

    return [dfMods, description];
}

//7. Base Damage
function calcBaseDamage(attacker, basePower, attack, defense) {
    return Math.floor(Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * basePower * attack) / defense) / 50 + 2);
}

//8. General Damage Mods
function calcGeneralMods(baseDamage, move, attacker, defender, defAbility, field, description, isCritical, typeEffectiveness, isQuarteredByProtect, hitsPhysical) {
    //a. Spread Move mod
    if (field.format !== "Singles" && move.isSpread) {
        baseDamage = pokeRound(baseDamage * 0xC00 / 0x1000);
    }
    //b. Parental Bond mod
    var childMod = gen >= 7 ? 0x0400 : 0x0800;
    baseDamage = attacker.isChild ? pokeRound(baseDamage * childMod / 0x1000) : baseDamage;    //should be accurate based on implementation
    //c. Weather mod, Hydro Steam
    if (((((field.weather.indexOf("Sun") > -1 || attacker.ability === 'Mega Sol') && move.type === "Fire") || (field.weather.indexOf("Rain") > -1 && move.type === "Water")) && defender.item !== 'Utility Umbrella')
        || ((field.weather.indexOf("Sun") > -1 || attacker.ability === 'Mega Sol') && move.name === "Hydro Steam" && attacker.item !== 'Utility Umbrella')) {
        baseDamage = pokeRound(baseDamage * 0x1800 / 0x1000);
        if (attacker.ability === 'Mega Sol') {
            description.attackerAbility = attacker.ability;
        }
        else {
            description.weather = field.weather;
        }
    }
    else if (((field.weather === "Sun" && move.type === "Water") || (field.weather === "Rain" && move.type === "Fire" && attacker.ability !== 'Mega Sol')) && defender.item !== 'Utility Umbrella') {
        baseDamage = pokeRound(baseDamage * 0x800 / 0x1000);
        description.weather = field.weather;
    }
    else if ((field.weather === "Strong Winds" && defender.hasType("Flying") &&
        typeChart[move.type]["Flying"] > 1)) {
        description.weather = field.weather;        //not actually a mod, just adding the description here
    }
    //d. Glaive Rush 2x mod
    if (defender.glaiveRushMod) {
        baseDamage = pokeRound(baseDamage * 0x2000 / 0x1000);
        description.isGlaiveMod = true;
    }
    //e. Crit mod
    if (isCritical) {
        baseDamage = Math.floor(baseDamage * (gen >= 6 ? 1.5 : 2));
        description.isCritical = isCritical;
    }
    // the random factor is applied between the crit mod and the stab mod, so don't apply anything below this until we're inside the loop
    //see GENERAL MODS CONTINUED for further comments

    var stabMod = 0x1000;
    if (move.type !== 'Typeless') {     //Typeless moves cannot get stab even if the user is Typeless
        if (attacker.isTerastalize && attacker.tera_type !== 'Stellar') {
            if (move.type === attacker.tera_type && [attacker.teraSTAB1, attacker.teraSTAB2].indexOf(attacker.tera_type) !== -1 ) {
                if (attacker.ability === "Adaptability") {
                    stabMod = 0x2400;
                    description.attackerAbility = attacker.ability;
                } else {
                    stabMod = 0x2000;
                }
            }
            else if ((move.type !== attacker.tera_type && [attacker.teraSTAB1, attacker.teraSTAB2].indexOf(move.type) !== -1) || move.type === attacker.tera_type) {
                if (attacker.ability === "Adaptability" && move.type === attacker.tera_type) {
                    stabMod = 0x2000;
                    description.attackerAbility = attacker.ability;
                } else {
                    stabMod = 0x1800;
                }
            }
        }
        else if (attacker.isTerastalize && (move.getsStellarBoost || attacker.name === 'Terapagos-Stellar')) { //Tera Type being Stellar is implicit
            if (attacker.hasType(move.type) || (move.combinePledge && move.combinePledge !== move.name)) {
                stabMod = 0x2000;
            }
            else {
                stabMod = 0x1333;
            }
            if (attacker.name !== 'Terapagos-Stellar') description.stellarBoost = true;
        }
        else { //Covers for non-terastalized and Stellar being used up
            if (attacker.hasType(move.type) || (move.combinePledge && move.combinePledge !== move.name)) {
                if (attacker.ability === "Adaptability") {
                    stabMod = 0x2000;
                    description.attackerAbility = attacker.ability;
                } else {
                    stabMod = 0x1800;
                }
            } else if (["Protean", "Libero"].indexOf(attacker.ability) !== -1 && (gen < 9 || attacker.abilityOn)) {
                stabMod = 0x1800;
                description.attackerAbility = attacker.ability;
            }
        }
    }
    var applyBurn = (attacker.status === "Burned" && move.category === "Physical" && attacker.ability !== "Guts" && !move.ignoresBurn);
    description.isBurned = applyBurn;
    var finalMod;
    [finalMod, description] = calcFinalMods(move, attacker, defender, field, description, isCritical, typeEffectiveness, defAbility);
    finalMods = chainMods(finalMod);
    var reSortDamage = false;

    var damage = [], additionalDamage = [], allDamage = [];
    var minDamageValue = 85;    //this has been made into a value in case of any more damage roll alterations

    //GENERAL MODS CONTINUED
    for (var i = 0; i + minDamageValue <= 100; i++) { //e. Rand mod
        damage[i] = Math.floor(baseDamage * (minDamageValue + i) / 100);
        //f. STAB mod (with Terastal changes)
        damage[i] = pokeRound(damage[i] * stabMod / 0x1000);
        //g. Type Effect mod
        damage[i] = Math.floor(damage[i] * typeEffectiveness);
        //h. Burn mod
        if (applyBurn) {
            damage[i] = Math.floor(damage[i] / 2);
        }
        //i. Final mods
        damage[i] = pokeRound(damage[i] * finalMods / 0x1000);
        //j. Z-move and Max move protecting mod
        if (isQuarteredByProtect) {
            damage[i] = pokeRound(damage[i] * 0x400 / 0x1000);
            description.isQuarteredByProtect = true;
        }
        //k. Damage Reduction (LEGENDS Z-A ONLY)
        if (gen == 9.5) {
            damage[i] = Math.floor(Math.floor(damage[i] * 70) / 100);
        }
        //l. Min Damage Check
        if (gen <= 9) {
            damage[i] = Math.max(1, damage[i]);
        }
        //m. Max Damage Check
        if (gen <= 9 && damage[i] > 65535 && !turnOffOverflow) {
            damage[i] %= 65536;
            reSortDamage = true;
        }
    }

    if (reSortDamage) {
        damage.sort(numericSort);
    }

    //if (defAbility === 'Sand Spit' && field.weather !== 'Sand' && !(['Harsh Sun', 'Heavy Rain', 'Strong Winds'].includes(defAbility))) {
    //    field.weather = 'Sand';
    //}
    //else if (defAbility === 'Seed Sower' && field.terrain !== 'Grassy') {
    //    field.terrain = 'Grassy';
    //}

    if (!move.isNextMove) {
        var addQualList = checkAddCalcQualifications(attacker, defender, move, field, hitsPhysical);
        var addCalcQualified = false;
        for (check in addQualList) {
            if (addQualList[check]) {
                addCalcQualified = true;
                break;
            }
        }
        if (addCalcQualified) {
            additionalDamage = additionalDamageCalcs(attacker, defender, move, field, description, addQualList);
            allDamage[0] = damage;
        }
        else
            allDamage = damage;
        if (additionalDamage.length) {
            for (var i = 0; i < additionalDamage.length; i++) {
                allDamage[i + 1] = additionalDamage[i];
            }
        }
    }
    else
        allDamage = damage;

    return {
        "damage": allDamage,
        "description": buildDescription(description)
    };
}

//9. Finals Damage Mods
function calcFinalMods(move, attacker, defender, field, description, isCritical, typeEffectiveness, defAbility) {
    var finalMods = [];
    //a. Screens/Aurora Veil
    if (field.isAuroraVeil && !isCritical && !move.ignoresScreens) {
        finalMods.push(field.format !== "Singles" ? 0xAAC : 0x800);
        description.isAuroraVeil = true;
    }
    else if (field.isReflect && move.category === "Physical" && !isCritical && !move.ignoresScreens) {  //Note: Reflect/Light Screen stop physical/special moves respectively, NOT moves that hit physical/special
        finalMods.push(field.format !== "Singles" ? 0xAAC : 0x800);
        description.isReflect = true;
    } else if (field.isLightScreen && move.category === "Special" && !isCritical) {
        finalMods.push(field.format !== "Singles" ? 0xAAC : 0x800);
        description.isLightScreen = true;
    }
    if (defender.isDynamax) description.isDynamax = true;
    //b. Neuroforce
    if (attacker.ability === "Neuroforce" && typeEffectiveness > 1) {
        finalMods.push(0x1400);
        description.attackerAbility = attacker.ability;
    }
    //c. Collision Course/Electro Drift
    if (["Collision Course", "Electro Drift"].indexOf(move.name) !== -1 && typeEffectiveness > 1) {
        finalMods.push(0x1555);
        description.courseDriftSE = true;
    }
    //d. Sniper
    if (attacker.ability === "Sniper" && isCritical) {
        finalMods.push(0x1800);
        description.attackerAbility = attacker.ability;
    }
    //e. Tinted Lens
    if (attacker.ability === "Tinted Lens" && typeEffectiveness < 1) {
        finalMods.push(0x2000);
        description.attackerAbility = attacker.ability;
    }
    //f. Dynamax Cannon, Behemoth Blade, Behemoth Bash
    if ((move.name === "Dynamax Cannon" || move.name === "Behemoth Blade" || move.name === "Behemoth Bash") && defender.isDynamax) {
        finalMods.push(0x2000);
    }
    //g. Multiscale, Shadow Shield
    if ((defAbility === "Multiscale" || defAbility == "Shadow Shield") && defender.curHP === defender.maxHP) {
        finalMods.push(0x800);
        description.defenderAbility = defAbility;
    }
    //h. Fluffy (contact)/Aura Guard
    if (["Fluffy", "Aura Guard"].includes(defAbility) && move.makesContact) {
        finalMods.push(0x800);
        description.defenderAbility = defAbility;
    }
    //i. Punk Rock
    if (defAbility === "Punk Rock" && move.isSound) {
        finalMods.push(0x800);
        description.defenderAbility = defAbility;
    }
    //j. Ice Scales
    if (defAbility === "Ice Scales" && move.category === "Special"){
        finalMods.push(0x800);
        description.defenderAbility = defAbility;
    }
    //k. Friend Guard
    if (field.isFriendGuard && !move.ignoresFriendGuard) {
        finalMods.push(0xC00);
        description.isFriendGuard = true;
    }
    //l. Solid Rock, Filter, Prism Armor
    if ((defAbility === "Solid Rock" || defAbility === "Filter" || defAbility === "Prism Armor") && typeEffectiveness > 1) {
        finalMods.push(0xC00);
        description.defenderAbility = defAbility;
    }
    //m. Metronome item
    //n. Fluffy (fire moves)
    if (defAbility === "Fluffy" && move.type === "Fire") {
        finalMods.push(0x2000);
        description.defenderAbility = defAbility;
    }
    //o. Expert Belt
    if (attacker.item === "Expert Belt" && typeEffectiveness > 1) {
        finalMods.push(0x1333);
        description.attackerItem = attacker.item;
    } //p. Life Orb
    else if (attacker.item === "Life Orb") {
        finalMods.push(0x14CC);
        description.attackerItem = attacker.item;
    }
    //q. Resist Berries
    if (getBerryResistType(defender.item) === move.type && (typeEffectiveness > 1 || move.type === "Normal") &&
        attacker.ability !== "Unnerve" && attacker.ability !== "As One") {
        if (defAbility === "Ripen") {
            finalMods.push(0x400);
            description.defenderAbility = defAbility;
        }
        else {
            finalMods.push(0x800);
        }
        description.defenderItem = defender.item;
        defender.consumeResistBerry = true;
    }
    //r. Doubled damage (These likely won't be added since Minimize/Dig/Dive are hardly ever used)
    //r.i. Body Slam, Stomp, Dragon Rush, Steamroller, Heat Crash, Heavy Slam, Flying Press, Malicious Moonsault
    //r.ii. Earthquake
    //r.iii. Surf, Whirlpool

    //MECHANICS TESTING
    if (attacker.hasCustomModifiers && attacker.customModifiers['fnMods']) {
        let customFinalMods = attacker.customModifiers['fnMods'];
        for (let i = 0; i < customFinalMods.length; i++) {
            finalMods.push(customFinalMods[i]);
        }
        description.isMechanicsTest = true;
    }

    return [finalMods, description];
}

//All conditions I can think of:
//-Using Triple Kick/Axel (move changes BP depending on which # kick it's on)
//-Resist berries (only active for the first hit)
//-Attacking with Parental Bond ("child" damage is a reduced general mod)
//-Multiscale/Shadow Shield (first hit deals reduced damage)
//-Stamina (each physical hit increases Defense until it reaches +6; yes it's any hit when playing but only physical hits are relevant in the calc)
//-Kee/Maranga Berry (first hit increases Defense/Special Defense by +1)
//-Weak Armor (each physical hit decreases Defense until it reaches -6)
//-Gooey/Tangling Hair (contact moves decreases attacker's Speed, only relevant for Defiant)
//-Cotton Down (any move decreases attacker's Speed, only relevant for Defiant)
//-Spicy Spray (any move burns the target, matters for physical moves and Flare Boost)
//Current implementation has all of the above use cases
//Not implemented (and no plans to do so in the near future):
//-Sand Spit/Seed Sower
//-Liechi/Ganlon/Petaya/Grepa/Salac Berries
//-Crush Grip/Wring Out
function checkAddCalcQualifications(attacker, defender, move, field, hitsPhysical) {
    var addQualList = {
        triple: false,
        resistBerry: false,
        multiscale: false,
        weakArmor: false,
        parentalBond: attacker.ability === "Parental Bond" && move.hits === 1 && !move.hitRange && (field.format === "Singles" || !move.isSpread),
        gooey: false,
        kee: false,
        maranga: false,
        moss: false,
        stamina: false,
        spicySpray: false,
    };
    if (move.hits > 1 || addQualList['parentalBond']) {
        addQualList['triple'] = move.isTripleHit && !addQualList['parentalBond'];
        addQualList['resistBerry'] = defender.consumeResistBerry;
        addQualList['multiscale'] = ['Multiscale', 'Shadow Shield'].includes(defender.ability) && defender.curHP === defender.maxHP;
        addQualList['weakArmor'] = defender.ability === 'Weak Armor' && hitsPhysical && defender.boosts[DF] > -6;
        addQualList['gooey'] = (['Gooey', 'Tangling Hair'].includes(defender.ability) && move.makesContact) || defender.ability === 'Cotton Down' && (['Defiant', 'Competitive'].includes(attacker.ability) || ['Electro Ball', 'Gyro Ball'].includes(move.name)) && defender.boosts[SP] > -6;
        addQualList['kee'] = defender.item === 'Kee Berry' && hitsPhysical && defender.boosts[DF] < 6;
        addQualList['maranga'] = defender.item === 'Maranga Berry' && !hitsPhysical && defender.boosts[SD] < 6;
        addQualList['moss'] = defender.item === 'Luminous Moss' && move.type == 'Water' && !hitsPhysical && defender.boosts[SD] < 6;
        addQualList['stamina'] = defender.ability === 'Stamina' && hitsPhysical && defender.boosts[DF] < 6;
        addQualList['spicySpray'] = defender.ability === 'Spicy Spray' && (attacker.ability === 'Flare Boost' || move.category === 'Physical') && canBeBurned(attacker, move, field);
    }
    return addQualList;
}

function canBeBurned(attacker, move, field) {
    return attacker.status != 'Burned' && !(attacker.hasType('Fire')) && !(['Protean', 'Libero'].includes(attacker.ability) && attacker.abilityOn && move.type == 'Fire')
        && !(attacker.ability == 'Leaf Guard' && field.weather.includes('Sun')) && !(['Water Veil', 'Water Bubble', 'Comatose', 'Thermal Exchange', 'Purifying Salt'].includes(attacker.ability))
        && (field.terrain != 'Misty' || !pIsGrounded(attacker, field));
}

//Inefficient for what it does now but should be a good setup for when more conditions are added
function additionalDamageCalcs(attacker, defender, move, field, description, addQualList) {
    var nextAttacker = JSON.parse(JSON.stringify(attacker)), nextDefender = JSON.parse(JSON.stringify(defender)), nextMove = JSON.parse(JSON.stringify(move));
    //Adding hasType function back in since the deep copy loses it
    nextAttacker.hasType = setHasTypeFunc;
    nextDefender.hasType = setHasTypeFunc;
    var allAdditionalDamages = [];
    var uniqueHits = 1;     //Keeps track of the number of unique hits that need to be calculated, done to minimize redundant function calls
    if (addQualList['parentalBond']) {
        nextAttacker.ability = '';
        nextAttacker.isChild = true;
        nextMove = move;

        if (moves[move.name]['statChange']) {
            var statChange = moves[move.name]['statChange'];
            var affectedStat, numStages = statChange[1], recipient = statChange[2] === 'user' ? nextAttacker : nextDefender;
            switch (statChange[0]) {
                case 'attack':
                    affectedStat = AT;
                    break;
                case 'defense':
                    affectedStat = DF;
                    break;
                case 'special attack':
                    affectedStat = SA;
                    break;
                case 'special defense':
                    affectedStat = SD;
                    break;
            }
            if (numStages > 0) {
                recipient.boosts[affectedStat] = Math.min(6, recipient.boosts[affectedStat] + numStages);
                //recipient = changeStatBoosts([recipient], affectedStat, numStages);
            }
            else {  //TODO: check opponent for: clear/full metal body/white smoke, hyper cutter/big pecks, amulet/cloak, simple, contrary, mirror armor
                recipient.boosts[affectedStat] = Math.max(-6, recipient.boosts[affectedStat] + numStages);
            }
            recipient.stats[affectedStat] = getModifiedStat(recipient.rawStats[affectedStat], recipient.boosts[affectedStat]);
        }
        else if (move.name === 'Assurance') {
            nextMove.isDouble = 1;
        }
        description.attackerAbility = attacker.ability;
        move.hits = 2;  //this persists for properly displaying .result-move and for calculations with function getKOChanceText()
        uniqueHits = 2;
        description.hits = move.hits;
    }
    else if (addQualList['triple']) {
        uniqueHits = move.hits;
    }
    if (addQualList['multiscale']) {
        nextDefender.ability = '';
        if (uniqueHits === 1) {
            uniqueHits = 2;
        }
    }
    else if (addQualList['weakArmor']) {
        uniqueHits = Math.max(uniqueHits, Math.min(-1 * (-6 - defender.boosts[DF]) + 1, move.hits), Math.min(Math.ceil((6 - defender.boosts[SP]) / 2) + 1, move.hits));
        description.defenderAbility = defender.ability;
    }
    else if (addQualList['gooey']) {
        uniqueHits = Math.max(uniqueHits, Math.min(-1 * (-6 - attacker.boosts[SP]) + 1, move.hits));
        description.defenderAbility = defender.ability;
        if (['Defiant', 'Competitive'].includes(attacker.ability)) {
            var boostStat = attacker.ability === 'Defiant' ? AT : SA;
            uniqueHits = Math.max(uniqueHits, Math.min(Math.ceil((6 - attacker.boosts[boostStat]) / 2) + 1, move.hits));
            description.attackerAbility = attacker.ability;
        }
    }
    else if (addQualList['stamina']) {
        uniqueHits = Math.max(uniqueHits, Math.min(6 - defender.boosts[DF] + 1, move.hits));
        description.defenderAbility = defender.ability;
    }
    else if (addQualList['spicySpray']) {
        var burnHealConsumed = false;
        if (['Rawst Berry', 'Lum Berry'].includes(attacker.item)) {
            burnHealConsumed = true;
            description.attackerItem = attacker.item;
            if (move.hits >= 3) {
                uniqueHits = 3;
            }
        }
        else {
            nextAttacker.status = 'Burned';
            if (uniqueHits == 1) {
                uniqueHits = 2;
            }
        }
        description.defenderAbility = defender.ability;
    }
    if (addQualList['kee']) {
        nextDefender.boosts[DF] = Math.min(6, nextDefender.boosts[DF] + 1);
        nextDefender.stats[DF] = getModifiedStat(nextDefender.rawStats[DF], nextDefender.boosts[DF]);
        if (uniqueHits === 1) {
            uniqueHits = 2;
        }
        description.defenderItem = defender.item;
    }
    else if (addQualList['maranga'] || addQualList['moss']) {
        nextDefender.boosts[SD] = Math.min(6, nextDefender.boosts[SD] + 1);
        nextDefender.stats[SD] = getModifiedStat(nextDefender.rawStats[SD], nextDefender.boosts[SD]);
        if (uniqueHits === 1) {
            uniqueHits = 2;
        }
        description.defenderItem = defender.item;
    }
    else if (addQualList['resistBerry']) {
        nextDefender.item = '';
        if (uniqueHits === 1) {
            uniqueHits = 2;
        }
    }
    nextMove.isNextMove = true;

    for (var i = 0; i < uniqueHits - 1; i++) {
        if (addQualList['gooey']) {
            nextAttacker.boosts[SP] = Math.max(-6, attacker.boosts[SP] - 1);
            nextAttacker.stats[SP] = getModifiedStat(nextAttacker.rawStats[SP], nextAttacker.boosts[SP]);
            if (['Defiant', 'Competitive'].includes(attacker.ability)) {
                boostStat = attacker.ability === 'Defiant' ? AT : SA;
                nextAttacker.boosts[boostStat] = Math.min(6, attacker.boosts[boostStat] + 2);
                nextAttacker.stats[boostStat] = getModifiedStat(nextAttacker.rawStats[boostStat], nextAttacker.boosts[boostStat]);
            }
        }
        else if (addQualList['weakArmor']) {
            nextDefender.boosts[SP] = Math.min(6, nextDefender.boosts[SP] + 2);
            nextDefender.stats[SP] = getModifiedStat(nextDefender.rawStats[SP], nextDefender.boosts[SP]);
            nextDefender.boosts[DF] = Math.max(-6, nextDefender.boosts[DF] - 1);
            nextDefender.stats[DF] = getModifiedStat(nextDefender.rawStats[DF], nextDefender.boosts[DF]);
        }
        else if (addQualList['stamina']) {
            nextDefender.boosts[DF] = Math.min(6, nextDefender.boosts[DF] + 1);
            nextDefender.stats[DF] = getModifiedStat(nextDefender.rawStats[DF], nextDefender.boosts[DF]);
        }
        if (addQualList['triple']) {
            nextMove.currTripleHit = i + 2;
        }
        allAdditionalDamages[i] = GET_DAMAGE_HANDLER(nextAttacker, nextDefender, nextMove, field).damage;
        if (burnHealConsumed && addQualList['spicySpray']) {
            burnHealConsumed = false;
            nextAttacker.item = '';
            nextAttacker.status = 'Burned';
        }
    }
    return allAdditionalDamages;
}


/* ---- damage_SV.js ---- */
/* Damage calculation for the side game: Champions;
 * for the Generation IX games: Scarlet, Violet, and Legends: Z-A;
 * for the Generation VIII games: Sword, Shield, Brilliant Diamond, and Shining Pearl;
 * and for the Generation VII games: Sun, Moon, Ultra Sun, and Ultra Moon */

function CALCULATE_ALL_MOVES_SV(p1, p2, field) {
    checkTrace(p1, p2);
    checkTrace(p2, p1);
    checkNeutralGas(p1, p2, field.getNeutralGas());
    checkAirLock(p1, field);
    checkAirLock(p2, field);
    checkForecast(p1, field.getWeather());
    checkForecast(p2, field.getWeather());
    checkMimicry(p1, field.getTerrain());
    checkMimicry(p2, field.getTerrain());
    checkTerastal(p1);
    checkTerastal(p2);
    checkKlutz(p1);
    checkKlutz(p2);
    checkEvo(p1, p2);
    checkParadoxAbilities(p1, field.getTerrain(), field.getWeather());
    checkParadoxAbilities(p2, field.getTerrain(), field.getWeather());
    checkSeeds(p1, field.getTerrain());
    checkSeeds(p2, field.getTerrain());
    checkSwordShield(p1);
    checkSwordShield(p2);
    checkWindRider(p1, field.getTailwind(0));
    checkWindRider(p2, field.getTailwind(1));
    checkIntimidate(p1, p2);
    checkIntimidate(p2, p1);
    checkSupersweetSyrup(p1, p2);
    checkSupersweetSyrup(p2, p1);
    checkDownload(p1, p2);
    checkDownload(p2, p1);
    checkEmbodyAspect(p1);
    checkEmbodyAspect(p2);
    checkBattleBond(p1);
    checkBattleBond(p2);
    p1.stats[AT] = getModifiedStat(p1.rawStats[AT], p1.boosts[AT]); //new order is important for the proper Protosynthesis/Quark Drive boost
    p1.stats[DF] = getModifiedStat(p1.rawStats[DF], p1.boosts[DF]);
    p1.stats[SA] = getModifiedStat(p1.rawStats[SA], p1.boosts[SA]);
    p1.stats[SD] = getModifiedStat(p1.rawStats[SD], p1.boosts[SD]);
    p1.stats[SP] = getModifiedStat(p1.rawStats[SP], p1.boosts[SP]);
    setHighestStat(p1, 0);
    p1.stats[SP] = getFinalSpeed(p1, field.getWeather(), field.getTailwind(0), field.getSwamp(0), field.getTerrain());
    $(".p1-speed-mods").text(p1.stats[SP]);
    p2.stats[AT] = getModifiedStat(p2.rawStats[AT], p2.boosts[AT]);
    p2.stats[DF] = getModifiedStat(p2.rawStats[DF], p2.boosts[DF]);
    p2.stats[SA] = getModifiedStat(p2.rawStats[SA], p2.boosts[SA]);
    p2.stats[SD] = getModifiedStat(p2.rawStats[SD], p2.boosts[SD]);
    p2.stats[SP] = getModifiedStat(p2.rawStats[SP], p2.boosts[SP]);
    setHighestStat(p2, 1);
    p2.stats[SP] = getFinalSpeed(p2, field.getWeather(), field.getTailwind(1), field.getSwamp(1), field.getTerrain());
    $(".p2-speed-mods").text(p2.stats[SP]);
    var side1 = field.getSide(1);
    var side2 = field.getSide(0);
    checkInfiltrator(p1, side1);
    checkInfiltrator(p2, side2);
    getWeightMods(p1, p2);
    var results = [[],[]];
    for (var i = 0; i < 4; i++) {
        results[0][i] = GET_DAMAGE_SV(p1, p2, p1.moves[i], side1);
        results[1][i] = GET_DAMAGE_SV(p2, p1, p2.moves[i], side2);
        if (gen == 9.5) {
            results[0][i].cooldown = getMoveCooldown(p1, p1.moves[i]);
            results[1][i].cooldown = getMoveCooldown(p2, p2.moves[i]);
        }
    }
    return results;
}

function GET_DAMAGE_SV(attacker, defender, move, field) {
    var moveDescName = move.name;
    var isQuarteredByProtect = false, isMeFirst = false;

    var attIsGrounded = pIsGrounded(attacker, field);
    var defIsGrounded = pIsGrounded(defender, field);

    if (move.name == 'Me First')
        [move, moveDescName, isMeFirst] = checkMeFirst(move, moveDescName, defender, attacker.isDynamax);

    checkMoveTypeChange(move, field, attacker);
    checkConditionalPriority(move, field.terrain, attacker, attIsGrounded);
    checkConditionalSpread(move, field.terrain, attacker, attIsGrounded);

    if (attacker.isDynamax && gen === 8)    //without the gen check a Dynamaxed Pokemon can lead to an error switching between gen 8 and either 7 or 9
        [move, isQuarteredByProtect, moveDescName] = MaxMoves(move, attacker, isQuarteredByProtect, moveDescName, field);
    else if (move.name == "Nature Power" && attacker.item !== 'Assault Vest')
        [move, moveDescName] = NaturePower(move, field, moveDescName);

    if (move.isZ || move.isSignatureZ)
        [move, moveDescName] = ZMoves(move, field, attacker, moveDescName);

    //Needs to be after the Z-move check since Light That Burns The Sky can change category
    if (usesPhysicalAttack(attacker, defender, move)) {
        move.category = "Physical";
    }

    //Placed here so 1) Me First moves get contact, and 2) physical Shell Side Arm gets contact
    checkContactOverride(move, attacker);

    attacker_name = attacker.name;
    if (attacker_name && attacker_name.includes("-Gmax")) attacker_name = attacker_name.substring(0, attacker_name.indexOf('-Gmax'));
    defender_name = defender.name;
    if (defender_name && defender_name.includes("-Gmax")) defender_name = defender_name.substring(0, defender_name.indexOf('-Gmax'));

    var description = {
        "attackerName": attacker_name,
        "moveName": moveDescName,
        "defenderName": defender_name
    };

    isQuarteredByProtect = setIsQuarteredByProtect(attacker, defender, field, move, description);

    addLevelDesc(attacker, defender, description);

    if (move.bp === 0 || move.category === "Status") {
        return statusMoves(move, attacker, defender, description);
    }

    description.attackerTera = attacker.isTerastalize ? attacker.tera_type : false;
    description.defenderTera = defender.isTerastalize ? defender.tera_type : false;

    var defAbility = defender.ability;
    [defAbility, description] = abilityIgnore(attacker, move, defAbility, description, defender.item);

    var isCritical = critMove(move, defAbility);

    var ateIzeBoosted;
    if (!move.isZ && (TYPE_CHANGE_BOOST_ABILITIES.includes(attacker.ability) || attacker.ability == "Liquid Voice")
        && !(['Hidden Power', 'Weather Ball', 'Natural Gift', 'Judgement', 'Techno Blast', 'Revelation Dance', 'Multi-Attack', 'Terrain Pulse'].includes(move.name))) {
        [move, description, ateIzeBoosted] = checkAbilityTypeChange(move, attacker, description);
    }

    var typeEffectiveness = getMoveEffectiveness(move, defender.type1, defender.type2, description, field.isForesight, ["Scrappy", "Mind's Eye"].includes(attacker.ability) ? attacker.ability : false, field.isGravity, defender.item, field.weather === "Strong Winds", defender.isTerastalize, defAbility === 'Tera Shell' && defender.curHP === defender.maxHP);
    immuneBuildDesc = immunityChecks(move, attacker, defender, field, description, defAbility, typeEffectiveness);
    if (immuneBuildDesc !== -1) return immuneBuildDesc;

    getHPInfo(description, defender);

    setDamageBuildDesc = setDamage(move, attacker, defender, description, isQuarteredByProtect, field);
    if (setDamageBuildDesc !== -1) return setDamageBuildDesc;

    if (move.hitRange && !(move.isPlusMove && move.plusEffects && move.plusEffects.hitRange == 1)) {
        description.hits = move.hits;
    }
    var turnOrder = attacker.stats[SP] > defender.stats[SP] ? "FIRST" : "LAST";

    ////////////////////////////////
    ////////// BASE POWER //////////
    ////////////////////////////////
    var basePower;
    [basePower, description] = basePowerFunc(move, description, turnOrder, attacker, defender, field, attIsGrounded, defIsGrounded, defAbility);

    var bpMods;
    [bpMods, description, move] = calcBPMods(attacker, defender, field, move, description, ateIzeBoosted, basePower, attIsGrounded, defIsGrounded, turnOrder, defAbility, isMeFirst);

    basePower = Math.max(1, pokeRound(basePower * chainMods(bpMods) / 0x1000));

    ////////////////////////////////
    ////////// (SP)ATTACK //////////
    ////////////////////////////////

    var attack;
    [attack, description] = calcAttack(move, attacker, defender, description, isCritical, defAbility);

    var atMods;
    [atMods, description] = calcAtMods(move, attacker, defAbility, description, field);

    attack = Math.max(1, pokeRound(attack * chainMods(atMods) / 0x1000));

    ////////////////////////////////
    ///////// (SP)DEFENSE //////////
    ////////////////////////////////
    var hitsPhysical = move.category === "Physical" || move.dealsPhysicalDamage;

    var defense;
    [defense, description] = calcDefense(move, attacker, defender, description, hitsPhysical, isCritical, field);

    var dfMods;
    [dfMods, description] = calcDefMods(move, defender, field, description, hitsPhysical, defAbility);

    defense = Math.max(1, pokeRound(defense * chainMods(dfMods) / 0x1000));

    ////////////////////////////////
    //////////// DAMAGE ////////////
    ////////////////////////////////
    var baseDamage = calcBaseDamage(attacker, basePower, attack, defense);


    return calcGeneralMods(baseDamage, move, attacker, defender, defAbility, field, description, isCritical, typeEffectiveness, isQuarteredByProtect, hitsPhysical);
}


/* ---- ko_chance.js ---- */
function getKOChanceText(damageIn, move, defender, field, isBadDreams, isItemlessAttacker = false) {
    if (isNaN(damageIn[0]) && !Array.isArray(damageIn[0])) {
        return 'something broke; please tell nerd of now';
    }
    if (move.name == "Pain Split" && !move.painMax) {
        return 'The battlers shared their pain!';
    }
    if (move.category == "Status" && ['Me First', '(No Move)'].indexOf(move.name) == -1) {
        return "It's a status move, it won't deal damage.";
    }
    if (damageIn[damageIn.length - 1] === 0) {
        if (field.weather === "Harsh Sun" && move.type === "Water") {
            return 'the Water-Type attack evaporated in the harsh sunlight';
        } else if (field.weather === "Heavy Rain" && move.type === "Fire") {
            return 'the Fire-Type attack fizzled out in the heavy rain';
        }
        return 'No damage for you';
    }
    let preventsHeal = move.name == 'Psychic Noise';
    let preventsHealItem = ['Knock Off', 'Psychic Noise'].includes(move.name) || (['Thief', 'Covet'].includes(move.name) && isItemlessAttacker);
    let preventsRestoreHP = preventsHealItem || (defender.item.includes(' Berry') && ['Bug Bite', 'Pluck', 'Incinerate'].includes(move.name));
    var restoreHP = getRestoreHP(defender.item, defender.maxHP, preventsRestoreHP);
    var isRipen = applyRipen(defender.ability == "Ripen", defender.item, restoreHP);
    if (isRipen) {
        restoreHP *= 2;
    }
    var isGluttony, restoreThreshold;
    [restoreThreshold, isGluttony] = getRestoreThreshold(defender.item, restoreHP, defender.maxHP, defender.ability == "Gluttony");
    if (defender.isDynamax) {
        restoreThreshold *= 0.5;
    }
    let tempHits = 0;   //exists specifically for the damage results text in gen 1

    if (gen == 1 && move.hits > 1) {
        damageIn = handleMultiHitGen1(damageIn, move.hits);
        tempHits = move.hits;
        move.hits = 1;
    }
    var multihit = move.hits > 1 || (damageIn.length > 1 && Array.isArray(damageIn[0]));

    //convert each array to a dictionary here
    var damage = damageArrToDict(damageIn, move.hits, defender.curHP, restoreHP, restoreThreshold), damageNums = [];
    if (tempHits) {
        move.hits = tempHits;
    }
    for (eachVal in damage) {
        damageNums.push(parseInt(eachVal));
    }

    if ((!multihit || !restoreHP) && damage[damageNums[0]] >= defender.curHP) {
        return 'guaranteed OHKO';
    }
    else if (multihit && restoreHP && damage[damageNums[0]] >= defender.curHP + restoreHP) {
        return 'guaranteed OHKO';
    }

    var hazards = 0;
    var hazardText = [];
    if (field.isSR && defender.ability !== 'Magic Guard' && defender.item !== "Heavy-Duty Boots") {
        var effectiveness = typeChart['Rock'][defender.type1] * (defender.type2 ? typeChart['Rock'][defender.type2] : 1);
        hazards += Math.max(1, Math.floor(effectiveness * defender.maxHP / 8));
        hazardText.push('Stealth Rock');
    }
    if (field.isSteelsurge && defender.ability !== 'Magic Guard' && defender.item !== "Heavy-Duty Boots") {
        var effectiveness = typeChart['Steel'][defender.type1] * (defender.type2 ? typeChart['Steel'][defender.type2] : 1);
        hazards += Math.max(1, Math.floor(effectiveness * defender.maxHP / 8));
        hazardText.push('Steelsurge');
    }
    if (pIsGrounded(defender, field) && defender.ability !== 'Magic Guard' && defender.item !== "Heavy-Duty Boots") {
        if (field.spikes === 1) {
            hazards += Math.max(1, Math.floor(defender.maxHP / 8));
            if (gen === 2 || gen == 9.5) {
                hazardText.push('Spikes');
            } else {
                hazardText.push('1 layer of Spikes');
            }
        } else if (field.spikes === 2) {
            hazards += Math.floor(defender.maxHP / 6);
            hazardText.push('2 layers of Spikes');
        } else if (field.spikes === 3) {
            hazards += Math.floor(defender.maxHP / 4);
            hazardText.push('3 layers of Spikes');
        }
    }
    if (isNaN(hazards)) {
        hazards = 0;
    }

    var eot = 0;
    var eotText = [];
    var toxicCounter = 0;
    var eotDict = getAllEndOfTurnEffects(defender, field, isBadDreams, preventsHeal, preventsHealItem, preventsRestoreHP);
    let eotOrder = gen <= 3 ? END_TURN_ORDER_GEN_3 : gen == 4 ? END_TURN_ORDER_GEN_4 : END_TURN_ORDER_GEN_5_ONWARDS;
    let maxChip = defender.isDynamax ? 0.5 : 1;
    for (eotType of eotOrder) {
        if (eotDict[eotType].val != 0) {
            if (eotDict[eotType].isToxic) {
                toxicCounter = eotDict[eotType].val;
                eot -= Math.floor(Math.floor(toxicCounter * defender.maxHP / 16) * maxChip);
            }
            else {
                eot += eotDict[eotType].val;
            }
            eotText.push(eotDict[eotType].text);
        }
    }

    var c = getKOChance(damage, multihit, defender.curHP - hazards, 0, 1, defender.maxHP, toxicCounter, restoreHP, restoreThreshold);
    var afterText = hazardText.length > 0 ? ' after ' + serializeText(hazardText) : '';
    var percNumText = '';
    if (c === 1) {
        return 'guaranteed OHKO' + afterText;
    }
    else if (c > 0 && eot >= 0) {
        if (c < 0.0001)
            percNumText = '<0.01';
        else if (c > 0.9999)
            percNumText = '>99.99';
        else
            percNumText = Math.round(c * 10000) / 100;
        return percNumText + '% chance to OHKO' + afterText;
    }

    if (restoreHP) {
        let eotTemp = '';
        if (isRipen) eotTemp += 'Ripen ';
        else if (isGluttony) eotTemp += 'Gluttony ';
        eotTemp += defender.item + ' recovery';
        eotText.push(eotTemp);
    }

    c = getKOChance(damage, multihit, defender.curHP - hazards, eot, 1, defender.maxHP, toxicCounter, restoreHP, restoreThreshold, maxChip, eotDict);
    afterText = hazardText.length > 0 || eotText.length > 0 ? ' after ' + serializeText(hazardText.concat(eotText)) : '';
    if (c === 1) {
        return 'guaranteed OHKO' + afterText;
    }
    else if (c > 0) {
        if (c < 0.0001)
            percNumText = '<0.01';
        else if (c > 0.9999)
            percNumText = '>99.99';
        else
            percNumText = Math.round(c * 10000) / 100;
        return percNumText + '% chance to OHKO' + afterText;
    }

    var i;
    for (i = 2; i <= 4; i++) {
        c = getKOChance(damage, multihit, defender.curHP - hazards, eot, i, defender.maxHP, toxicCounter, restoreHP, restoreThreshold, maxChip, eotDict);
        if (c === 1) {
            return 'guaranteed ' + i + 'HKO' + afterText;
        }
        else if (c > 0) {
            if (c < 0.0001)
                percNumText = '<0.01';
            else if (c > 0.9999)
                percNumText = '>99.99';
            else
                percNumText = Math.round(c * 10000) / 100;
            return percNumText + '% chance to ' + i + 'HKO' + afterText;
        }
    }

    for (i = 5; i <= 9; i++) {
        if (predictTotal(damageNums[0], eot, i, toxicCounter, defender.curHP - hazards, defender.maxHP, restoreHP, restoreThreshold) >= defender.curHP - hazards) {
            return 'guaranteed ' + i + 'HKO' + afterText;
        }
        else if (predictTotal(damageNums[damageNums.length - 1], eot, i, toxicCounter, defender.curHP - hazards, defender.maxHP, restoreHP, restoreThreshold) >= defender.curHP - hazards) {
            return 'possible ' + i + 'HKO' + afterText;
        }
    }

    return 'possibly the worst move ever';
}

function damageArrToDict(damageArr, hits, currHP, restoreHP, restoreThreshold) {
    var pivotSpread = {}, addedSpread = {}, tempSpread = {};
    var tempKey = 0, is2dArr = Array.isArray(damageArr[0]), damageArrL = damageArr.length;
    if (!(is2dArr && damageArrL > 1)) {
        pivotSpread = arrayToProbabilityDict(damageArr, currHP, restoreHP, restoreThreshold);
        addedSpread = pivotSpread;
    }
    else {
        pivotSpread = arrayToProbabilityDict(damageArr[1], currHP, restoreHP, restoreThreshold);
        addedSpread = arrayToProbabilityDict(damageArr[0], currHP, restoreHP, restoreThreshold);
    }
    for (var i = 0; i < hits - 1; i++) {
        if (is2dArr && i != 0) {
            //this if-else statement assumes that, if the number of 2D arrays is less than the number of hits, all of the remaining hits use the last array calculated
            if (damageArrL - 1 >= i + 1)
                pivotSpread = arrayToProbabilityDict(damageArr[i + 1], currHP, restoreHP, restoreThreshold);
            else
                pivotSpread = arrayToProbabilityDict(damageArr[damageArrL - 1], currHP, restoreHP, restoreThreshold);
        }
        for (addedNum in addedSpread) {
            let tempAddedNum = parseInt(addedNum);
            for (pivotNum in pivotSpread) {
                let tempPivotNum = parseInt(pivotNum);
                tempKey = tempPivotNum + tempAddedNum;
                if (checkThresholdCriteria(currHP, tempPivotNum, restoreHP, restoreThreshold, addedNum)) {
                    tempKey = tempKey + '*';
                }
                if (tempKey in tempSpread)
                    tempSpread[tempKey] = tempSpread[tempKey] + (pivotSpread[pivotNum] * addedSpread[addedNum]);
                else
                    tempSpread[tempKey] = pivotSpread[pivotNum] * addedSpread[addedNum];
            }
        }
        addedSpread = sortByKeys(tempSpread);
        tempSpread = {};
    }
    return addedSpread;
}

function arrayToProbabilityDict(arr, currHP, restoreHP, restoreThreshold) {
    let returnArr = {};
    let instanceUnit = 1 / (gen >= 3 ? 16 : 39);
    for (let i = 0; i < arr.length; i++) {
        let returnArrKey = arr[i];
        if (checkThresholdCriteria(currHP, returnArrKey, restoreHP, restoreThreshold)) {
            returnArrKey = returnArrKey + '*';
        }
        if (returnArrKey in returnArr)
            returnArr[returnArrKey] = returnArr[returnArrKey] + instanceUnit;
        else
            returnArr[returnArrKey] = instanceUnit;
    }
    return returnArr;
}

function numericSortParseInt(a, b) {
    return parseInt(a) - parseInt(b);
}

function sortByKeys(dict) {
    var sorted = [], tempDict = {};

    sorted = Object.keys(dict).sort(numericSortParseInt);
    for (let i = 0; i < sorted.length; i++)
        tempDict[sorted[i]] = dict[sorted[i]];

    return tempDict;
}

function getKOChance(damage, multihit, hp, eotSum, timesUsed, maxHP, toxicCounter, restoreHP, restoreThreshold, maxChip = 1, eotDict = {}) {
    var damageKeys = Object.keys(damage).sort(numericSortParseInt);
    let firstDamage = damageKeys[0];
    let lastDamage = damageKeys[damageKeys.length - 1];
    var minDamage = parseInt(firstDamage);
    var maxDamage = parseInt(lastDamage);
    var activateHealItem = false;
    let tempSpread = {};
    if (timesUsed === 1) {
        if (((!multihit && lastDamage[lastDamage.length - 1] != '*') || !restoreHP) && maxDamage - eotSum < hp) {
            return 0;
        }
        else if ((multihit || lastDamage[lastDamage.length - 1] == '*') && restoreHP && maxDamage - eotSum < hp + restoreHP) {
            return 0;
        }
        else if (((!multihit && firstDamage[firstDamage.length - 1] != '*') || !restoreHP) && minDamage - eotSum >= hp) {
            return 1;
        }
        else if ((multihit || firstDamage[firstDamage.length - 1] == '*') && restoreHP && minDamage - eotSum >= hp + restoreHP) {
            return 1;
        }
    }
    for (damageNum of damageKeys) {
        let tempDamageNum = parseInt(damageNum);
        activateHealItem = damageNum[damageNum.length - 1] == '*';
        if (eotSum) {
            [tempDamageNum, activateHealItem] = eotProcess(eotDict, tempDamageNum, toxicCounter, hp, restoreHP, restoreThreshold, maxHP, activateHealItem, maxChip);
        }
        if (activateHealItem) {
            tempDamageNum = tempDamageNum + '*';
        }
        if (tempDamageNum in tempSpread)
            tempSpread[tempDamageNum] = tempSpread[tempDamageNum] + damage[damageNum];
        else
            tempSpread[tempDamageNum] = damage[damageNum];
    }
    toxicCounter++;
    if (timesUsed == 1) {
        let tempSpreadKeysSorted = Object.keys(tempSpread).sort(numericSortParseInt);
        if (parseInt(tempSpreadKeysSorted[tempSpreadKeysSorted.length - 1]) >= hp) {
            let earlyTotalSpread = {};
            let returnSum = 0, probabilitySum = 0;
            for (spreadNum of tempSpreadKeysSorted) {
                let earlyItemConsumed = spreadNum[spreadNum.length - 1] == '*';
                let earlyFinalNum = parseInt(spreadNum);
                if (earlyItemConsumed) {
                    earlyFinalNum -= restoreHP;
                    if (hp - earlyFinalNum > maxHP) {
                        earlyFinalNum = hp - maxHP;    //conditional always fails if earlyFinalNum >= 0
                    }
                }
                if (earlyItemConsumed && earlyFinalNum in earlyTotalSpread) {
                    earlyTotalSpread[earlyFinalNum] += tempSpread[spreadNum];
                }
                else {
                    earlyTotalSpread[earlyFinalNum] = tempSpread[spreadNum];
                }
            }
            for (finalNum in earlyTotalSpread) {
                if (parseInt(finalNum) >= hp)
                    returnSum += earlyTotalSpread[finalNum];
                probabilitySum += earlyTotalSpread[finalNum];
            }
            if (returnSum === probabilitySum)
                returnSum = 1;
            return returnSum;
        }
        return 0;
    }
    tempSpread = sortByKeys(tempSpread);
    var sum = verifyKOChance(damage, hp, eotSum, timesUsed, maxHP, toxicCounter, restoreHP, restoreThreshold, eotDict, maxChip, tempSpread);
    return sum;
}

function verifyKOChance(damage, targetHP, eotSum, timesUsed, maxHP, toxicCounter, restoreHP, restoreThreshold, eotDict, maxChip, inSpread = damage) {
    var pivotSpread = {}, addedSpread = {}, tempSpread = {}, totalSpread = {};
    var tempKey = 0, finalNum = 0;
    var returnSum = 0, probabilitySum = 0;
    let activateHealItem = false;
    pivotSpread = damage;
    addedSpread = inSpread;
    for (var i = 0; i < timesUsed - 1; i++) {
        for (addedNum in addedSpread) {
            let tempAddedNum = parseInt(addedNum);
            for (pivotNum in pivotSpread) {
                let tempPivotNum = parseInt(pivotNum);
                tempKey = tempPivotNum + tempAddedNum;
                if (checkThresholdCriteria(targetHP, tempPivotNum, restoreHP, restoreThreshold, addedNum)) {
                    activateHealItem = true;
                }
                if (eotSum) {
                    [tempKey, activateHealItem] = eotProcess(eotDict, tempKey, toxicCounter, targetHP, restoreHP, restoreThreshold, maxHP, activateHealItem, maxChip);
                }
                if (activateHealItem) {
                    tempKey = tempKey + '*';
                }
                activateHealItem = false;

                if (tempKey in tempSpread)
                    tempSpread[tempKey] = tempSpread[tempKey] + (pivotSpread[pivotNum] * addedSpread[addedNum]);
                else
                    tempSpread[tempKey] = pivotSpread[pivotNum] * addedSpread[addedNum];
            }
        }
        addedSpread = sortByKeys(tempSpread);
        tempSpread = {};
    }
    for (spreadNum in addedSpread) {
        let itemConsumed = spreadNum[spreadNum.length - 1] == '*';
        finalNum = parseInt(spreadNum);
        if (itemConsumed && timesUsed > 1) {
            finalNum -= restoreHP;
            if (targetHP - finalNum > maxHP) {
                finalNum = targetHP - maxHP;    //conditional always fails if finalNum >= 0
            }
        }
        if (itemConsumed && finalNum in totalSpread) {
            totalSpread[finalNum] += addedSpread[spreadNum];
        }
        else {
            totalSpread[finalNum] = addedSpread[spreadNum];
        }
    }
    for (finalNum in totalSpread) {
        if (finalNum >= targetHP)
            returnSum += totalSpread[finalNum];
        probabilitySum += totalSpread[finalNum];
    }
    if (returnSum === probabilitySum)
        returnSum = 1;
    return returnSum;
}

function predictTotal(damage, eot, timesUsed, toxicCounter, hp, maxHP, restoreHP, restoreThreshold) {
    var total = 0;
    for (var i = 0; i < timesUsed; i++) {
        total += damage;
        if ((hp - total <= restoreThreshold) && restoreHP) {
            total -= restoreHP;
            if (hp - total > maxHP) {
                total = hp - maxHP;
            }
            restoreHP = 0;
        }
        if (i < timesUsed - 1) {
            total -= eot;
            if (toxicCounter > 0) {
                total += Math.floor((toxicCounter + i) * maxHP / 16);
            }
        }
    }
    return total;
}

function serializeText(arr) {
    if (arr.length === 0) {
        return '';
    }
    else if (arr.length === 1) {
        return arr[0];
    }
    else if (arr.length === 2) {
        return arr[0] + " and " + arr[1];
    }
    else {
        var text = '';
        for (var i = 0; i < arr.length - 1; i++) {
            text += arr[i] + ', ';
        }
        return text + 'and ' + arr[arr.length - 1];
    }
}

function getRestoreHP(item, maxHP, preventsRestoreHP) {
    return preventsRestoreHP ? 0 :
        ["Berry", "Oran Berry"].includes(item) ? 10 :
            item == "Berry Juice" ? 20 :
                ["Gold Berry", "Sitrus Berry"].includes(item) && gen <= 3 ? 30 :
                    item == "Sitrus Berry" ? Math.floor(maxHP / 4) :    //Enigma Berry can also apply if the attack is super effective
                        ["Figy Berry", "Iapapa Berry", "Wiki Berry", "Aguav Berry", "Mago Berry"].includes(item) ? Math.floor(maxHP / (gen <= 6 ? 8 : gen == 7 ? 2 : 3)) :
                            0;
}

function applyRipen(isRipen, item, restoreHP) {
    return isRipen && item.includes(" Berry") && restoreHP;
}

function getRestoreThreshold(item, restoreHP, maxHP, isGluttony) {
    if (restoreHP) {
        if (gen <= 6 || ["Berry", "Oran Berry", "Berry Juice", "Gold Berry", "Sitrus Berry"].includes(item)) {
            return [maxHP / 2, false];
        }
        else if (["Figy Berry", "Iapapa Berry", "Wiki Berry", "Aguav Berry", "Mago Berry"].includes(item)) {
            if (isGluttony) {
                return [maxHP / 2, true];
            }
            else {
                return [maxHP / 4, false];
            }
        }
    }
    return [0, false];
}

/**
 * Converts multihit moves into one Array (In Gen 1, each hit uses the same damage roll, and only the first hit can crit)
 * @param {var} damage Array containing either each damage roll or multiple Arrays that contain each damage roll
 * @param {var} hits Number of times a move hits
 * @returns the sum of all hits with each damage roll
 */
function handleMultiHitGen1(damage, hits) {
    let is2dArr = Array.isArray(damage[0]);
    var firstHit = is2dArr ? damage[0] : damage;
    var laterHits = is2dArr ? damage[1] : damage;
    var allHitsDamage = [];
    for (randIndex in firstHit) {
        allHitsDamage.push(firstHit[randIndex] + laterHits[randIndex] * (hits - 1));
    }
    return allHitsDamage;
}

function getAllEndOfTurnEffects(defender, field, isBadDreams, preventsHeal, preventsHealItem/*, preventsRestoreHP, restoreHP*/) {
        //IMPORTANT: THIS ISN'T THE ORDER FOR GEN 3 AND BEFORE. THIS IS WHAT I FOUND TO BE GEN 3 ORDER:
        //Wish, Weather, Ingrain, Sitrus/Oran/Berry Juice healing, Leftovers, burn, Leech Seed, Nightmare, Curse
        //THE SITRUS/ORAN/BERRY JUICE HEALING IS WHY preventsRestoreHP IS PASSED IN
    let weatherEffects = 0,
        //wish = 0,
        seaOfFire = 0,
        gMaxField = 0,
        grassyTerrain = 0,
        leftoversBlackSludge = 0,
        aquaRing = 0,
        ingrain = 0,
        leechSeed = 0,
        poisonedPoisonHeal = 0,
        toxicCounter = 0,
        burn = 0,
        nightmare = 0,
        ghostCurse = 0,
        saltCure = 0,
        bindingMove = 0,
        badDreams = 0,
        stickyBarb = 0;
        //harvest = 0;
    let rainDishGen3 = 0;
    let weatherEffectsText = '',
        leftoversBlackSludgeText = '',
        poisonedPoisonHealText = '',
        burnedText = '',
        saltCureText = '';
    let isToxicDamage = false;
    let bigRootMod = defender.item === 'Big Root' ? 1.3 : 1;

    //EOT Order
    //1. Weather Effects
    if (field.weather == 'Sun') {
        if (['Dry Skin', 'Solar Power'].includes(defender.ability)) {
            weatherEffects -= Math.floor(defender.maxHP / 8);
            weatherEffectsText = defender.ability + ' damage';
        }
    }
    else if (field.weather == 'Rain') {
        if (!preventsHeal) {
            if (defender.ability === 'Dry Skin') {
                weatherEffects += Math.floor(defender.maxHP / 8);
                weatherEffectsText = 'Dry Skin recovery';
            }
            else if (defender.ability === 'Rain Dish' && gen >= 4) {
                weatherEffects += Math.floor(defender.maxHP / 16);
                weatherEffectsText = 'Rain Dish recovery';
            }
        }
    }
    else if (field.weather == 'Sand') {
        if (!(defender.hasType("Rock", "Ground", "Steel")) && !(['Magic Guard', 'Overcoat', 'Sand Force', 'Sand Rush', 'Sand Veil'].includes(defender.ability)) && defender.item !== 'Safety Goggles') {
            weatherEffects -= Math.floor(defender.maxHP / 16);
            weatherEffectsText = 'sandstorm damage';
        }
    }
    else if (field.weather == 'Hail') {
        if (defender.ability === 'Ice Body' && !preventsHeal) {
            weatherEffects += Math.floor(defender.maxHP / 16);
            weatherEffectsText = 'Ice Body recovery';
        }
        else if (!(defender.hasType('Ice')) && !(['Magic Guard', 'Overcoat', 'Snow Cloak'].includes(defender.ability)) && defender.item !== 'Safety Goggles') {
            weatherEffects -= Math.floor(defender.maxHP / 16);
            weatherEffectsText = 'hail damage';
        }
    }
    else if (field.weather === 'Snow' && defender.ability === 'Ice Body' && !preventsHeal) {
        weatherEffects += Math.floor(defender.maxHP / 16);
        weatherEffectsText = 'Ice Body recovery';
    }

    //2. Future Sight / Doom Desire (not yet implemented as such)
    //3. Wish (no plans for implementation)
    //4. Speed dependant block
    //a. Sea of Fire, G-Max Vinelash / Wildfire / Cannonade / Volcalith
    if (field.isSeaFire && defender.ability !== 'Magic Guard' && !(defender.hasType("Fire"))) {
        seaOfFire -= Math.floor(defender.maxHP / 8);
    }
    if (field.isGMaxField && defender.ability !== 'Magic Guard') {
        gMaxField -= Math.floor(defender.maxHP / 6);
    }
    //b. Grassy Terrain
    if (field.terrain === "Grassy") {
        if (!preventsHeal && pIsGrounded(defender, field)) {
            grassyTerrain += Math.floor(defender.maxHP / 16);
        }
    }
    //c. Hydration (not implemented, not that it's relevant within this block)
    //d. Leftovers / Black Sludge
    if (defender.item === 'Leftovers' && !preventsHealItem) {
        leftoversBlackSludge += Math.floor(defender.maxHP / 16);
        leftoversBlackSludgeText = 'Leftovers recovery';
    }
    else if (defender.item === 'Black Sludge') {
        if (defender.hasType('Poison') && !preventsHealItem) {
            leftoversBlackSludge += Math.floor(defender.maxHP / 16);
            leftoversBlackSludgeText = 'Black Sludge recovery';
        }
        else if (defender.ability !== 'Magic Guard' && defender.ability !== 'Klutz') {
            leftoversBlackSludge -= Math.floor(defender.maxHP / 8);
            leftoversBlackSludgeText = 'Black Sludge damage';
        }
    }

    //5. Aqua Ring
    if (field.isAquaRing && !preventsHeal) {
        aquaRing += Math.floor(Math.floor(defender.maxHP / 16) * bigRootMod);
    }
    //6. Ingrain
    if (field.isIngrain && !preventsHeal) {
        ingrain += Math.floor(Math.floor(defender.maxHP / 16) * bigRootMod);
    }
    //7. Leech Seed
    if (field.isLeechSeed && defender.ability !== 'Magic Guard') {
        leechSeed -= Math.floor(defender.maxHP / 8);
    }
    //8. Poisoned / Badly Poisoned / Poison Heal
    if (defender.status === 'Poisoned') {
        if (defender.ability === 'Poison Heal' && !preventsHeal) {
            poisonedPoisonHeal += Math.floor(defender.maxHP / 8);
            poisonedPoisonHealText = 'Poison Heal';
        }
        else if (defender.ability !== 'Magic Guard') {
            poisonedPoisonHeal -= Math.floor(defender.maxHP / 8);
            poisonedPoisonHealText = 'poison damage';
        }
    }
    else if (defender.status === 'Badly Poisoned') {
        if (defender.ability === 'Poison Heal' && !preventsHeal) {
            poisonedPoisonHeal += Math.floor(defender.maxHP / 8);
            poisonedPoisonHealText = 'Poison Heal';
        }
        else if (defender.ability !== 'Magic Guard') {
            toxicCounter = defender.toxicCounter;
            poisonedPoisonHealText = 'toxic damage';
            isToxicDamage = true;
        }
    }
    //9. Burned
    else if (defender.status === 'Burned') {
        var burnDmgDivider = (gen >= 7) ? 16 : 8;
        if (defender.ability === 'Heatproof') {
            burn -= Math.floor(defender.maxHP / burnDmgDivider / 2);
            burnedText = 'reduced burn damage';
        }
        else if (defender.ability !== 'Magic Guard') {
            burn -= Math.floor(defender.maxHP / burnDmgDivider);
            burnedText = 'burn damage';
        }
    }

    //10. Nightmare
    if (field.isNightmare && defender.ability !== 'Magic Guard') {
        nightmare -= Math.floor(defender.maxHP / 4);
    }
    //11. Curse
    if (field.isCurse && defender.ability !== 'Magic Guard') {
        ghostCurse -= Math.floor(defender.maxHP / 4);
    }
    //12. Salt Cure
    if (field.isSaltCure && defender.ability !== 'Magic Guard') {
        if (!(defender.hasType("Water", "Steel"))) {
            let saltMult = gen == 10 ? 16 : 8;
            saltCure -= Math.floor(defender.maxHP / saltMult);
            saltCureText = 'Salt Cure damage';
        }
        else {
            let saltMult = gen == 10 ? 8 : 4;
            saltCure -= Math.floor(defender.maxHP / saltMult);
            saltCureText = 'extra Salt Cure damage';
        }
    }

    //13. Binding moves
    if (field.isBinding && defender.ability !== 'Magic Guard') {
        let bindMod = gen <= 5 ? (defender.item == 'Binding Band' ? 8 : 16) : (defender.item == 'Binding Band' ? 6 : 8);
        bindingMove -= Math.floor(defender.maxHP / bindMod);
    }
    //14. Bad Dreams
    if ((defender.status === 'Asleep' || defender.ability === 'Comatose') && isBadDreams && defender.ability !== 'Magic Guard') {
        badDreams -= Math.floor(defender.maxHP / 8);
    }

    //15. Sticky Barb
    if (defender.item === 'Sticky Barb' && defender.ability !== 'Magic Guard' && !(move.makesContact && isItemlessAttacker)) {
        stickyBarb -= Math.floor(defender.maxHP / 8);
    }
    //16. Harvest (not likely to be implemented)

    //Exclusive to earlier gens:
    //Rain Dish (Gen 3, comes after ingrain)
    if (gen == 3 && field.weather == 'Rain' && defender.ability == 'Rain Dish') {
        rainDishGen3 += Math.floor(defender.maxHP / 16);
    }

    let maxChip = defender.isDynamax ? 0.5 : 1;
    return {
        weatherEffects: {
            val: Math.floor(weatherEffects * maxChip),
            text: weatherEffectsText
        },
        seaOfFire: {
            val: Math.floor(seaOfFire * maxChip),
            text: 'Sea of Fire damage'
        },
        gMaxField: {
            val: Math.floor(gMaxField * maxChip),
            text: 'G-Max field damage'
        },
        grassyTerrain: {
            val: Math.floor(grassyTerrain * maxChip),
            text: 'Grassy Terrain recovery'
        },
        leftoversBlackSludge: {
            val: Math.floor(leftoversBlackSludge * maxChip),
            text: leftoversBlackSludgeText
        },
        aquaRing: {
            val: Math.floor(aquaRing * maxChip),
            text: 'Aqua Ring recovery'
        },
        ingrain: {
            val: Math.floor(ingrain * maxChip),
            text: 'Ingrain recovery'
        },
        leechSeed: {
            val: Math.floor(leechSeed * maxChip),
            text: 'Leech Seed damage'
        },
        poisonedToxicPoisonHeal: {
            val: isToxicDamage ? toxicCounter : Math.floor(poisonedPoisonHeal * maxChip),
            text: poisonedPoisonHealText,
            isToxic: isToxicDamage
        },
        burned: {
            val: Math.floor(burn * maxChip),
            text: burnedText
        },
        nightmare: {
            val: Math.floor(nightmare * maxChip),
            text: 'Nightmare'
        },
        ghostCurse: {
            val: Math.floor(ghostCurse * maxChip),
            text: 'ghost Curse'
        },
        saltCure: {
            val: Math.floor(saltCure * maxChip),
            text: saltCureText
        },
        bindingMove: {
            val: Math.floor(bindingMove * maxChip),
            text:'binding damage'
        },
        badDreams: {
            val: Math.floor(badDreams * maxChip),
            text: 'Bad Dreams'
        },
        stickyBarb: {
            val: Math.floor(stickyBarb * maxChip),
            text: 'Sticky Barb damage'
        },
        rainDishGen3: {
            val: rainDishGen3,
            text: 'Rain Dish recovery'
        }
    };
}

function checkThresholdCriteria(currHP, roll, restoreHP, restoreThreshold, prevCalcRolls = 0) {
    let usedPrevCalcRolls = parseInt(prevCalcRolls);
    return isNaN(prevCalcRolls) || (restoreHP && currHP - usedPrevCalcRolls - roll <= restoreThreshold && currHP - usedPrevCalcRolls - roll > 0);
}

const END_TURN_ORDER_GEN_3 = [/*'wish',*/ 'weatherEffects', 'ingrain', 'rainDishGen3',/*'hpRestoreGen3',*/ 'leftoversBlackSludge', 'leechSeed', 'poisonedToxicPoisonHeal', 'burned', 'nightmare', 'ghostCurse', 'bindingMove'];    //Future Sight at the very end
const END_TURN_ORDER_GEN_4 = [/*'wish',*/ 'weatherEffects', 'ingrain', 'aquaRing', 'leftoversBlackSludge', 'leechSeed', 'poisonedToxicPoisonHeal', 'burned', 'nightmare', 'ghostCurse', 'bindingMove', 'badDreams', 'stickyBarb']; //Future Sight at the very end
const END_TURN_ORDER_GEN_5_ONWARDS = ['weatherEffects',/*'wish',*/'seaOfFire', 'gMaxField', 'grassyTerrain', 'leftoversBlackSludge', 'aquaRing', 'ingrain', 'leechSeed', 'poisonedToxicPoisonHeal', 'burned', 'nightmare', 'ghostCurse', 'saltCure', 'bindingMove', 'badDreams', 'stickyBarb', /*'harvest'*/];  //Future Sight is after weatherEffects and before wish

function eotProcess(eotDict, damageRoll, toxicCounter, targetHP, restoreHP, restoreThreshold, maxHP, activateHealItem, maxChip) {
    let eotOrder = gen <= 3 ? END_TURN_ORDER_GEN_3 : gen == 4 ? END_TURN_ORDER_GEN_4 : END_TURN_ORDER_GEN_5_ONWARDS;
    for (eotType of eotOrder) {
        if (eotDict[eotType].val != 0) {
            let eotApply = 0;
            if (!eotDict[eotType].isToxic) {
                eotApply = eotDict[eotType].val;
            }
            else {
                eotApply = Math.floor(Math.floor(toxicCounter * maxHP / 16) * maxChip) * -1;
            }
            if (!activateHealItem && checkThresholdCriteria(targetHP, eotApply * -1, restoreHP, restoreThreshold, damageRoll)) {
                activateHealItem = true;
            }
            if ((activateHealItem && targetHP - damageRoll + restoreHP > 0) || (!activateHealItem && targetHP - damageRoll > 0)) {
                damageRoll -= eotApply;     //Currently assumes to always check for a KO before applying the eot damage/healing, consider changing to allow for more lefties healing turns
            }
        }
    }
    return [damageRoll, activateHealItem];
}

/* ---- ap_calc.js : calcUserHP et userHPResultText ---- */
function calcUserHP(move, user, target, minDamage, maxDamage, isLeechSeed) {
    var userMinDamage = 0, userMaxDamage = 0;
    var targetMax = target.curHP;   //done because the user cannot heal/take more HP than what they can get from the target
    var usedMin = Math.min(minDamage, targetMax), usedMax = Math.min(maxDamage, targetMax);
    var userItem = user.item;

    //Move check
    if (!user.isDynamax) {
        if (move.recoilHP && usedMax > 0) {
            if (!["Rock Head", "Magic Guard"].includes(user.ability)) {
                var recoilMod = move.recoilHP[0] / move.recoilHP[1];
                userMinDamage = Math.max(1, pokeRound(usedMin * recoilMod));
                userMaxDamage = Math.max(1, pokeRound(usedMax * recoilMod));
            }
        }
        else if (move.drainHP && usedMax > 0) {
            var drainMod = move.drainHP[0] / move.drainHP[1];
            var liquidOoze = target.ability == "Liquid Ooze" && (gen >= 5 || move.name != "Dream Eater");
            var doesHeal = !liquidOoze ? -1 : user.ability == "Magic Guard" ? 0 : 1;

            userMinDamage = pokeRound(usedMin * drainMod);
            userMaxDamage = pokeRound(usedMax * drainMod);

            if (userItem == "Big Root") {
                var bigRootMod = gen >= 5 ? 5324 / 4096 : 1.3;
                userMinDamage = Math.round(userMinDamage * bigRootMod);
                userMaxDamage = Math.round(userMaxDamage * bigRootMod);
            }

            userMinDamage = doesHeal * Math.max(1, userMinDamage);
            userMaxDamage = doesHeal * Math.max(1, userMaxDamage);
        }
        else if (move.costHP) {
            if (move.costHP[2] == "roundDown") {
                if (move.name != "Curse" || user.hasType("Ghost")) {
                    userMinDamage = Math.max(1, Math.floor(user.maxHP * (move.costHP[0] / move.costHP[1])));
                    userMaxDamage = userMinDamage;
                }
            }
            else {
                userMinDamage = Math.ceil(user.maxHP * (move.costHP[0] / move.costHP[1]));
                userMaxDamage = userMinDamage;
            }
        }
        else if (move.name == "Pain Split") {
            userMinDamage = user.curHP - Math.floor((user.curHP + targetMax) / 2);
            userMaxDamage = userMinDamage;
        }
        else if (move.name == "Strength Sap") {
            if (target.boosts[AT] > -6) {
                var doesHeal = target.ability != "Liquid Ooze" ? -1 : user.ability == "Magic Guard" ? 0 : 1;
                userMinDamage = target.stats[AT];
                if (userItem == "Big Root") {
                    var bigRootMod = gen >= 5 ? 5324 / 4096 : 1.3;
                    userMinDamage = Math.round(userMinDamage * bigRootMod);
                }

                userMinDamage = doesHeal * Math.max(1, userMinDamage);
                userMaxDamage = userMinDamage;
            }
        }
    }
    else if (user.name == "Alcremie-Gmax" && move.type == "Fairy" && move.category != "Status") { //G-Max Finale
        userMinDamage = -1 * Math.max(1, pokeRound(user.maxHP / 6));
        userMaxDamage = userMinDamage;
    }

    var dynamaxHP = user.isDynamax ? 2 : 1;
    //Opponent ability check
    if (["Rough Skin", "Iron Barbs"].includes(target.ability) && move.makesContact && usedMax > 0) {
        userMinDamage += Math.max(1, Math.floor(user.maxHP / 8)) * move.hits;
        userMaxDamage += Math.max(1, Math.floor(user.maxHP / 8)) * move.hits;
    }
    //Conditional assumes that ability toggling handles whether or not the target is a Cramorant
    //else if (target.ability == "Gulp Missile" && target.abilityOn && move.category != "Status") {
    //    userMinDamage += Math.max(1, Math.floor(user.maxHP / (4 * dynamaxHP)));
    //    userMaxDamage += Math.max(1, Math.floor(user.maxHP / (4 * dynamaxHP)));
    //}

    //Opponent item check
    if (target.item == "Rocky Helmet" && move.makesContact && usedMax > 0) {
        userMinDamage += Math.max(1, Math.floor(user.maxHP / 6)) * move.hits;
        userMaxDamage += Math.max(1, Math.floor(user.maxHP / 6)) * move.hits;
    }
    else if (((target.item == "Jaboca Berry" && move.category == "Physical") || (target.item == "Rowap Berry" && move.category == "Special")) && usedMax > 0) {
        let ripenMod = target.ability == "Ripen" ? 2 : 1;
        userMinDamage += Math.max(1, Math.floor(user.maxHP / (8 * dynamaxHP))) * ripenMod;
        userMaxDamage += Math.max(1, Math.floor(user.maxHP / (8 * dynamaxHP))) * ripenMod;
    }

    //User item check
    if (!(user.ability == "Sheer Force" && move.hasSecondaryEffect) && usedMax > 0) {
        if (userItem == "Shell Bell") {
            if (gen == 3) {
                userMinDamage -= Math.max(1, Math.floor(((usedMin / move.hits) / 8))) * move.hits;
                userMaxDamage -= Math.max(1, Math.floor(((usedMax / move.hits) / 8))) * move.hits;
            }
            else {
                userMinDamage -= Math.max(1, Math.floor(usedMin / (8 * dynamaxHP)));
                userMaxDamage -= Math.max(1, Math.floor(usedMax / (8 * dynamaxHP)));
            }
        }
        else if (userItem == "Life Orb" && move.category != "Status") {
            userMinDamage += Math.max(1, Math.floor(user.maxHP / (10 * dynamaxHP)));
            userMaxDamage += Math.max(1, Math.floor(user.maxHP / (10 * dynamaxHP)));
        }
    }

    //Leech Seed check
    if (isLeechSeed) {
        let drainMod = Math.floor(target.maxHP / 8);
        let doesHeal = target.ability != "Liquid Ooze" ? -1 : user.ability == "Magic Guard" ? 0 : 1;
        let bigRootMod = user.item != 'Big Root' ? 1 : gen >= 5 ? 5324 / 4096 : 1.3;

        userMinDamage += doesHeal * Math.floor(Math.min(target.curHP, drainMod) * bigRootMod);
        userMaxDamage += doesHeal * Math.floor(Math.min(target.curHP, drainMod) * bigRootMod);
    }

    return [Math.round(userMinDamage / user.maxHP * 1000) / 10, Math.round(userMaxDamage / user.maxHP * 1000) / 10];
}

function userHPResultText(move, user, target, minDamage, maxDamage, isLeechSeed) {
    var userHPResult = calcUserHP(move, user, target, minDamage, maxDamage, isLeechSeed);
    var healOrRecoil;
    if (userHPResult[0] < 0 && userHPResult[1] < 0) {
        healOrRecoil = "healed)";
        userHPResult[0] *= -1;
        userHPResult[1] *= -1;
    }
    else {
        healOrRecoil = "recoil)";
    }
    var userHPText = !userHPResult[0] && !userHPResult[1] ? '' : ' (' + userHPResult[0] + " - " + userHPResult[1] + '% ' + healOrRecoil;
    if (!userHPResult[0] && !userHPResult[1]) {
        userHPText = '';
    }
    else if (userHPResult[0] == userHPResult[1]) {
        userHPText = ' (' + userHPResult[0] + '% ' + healOrRecoil;
    }
    else {
        userHPText = ' (' + userHPResult[0] + " - " + userHPResult[1] + '% ' + healOrRecoil;
    }
    return userHPText;
}

/* ---- adaptateur ---- */
// Adaptateur : construit les objets Pokémon et Terrain du moteur NCP à partir de données simples,
// exactement comme ap_calc.js les construit à partir des champs du formulaire (génération 10, Champions).
// build_engine.js l'inclut dans calc-moteur.js, dans la même portée que le moteur.
var NCP_ADAPT = (function () {
  var STAT_KEYS = ['at', 'df', 'sa', 'sd', 'sp'];
  var TOGGLE_ON = ['Intimidate', 'Slow Start', 'Protean', 'Libero', 'Intrepid Sword', 'Dauntless Shield', 'Supersweet Syrup'];
  var TOGGLE_OFF = ['Flash Fire', 'Plus', 'Minus', 'Trace', 'Stakeout', 'Sand Spit', 'Battle Bond', 'Electromorphosis', 'Wind Power', 'Seed Sower'];

  // Formules de Pokémon Champions : niveau 50, IV à 31, points de statistique (SP) au lieu des EV
  function hpChamp(base, sps) {
    if (base === 1) return 1;
    return Math.floor((base * 2 + 31) * 50 / 100) + 50 + 10 + sps;
  }
  function statChamp(base, sps, nature, statName) {
    var mods = NATURES[nature] || ['', ''];
    var n = mods[0] === statName ? 1.1 : mods[1] === statName ? 0.9 : 1;
    return Math.floor(((Math.floor((base * 2 + 31) * 50 / 100) + 5) + sps) * n);
  }
  function defaultAbilityOn(ability) {
    if (TOGGLE_ON.indexOf(ability) !== -1) return true;
    if (TOGGLE_OFF.indexOf(ability) !== -1) return false;
    return false;
  }
  function hasTypeFn() {
    for (var i = 0; i < arguments.length; i++) {
      if ([this.type1, this.type2].indexOf(arguments[i]) !== -1) return true;
    }
    return false;
  }
  // Comme getMoveDetails d'ap_calc.js ; opts : { crit, hits, bp, type, category, double, timesAffected }
  function moveDetails(name, opts, ability, item) {
    var d = moves[name] || moves['(No Move)'];
    var o = opts || {};
    var hits = 1;
    if (d.hitRange) {
      if (d.hitRange.length === 2) {
        // valeurs par défaut de showHits() d'ap_calc.js
        var lo = d.hitRange[0], hi = d.hitRange[1];
        var def = (lo === 2 && hi === 5) ? (ability === 'Skill Link' ? 5 : item === 'Loaded Dice' ? 4 : 3)
          : (lo === 1 && hi === 2) ? 1
          : (lo === 1 && hi === 6) ? 4
          : hi;
        hits = o.hits != null ? o.hits : def;
      } else {
        hits = d.hitRange;
      }
    }
    return Object.assign({}, d, {
      name: moves[name] ? name : '(No Move)',
      bp: o.bp != null ? o.bp : d.bp,
      type: o.type || d.type,
      category: o.category || d.category,
      isCrit: o.crit != null ? !!o.crit : d.alwaysCrit === true,
      isZ: false,
      hits: hits,
      isDouble: (d.canDouble && o.double) ? 1 : 0,
      combinePledge: 0,
      timesAffected: (d.linearAddBP && o.timesAffected) ? o.timesAffected : 0,
      usedOppMoveIndex: 0,
      getsStellarBoost: false,
      isPlusMove: false,
    });
  }

  // Forme retenue par défaut, comme showFormes() d'ap_calc.js : la première forme listée,
  // sauf Palafin et Terapagos (forme Super / Stellaire). Une forme choisie à la main (spec.forme) l'emporte.
  function resolveForme(name, forme) {
    var base = pokedex[name];
    if (!base || !base.formes) return name;
    if (forme && base.formes.indexOf(forme) !== -1) return forme;
    return base.formes[(name === 'Palafin' || name === 'Terapagos') ? 1 : 0];
  }

  // spec : { name, forme?, nature, ability, abilityOn?, item, sps{hp,at,df,sa,sd,sp}, boosts{at..sp}, status,
  //          toxicCounter?, hpPercent, supremeOverlord?, moves[4], moveOpts[4] }
  // Comme le constructeur Pokemon() d'ap_calc.js, champ par champ.
  function makePokemon(spec) {
    var baseEntry = pokedex[spec.name];
    if (!baseEntry) throw new Error('Pokémon inconnu : ' + spec.name);
    var formeName = resolveForme(spec.name, spec.forme);
    var entry = pokedex[formeName] || baseEntry;
    var p = {};
    p.name = formeName;
    p.type1 = entry.t1;
    p.type2 = entry.t2 || '';
    p.tera_type = entry.t1;
    p.level = 50;
    var sps = spec.sps || {};
    var hpSp = sps.hp || 0;
    p.maxHP = hpChamp(entry.bs.hp, hpSp);
    var pct = spec.hpPercent == null ? 100 : spec.hpPercent;
    p.curHP = Math.ceil(pct * p.maxHP / 100);
    p.HPSPs = hpSp;
    p.HPEVs = Math.max(0, hpSp * 8 - 4);
    p.HPIVs = 31;
    p.HPraw = p.maxHP;
    p.isDynamax = false;
    p.gmax_factor = false;
    p.isTerastalize = false;
    p.rawStats = {}; p.boosts = {}; p.stats = {}; p.sps = {}; p.evs = {}; p.ivs = {};
    var nature = spec.nature || 'Hardy';
    STAT_KEYS.forEach(function (s) {
      var sp = sps[s] || 0;
      p.rawStats[s] = statChamp(entry.bs[s], sp, nature, s);
      p.boosts[s] = (spec.boosts && spec.boosts[s]) || 0;
      p.sps[s] = sp;
      p.evs[s] = Math.max(0, sp * 8 - 4);
      p.ivs[s] = 31;
    });
    p.nature = nature;
    var lock = LOCK_ITEM_LOOKUP[formeName];
    p.ability = spec.ability || entry.ab || '';
    p.abilityOn = spec.abilityOn != null ? !!spec.abilityOn : defaultAbilityOn(p.ability);
    p.supremeOverlord = spec.supremeOverlord || 0;
    p.rivalryGender = '';
    p.highestStat = -1;
    p.item = lock !== undefined ? lock : (spec.item || '');
    p.status = spec.status || 'Healthy';
    // compteur du poison grave : 1/16 par défaut, comme le menu de la page d'origine
    p.toxicCounter = p.status === 'Badly Poisoned' ? (spec.toxicCounter != null ? ~~spec.toxicCounter : 1) : 0;
    var names = (spec.moves || []).slice(0, 4);
    while (names.length < 4) names.push('(No Move)');
    var opts = spec.moveOpts || [];
    p.moves = names.map(function (m, i) { return moveDetails(m, opts[i], p.ability, p.item); });
    p.glaiveRushMod = false;
    p.weight = +entry.w;
    p.canEvolve = baseEntry.canEvolve || false;
    p.isTransformed = false;
    p.hasType = hasTypeFn;
    return p;
  }

  // f : { format, weather, terrain, gravity, sides: [gauche, droite] }, chaque côté :
  // { reflect, lightScreen, auroraVeil, helpingHand, friendGuard, tailwind, protect, battery, powerSpot, steelySpirit, flowerGift, charge }
  // Comme dans ap_calc.js, Helping Hand, Battery, Power Spot, Steely Spirit et Charge d'un côté
  // renforcent les attaques de CE côté, donc s'appliquent dans getSide de l'autre côté.
  function makeField(f) {
    f = f || {};
    var L = (f.sides && f.sides[0]) || {}, R = (f.sides && f.sides[1]) || {};
    var format = f.format || 'Doubles';
    var weather = f.weather || '';
    var terrain = f.terrain || '';
    var isGravity = !!f.gravity;
    var nGas = !!f.neutralizingGas;
    var pair = function (k) { return [!!L[k], !!R[k]]; };
    var cross = function (k) { return [!!R[k], !!L[k]]; };
    var isSR = [false, false], spikes = [0, 0];
    var isReflect = pair('reflect'), isLightScreen = pair('lightScreen'), isForesight = [false, false];
    var isHelpingHand = cross('helpingHand');
    var isGMaxField = [false, false];
    var isFriendGuard = !nGas ? pair('friendGuard') : false;
    var isBattery = !nGas ? cross('battery') : false;
    var isPowerSpot = !nGas ? cross('powerSpot') : false;
    var isSteelySpirit = !nGas ? cross('steelySpirit') : false;
    var isFlowerGiftSpD = !nGas ? pair('flowerGift') : false;
    var isFlowerGiftAtk = !nGas ? cross('flowerGift') : false;
    var isTailwind = pair('tailwind'), isSaltCure = [false, false], isAuroraVeil = pair('auroraVeil');
    var isSwamp = [false, false], isSeaFire = [false, false], isRedItem = [false, false], isBlueItem = [false, false];
    var isCharge = cross('charge');
    var none = [false, false];
    var isProtect = pair('protect');
    this.getNeutralGas = function () { return nGas; };
    this.getTailwind = function (i) { return isTailwind[i]; };
    this.getWeather = function () { return weather; };
    this.getTerrain = function () { return terrain; };
    this.getSwamp = function (i) { return isSwamp[i]; };
    this.clearWeather = function () { weather = ''; };
    this.clearTerrain = function () { terrain = ''; };
    this.getSide = function (i) {
      return new Side(format, terrain, weather, isGravity, isSR[i], spikes[i], isReflect[i], isLightScreen[i], isForesight[i],
        isHelpingHand[i], isFriendGuard[i], isBattery[i], isProtect[i], isPowerSpot[i], isSteelySpirit[i], nGas, isGMaxField[i],
        isFlowerGiftSpD[i], isFlowerGiftAtk[i], isTailwind[i], isSaltCure[i], isAuroraVeil[i], isSwamp[i], isSeaFire[i],
        isRedItem[i], isBlueItem[i], isCharge[i], none[i], none[i], none[i], none[i], none[i], none[i]);
    };
  }

  // Constructeur Side d'ap_calc.js, avec ses 33 arguments
  function Side(format, terrain, weather, isGravity, isSR, spikes, isReflect, isLightScreen, isForesight, isHelpingHand, isFriendGuard, isBattery, isProtect, isPowerSpot, isSteelySpirit, isNeutralizingGas, isGmaxField, isFlowerGiftSpD, isFlowerGiftAtk, isTailwind, isSaltCure, isAuroraVeil, isSwamp, isSeaFire, isRedItem, isBlueItem, isCharge, isLeechSeed, isIngrain, isCurse, isBinding, isAquaRing, isNightmare) {
    this.format = format; this.terrain = terrain; this.weather = weather; this.isGravity = isGravity; this.isSR = isSR;
    this.spikes = spikes; this.isReflect = isReflect; this.isLightScreen = isLightScreen; this.isForesight = isForesight;
    this.isHelpingHand = isHelpingHand; this.isFriendGuard = isFriendGuard; this.isBattery = isBattery; this.isProtect = isProtect;
    this.isPowerSpot = isPowerSpot; this.isSteelySpirit = isSteelySpirit; this.isNeutralizingGas = isNeutralizingGas;
    this.isGMaxField = isGmaxField; this.isFlowerGiftSpD = isFlowerGiftSpD; this.isFlowerGiftAtk = isFlowerGiftAtk;
    this.isTailwind = isTailwind; this.isSaltCure = isSaltCure; this.isAuroraVeil = isAuroraVeil; this.isSwamp = isSwamp;
    this.isSeaFire = isSeaFire; this.isRedItem = isRedItem; this.isBlueItem = isBlueItem; this.isCharge = isCharge;
    this.isLeechSeed = isLeechSeed; this.isIngrain = isIngrain; this.isCurse = isCurse; this.isBinding = isBinding;
    this.isAquaRing = isAquaRing; this.isNightmare = isNightmare;
  }

  // calcMinMaxDamage d'ap_calc.js
  function minMax(damage, hits) {
    var minDamage, maxDamage;
    if (Array.isArray(damage[0])) {
      minDamage = 0; maxDamage = 0;
      for (var i = 0; i < hits; i++) {
        var arr = damage[Math.min(i, damage.length - 1)];
        minDamage += arr[0]; maxDamage += arr[arr.length - 1];
      }
    } else {
      minDamage = damage[0] * hits;
      maxDamage = damage[damage.length - 1] * hits;
    }
    return [minDamage, maxDamage];
  }

  // Comme setIndependentField d'ap_calc.js : une aura ou un talent « of Ruin » présent chez l'un des deux
  // Pokémon coche la case correspondante ; les autres cases viennent des réglages (fieldSpec.flags).
  var AUTO_FLAGS = { 'Fairy Aura': 'fairy-aura', 'Dark Aura': 'dark-aura', 'Aura Break': 'aura-break',
    'Tablets of Ruin': 'tablets-of-ruin', 'Vessel of Ruin': 'vessel-of-ruin', 'Sword of Ruin': 'sword-of-ruin', 'Beads of Ruin': 'beads-of-ruin' };
  function setFlags(p1, p2, fieldSpec) {
    var flags = {};
    [p1.ability, p2.ability].forEach(function (ab) { if (AUTO_FLAGS[ab]) flags[AUTO_FLAGS[ab]] = true; });
    var manual = (fieldSpec && fieldSpec.flags) || {};
    Object.keys(manual).forEach(function (k) { flags[k] = !!manual[k]; });
    Object.keys(NCP_FLAGS).forEach(function (k) { delete NCP_FLAGS[k]; });
    Object.keys(flags).forEach(function (k) { NCP_FLAGS[k] = flags[k]; });
  }

  // Calcule les quatre attaques de chaque côté, comme calculate() d'ap_calc.js
  function run(spec1, spec2, fieldSpec) {
    var p1 = makePokemon(spec1), p2 = makePokemon(spec2);
    setFlags(p1, p2, fieldSpec);
    var field = new makeField(fieldSpec);
    var results = CALCULATE_ALL_MOVES_SV(p1, p2, field);
    var out = [[], []];
    [[p1, p2, 0, 1], [p2, p1, 1, 0]].forEach(function (t) {
      var att = t[0], def = t[1], side = t[2], defSide = t[3];
      for (var i = 0; i < 4; i++) {
        var r = results[side][i];
        var mv = att.moves[i];
        var mm = minMax(r.damage, mv.hits);
        var minPct = Math.floor(mm[0] * 1000 / def.maxHP) / 10;
        var maxPct = Math.floor(mm[1] * 1000 / def.maxHP) / 10;
        var ko = (mv.bp === 0 && mv.category !== 'Status') ? ''
          : getKOChanceText(r.damage, mv, def, field.getSide(defSide), att.ability === 'Bad Dreams', att.item === '');
        // PV gagnés ou perdus par l'attaquant (recul, drain, Life Orb, Rocky Helmet...), comme la page d'origine
        var hasUser = typeof calcUserHP === 'function';
        var leech = field.getSide(defSide).isLeechSeed;
        out[side].push({
          move: mv.name, category: mv.category, damage: r.damage, min: mm[0], max: mm[1],
          minPct: minPct, maxPct: maxPct, ko: ko, description: r.description, hits: mv.hits,
          user: hasUser ? calcUserHP(mv, att, def, mm[0], mm[1], leech) : null,
          userText: hasUser ? userHPResultText(mv, att, def, mm[0], mm[1], leech) : '',
        });
      }
    });
    return { p1: p1, p2: p2, results: out };
  }

  return { run: run, makePokemon: makePokemon, statChamp: statChamp, hpChamp: hpChamp, resolveForme: resolveForme };
})();


  window.NCP_CALC = {
    ready: false,
    init: function (data) {
      pokedex = data.pokedex; moves = data.moves; items = data.items; abilities = data.abilities;
      typeChart = data.typeChart; NATURES = data.natures;
      ZMOVES_LOOKUP = data.zmoves || {}; MAXMOVES_LOOKUP = data.maxmoves || {};
      G_MAXMOVES_TYPE = data.gmaxType || {}; G_MAXMOVES_LOOKUP = data.gmaxLookup || {};
      this.ready = true;
    },
    run: NCP_ADAPT.run,
    makePokemon: NCP_ADAPT.makePokemon,
    resolveForme: NCP_ADAPT.resolveForme,
    natures: function () { return NATURES; },
  };
})();
