// Analyse de portée : liste les variables qu'un script affecte sans les déclarer (var, let, const).
// En JavaScript non strict, chacune devient une variable globale implicite ; en mode strict, elle lève une erreur.
// Usage en ligne de commande : node implicit_globals.js <fichier.js>  (code de sortie 1 s'il en reste)
'use strict';
const fs = require('fs');
const espree = require('espree');
const eslintScope = require('eslint-scope');

function analyse(src) {
  const ast = espree.parse(src, { ecmaVersion: 2022, sourceType: 'script', range: true });
  const scopes = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
  const ecrites = new Set(), lues = new Set();
  for (const ref of scopes.globalScope.through) (ref.isWrite() ? ecrites : lues).add(ref.identifier.name);
  return { ecrites: [...ecrites].sort(), lues: [...lues].filter((n) => !ecrites.has(n)).sort() };
}

// noms affectés sans déclaration, triés
const implicitGlobals = (src) => analyse(src).ecrites;

module.exports = { analyse, implicitGlobals };

if (require.main === module) {
  const { ecrites, lues } = analyse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log('affectées sans déclaration :', ecrites.length ? ecrites.join(' ') : 'aucune');
  console.log('lues sans déclaration :', lues.join(' '));
  process.exit(ecrites.length ? 1 : 0);
}
