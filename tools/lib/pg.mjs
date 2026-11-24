// Strela — Postgres local des tests (lot 10) : une base jetable avec ce qu'il faut de Supabase (schéma auth, rôles,
// auth.uid()) pour jouer supabase/schema.sql pour de vrai. Sans Postgres installé (pas de /usr/lib/postgresql/*/bin),
// pgAvailable() est faux et les tests qui en ont besoin sont sautés.
//
// Connexion : socket Unix dans un dossier temporaire ; sous root (sessions Claude), tout tourne sous l'utilisateur
// « postgres » (initdb refuse root) ; en CI (utilisateur runner), directement.

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, existsSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function pgBin() {
  const base = '/usr/lib/postgresql';
  if (!existsSync(base)) return null;
  const v = readdirSync(base).filter(d => existsSync(join(base, d, 'bin', 'initdb'))).sort((a, b) => Number(b) - Number(a))[0];
  return v ? join(base, v, 'bin') : null;
}
export const pgAvailable = () => !!pgBin() && process.env.STRELA_SANS_PG !== '1';

const isRoot = () => typeof process.getuid === 'function' && process.getuid() === 0;
const asPg = (cmd, args) => (isRoot() ? ['runuser', ['-u', 'postgres', '--', cmd, ...args]] : [cmd, args]);

/** Ce qui remplace Supabase dans la base de test : rôles, schéma auth et auth.uid() (lu dans request.jwt.claims). */
export const SUPABASE_STUB = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, is_anonymous boolean default true, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;
`;

/** Appel d'une fonction comme PostgREST, créé après le schéma (qui retire les droits d'exécution par défaut). */
export const TEST_RPC = `
-- Appel d'une fonction comme PostgREST (/rest/v1/rpc/<nom>, corps JSON aux noms des paramètres) : tests seulement.
create or replace function public.test_rpc(fn text, args jsonb) returns jsonb language plpgsql as $f$
declare
  sig record;
  parts text[] := '{}';
  i int;
  nm text;
  ty text;
  res jsonb;
begin
  select p.proargnames as names, p.proargtypes::regtype[] as types, p.pronargs as n into sig
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = fn limit 1;
  if sig is null then raise exception 'fonction inconnue %', fn using errcode = '42883'; end if;
  for i in 1..coalesce(sig.n, 0) loop
    nm := sig.names[i]; ty := sig.types[i - 1]::text;
    if not (args ? nm) then continue; end if;
    if ty = 'jsonb' then parts := parts || format('%I => %L::jsonb', nm, args->nm);
    elsif ty = 'text[]' then parts := parts || format('%I => array(select jsonb_array_elements_text(%L::jsonb))', nm, args->nm);
    elsif jsonb_typeof(args->nm) = 'null' then parts := parts || format('%I => null::%s', nm, ty);
    else parts := parts || format('%I => %L::%s', nm, args->>nm, ty);
    end if;
  end loop;
  execute format('select to_jsonb(public.%I(%s))', fn, array_to_string(parts, ', ')) into res;
  return res;
end $f$;
grant execute on function public.test_rpc(text, jsonb) to anon, authenticated, service_role;
`;

/**
 * Démarre une base jetable : { sql(text, { as, sub }) → sortie texte, stop() }. `as` : rôle (anon, authenticated,
 * service_role ; par défaut le superutilisateur) ; `sub` : identifiant de connexion (auth.uid()).
 */
export async function startPg({ schema = true } = {}) {
  const bin = pgBin();
  if (!bin) throw new Error('Postgres absent');
  const dir = mkdtempSync(join(tmpdir(), 'strela-pg-'));
  chmodSync(dir, 0o777);
  const data = join(dir, 'data');
  const run = (cmd, args) => { const [c, a] = asPg(join(bin, cmd), args); execFileSync(c, a, { stdio: 'pipe' }); };
  run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-sync', '-E', 'UTF8', '--locale=C']);
  const port = 20000 + Math.floor(Math.random() * 20000);
  run('pg_ctl', ['-D', data, '-w', '-l', join(dir, 'log.txt'), '-o', `-k ${dir} -p ${port} -c listen_addresses='' -c fsync=off`, 'start']);
  const psqlArgs = ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', String(port), '-U', 'postgres', '-d', 'postgres'];
  const sql = (text, { as = null, sub = null } = {}) => new Promise((resolve, reject) => {
    let body = text;
    if (as) {
      const claims = JSON.stringify(sub ? { sub, role: as } : { role: as });
      body = `begin;\nset local role ${as};\nselect set_config('request.jwt.claims', $c$${claims}$c$, true) \\g /dev/null\n${text};\ncommit;`;
    }
    const [c, a] = asPg(join(bin, 'psql'), psqlArgs);
    const p = spawn(c, a, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => (code === 0 ? resolve(out.trim()) : reject(Object.assign(new Error(err.trim() || `psql ${code}`), { stderr: err }))));
    p.stdin.end(body);
  });
  const stop = () => {
    try { run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']); } catch (e) { /* */ }
    try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* */ }
  };
  await sql(SUPABASE_STUB);
  if (schema) await sql(readFileSync(join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  await sql(TEST_RPC);
  return { sql, stop, port, dir };
}

/** Pour les tests : `pgAvailable()` sans lancer de base (spawnSync de initdb --version). */
export function pgWorks() {
  const bin = pgBin();
  if (!bin) return false;
  const r = spawnSync(join(bin, 'initdb'), ['--version']);
  return r.status === 0;
}
