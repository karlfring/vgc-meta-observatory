// Extrait du calculateur NCP les données du mode Champions, dans le fichier JSON que lit le tableau de bord.
// Usage : node extract_data.js <clone de NCP-VGC-Damage-Calculator> <sortie champions_data.json>
// Les fichiers de données de NCP sont exécutés dans un contexte isolé (vm), sans page ni réseau.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { makeContext, load } = require('./sandbox');

const [, , repo, out] = process.argv;
if (!repo || !out) {
  console.error('Usage : node extract_data.js <clone de NCP-VGC-Damage-Calculator> <sortie.json>');
  process.exit(2);
}
const dir = path.join(repo, 'script_res');
const ctx = makeContext();
for (const f of ['pokedex.js', 'stat_data.js', 'type_data.js', 'nature_data.js', 'ability_data.js', 'item_data.js', 'move_data.js']) {
  load(ctx, path.join(dir, f));
}
const pick = (name) => vm.runInContext(name, ctx);

// version du calculateur d'origine : commit et date du clone
let commit = 'inconnu', date = 'inconnue';
try {
  [commit, date] = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%h|%cs'], { encoding: 'utf8' }).trim().split('|');
} catch (e) {
  console.warn('Clone sans historique git : commit et date notés « inconnu ».');
}

const data = {
  pokedex: pick('POKEDEX_CHAMPIONS'),
  moves: pick('MOVES_CHAMPIONS'),
  items: pick('ITEMS_CHAMPIONS'),
  abilities: pick('ABILITIES_CHAMPIONS'),
  typeChart: pick('TYPE_CHART_SV'),
  natures: pick('NATURES'),
  lockItems: pick('LOCK_ITEM_LOOKUP'),
  zmoves: pick('ZMOVES_LOOKUP'),
  maxmoves: pick('MAXMOVES_LOOKUP'),
  gmaxType: pick('G_MAXMOVES_TYPE'),
  gmaxLookup: pick('G_MAXMOVES_LOOKUP'),
  source: {
    calculateur: 'Nimbasa City Post VGC Damage Calculator',
    depot: 'https://github.com/nerd-of-now/NCP-VGC-Damage-Calculator',
    commit,
    date,
    licence: 'MIT',
    mode: 'Champions',
  },
};

// une fiche ou une capacité vide trahirait une copie incomplète (voir sandbox.js)
const vides = Object.entries(data.pokedex).filter(([, v]) => !v || !v.bs).map(([k]) => k)
  .concat(Object.entries(data.moves).filter(([k, v]) => !v || (!v.type && k !== '(No Move)')).map(([k]) => k));
if (vides.length) {
  console.error('Entrées incomplètes :', vides.slice(0, 20));
  process.exit(1);
}
fs.writeFileSync(out, JSON.stringify(data));
console.log(`${Object.keys(data.pokedex).length} Pokémon, ${Object.keys(data.moves).length} capacités, ${data.items.length} objets, `
  + `${data.abilities.length} talents ; commit ${commit} du ${date} ; ${fs.statSync(out).size} octets`);
