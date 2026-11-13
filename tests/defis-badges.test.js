// Lot 9 (2e partie) : défis de soirée (tirage déterministe, résultats) et badges / tableau d'honneur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ds } from './helpers.js';
import { computeState } from '../src/engine/x01.js';
import { DEFIS, drawDefi, defiResult, gameDefis } from '../src/engine/defis.js';
import { honours, playerBadges, badgesOfGame, BADGES } from '../src/engine/badges.js';

const cfg = (players = ['A', 'B'], extra = {}) => ({ startScore: 501, outMode: 'double', legsToWin: 1, players, ...extra });

test('défis : tirage stable, jamais à la 1re volée ni sans option, fréquence à peu près tenue', () => {
  assert.equal(drawDefi('g1', 0, 'souvent', 501), null, 'jamais la première volée');
  assert.equal(drawDefi('g1', 3, undefined, 501), null, 'sans option : aucun défi');
  for (let i = 1; i < 50; i++) assert.equal(drawDefi('g1', i, 'souvent', 501), drawDefi('g1', i, 'souvent', 501));
  let n4 = 0, n8 = 0;
  for (let g = 0; g < 200; g++) for (let i = 1; i < 20; i++) {
    if (drawDefi(`p${g}`, i, 'souvent', 501)) n4++;
    if (drawDefi(`p${g}`, i, 'parfois', 501)) n8++;
  }
  const tot = 200 * 19;
  assert.ok(n4 / tot > 0.2 && n4 / tot < 0.3, `souvent ≈ 1/4 (${n4 / tot})`);
  assert.ok(n8 / tot > 0.09 && n8 / tot < 0.16, `parfois ≈ 1/8 (${n8 / tot})`);
  // Près de la fin, seuls les défis qui restent jouables sont tirés.
  for (let g = 0; g < 300; g++) { const k = drawDefi(`q${g}`, 2, 'souvent', 50); if (k) assert.ok(DEFIS[k].minRest <= 50, k); }
  for (let g = 0; g < 300; g++) assert.equal(drawDefi(`r${g}`, 2, 'souvent', 30), null, 'sous 40 : rien');
});

test('défis : résultat vérifié sur la volée close, gage seulement en cas d’échec (bull : les autres)', () => {
  // On cherche une partie dont la volée 1 (B) porte un défi « triple ».
  let id = null;
  for (let g = 0; g < 2000 && !id; g++) if (drawDefi(`t${g}`, 1, 'souvent', 501) === 'triple') id = `t${g}`;
  assert.ok(id);
  const config = cfg();
  const ok = { id, config, defis: 'souvent', darts: ds('S1 S1 S1  T5 S1 S1') };
  const ko = { id, config, defis: 'souvent', darts: ds('S1 S1 S1  S5 S1 S1') };
  assert.deepEqual(defiResult(ok, computeState(config, ok.darts), 1), { key: 'triple', player: 1, ok: true, gage: null });
  assert.deepEqual(defiResult(ko, computeState(config, ko.darts), 1), { key: 'triple', player: 1, ok: false, gage: 'verre' });
  assert.equal(gameDefis({ ...ko, defis: undefined }, computeState(config, ko.darts)).length, 0);
  assert.ok(gameDefis(ko, computeState(config, ko.darts)).some(d => d.index === 1 && !d.ok));
  let bid = null;
  for (let g = 0; g < 4000 && !bid; g++) if (drawDefi(`b${g}`, 1, 'souvent', 501) === 'bull') bid = `b${g}`;
  const bg = { id: bid, config, defis: 'souvent', darts: ds('S1 S1 S1  S25 S1 S1') };
  assert.deepEqual(defiResult(bg, computeState(config, bg.darts), 1), { key: 'bull', player: 1, ok: true, gage: 'autres' });
});

test('badges : gagnés une fois à la bonne partie ; records au tableau d’honneur dès la 2e partie', () => {
  const day = Date.UTC(2026, 9, 3, 20);
  // Partie 1 : A gagne 501 en 9 fléchettes (180 180 141 = T20 T19 D12), avec un 180.
  const g1 = { id: 'g1', startedAt: day, config: cfg(['A', 'B']), darts: ds('T20 T20 T20  S1 S1 S1  T20 T20 T20  S1 S1 S1  T20 T19 D12') };
  // Partie 2 : A regagne, B rien ; A bat sa meilleure moyenne ? non (9 fléchettes imbattable) ; B bat sa meilleure volée.
  const g2 = { id: 'g2', startedAt: day + 3600e3, config: cfg(['A', 'B']), darts: ds('T20 T20 T20  T20 S20 S1  T20 T20 T20  S1 S1 S1  T20 T19 D12') };
  const h = honours([g2, g1], Date.UTC(2026, 9, 20));
  const a = playerBadges(h, 'A');
  assert.equal(a.length, BADGES.length);
  const has = (list, k) => list.find(b => b.key === k).earned;
  assert.ok(has(a, 'win1') && has(a, 'max') && has(a, 'ton40') && has(a, 'fin100') && has(a, 'leg15'));
  assert.ok(!has(a, 'win10') && !has(a, 'streak3'));
  assert.equal(h.byPlayer.A.max.gameId, 'g1', 'gagné à la première partie qui le remplit');
  assert.deepEqual(badgesOfGame(h, 'g2').filter(b => b.id === 'A'), [], 'rien de nouveau pour A en partie 2');
  assert.ok(!has(playerBadges(h, 'B'), 'win1'));
  const rec = h.events.find(e => e.kind === 'record' && e.id === 'B');
  assert.deepEqual([rec.key, rec.value, rec.before], ['visit', '81', '3']);
  assert.ok(!h.events.some(e => e.kind === 'record' && e.at === day), 'aucun record à la première partie');
  assert.ok(h.events[0].at >= h.events[h.events.length - 1].at, 'du plus récent au plus ancien');
});

test('badges du mois : seulement les mois finis, 3 victoires au moins', () => {
  const games = [0, 1, 2].map(i => ({ id: `m${i}`, startedAt: Date.UTC(2026, 9, 5 + i, 20), config: cfg(['A', 'B']),
    darts: ds('T20 T20 T20  S1 S1 S1  T20 T20 T20  S1 S1 S1  T20 T19 D12') }));
  assert.ok(!honours(games, Date.UTC(2026, 9, 25)).byPlayer.A.champion, 'octobre pas fini');
  const h = honours(games, Date.UTC(2026, 10, 2));
  assert.equal(h.byPlayer.A.champion.count, 1);
  assert.ok(!h.byPlayer.B || !h.byPlayer.B.champion);
  assert.ok(h.byPlayer.A.streak3, '3 d’affilée');
});
