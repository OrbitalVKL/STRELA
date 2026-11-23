// Lot 8 du 23/11/2026, sections 6 à 9 : modes de l'application, export pour une IA, sauvegarde complète (soirée en
// cours, derniers choix), mise à jour (coquille), page et guide d'installation. Les parcours en vraie appli sont dans
// tests/lot8-appli-parcours.test.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAiExport, aiFileName, COACH_PROMPT } from '../src/engine/aiexport.js';
import { trend } from '../src/engine/trends.js';
import { makeBackup, parseBackup, importPlan } from '../src/data/backup.js';
import { installSteps, installGuideHtml, APK_LATEST, INSTALL_PAGE } from '../src/ui/installguide.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('export pour une IA (8.2)', () => {
  const now = new Date(2026, 10, 23, 21, 5).getTime();
  const base = {
    now, player: { name: 'Guillaume', level: 'DÉBUTANT' }, period: '30 derniers jours', source: 'deux',
    sets: [{ name: '22 g torpedo', summary: '22 g · torpedo' }],
    summary: { sessions: 2, darts: 18, dist: 42, spread: 31, rate: 0.5, approx: 9, noPos: 1 },
    trends: [{ name: 'Toutes', n: 5, prec: trend([50, 45, 40, 35], -1), spread: trend([30, 30]) }],
    exercises: [{ name: 'Groupement', n: 2, last: '44 %', best: '56 %', goal: '50 %' }],
    sessions: [{ at: now - 86400000, title: 'Groupement', sets: '22 g torpedo', darts: 9, result: '44 % (dans la cible)', dist: 42, spread: 31, rate: 0.44, bias: 'à gauche du 20 (2,1 cm en moyenne)', entry: 'pavé', notes: 'fatigué | tard', dartsText: '20 INT. T20 HORS' }],
    games: { n: 1, average: 41.2, tripleRate: 0.1, doubleRate: 0.05, finishRate: 0.2, list: [{ at: now - 3600000, label: '501 double · 3 joueurs', average: 41.2, result: 'gagnée' }] },
    badges: [{ name: 'Assidu', tier: 0, value: '2' }],
  };
  test('un seul fichier : le prompt en tête, puis les données lisibles', () => {
    const t = buildAiExport(base);
    assert.ok(t.startsWith('# Strela — données pour une analyse de coaching'));
    assert.ok(t.indexOf(COACH_PROMPT) > 0 && t.indexOf(COACH_PROMPT) < t.indexOf('## Joueur'), 'le prompt avant les données');
    assert.match(t, /- Pseudo : Guillaume/, 'pseudo tel quel');
    assert.match(t, /- Période : 30 derniers jours/);
    assert.match(t, /entraînement et soirée/);
    assert.match(t, /Précision \(écart moyen au point visé\) : 4,2 cm/);
    assert.match(t, /Approximation : 9 fléchette\(s\) saisie\(s\) au pavé/, 'approximation de la saisie au pavé signalée');
    assert.match(t, /\| Toutes \| 5 \| 4,3 \| en progrès \|/);
    assert.match(t, /\| Groupement \| 22 g torpedo \| 9 \| 44 % \(dans la cible\) \| 4,2 \| 3,1 \| 44 % \| à gauche du 20/);
    assert.match(t, /20 INT\. T20 HORS \(note : fatigué \| tard\)/);
    assert.match(t, /## Soirée : parties X01/);
    assert.match(t, /\| 501 double · 3 joueurs \| 41,2 \| gagnée \|/);
    assert.ok(!/\| fatigué \| tard/.test(t.split('### Séances')[1].split('###')[0]), 'une barre dans une note ne casse pas un tableau');
  });
  test('suit la source choisie ; nom de fichier accepté par l\'appli', () => {
    const t = buildAiExport({ ...base, source: 'parties', games: null });
    assert.match(t, /soirée \(parties\) seulement/);
    assert.ok(!/## Entraînement : résumé/.test(t));
    assert.equal(aiFileName(now), 'strela-analyse-20261123-2105.md');
    const bridge = read('android/app/src/main/java/fr/orbitalvkl/strela/Bridge.java');
    assert.match(bridge, /strela-analyse-\[0-9\]\{8\}-\[0-9\]\{4\}\\\\\.md/);
    assert.match(bridge, /fiche\|soiree\|resume\|entrainement/, 'feuille d\'entraînement acceptée');
  });
});

