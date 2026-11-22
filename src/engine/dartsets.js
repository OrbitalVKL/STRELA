// Strela — jeux de fléchettes (« armurerie », lot 8) : modèles prédéfinis, forme d'un jeu enregistré, résumé.
// JS pur, sans dépendance ni affichage (testé dans node).
//
// Un jeu = { id, name, weight (g), barrelWeight? (g), shape, material, tungsten? (%), grip, length? (mm, empennage
// compris), shaft, shaftMat, flight, flightMm? (épaisseur, mm), point, archived, createdAt, model? (clé du modèle de
// départ) }. Tout est facultatif sauf id, name et createdAt : un champ inconnu ou hors liste est retiré (null).

/** Listes de choix (clé enregistrée → libellé affiché). L'ordre est celui de l'écran. */
export const CHOICES = Object.freeze({
  shape: Object.freeze({ droit: 'Droit', torpedo: 'Torpedo', bombe: 'Bombé', fusele: 'Fuselé' }),
  material: Object.freeze({ laiton: 'Laiton', nickel: 'Nickel-argent', tungstene: 'Tungstène' }),
  grip: Object.freeze({ lisse: 'Lisse', anneaux: 'Anneaux', molete: 'Moleté', rainures: 'Rainures' }),
  shaft: Object.freeze({ courte: 'Courte', intermediaire: 'Intermédiaire', moyenne: 'Moyenne', longue: 'Longue' }),
  shaftMat: Object.freeze({ nylon: 'Nylon', alu: 'Aluminium', carbone: 'Carbone', rotative: 'Rotative' }),
  flight: Object.freeze({ standard: 'Standard', slim: 'Slim', kite: 'Kite', pear: 'Pear', petit: 'Petit standard' }),
  point: Object.freeze({ acier: 'Acier', souple: 'Souple' }),
});

/** Champs numériques : bornes acceptées (au-delà : retiré). */
export const NUMBERS = Object.freeze({
  weight: [5, 60], barrelWeight: [1, 60], tungsten: [1, 100], length: [40, 250], flightMm: [0.01, 5],
});

const num = (v, [lo, hi]) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : null;
};
const pick = (v, list) => (typeof v === 'string' && Object.hasOwn(list, v) ? v : null);

/** Jeu tel qu'enregistré (champs nettoyés), ou null s'il est illisible (ni identifiant, ni nom). */
export function dartSetRecord(x) {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id) return null;
  const name = typeof x.name === 'string' ? x.name.trim().slice(0, 40) : '';
  if (!name) return null;
  const rec = { id: x.id, name, archived: !!x.archived, createdAt: Number.isFinite(x.createdAt) ? x.createdAt : 0 };
  for (const [k, range] of Object.entries(NUMBERS)) { const v = num(x[k], range); if (v !== null) rec[k] = v; }
  for (const [k, list] of Object.entries(CHOICES)) { const v = pick(x[k], list); if (v) rec[k] = v; }
  if (rec.material !== 'tungstene') delete rec.tungsten;
  if (typeof x.model === 'string' && Object.hasOwn(MODELS, x.model)) rec.model = x.model;
  return rec;
}

/** Modèles fournis dans l'appli (cahier des charges du lot 8) : point de départ d'un nouveau jeu. */
export const MODELS = Object.freeze({
  'torpedo-22': { name: '22 g torpedo', weight: 22, shape: 'torpedo', length: 161, material: 'tungstene', tungsten: 90, grip: 'anneaux', shaft: 'intermediaire', shaftMat: 'nylon', flight: 'standard', point: 'acier' },
  'droit-22': { name: '22 g fût droit', weight: 22, shape: 'droit', length: 135, material: 'tungstene', tungsten: 90, grip: 'molete', shaft: 'courte', shaftMat: 'nylon', flight: 'standard', point: 'acier' },
  'droit-18': { name: '18 g fût droit léger', weight: 18, shape: 'droit', material: 'tungstene', tungsten: 80, grip: 'lisse', shaft: 'moyenne', shaftMat: 'nylon', flight: 'standard', point: 'acier' },
  'droit-24': { name: '24 g fût droit', weight: 24, shape: 'droit', material: 'tungstene', tungsten: 90, grip: 'molete', shaft: 'courte', shaftMat: 'alu', flight: 'standard', point: 'acier' },
  'bombe-26': { name: '26 g bombé (avant lourd)', weight: 26, shape: 'bombe', material: 'laiton', grip: 'anneaux', shaft: 'courte', shaftMat: 'nylon', flight: 'standard', point: 'acier' },
  'fusele-20': { name: '20 g fuselé tungstène 90 %', weight: 20, shape: 'fusele', material: 'tungstene', tungsten: 90, grip: 'rainures', shaft: 'intermediaire', shaftMat: 'carbone', flight: 'slim', point: 'acier' },
});

/** Jeux de Guillaume, créés une fois par la migration de la base vers la version 3 (lot 8). */
export const SEED_SETS = Object.freeze([
  Object.freeze({ id: 'ds-torpedo-22', name: '22 g torpedo', weight: 22, shape: 'torpedo', length: 161, flight: 'standard', flightMm: 0.1, point: 'acier', archived: false, createdAt: 1795305600000, model: 'torpedo-22' }),
  Object.freeze({ id: 'ds-droit-22', name: '22 g fût droit', weight: 22, shape: 'droit', length: 135, flight: 'standard', flightMm: 0.1, point: 'acier', archived: false, createdAt: 1795305600001, model: 'droit-22' }),
]);

const fr = n => String(n).replace('.', ',');

/** Résumé court d'un jeu : « 22 g · torpedo · 161 mm · tungstène 90 % ». */
export function dartSetSummary(s) {
  if (!s) return '';
  const parts = [];
  if (s.weight) parts.push(`${fr(s.weight)} g`);
  if (s.shape) parts.push(CHOICES.shape[s.shape].toLowerCase());
  if (s.length) parts.push(`${fr(s.length)} mm`);
  if (s.material) parts.push(`${CHOICES.material[s.material].toLowerCase()}${s.material === 'tungstene' && s.tungsten ? ` ${fr(s.tungsten)} %` : ''}`);
  if (s.flight) parts.push(`empennage ${CHOICES.flight[s.flight].toLowerCase()}${s.flightMm ? ` ${fr(s.flightMm)} mm` : ''}`);
  return parts.join(' · ');
}
