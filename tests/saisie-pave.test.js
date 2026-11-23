// Saisie au pavé, téléphone debout (correction du 23/11) : secteur entier (rapide) et secteur touché (précis).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { padModeOf, padRingFor, fastDefault, fastToggle, padPress, zonePress, preciseAim, PAD_MODES } from '../src/engine/padinput.js';
import { trainingDartError, zoneOf, approxPoint, realPoint, isHit, trainingDartLabel, heatCounts } from '../src/engine/training.js';

const dart = (mode, key, zone) => { const r = padPress(mode, key, { zone }); return r && r.dart; };

test('le réglage choisit le mode : seule padRing === true donne le secteur touché', () => {
  assert.equal(padModeOf(undefined), 'entier');
  assert.equal(padModeOf({}), 'entier', 'installation sans réglage : saisie rapide');
  assert.equal(padModeOf({ padRing: false }), 'entier');
  assert.equal(padModeOf({ padRing: 'oui' }), 'entier');
  assert.equal(padModeOf({ padRing: true }), 'touche');
  assert.deepEqual(PAD_MODES.map(padRingFor), [false, true]);
  for (const m of PAD_MODES) assert.equal(padModeOf({ padRing: padRingFor(m) }), m, 'aller-retour du réglage');
});

test('le réglage change bien le comportement de la même touche', () => {
  const settingsOff = { padRing: false }, settingsOn = { padRing: true };
  assert.deepEqual(padPress(padModeOf(settingsOff), '20', { zone: 's' }), { dart: { segment: 20, multiplier: 1 } });
  assert.deepEqual(padPress(padModeOf(settingsOn), '20', { zone: 's' }), { pick: 20 });
});

test('secteur entier : simple, double, triple d\'un appui, sans couronne', () => {
  assert.deepEqual(dart('entier', '20', 's'), { segment: 20, multiplier: 1 });
  assert.deepEqual(dart('entier', 16, 'd'), { segment: 16, multiplier: 2 });
  assert.deepEqual(dart('entier', '19', 't'), { segment: 19, multiplier: 3 });
  assert.deepEqual(dart('entier', '1', undefined), { segment: 1, multiplier: 1 }, 'simple par défaut');
  for (const z of ['s', 'd', 't']) {
    const d = dart('entier', '7', z);
    assert.equal('ring' in d, false, 'jamais de couronne');
    assert.equal(trainingDartError(d), null);
  }
  assert.equal(padPress('entier', '21', { zone: 's' }), null);
  assert.equal(padPress('entier', 'x', { zone: 's' }), null);
});

test('secteur entier : hors cible, bull et demi-bull comme avant', () => {
  for (const z of ['s', 'd', 't']) {
    assert.deepEqual(dart('entier', '0', z), { segment: 0, multiplier: 1 });
    assert.deepEqual(dart('entier', '50', z), { segment: 25, multiplier: 2 });
  }
  assert.deepEqual(dart('entier', '25', 's'), { segment: 25, multiplier: 1 });
  assert.deepEqual(dart('entier', '25', 'd'), { segment: 25, multiplier: 2 }, 'D armé + 25 = 50');
  assert.equal(padPress('entier', '25', { zone: 't' }), null, 'pas de triple bull');
});

test('secteur entier : zone armée d\'office et barre S / D / T', () => {
  assert.equal(fastDefault('t'), 't');
  assert.equal(fastDefault('d'), 'd');
  for (const z of ['any', 's', 'si', 'se', null, undefined]) assert.equal(fastDefault(z), 's');
  assert.equal(fastToggle(null, 'd', 's'), 'd');
  assert.equal(fastToggle('d', 'd', 's'), null, 'D touché deux fois : retour au simple');
  assert.equal(fastToggle('d', 't', 's'), 't');
  assert.equal(fastToggle('t', 's', 's'), null);
  assert.equal(fastToggle(null, 't', 't'), 's', 'triple visé : T touché de nouveau arme le simple');
  assert.equal(fastToggle(null, 's', 't'), 's');
  assert.equal(fastToggle('d', 'z', 's'), 'd', 'touche inconnue ignorée');
});

test('secteur touché : le nombre, puis sa zone (couronne pour le simple seulement)', () => {
  assert.deepEqual(padPress('touche', '20'), { pick: 20 });
  assert.deepEqual(zonePress(20, 'in'), { segment: 20, multiplier: 1, ring: 'in' });
  assert.deepEqual(zonePress(20, 'out'), { segment: 20, multiplier: 1, ring: 'out' });
  assert.deepEqual(zonePress(20, 'd'), { segment: 20, multiplier: 2 });
  assert.deepEqual(zonePress(20, 't'), { segment: 20, multiplier: 3 });
  assert.deepEqual(zonePress(5, 's'), { segment: 5, multiplier: 1 });
  assert.equal(zonePress(20, 'x'), null);
  assert.equal(zonePress(25, 'in'), null);
  for (const z of ['in', 'out', 'd', 't']) assert.equal(trainingDartError(zonePress(3, z)), null);
  assert.equal(preciseAim('si'), 'in');
  assert.equal(preciseAim('se'), 'out');
  assert.equal(preciseAim('any'), null);
});

test('secteur touché : hors cible, bull et demi-bull d\'un appui, sans effet de la zone', () => {
  for (const z of ['s', 'd', 't']) {
    assert.deepEqual(dart('touche', '0', z), { segment: 0, multiplier: 1 });
    assert.deepEqual(dart('touche', '25', z), { segment: 25, multiplier: 1 });
    assert.deepEqual(dart('touche', '50', z), { segment: 25, multiplier: 2 });
  }
});

test('stats : simple sans couronne = point approché au milieu de sa case ; couronne gardée sinon', () => {
  const fast = dart('entier', '20', 's');
  assert.equal(zoneOf(fast), 's');
  assert.equal(approxPoint(fast), true, 'mention d\'approximation');
  assert.equal(trainingDartLabel(fast), '20');
  // Même point qu'une saisie verticale sans couronne d'avant (les séances enregistrées ne changent pas).
  assert.deepEqual(realPoint(fast), realPoint({ segment: 20, multiplier: 1 }));
  assert.ok(isHit({ s: 20, z: 'any' }, fast) && isHit({ s: 20, z: 's' }, fast));
  const h = heatCounts([fast]);
  assert.equal(h.get('20', 'i'), 0.5);
  assert.equal(h.get('20', 'o'), 0.5);
  const precise = zonePress(20, 'out');
  assert.equal(zoneOf(precise), 'se');
  assert.equal(trainingDartLabel(precise), '20 EXT.');
  assert.ok(isHit({ s: 20, z: 'se' }, precise));
  assert.notDeepEqual(realPoint(precise), realPoint(fast));
  // Double et triple : même point dans les deux modes.
  assert.deepEqual(realPoint(dart('entier', '20', 't')), realPoint(zonePress(20, 't')));
  assert.deepEqual(realPoint(dart('entier', '20', 'd')), realPoint(zonePress(20, 'd')));
});