describe('sauvegarde complète (8.1)', () => {
  test('soirée en cours et derniers choix de l\'entraînement exportés et relus', () => {
    const soiree = { id: 's1', startedAt: 1, players: ['p1'], drinks: {} };
    const trSetup = { player: 'p1', setId: 'ds-torpedo-22', mode: 'coach' };
    const b = makeBackup({ players: [{ id: 'p1', name: 'A', avatar: { kind: 'initials', color: 0 } }], games: [], current: null, display: { theme: 'auto', modes: { train: true, soiree: false }, heatScale: 'couleur' }, lastSetup: null, trainings: [], dartSets: [], soiree, trSetup }, { app: 't' });
    assert.deepEqual(b.settings.training, trSetup);
    assert.equal(b.settings.soiree.id, 's1');
    const back = parseBackup(JSON.stringify(b));
    assert.equal(back.settings.soiree.id, 's1');
    assert.deepEqual(back.settings.training, trSetup);
    const plan = importPlan({ players: [], games: [], current: null, display: {}, lastSetup: null, trainings: [], training: null, dartSets: [] }, back, 'replace');
    assert.ok(plan.ops.some(o => o.store === 'settings' && o.key === 'soiree'));
    assert.ok(plan.ops.some(o => o.store === 'settings' && o.key === 'training'));
    assert.equal(plan.state.display.heatScale, 'couleur', 'réglages d\'affichage (modes, échelle) gardés');
    // Une sauvegarde d'avant (sans ces champs) se relit toujours.
    const old = makeBackup({ players: [], games: [], current: null, display: null, lastSetup: null }, { app: 't' });
    assert.equal(parseBackup(JSON.stringify(old)).settings.soiree, null);
  });
});

describe('mise à jour (7.2) et installation (9.1, 9.2)', () => {
  test('la coquille cherche à chaque ouverture et repère une version importante', () => {
    const u = read('android/app/src/github/java/fr/orbitalvkl/strela/Updater.java');
    assert.match(u, /MIN_GAP = 10L \* 60 \* 1000/);
    assert.match(u, /contains\("\[important\]"\)/);
    assert.match(u, /u\.put\("important"/);
  });
  test('lien stable, page publiée avec la version, guide en images partagé avec l\'appli', () => {
    assert.equal(APK_LATEST, 'https://github.com/OrbitalVKL/STRELA/releases/latest/download/strela.apk');
    assert.equal(INSTALL_PAGE, 'https://orbitalvkl.github.io/STRELA/installer.html');
    const steps = installSteps();
    assert.equal(steps.length, 4);
    for (const s of steps) assert.match(s.svg, /^<svg class="igph"/);
    assert.match(steps.map(s => s.text).join(' '), /Autoriser cette source/);
    assert.match(steps.map(s => s.text).join(' '), /INSTALLER SANS ANALYSER/);
    assert.match(installGuideHtml({ version: '0.17.0' }), /TÉLÉCHARGER STRELA · v0\.17\.0/);
    const page = read('installer.html');
    assert.match(page, /<!--@version-->/);
    assert.match(page, /import \{ installGuideHtml \} from '\.\/src\/ui\/installguide\.js'/);
    assert.match(read('tools/build-site.mjs'), /installer\.html/);
    assert.match(read('.github/workflows/apk.yml'), /gh release create "\$TAG" strela\.apk/, 'chaque version publiée en release (la plus récente = latest)');
  });
});
