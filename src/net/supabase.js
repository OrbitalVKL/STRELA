// Strela — client Supabase minimal (lot 10), sans bibliothèque : connexion anonyme (GoTrue), renouvellement du jeton,
// appels de fonctions (PostgREST /rest/v1/rpc/…). Rien d'autre : l'appli ne touche jamais les tables directement
// (supabase/schema.sql). Pur côté réseau : `fetch` est donné (tests : faux serveur, tools/lib/fake-supabase.mjs).
//
// Session : { userId, access, refresh, expiresAt (ms) } ; `onSession(session | null)` est appelé à chaque changement
// pour que l'appelant la range (réglage `cloudAuth`, jamais exporté).

/** Erreur d'un appel : kind 'reseau' (pas de réponse), 'serveur' (5xx, projet en veille), 'auth' (jeton refusé),
 *  'refus' (la fonction a refusé : code strela:…), 'http' (autre). */
export class CloudError extends Error {
  constructor(kind, message, { status = 0, code = '' } = {}) {
    super(message);
    this.name = 'CloudError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

/** Message lisible d'une erreur (Réglages, journal). */
export function cloudErrorText(e) {
  if (!e) return '';
  if (e.kind === 'reseau') return 'pas de réseau, ou serveur injoignable';
  if (e.kind === 'serveur') return `serveur indisponible (${e.status || '?'}) — en veille ?`;
  if (e.kind === 'auth') return 'connexion refusée par le serveur';
  if (e.kind === 'refus') return REFUS[e.code] || `refusé (${e.code || e.message})`;
  return e.message || String(e);
}
const REFUS = {
  refuse: 'ce compte appartient à un autre code de récupération',
  sans_compte: 'compte pas encore créé',
  code_inconnu: 'aucun joueur n\'a ce code',
  soi_meme: 'c\'est ton propre code',
  pas_de_demande: 'plus de demande à accepter',
  invalide: 'données refusées par le serveur',
  trop_gros: 'données trop grosses',
};

const isJwt = k => /^eyJ/.test(k);

export function supabaseClient({ url, key, fetch: fetchFn = globalThis.fetch, session = null, onSession = () => {}, timeout = 15000, now = () => Date.now() }) {
  let current = session && session.access ? { ...session } : null;
  let refreshing = null;

  async function http(path, { method = 'POST', body, token = null } = {}) {
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    // Clé « publishable » (sb_publishable_…) : seulement en apikey ; ancienne clé anon (JWT) : aussi en Authorization.
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (isJwt(key)) headers.Authorization = `Bearer ${key}`;
    let res;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
    try {
      res = await fetchFn(`${url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
    } catch (e) {
      throw new CloudError('reseau', String((e && e.message) || e));
    } finally { if (timer) clearTimeout(timer); }
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (res.ok) return data;
    const msg = (data && (data.message || data.msg || data.error_description || data.error)) || text || `HTTP ${res.status}`;
    const m = /strela:([a-z_]+)/.exec(String(msg));
    if (m) throw new CloudError('refus', String(msg), { status: res.status, code: m[1] });
    if (res.status >= 500) throw new CloudError('serveur', String(msg), { status: res.status });
    if (res.status === 401 || res.status === 403 || /JWT|jwt|token/.test(String(msg))) throw new CloudError('auth', String(msg), { status: res.status });
    throw new CloudError('http', String(msg), { status: res.status });
  }

  const fromAuth = d => {
    if (!d || !d.access_token) throw new CloudError('auth', 'réponse de connexion sans jeton');
    return { userId: (d.user && d.user.id) || '', access: d.access_token, refresh: d.refresh_token || '', expiresAt: now() + Math.max(60, Number(d.expires_in) || 3600) * 1000 };
  };
  const set = s => { current = s; try { onSession(s ? { ...s } : null); } catch (e) { /* */ } };

  /** Nouvelle connexion anonyme (nouvel utilisateur Supabase). */
  async function signInAnonymously() {
    set(fromAuth(await http('/auth/v1/signup', { body: { data: {} } })));
    return current;
  }

  /** Jeton renouvelé ; si le renouvellement est refusé, nouvelle connexion anonyme (l'appelant rattache le compte). */
  async function refresh() {
    if (!current || !current.refresh) return signInAnonymously();
    if (!refreshing) {
      refreshing = (async () => {
        try { set(fromAuth(await http('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: current.refresh } }))); return { renewed: true }; }
        catch (e) { if (e.kind === 'reseau' || e.kind === 'serveur') throw e; set(null); await signInAnonymously(); return { renewed: false }; }
        finally { refreshing = null; }
      })();
    }
    return refreshing;
  }

  /** Session valide (connexion ou renouvellement si besoin). Renvoie { fresh } : vrai si c'est un nouvel utilisateur. */
  async function ensureSession() {
    if (!current) { await signInAnonymously(); return { fresh: true }; }
    if (current.expiresAt - 60000 < now()) { const r = await refresh(); return { fresh: !r.renewed }; }
    return { fresh: false };
  }

  /** Appel d'une fonction strela_* (corps aux noms des paramètres). Un jeton refusé est renouvelé une fois. */
  async function rpc(name, args = {}) {
    await ensureSession();
    try { return await http(`/rest/v1/rpc/${name}`, { body: args, token: current.access }); }
    catch (e) {
      if (e.kind !== 'auth') throw e;
      await refresh();
      return http(`/rest/v1/rpc/${name}`, { body: args, token: current.access });
    }
  }

  /** Appel sans connexion (strela_ping). */
  const anonRpc = (name, args = {}) => http(`/rest/v1/rpc/${name}`, { body: args });

  return {
    rpc, anonRpc, ensureSession, signInAnonymously, refresh,
    get session() { return current ? { ...current } : null; },
    forget() { set(null); },
  };
}
