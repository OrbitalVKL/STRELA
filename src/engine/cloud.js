// Strela — compte en ligne (lot 10), JS pur sans réseau ni DOM (tests/cloud.test.js).
//
// Compte invisible : au premier lancement, le téléphone tire un identifiant de profil (UUID) et un secret ; ils sont
// rangés dans les réglages (`settings.cloudAccount`), donc dans la sauvegarde et l'export. La base en ligne
// (supabase/schema.sql) ne garde que l'empreinte du secret ; une connexion anonyme Supabase (une par téléphone, ou
// après réinstallation) se rattache au profil en donnant le secret (strela_compte). Le code de récupération affiché
// dans Réglages › Compte et amis contient l'identifiant et le secret : le retaper sur un autre téléphone y ramène le
// compte.

/** Format des données envoyées en ligne (colonne fmt) : à augmenter quand leur forme change, sans casser l'ancienne. */
export const CLOUD_FORMAT = 1;

const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');

function randomBytes(n, rand = null) {
  const b = new Uint8Array(n);
  if (rand) { for (let i = 0; i < n; i++) b[i] = Math.floor(rand() * 256) & 255; return b; }
  try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256); }
  return b;
}

/** UUID version 4 (identifiant de profil). */
export function newUuid(rand = null) {
  const b = randomBytes(16, rand);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export const isUuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);

// Base 32 de Crockford (sans I, L, O, U) : se lit et se retape sans ambiguïté.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function toB32(bytes) {
  let bits = 0, v = 0, out = '';
  for (const x of bytes) {
    v = (v << 8) | x; bits += 8;
    while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; }
    v &= (1 << bits) - 1;
  }
  if (bits) out += B32[(v << (5 - bits)) & 31];
  return out;
}
function fromB32(s, n) {
  const out = [];
  let bits = 0, v = 0;
  for (const c of s) {
    const i = B32.indexOf(c);
    if (i < 0) return null;
    v = (v << 5) | i; bits += 5;
    if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; v &= (1 << bits) - 1; }
  }
  if (v !== 0) return null; // bits de remplissage du dernier caractère : toujours nuls
  return out.length >= n ? Uint8Array.from(out.slice(0, n)) : null;
}

/** Secret du compte : 12 octets en base 32 (20 caractères). */
export const newSecret = (rand = null) => toB32(randomBytes(12, rand));
export const isSecret = x => typeof x === 'string' && /^[0-9A-HJKMNP-TV-Z]{20}$/.test(x) && fromB32(x, 12) !== null;

/** Compte tel que rangé dans les réglages, ou null s'il est illisible : { profileId, secret, createdAt }. */
export function cloudAccountRecord(x) {
  if (!x || typeof x !== 'object' || !isUuid(x.profileId) || !isSecret(x.secret)) return null;
  return { profileId: x.profileId, secret: x.secret, createdAt: Number.isFinite(x.createdAt) ? x.createdAt : 0 };
}

export const newCloudAccount = (now = Date.now(), rand = null) => ({ profileId: newUuid(rand), secret: newSecret(rand), createdAt: now });

/** CRC-8 (polynôme 0x07) : repère toute faute qui touche moins de 8 bits d'affilée, donc tout caractère mal tapé. */
function checksum(bytes) {
  let c = 0;
  for (const x of bytes) { c ^= x; for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255; }
  return c;
}

/**
 * Code de récupération : identifiant (16 octets) + secret (12 octets) + contrôle (1 octet), en base 32, par groupes de
 * 5 (47 caractères, 10 groupes). Une faute de frappe est presque toujours repérée par le contrôle.
 */
export function recoveryCode(account) {
  const a = cloudAccountRecord(account);
  if (!a) return null;
  const id = a.profileId.replace(/-/g, '');
  const bytes = [];
  for (let i = 0; i < 32; i += 2) bytes.push(parseInt(id.slice(i, i + 2), 16));
  bytes.push(...fromB32(a.secret, 12));
  bytes.push(checksum(bytes));
  return toB32(bytes).match(/.{1,5}/g).join('-');
}

