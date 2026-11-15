// Remplace l'API du tableau de bord Claude (window.dash) pour la page servie par le site.
// La page n'utilise que : data, calc, onData, params, setParams, setLink et colors.
// Les jeux de données sont chargés à la demande depuis /data/<id>.json ; les calculs (dash.calc)
// tournent dans le navigateur, comme dans le tableau de bord d'origine.
(function () {
  'use strict';
  var SOURCES = ['pokemon', 'instantanes', 'builds', 'coequipiers', 'counters', 'calculateur'];
  var VIDE = [];
  var sources = {};   // id -> { status, data }
  var calcs = {};     // id -> { inputs, fn }
  var cache = {};     // résultats des calculs, vidés à chaque arrivée de données
  var listeners = [];
  var pending = false;

  function emit() {
    pending = false;
    listeners.forEach(function (fn) {
      try { fn(); } catch (e) { console.error('[tableau de bord]', e); }
    });
  }
  // plusieurs fichiers qui arrivent ensemble ne redessinent la page qu'une fois
  function notify(now) {
    if (now) { emit(); return; }
    if (!pending) { pending = true; setTimeout(emit, 0); }
  }

  function load(id) {
    sources[id] = { status: 'loading', data: VIDE };
    fetch('/data/' + id + '.json', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) {
          // session expirée : retour à la connexion, puis à cette page
          location.href = '/login?suite=' + encodeURIComponent(location.pathname + location.search);
          throw new Error('session expirée');
        }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) { sources[id] = { status: 'ok', data: d }; })
      .catch(function (e) { console.error('[données] ' + id + ' : ' + e.message); sources[id] = { status: 'error', data: VIDE }; })
      .then(function () { cache = {}; notify(false); });
  }

  function data(id) {
    var c = calcs[id];
    if (c) {
      if (cache[id]) return cache[id];
      var inputs = c.inputs.map(data);
      for (var i = 0; i < inputs.length; i++) {
        if (inputs[i].status !== 'ok') return { status: inputs[i].status, data: VIDE };
      }
      try {
        cache[id] = { status: 'ok', data: c.fn.apply(null, inputs.map(function (x) { return x.data; })) };
      } catch (e) {
        console.error('[calcul] ' + id + ' : ' + e.message);
        cache[id] = { status: 'error', data: VIDE };
      }
      return cache[id];
    }
    if (!sources[id]) {
      if (SOURCES.indexOf(id) === -1) return { status: 'error', data: VIDE };
      load(id);
    }
    return sources[id];
  }

  // paramètres (Pokémon et palier choisis) dans l'adresse : un lien partagé ouvre la même vue
  function readParams() {
    var p = {};
    new URLSearchParams(location.search).forEach(function (v, k) { p[k] = /^-?\d+$/.test(v) ? Number(v) : v; });
    return p;
  }
  var params = readParams();
  function writeParams() {
    var q = new URLSearchParams();
    Object.keys(params).forEach(function (k) {
      if (params[k] !== null && params[k] !== undefined && params[k] !== '') q.set(k, params[k]);
    });
    var s = q.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
  }

  var dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  window.dash = {
    data: data,
    calc: function (id, def) { calcs[id] = def; delete cache[id]; },
    onData: function (fn) {
      listeners.push(fn);
      try { fn(); } catch (e) { console.error('[tableau de bord]', e); }
    },
    params: function () { return Object.assign({}, params); },
    setParams: function (p) { Object.assign(params, p); writeParams(); notify(true); },
    resetParams: function () { params = {}; writeParams(); notify(true); },
    // onglet courant dans l'adresse (#evolution, #calculateur...), comme les liens directs de la page
    setLink: function (id) {
      history.replaceState(null, '', location.pathname + location.search + (id && id !== 'apercu' ? '#' + id : ''));
    },
    refresh: function () { Object.keys(sources).forEach(load); },
    // palette catégorielle validée (contraste et daltonisme), en clair et en sombre
    colors: dark
      ? ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
      : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  };
})();
