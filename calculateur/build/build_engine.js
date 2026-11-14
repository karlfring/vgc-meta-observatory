// Assemble le moteur du calculateur pour le tableau de bord : un seul fichier autonome, calc-moteur.js.
// Usage : node build_engine.js <clone de NCP-VGC-Damage-Calculator> <champions_data.json> <sortie calc-moteur.js>
//
// Le moteur NCP est repris tel quel (licence MIT) : damage_MASTER.js, damage_SV.js, ko_chance.js, les fonctions
// d'item_data.js, et calcUserHP et userHPResultText d'ap_calc.js. Seuls s'y ajoutent l'enveloppe, le remplaçant
// de jQuery (shim.js) et l'adaptateur qui construit les objets Pokémon et Terrain (adapter.js).
'use strict';
const fs = require('fs');
const path = require('path');
const { implicitGlobals } = require('./implicit_globals');

const [, , repo, dataFile, out] = process.argv;
if (!repo || !dataFile || !out) {
  console.error('Usage : node build_engine.js <clone de NCP-VGC-Damage-Calculator> <champions_data.json> <sortie.js>');
  process.exit(2);
}
// lecture en fins de ligne Unix, comme les autres outils du dépôt
const rd = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');
const src = path.join(repo, 'script_res');
const ici = __dirname;

const lic = rd(path.join(repo, 'LICENSE')).trim();
const item = rd(path.join(src, 'item_data.js')).split('\n');
const start = item.findIndex((l) => l.startsWith('function getItemBoostType'));
if (start < 0) throw new Error("item_data.js : fonction getItemBoostType introuvable");
const itemHelpers = item.slice(start).join('\n');
// PV de l'attaquant après l'attaque (recul, drain, objets) : deux fonctions d'ap_calc.js, reprises telles quelles
const ap = rd(path.join(src, 'ap_calc.js')).split('\n');
const u0 = ap.findIndex((l) => l.startsWith('function calcUserHP('));
const u1 = ap.findIndex((l) => l.startsWith('var damageResults;'));
const userHp = ap.slice(u0, u1).join('\n').replace(/\s+$/, '');
if (u0 < 0 || u1 < u0 || !userHp.includes('function userHPResultText(') || userHp.split('\nfunction ').length !== 2) {
  throw new Error("ap_calc.js : découpage de calcUserHP et userHPResultText inattendu");
}

const { source } = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source.date || '');
const dateFr = m ? `${Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}` : source.date;

const header = `/* Calculateur de dégâts de VGC Meta Overview : moteur du Nimbasa City Post VGC Damage Calculator,
 * mode Champions (génération 10), repris sans modification de ses formules.
 * Source : https://github.com/nerd-of-now/NCP-VGC-Damage-Calculator (commit ${source.commit} du ${dateFr}),
 * fichiers damage_MASTER.js, damage_SV.js, ko_chance.js, les fonctions d'item_data.js, et calcUserHP et
 * userHPResultText d'ap_calc.js.
 * Ajouts propres au tableau de bord : l'enveloppe ci-dessous, un remplaçant de jQuery (les cases que le
 * moteur lit) et un adaptateur qui construit les objets Pokémon et Terrain comme le fait ap_calc.js.
 * Fichier construit par calculateur/build/build_engine.js (dépôt vgc-meta-observatory).
 *
 * Licence du moteur d'origine :
 *
${lic.split('\n').map((l) => (l ? ` * ${l}` : ' *')).join('\n')}
 */
`;

const body = (declarations) => `(function () {
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
  ${declarations}
  // Une alerte du moteur (cas prévu comme impossible) part dans la console au lieu d'ouvrir une boîte de dialogue.
  var alert = function (msg) { if (typeof console !== 'undefined') console.warn('[calculateur] ' + msg); };

/* ---- remplaçant de jQuery ---- */
${rd(path.join(ici, 'shim.js'))}

/* ---- item_data.js (fonctions et tables) ---- */
${itemHelpers}

/* ---- damage_MASTER.js ---- */
${rd(path.join(src, 'damage_MASTER.js'))}

/* ---- damage_SV.js ---- */
${rd(path.join(src, 'damage_SV.js'))}

/* ---- ko_chance.js ---- */
${rd(path.join(src, 'ko_chance.js'))}

/* ---- ap_calc.js : calcUserHP et userHPResultText ---- */
${userHp}

/* ---- adaptateur ---- */
${rd(path.join(ici, 'adapter.js'))}

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
`;

// 1er passage : relever les variables affectées sans déclaration ; 2e : les déclarer dans l'enveloppe
const implicites = implicitGlobals(header + body('// (aucune)'));
const declarations = implicites.length ? `var ${implicites.join(', ')};` : '// (aucune)';
const code = header + body(declarations);
const restantes = implicitGlobals(code).filter((n) => n !== 'window');
if (restantes.length) throw new Error(`variables encore implicites : ${restantes.join(', ')}`);
fs.writeFileSync(out, code);
const json = Buffer.byteLength(JSON.stringify({ text: code }));
console.log(`calc-moteur.js : ${Buffer.byteLength(code)} octets (${json} en JSON, limite d'un document du tableau de bord : 262 144) ; `
  + `${implicites.length} variables implicites déclarées : ${implicites.join(' ')}`);
if (json > 262144) {
  console.error('Fichier trop gros pour un seul document du tableau de bord.');
  process.exit(1);
}
