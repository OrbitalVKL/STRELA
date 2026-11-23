// Strela — export pour une analyse par une IA (lot 8 du 23/11/2026, 8.2). JS pur, sans DOM : un seul fichier texte
// (Markdown), un prompt de coaching en tête, puis les données dans une forme qu'un modèle lit sans peine (listes, tableaux,
// et les fléchettes de chaque séance en notation courte). Les pseudos restent tels quels (pas d'anonymisation, demande de
// Guillaume) ; les approximations de la saisie au pavé sont signalées.
// Les chiffres sont préparés par l'écran des stats (mêmes filtres : période, source) ; ici, seulement la mise en forme.

const dec1 = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const cm = mm => (mm === null || mm === undefined || !Number.isFinite(mm) ? '—' : dec1(mm / 10));
const pct = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${Math.round(v * 100)} %`);
const cell = s => String(s ?? '—').replace(/\|/g, '/').replace(/\n/g, ' ');
const row = cells => `| ${cells.map(cell).join(' | ')} |`;
const pad2 = n => String(n).padStart(2, '0');
export const isoDate = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const isoTime = ms => { const d = new Date(ms); return `${isoDate(ms)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
/** Nom du fichier : strela-analyse-AAAAMMJJ-HHMM.md (accepté par l'appli Android, Bridge.saveFile). */
export const aiFileName = ms => { const d = new Date(ms); return `strela-analyse-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}.md`; };

/** Prompt de coaching, en tête du fichier. */
export const COACH_PROMPT = `Tu es un coach de fléchettes (steel-tip, cible réglementaire, 2,37 m). Les données ci-dessous viennent de l'appli Strela : les séances d'entraînement de ce joueur (exercices sur une cible imposée, jeux de cible, X01 et Cricket joués seul) et, s'il y en a, ses parties en soirée.

Analyse-les et réponds en français, simplement, comme à un joueur amateur :
1. Ce qui va bien (chiffres à l'appui).
2. Les défauts qui reviennent : de quel côté partent les fléchettes (écart moyen), groupement, régularité, finition.
3. Ce qui progresse ou recule sur la période (tendances).
4. Un plan pour les deux semaines à venir : 3 à 5 exercices précis (nom, nombre de fléchettes, objectif chiffré), en t'appuyant si possible sur les exercices de l'appli.
5. Si plusieurs jeux de fléchettes sont utilisés : lequel semble le mieux lui convenir, et pourquoi.

À savoir pour lire les chiffres :
- Distances en centimètres, mesurées sur une cible réglementaire. « Précision » = distance moyenne entre la fléchette et le point visé (plus c'est petit, mieux c'est) ; « groupement » = distance moyenne des fléchettes à leur propre centre.
- « Dans la cible » = part des fléchettes dans la zone visée (secteur, triple, double…).
- Saisie « pavé » : le joueur a seulement indiqué la case touchée ; la fléchette est alors placée au centre de sa case, donc distances et groupement sont approchés. Saisie « cible » : point exact posé au doigt. Un hors cible saisi au pavé n'a pas de distance.
- Notation des fléchettes : « 20 INT. » simple intérieur du 20, « 20 EXT. » simple extérieur, « T20 » triple, « D16 » double, « 25 », « 50 » (centre), « HORS » à côté.`;

/**
 * Fichier complet.
 *   d : { now, player: { name, level }, period, source ('entrainements' | 'parties' | 'deux'), sets: [{ name, summary }],
 *         summary: { sessions, darts, dist, spread, rate, approx, noPos }, trends: [{ name, n, prec, spread }] (trend()),
 *         exercises: [{ name, n, last, best, goal }], sessions: [{ at, title, sets, darts, result, dist, spread, rate,
 *         bias, entry ('pavé' | 'cible' | 'mixte'), notes?, dartsText }], games: { n, average, tripleRate, doubleRate,
 *         finishRate, list: [{ at, label, average, result }] } | null, badges: [{ name, tier, value }] }
 */
export function buildAiExport(d) {
  const L = [];
  L.push('# Strela — données pour une analyse de coaching', '');
  L.push('## Consigne pour l\'IA', '', COACH_PROMPT, '');
  L.push('## Joueur', '');
  L.push(`- Pseudo : ${d.player.name}`);
  if (d.player.level) L.push(`- Niveau dans l'appli : ${d.player.level}`);
  L.push(`- Période : ${d.period}`);
  L.push(`- Données : ${d.source === 'parties' ? 'soirée (parties) seulement' : d.source === 'deux' ? 'entraînement et soirée' : 'entraînement seulement'}`);
  L.push(`- Exporté le : ${isoTime(d.now)}`, '');
  if (d.sets && d.sets.length) {
    L.push('## Jeux de fléchettes', '');
    for (const s of d.sets) L.push(`- ${s.name}${s.summary ? ` : ${s.summary}` : ''}`);
    L.push('');
  }
  if (d.source !== 'parties' && d.summary) {
    const s = d.summary;
    L.push('## Entraînement : résumé', '');
    L.push(`- Séances : ${s.sessions} ; fléchettes : ${s.darts}`);
    L.push(`- Précision (écart moyen au point visé) : ${cm(s.dist)} cm`);
    L.push(`- Groupement moyen : ${cm(s.spread)} cm`);
    L.push(`- Dans la cible : ${pct(s.rate)}`);
    if (s.approx || s.noPos) L.push(`- Approximation : ${s.approx} fléchette(s) saisie(s) au pavé, placée(s) au centre de leur case (distances approchées) ; ${s.noPos} hors cible au pavé, sans distance.`);
    L.push('');
    if (d.trends && d.trends.length) {
      L.push('### Tendances (10 dernières séances de la période ; flèche si la progression dépasse 5 %)', '');
      L.push(row(['Exercice', 'Séances', 'Précision (cm)', 'Tendance', 'Groupement (cm)', 'Tendance']), row(['---', '---', '---', '---', '---', '---']));
      const tw = t => (!t || t.arrow === null ? 'pas assez de séances' : t.arrow === 'flat' ? 'stable' : t.better ? 'en progrès' : 'en recul');
      for (const t of d.trends) L.push(row([t.name, t.n, cm(t.prec.mean), tw(t.prec), cm(t.spread.mean), tw(t.spread)]));
      L.push('');
    }
    if (d.exercises && d.exercises.length) {
      L.push('### Par exercice', '');
      L.push(row(['Exercice', 'Séances', 'Dernier résultat', 'Meilleur', 'Objectif du niveau']), row(['---', '---', '---', '---', '---']));
      for (const e of d.exercises) L.push(row([e.name, e.n, e.last, e.best, e.goal || '—']));
      L.push('');
    }
    if (d.sessions && d.sessions.length) {
      L.push('### Séances (de la plus ancienne à la plus récente)', '');
      L.push(row(['Date', 'Séance', 'Jeu', 'Fl.', 'Résultat', 'Précision (cm)', 'Groupement (cm)', 'Dans la cible', 'Écart principal', 'Saisie']));
      L.push(row(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---']));
      for (const x of d.sessions) L.push(row([isoTime(x.at), x.title, x.sets, x.darts, x.result, cm(x.dist), cm(x.spread), pct(x.rate), x.bias || '—', x.entry]));
      L.push('', '### Fléchettes de chaque séance', '');
      for (const x of d.sessions) L.push(`- ${isoTime(x.at)} · ${x.title} : ${x.dartsText}${x.notes ? ` (note : ${x.notes})` : ''}`);
      L.push('');
    }
  }
  if (d.games && d.games.n) {
    const g = d.games;
    L.push('## Soirée : parties X01', '');
    L.push(`- Parties : ${g.n} ; moyenne sur 3 fléchettes : ${dec1(g.average)} ; triples : ${pct(g.tripleRate)} ; doubles : ${pct(g.doubleRate)}${g.finishRate !== undefined && g.finishRate !== null ? ` ; finition au double : ${pct(g.finishRate)}` : ''}`, '');
    L.push(row(['Date', 'Partie', 'Moyenne', 'Résultat']), row(['---', '---', '---', '---']));
    for (const x of g.list) L.push(row([isoTime(x.at), x.label, dec1(x.average), x.result]));
    L.push('');
  }
  if (d.badges && d.badges.length) {
    L.push('## Badges d\'entraînement', '');
    for (const b of d.badges) L.push(`- ${b.name} : ${b.tier || 'pas encore'} (${b.value})`);
    L.push('');
  }
  return L.join('\n');
}
