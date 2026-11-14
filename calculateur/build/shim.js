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
