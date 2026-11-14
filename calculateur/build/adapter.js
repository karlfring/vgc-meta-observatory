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
