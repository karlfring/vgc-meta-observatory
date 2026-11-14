// Lance des duels dans la page d'origine du calculateur NCP, ouverte dans Chromium sans affichage et sans réseau.
// Chaque Pokémon y est chargé comme un set (« Ref »), puis les réglages sont posés dans le formulaire,
// comme le ferait un joueur, avant l'appel de calculate().
// Usage : node run_original.js <clone de NCP-VGC-Damage-Calculator> <duels.json> <sortie.json>
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [, , repo, mFile, out] = process.argv;
const matchups = JSON.parse(fs.readFileSync(mFile, 'utf8'));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.dismiss());
  await page.route(/^https?:\/\//, (r) => r.abort());  // aucune requête réseau (publicités, polices)
  await page.goto('file://' + path.resolve(repo, 'index.html'));
  await page.waitForFunction(() => typeof calculate === 'function' && typeof setdex !== 'undefined' && gen === 10, null, { timeout: 30000 });
  const res = {};
  for (const m of matchups) {
    try {
      res[m.id] = await page.evaluate((m) => {
        function setPoke(p, s) {
          setdex[s.name] = setdex[s.name] || {};
          setdex[s.name].Ref = { level: 50, nature: s.nature, ability: s.ability, item: s.item, sps: s.sps, moves: s.moves };
          const sel = $('#' + p + ' .set-selector');
          sel.val(s.name + ' (Ref)');
          sel.change();
          if (s.boosts) for (const k in s.boosts) $('#' + p + ' .' + k + ' .boost').val(s.boosts[k]);
          if (s.status) $('#' + p + ' .status').val(s.status).change();
          $('#' + p + ' .percent-hp').val(s.hpPercent == null ? 100 : s.hpPercent).keyup();
          if (s.abilityOn != null) $('#' + p + ' .abilityToggle').prop('checked', s.abilityOn);
          if (s.toxicCounter != null) $('#' + p + ' .toxic-counter').val(s.toxicCounter);
          if (s.supremeOverlord != null) $('#' + p + ' .ability-supreme').val(s.supremeOverlord);
          (s.moveOpts || []).forEach((o, i) => {
            if (!o) return;
            const mv = $('#' + p + ' .move' + (i + 1));
            if (o.crit) mv.find('.move-crit').prop('checked', true);
            if (o.hits != null) mv.find('.move-hits').val(o.hits);
            if (o.double) mv.find('.move-double').prop('checked', true);
            if (o.timesAffected != null) mv.find('.move-linearAddedBP').val(o.timesAffected);
          });
        }
        setPoke('p1', m.a);
        setPoke('p2', m.b);
        $("input:radio[name='format'][value='" + (m.f.format || 'Doubles') + "']").prop('checked', true);
        $("input:radio[name='weather'][value='" + (m.f.weather || '') + "']").prop('checked', true);
        $("input:radio[name='terrain'][value='" + (m.f.terrain || '') + "']").prop('checked', true);
        const ids = ['reflect', 'lightScreen', 'auroraVeil', 'helpingHand', 'friendGuard', 'tailwind', 'protect', 'battery', 'powerSpot', 'steelySpirit', 'flowerGift', 'charge'];
        const sides = m.f.sides || [{}, {}];
        ids.forEach((k) => { $('#' + k + 'L').prop('checked', !!(sides[0] || {})[k]); $('#' + k + 'R').prop('checked', !!(sides[1] || {})[k]); });
        calculate();
        const o = [[], []];
        for (let s = 0; s < 2; s++) for (let i = 0; i < 4; i++) {
          const r = damageResults[s][i];
          o[s].push({ damage: r.damage, description: r.description, ko: r.koChanceText, dmgText: $('#resultDamage' + (s ? 'R' : 'L') + (i + 1)).text() });
        }
        const pk = (p) => ({ name: p.name, maxHP: p.maxHP, raw: p.rawStats, item: p.item, ability: p.ability, abilityOn: p.abilityOn, status: p.status, moves: p.moves.map((x) => x.name) });
        // les cases et menus de capacité gardent leur état d'un duel à l'autre : on les remet à zéro
        $('.move-crit, .move-double').prop('checked', false);
        $('.move-linearAddedBP, .ability-supreme').val('0');
        $('.toxic-counter').val('1');
        return JSON.parse(JSON.stringify({ out: o, p1: pk(new Pokemon($('#p1'))), p2: pk(new Pokemon($('#p2'))) }));
      }, m);
    } catch (e) {
      res[m.id] = { error: String(e.message || e) };
    }
  }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(res));
  console.log(Object.keys(res).length, "duels calculés par la page d'origine,", Object.values(res).filter((r) => r.error).length, 'en erreur ; erreurs de page :', errors.slice(0, 5));
})();
