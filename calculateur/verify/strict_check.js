// Lance le moteur empaqueté deux fois, en JavaScript normal puis en mode strict, sur des duels donnés.
// Vérifie qu'aucun calcul n'échoue et qu'aucune variable globale n'est créée en dehors de window.NCP_CALC.
// Usage : node strict_check.js <calc-moteur.js> <champions_data.json> <duels.json> [<duels.json> ...]
// Code de sortie 1 en cas d'erreur ou de variable globale créée.
'use strict';
const fs = require('fs');
const vm = require('vm');

const [, , bundle, dataFile, ...mFiles] = process.argv;
const src = fs.readFileSync(bundle, 'utf8');
if (!src.includes('(function () {')) throw new Error("enveloppe du moteur introuvable");
let echec = false;
for (const strict of [false, true]) {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(strict ? src.replace('(function () {', '(function () {\n"use strict";') : src, ctx);
  ctx.__data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  vm.runInContext('window.NCP_CALC.init(__data)', ctx);
  const erreurs = new Map();
  let n = 0;
  for (const f of mFiles) {
    for (const m of JSON.parse(fs.readFileSync(f, 'utf8'))) {
      ctx.__m = m;
      n++;
      try { vm.runInContext('window.NCP_CALC.run(__m.a, __m.b, __m.f)', ctx); }
      catch (e) { const k = String(e.message); erreurs.set(k, (erreurs.get(k) || 0) + 1); }
    }
  }
  const globales = Object.keys(ctx).filter((k) => !['console', 'window', '__data', '__m', 'NCP_CALC'].includes(k));
  console.log(`${strict ? 'mode strict' : 'mode normal'} : ${n} duels, ${erreurs.size ? `erreurs ${JSON.stringify([...erreurs])}` : 'aucune erreur'}, `
    + `${globales.length ? `variables globales créées : ${globales.join(' ')}` : 'aucune variable globale créée'}`);
  if (erreurs.size || globales.length) echec = true;
}
process.exit(echec ? 1 : 0);
