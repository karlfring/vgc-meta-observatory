// Lance des duels avec le moteur empaqueté, chargé seul comme dans le tableau de bord (calc-moteur.js + données).
// Usage : node run_engine.js <calc-moteur.js> <champions_data.json> <duels.json> <sortie.json>
'use strict';
const fs = require('fs');
const vm = require('vm');

const [, , bundle, dataFile, mFile, out] = process.argv;
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(bundle, 'utf8'), ctx, { filename: 'calc-moteur.js' });
ctx.__data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
vm.runInContext('window.NCP_CALC.init(__data)', ctx);
const res = {};
for (const m of JSON.parse(fs.readFileSync(mFile, 'utf8'))) {
  ctx.__m = m;
  try {
    // mêmes champs que run_original.js, et le texte de dégâts affiché par la page d'origine (avec recul ou soin).
    // Comme la page d'origine, qui relit son formulaire, on décrit les Pokémon d'avant le calcul : le calcul
    // lui-même peut consommer un objet (graine de champ) ou modifier un talent (Trace).
    res[m.id] = JSON.parse(vm.runInContext(`(function () {
      var r = window.NCP_CALC.run(__m.a, __m.b, __m.f);
      var q1 = window.NCP_CALC.makePokemon(__m.a), q2 = window.NCP_CALC.makePokemon(__m.b);
      var pk = function (p) { return { name: p.name, maxHP: p.maxHP, raw: p.rawStats, item: p.item, ability: p.ability, abilityOn: p.abilityOn, status: p.status, moves: p.moves.map(function (x) { return x.name; }) }; };
      return JSON.stringify({ out: r.results.map(function (s) { return s.map(function (x) { return { damage: x.damage, description: x.description, ko: x.ko, dmgText: x.minPct + ' - ' + x.maxPct + '%' + x.userText }; }); }), p1: pk(q1), p2: pk(q2) });
    })()`, ctx));
  } catch (e) {
    res[m.id] = { error: String((e && e.stack) || e) };
  }
}
fs.writeFileSync(out, JSON.stringify(res));
console.log(Object.keys(res).length, 'duels calculés par le moteur,', Object.values(res).filter((r) => r.error).length, 'en erreur');
