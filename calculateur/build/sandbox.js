// Charge les scripts du calculateur NCP dans un contexte isolé (vm), sans DOM ni réseau.
// Le shim jQuery ne fournit que ce que les fichiers de données et le moteur utilisent :
// $.extend (copie profonde comme jQuery), $.isEmptyObject, et un $() inerte (cases jamais cochées).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Les objets créés dans le contexte vm ont un autre Object.prototype que l'hôte :
// on teste donc la forme (objet simple dont le prototype est un prototype racine), comme jQuery.
function isPlainObject(o) {
  if (o === null || typeof o !== 'object' || Object.prototype.toString.call(o) !== '[object Object]') return false;
  const proto = Object.getPrototypeOf(o);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

// Réplique de jQuery.extend (y compris le mode profond sur objets et tableaux)
function extend(...args) {
  let deep = false;
  let i = 0;
  if (typeof args[0] === 'boolean') { deep = args[0]; i = 1; }
  let target = args[i] ?? {};
  if (typeof target !== 'object' && typeof target !== 'function') target = {};
  for (i += 1; i < args.length; i++) {
    const options = args[i];
    if (options == null) continue;
    for (const name of Object.keys(options)) {
      const copy = options[name];
      if (name === '__proto__' || target === copy) continue;
      const copyIsArray = Array.isArray(copy);
      if (deep && copy && (isPlainObject(copy) || copyIsArray)) {
        const src = target[name];
        let clone;
        if (copyIsArray && !Array.isArray(src)) clone = [];
        else if (!copyIsArray && !isPlainObject(src)) clone = {};
        else clone = src;
        target[name] = extend(deep, clone, copy);
      } else if (copy !== undefined) {
        target[name] = copy;
      }
    }
  }
  return target;
}

function inertQuery() {
  const q = {
    length: 0,
    is: () => false, prop: () => false, val: () => undefined, text: () => q, html: () => q,
    find: () => q, children: () => q, parent: () => q, closest: () => q, attr: () => undefined,
    show: () => q, hide: () => q, change: () => q, trigger: () => q, addClass: () => q, removeClass: () => q,
    toggleClass: () => q, bind: () => q, click: () => q, on: () => q, each: () => q, css: () => q,
  };
  return q;
}

function makeContext(extra = {}) {
  const $ = function () { return inertQuery(); };
  $.extend = extend;
  $.isEmptyObject = (o) => !o || Object.keys(o).length === 0;
  const ctx = {
    $, jQuery: $,
    localStorage: { getItem: () => null, setItem: () => {} },
    console,
    ...extra,
  };
  vm.createContext(ctx);
  return ctx;
}

function load(ctx, file) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: path.basename(file) });
}

module.exports = { makeContext, load, extend };