/** Code de récupération tapé → { profileId, secret }, ou null (mauvaise longueur, faute de frappe). */
export function parseRecoveryCode(text) {
  const s = String(text || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== 47) return null;
  const b = fromB32(s, 29);
  if (!b) return null;
  const body = [...b.slice(0, 28)];
  if (checksum(body) !== b[28]) return null;
  const h = hex(body.slice(0, 16));
  const profileId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  const secret = toB32(body.slice(16, 28));
  return isUuid(profileId) && isSecret(secret) ? { profileId, secret } : null;
}

/** Code d'ami tapé (6 caractères, même alphabet que les salons en ligne) → code propre, ou null. */
const FRIEND_CHARS = '23456789BCDFGHJKMNPQRSTVWXZ';
export function cleanFriendCode(text) {
  const s = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 6 && [...s].every(c => FRIEND_CHARS.includes(c)) ? s : null;
}

/**
 * Configuration du serveur : { url, key } propres, ou null si elle n'est pas remplie (valeurs factices de
 * src/net/cloudconfig.js tant que Guillaume n'a pas donné l'adresse du projet et sa clé publique).
 */
export function cleanCloudConfig(c) {
  if (!c || typeof c !== 'object') return null;
  const url = String(c.url || '').trim().replace(/\/+$/, '');
  const key = String(c.key || '').trim();
  if (!/^https?:\/\/[^\s/]+/.test(url) || key.length < 20) return null;
  return { url, key };
}

/** « il y a 2 h », « à l'instant »… (dernière synchronisation, dernière activité d'un ami). */
export function agoText(t, now = Date.now()) {
  if (!Number.isFinite(t) || t <= 0) return 'jamais';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'à l\'instant';
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `il y a ${d} jour${d > 1 ? 's' : ''}`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `il y a ${mo} mois` : 'il y a plus d\'un an';
}

// ------------------------------------------------------------------ amis (étape 2)
/** Avatar reçu d'un ami, nettoyé (rien d'autre que ce que l'appli sait dessiner). */
export function cleanAvatar(a) {
  const out = { kind: 'initials', color: 0 };
  if (!a || typeof a !== 'object') return out;
  if (Number.isInteger(a.color) && a.color >= 0 && a.color < 64) out.color = a.color;
  if (a.kind === 'icon' && typeof a.icon === 'string' && /^[a-z0-9-]{1,30}$/.test(a.icon)) { out.kind = 'icon'; out.icon = a.icon; }
  if (a.kind === 'photo' && typeof a.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a.photo) && a.photo.length <= 400000) { out.kind = 'photo'; out.photo = a.photo; }
  return out;
}

const ms = t => { const x = typeof t === 'number' ? t : Date.parse(t); return Number.isFinite(x) ? x : 0; };

/**
 * Ligne de strela_amis (ou de strela_demander_ami) → { id, name, avatar, anim, sets, seen, state, dir, since, fmt },
 * ou null si elle est illisible. state : 'attente' | 'acceptee' | 'refusee' ; dir : 'recue' | 'envoyee'.
 */
export function friendFromServer(x) {
  if (!x || typeof x !== 'object' || !isUuid(x.id)) return null;
  const state = ['attente', 'acceptee', 'refusee'].includes(x.etat) ? x.etat : 'attente';
  return {
    id: x.id,
    name: (typeof x.pseudo === 'string' && x.pseudo.trim() ? x.pseudo.trim() : 'Joueur sans nom').slice(0, 40),
    avatar: cleanAvatar(x.avatar),
    anim: typeof x.anim === 'string' ? x.anim.slice(0, 40) : null,
    sets: Array.isArray(x.jeux) ? x.jeux.filter(s => s && typeof s === 'object').slice(0, 30) : [],
    seen: ms(x.vu_le),
    state,
    dir: x.sens === 'envoyee' ? 'envoyee' : 'recue',
    since: ms(x.depuis),
    fmt: Number.isInteger(x.fmt) ? x.fmt : 1,
  };
}

/** Identifiant local d'un ami (joueur rangé dans « players ») : « u:<uuid> ». */
export const friendPlayerId = uuid => `u:${uuid}`;

/** Lien vers un code d'ami (QR code, partage) : page rejoindre.html, qui ouvre l'appli sur la demande. */
export const friendUrl = (code, base = 'https://orbitalvkl.github.io/STRELA/') => `${base}rejoindre.html#${code}`;
