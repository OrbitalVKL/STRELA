-- Strela — base en ligne (lot 10) : comptes invisibles, amis, parties partagées, présence.
--
-- À coller tel quel dans Supabase › SQL Editor › New query › Run. Rejouable sans risque (tout est « if not exists »,
-- « create or replace » ou supprimé puis recréé) : une version plus récente de ce fichier se colle par-dessus.
--
-- Principe (docs/cloud.md) :
--   - l'appli ne touche jamais les tables directement : elle n'appelle que les fonctions strela_* ci-dessous
--     (« security definer »), qui vérifient qui appelle (auth.uid(), connexion anonyme) ;
--   - les tables ont la sécurité par ligne (RLS) activée : lecture de ses données et de celles de ses amis acceptés,
--     aucune écriture directe ;
--   - un compte = un profil (identifiant choisi par le téléphone, stable) ; plusieurs connexions anonymes (téléphones,
--     réinstallation) peuvent s'y rattacher avec le code secret de récupération (seule son empreinte est gardée ici).
-- Format des données envoyées : colonne fmt (1 aujourd'hui) ; une appli plus ancienne ignore ce qu'elle ne connaît pas.

-- ------------------------------------------------------------------ tables
create table if not exists public.profil (
  id uuid primary key,
  pseudo text not null default '' check (length(pseudo) <= 40),
  avatar jsonb not null default '{}'::jsonb,          -- { kind, icon?, color, photo? (data: URL, 300 ko au plus) }
  anim text,                                          -- animation de tour
  jeux jsonb not null default '[]'::jsonb,            -- jeux de fléchettes (armurerie)
  extra jsonb not null default '{}'::jsonb,           -- champs ajoutés par une version plus récente
  fmt int not null default 1,
  code_ami text not null unique,                      -- 6 caractères, pour s'ajouter en ami
  cree timestamptz not null default now(),
  maj timestamptz not null default now(),
  vu_le timestamptz                                   -- dernière activité
);

create table if not exists public.appareil (
  auth_uid uuid primary key,                          -- connexion anonyme Supabase (auth.users.id)
  profil uuid not null references public.profil(id) on delete cascade,
  cree timestamptz not null default now(),
  vu_le timestamptz
);
create index if not exists appareil_profil on public.appareil(profil);

create table if not exists public.profil_secret (
  profil uuid primary key references public.profil(id) on delete cascade,
  empreinte text not null                             -- sha256 du code de récupération (hexadécimal)
);

create table if not exists public.amitie (
  demandeur uuid not null references public.profil(id) on delete cascade,
  destinataire uuid not null references public.profil(id) on delete cascade,
  etat text not null default 'attente' check (etat in ('attente', 'acceptee', 'refusee')),
  cree timestamptz not null default now(),
  maj timestamptz not null default now(),
  primary key (demandeur, destinataire),
  check (demandeur <> destinataire)
);
create index if not exists amitie_destinataire on public.amitie(destinataire);

create table if not exists public.partie (
  id text primary key check (length(id) between 1 and 80),
  createur uuid not null references public.profil(id) on delete cascade,
  type text not null check (type in ('soiree', 'enligne', 'entrainement')),
  jeu text not null default '',                       -- x01, cricket, ou l'exercice d'entraînement
  fmt int not null default 1,
  etat text not null check (etat in ('terminee', 'abandonnee', 'supprimee')),
  debut timestamptz,
  fin timestamptz,
  donnees jsonb,                                      -- la partie telle que l'appli la range (null une fois supprimée)
  maj timestamptz not null default clock_timestamp()
);
create index if not exists partie_maj on public.partie(maj);
create index if not exists partie_createur on public.partie(createur);

create table if not exists public.participation (
  partie text not null references public.partie(id) on delete cascade,
  ordre int not null,
  profil uuid references public.profil(id) on delete set null,   -- joueur qui a un compte
  joueur_local text,                                              -- sinon : identifiant local chez le créateur
  resultat jsonb,
  primary key (partie, ordre)
);
create index if not exists participation_profil on public.participation(profil);

-- ------------------------------------------------------------------ droits
alter table public.profil enable row level security;
alter table public.appareil enable row level security;
alter table public.profil_secret enable row level security;
alter table public.amitie enable row level security;
alter table public.partie enable row level security;
alter table public.participation enable row level security;

revoke all on public.profil, public.appareil, public.profil_secret, public.amitie, public.partie, public.participation from anon, authenticated;
grant select on public.profil, public.amitie, public.partie, public.participation to authenticated;

-- Mon profil (null si ce téléphone n'a pas encore de compte).
create or replace function public.strela_moi() returns uuid
language sql stable security definer set search_path = public as $$
  select profil from public.appareil where auth_uid = auth.uid()
$$;

-- Moi et mes amis acceptés.
create or replace function public.strela_visibles() returns setof uuid
language sql stable security definer set search_path = public as $$
  select public.strela_moi() where public.strela_moi() is not null
  union
  select case when a.demandeur = public.strela_moi() then a.destinataire else a.demandeur end
    from public.amitie a
   where a.etat = 'acceptee' and public.strela_moi() in (a.demandeur, a.destinataire)
$$;

drop policy if exists profil_lecture on public.profil;
create policy profil_lecture on public.profil for select to authenticated using (
  id in (select public.strela_visibles())
  or exists (select 1 from public.amitie a where a.etat = 'attente'
             and ((a.demandeur = profil.id and a.destinataire = public.strela_moi())
               or (a.destinataire = profil.id and a.demandeur = public.strela_moi())))
);
drop policy if exists amitie_lecture on public.amitie;
create policy amitie_lecture on public.amitie for select to authenticated using (
  public.strela_moi() in (demandeur, destinataire)
);
-- Une partie est visible si son créateur ou l'un de ses joueurs est moi ou un ami accepté (fonction « security
-- definer » : la politique de participation renvoie à celle de partie, sans boucle).
create or replace function public.strela_partie_visible(p_id text, p_createur uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_createur in (select public.strela_visibles())
      or exists (select 1 from public.participation p where p.partie = p_id and p.profil in (select public.strela_visibles()))
$$;
drop policy if exists partie_lecture on public.partie;
create policy partie_lecture on public.partie for select to authenticated using (public.strela_partie_visible(id, createur));
drop policy if exists participation_lecture on public.participation;
create policy participation_lecture on public.participation for select to authenticated using (
  public.strela_partie_visible(partie, (select x.createur from public.partie x where x.id = participation.partie))
);
-- appareil et profil_secret : aucune politique, donc illisibles (seules les fonctions ci-dessous y touchent).

-- ------------------------------------------------------------------ outils
create or replace function public.strela_empreinte(p_secret text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex')
$$;

-- Code d'ami de 6 caractères (sans 0/O, 1/I/L ni voyelles), jamais deux fois le même.
create or replace function public.strela_nouveau_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet constant text := '23456789BCDFGHJKMNPQRSTVWXZ';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profil where code_ami = c);
  end loop;
  return c;
end $$;

create or replace function public.strela_exige_moi() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare m uuid := public.strela_moi();
begin
  if auth.uid() is null then raise exception 'strela:connexion' using errcode = '28000'; end if;
  if m is null then raise exception 'strela:sans_compte' using errcode = '28000'; end if;
  return m;
end $$;

-- Profil vu chez un ami (sans rien de privé).
create or replace function public.strela_profil_json(p public.profil) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', p.id, 'pseudo', p.pseudo, 'avatar', p.avatar, 'anim', p.anim, 'jeux', p.jeux,
    'extra', p.extra, 'fmt', p.fmt, 'maj', p.maj, 'vu_le', p.vu_le)
$$;

-- ------------------------------------------------------------------ compte
-- Crée le compte de ce téléphone (profil choisi par l'appli + empreinte du code de récupération), ou rattache cette
-- connexion à un compte existant si le code est le bon (nouveau téléphone, réinstallation). Rejouable.
create or replace function public.strela_compte(p_profil uuid, p_secret text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  e text;
  pr public.profil;
  nouveau boolean := false;
begin
  if uid is null then raise exception 'strela:connexion' using errcode = '28000'; end if;
  if p_profil is null or length(coalesce(p_secret, '')) < 16 then raise exception 'strela:invalide' using errcode = '22023'; end if;
  select empreinte into e from public.profil_secret where profil = p_profil;
  if e is null then
    if exists (select 1 from public.profil where id = p_profil) then raise exception 'strela:refuse' using errcode = '42501'; end if;
    insert into public.profil (id, code_ami) values (p_profil, public.strela_nouveau_code());
    insert into public.profil_secret (profil, empreinte) values (p_profil, public.strela_empreinte(p_secret));
    nouveau := true;
  elsif e <> public.strela_empreinte(p_secret) then
    raise exception 'strela:refuse' using errcode = '42501';
  end if;
  insert into public.appareil (auth_uid, profil) values (uid, p_profil)
    on conflict (auth_uid) do update set profil = excluded.profil, vu_le = now();
  update public.profil set vu_le = now() where id = p_profil returning * into pr;
  -- nouveau : le profil vient d'être créé (premier lancement, ou base reconstruite) : le téléphone renvoie alors tout.
  return jsonb_build_object('profil', pr.id, 'code_ami', pr.code_ami, 'fmt', 1, 'nouveau', nouveau);
end $$;

-- Met à jour mon profil (pseudo, avatar, animation de tour, jeux de fléchettes, champs à venir).
create or replace function public.strela_profil(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  m uuid := public.strela_exige_moi();
  pr public.profil;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'strela:invalide' using errcode = '22023'; end if;
  if length(coalesce(p->>'avatar', '')) > 400000 or length(coalesce(p->>'jeux', '')) > 100000 or length(coalesce(p->>'extra', '')) > 100000 then
    raise exception 'strela:trop_gros' using errcode = '22023';
  end if;
  update public.profil set
    pseudo = left(coalesce(p->>'pseudo', pseudo), 40),
    avatar = case when jsonb_typeof(p->'avatar') = 'object' then p->'avatar' else avatar end,
    anim = case when p ? 'anim' then left(p->>'anim', 40) else anim end,
    jeux = case when jsonb_typeof(p->'jeux') = 'array' then p->'jeux' else jeux end,
    extra = case when jsonb_typeof(p->'extra') = 'object' then p->'extra' else extra end,
    fmt = greatest(1, coalesce((p->>'fmt')::int, fmt)),
    maj = now(), vu_le = now()
  where id = m returning * into pr;
  return public.strela_profil_json(pr) || jsonb_build_object('code_ami', pr.code_ami);
end $$;

-- Mon compte : profil, code d'ami.
create or replace function public.strela_mon_compte() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  m uuid := public.strela_exige_moi();
  pr public.profil;
begin
  update public.profil set vu_le = now() where id = m returning * into pr;
  update public.appareil set vu_le = now() where auth_uid = auth.uid();
  return public.strela_profil_json(pr) || jsonb_build_object('code_ami', pr.code_ami);
end $$;

-- Supprime toutes mes données en ligne : profil, amitiés, parties créées, connexions (et les comptes anonymes de
-- Supabase qui vont avec). Les parties restent sur les téléphones.
create or replace function public.strela_supprimer_compte() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  m uuid := public.strela_exige_moi();
  uids uuid[];
begin
  select array_agg(auth_uid) into uids from public.appareil where profil = m;
  delete from public.profil where id = m;   -- en cascade : appareil, secret, amitiés, parties créées
  begin
    delete from auth.users where id = any(uids);
  exception when others then null;          -- sans droit sur auth.users : les comptes anonymes restent, vides
  end;
  return jsonb_build_object('supprime', m);
end $$;

-- ------------------------------------------------------------------ amis
-- Liste : amis acceptés et demandes (reçues, envoyées), avec le profil de l'autre.
create or replace function public.strela_amis() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.strela_profil_json(p) || jsonb_build_object(
           'etat', a.etat, 'sens', case when a.demandeur = public.strela_exige_moi() then 'envoyee' else 'recue' end,
           'depuis', a.maj) order by a.maj), '[]'::jsonb)
    from public.amitie a
    join public.profil p on p.id = case when a.demandeur = public.strela_exige_moi() then a.destinataire else a.demandeur end
   where public.strela_exige_moi() in (a.demandeur, a.destinataire)
     and not (a.etat = 'refusee' and a.demandeur <> public.strela_exige_moi())
$$;

-- Demande d'ami par code (6 caractères). Si l'autre m'avait déjà demandé : acceptée tout de suite.
create or replace function public.strela_demander_ami(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  m uuid := public.strela_exige_moi();
  o public.profil;
  inverse public.amitie;
  etat_final text := 'attente';
begin
  select * into o from public.profil where code_ami = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if o.id is null then raise exception 'strela:code_inconnu' using errcode = 'P0002'; end if;
  if o.id = m then raise exception 'strela:soi_meme' using errcode = '22023'; end if;
  select * into inverse from public.amitie where demandeur = o.id and destinataire = m;
  if inverse.demandeur is not null and inverse.etat in ('attente', 'acceptee') then
    update public.amitie set etat = 'acceptee', maj = now() where demandeur = o.id and destinataire = m;
    etat_final := 'acceptee';
  elsif exists (select 1 from public.amitie where demandeur = m and destinataire = o.id and etat = 'acceptee') then
    etat_final := 'acceptee';
  else
    insert into public.amitie (demandeur, destinataire, etat) values (m, o.id, 'attente')
      on conflict (demandeur, destinataire) do update set etat = 'attente', maj = now();
  end if;
  return public.strela_profil_json(o) || jsonb_build_object('etat', etat_final);
end $$;

-- Réponse à une demande reçue.
create or replace function public.strela_repondre_ami(p_autre uuid, p_accepter boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare m uuid := public.strela_exige_moi();
begin
  update public.amitie set etat = case when p_accepter then 'acceptee' else 'refusee' end, maj = now()
   where demandeur = p_autre and destinataire = m and etat = 'attente';
  if not found then raise exception 'strela:pas_de_demande' using errcode = 'P0002'; end if;
  return jsonb_build_object('autre', p_autre, 'etat', case when p_accepter then 'acceptee' else 'refusee' end);
end $$;

-- Retirer un ami (ou annuler une demande) : le lien est coupé dans les deux sens ; les parties restent.
create or replace function public.strela_retirer_ami(p_autre uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare m uuid := public.strela_exige_moi();
begin
  delete from public.amitie where (demandeur = m and destinataire = p_autre) or (demandeur = p_autre and destinataire = m);
  return jsonb_build_object('autre', p_autre, 'etat', 'retire');
end $$;

-- ------------------------------------------------------------------ parties
-- Envoie des parties créées sur ce compte : [{ id, type, jeu, fmt, etat, debut, fin, donnees,
-- joueurs: [{ ordre, profil?, local?, resultat? }] }]. Une partie d'un autre créateur est refusée (jamais écrasée).
create or replace function public.strela_envoyer(p_parties jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  m uuid := public.strela_exige_moi();
  x jsonb;
  j jsonb;
  ok text[] := '{}';
  refus text[] := '{}';
  createur_existant uuid;
  pid text;
begin
  if jsonb_typeof(p_parties) <> 'array' or jsonb_array_length(p_parties) > 200 then raise exception 'strela:invalide' using errcode = '22023'; end if;
  for x in select * from jsonb_array_elements(p_parties) loop
    pid := x->>'id';
    if pid is null or length(pid) > 80 or length(coalesce(x->>'donnees', '')) > 2000000 then refus := refus || coalesce(pid, '?'); continue; end if;
    select createur into createur_existant from public.partie where id = pid;
    if createur_existant is not null and createur_existant <> m then refus := refus || pid; continue; end if;
    insert into public.partie (id, createur, type, jeu, fmt, etat, debut, fin, donnees, maj)
    values (pid, m, x->>'type', coalesce(x->>'jeu', ''), greatest(1, coalesce((x->>'fmt')::int, 1)),
            coalesce(x->>'etat', 'terminee'),
            to_timestamp((x->>'debut')::double precision / 1000), to_timestamp((x->>'fin')::double precision / 1000),
            case when x->>'etat' = 'supprimee' then null else x->'donnees' end, clock_timestamp())
    on conflict (id) do update set type = excluded.type, jeu = excluded.jeu, fmt = excluded.fmt, etat = excluded.etat,
      debut = excluded.debut, fin = excluded.fin, donnees = excluded.donnees, maj = clock_timestamp();
    delete from public.participation where partie = pid;
    if jsonb_typeof(x->'joueurs') = 'array' then
      for j in select * from jsonb_array_elements(x->'joueurs') loop
        insert into public.participation (partie, ordre, profil, joueur_local, resultat)
        values (pid, (j->>'ordre')::int,
                case when (j->>'profil') ~ '^[0-9a-f-]{36}$' and exists (select 1 from public.profil where id = (j->>'profil')::uuid) then (j->>'profil')::uuid end,
                left(j->>'local', 80), j->'resultat')
        on conflict do nothing;
      end loop;
    end if;
    ok := ok || pid;
  end loop;
  update public.profil set vu_le = now() where id = m;
  return jsonb_build_object('ok', to_jsonb(ok), 'refusees', to_jsonb(refus));
end $$;

-- Supprime des parties créées sur ce compte : elles disparaissent aussi chez les autres (suppression douce, puis
-- purge au bout de 60 jours par strela_ping).
create or replace function public.strela_supprimer(p_ids text[]) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare m uuid := public.strela_exige_moi(); n int;
begin
  update public.partie set etat = 'supprimee', donnees = null, maj = clock_timestamp()
   where id = any(p_ids) and createur = m;
  get diagnostics n = row_count;
  return jsonb_build_object('supprimees', n);
end $$;

-- Instant en microsecondes depuis 1970 (entier exact en JavaScript jusqu'en 2255) : curseur de strela_recevoir.
create or replace function public.strela_us(t timestamptz) returns bigint
language sql immutable set search_path = public as $$ select (extract(epoch from t) * 1000000)::bigint $$;
create or replace function public.strela_de_us(us double precision) returns timestamptz
language sql immutable set search_path = public as $$ select timestamptz 'epoch' + (coalesce(us, 0)::bigint * interval '1 microsecond') $$;

-- Parties visibles (les miennes, celles de mes amis, celles où l'un de nous a joué) changées après le curseur
-- (p_depuis : microsecondes, colonne « maj » de la dernière reçue ; p_apres_id : son identifiant) ; p_seulement :
-- celles d'un seul profil (nouvel ami : tout son historique). 300 au plus par appel, dans l'ordre (maj, id).
create or replace function public.strela_recevoir(p_depuis double precision, p_apres_id text default '', p_seulement uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with vis as (select public.strela_visibles() as id),
  rows as (
    select x.* from public.partie x
     where (x.maj > public.strela_de_us(p_depuis) or (x.maj = public.strela_de_us(p_depuis) and x.id > coalesce(p_apres_id, '')))
       and (x.createur in (select id from vis)
            or exists (select 1 from public.participation p where p.partie = x.id and p.profil in (select id from vis)))
       and (p_seulement is null or x.createur = p_seulement
            or exists (select 1 from public.participation p where p.partie = x.id and p.profil = p_seulement))
     order by x.maj, x.id
     limit 300
  )
  select jsonb_build_object('parties', coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'createur', r.createur, 'type', r.type, 'jeu', r.jeu, 'fmt', r.fmt, 'etat', r.etat, 'donnees', r.donnees,
    'maj', public.strela_us(r.maj)) order by r.maj, r.id), '[]'::jsonb),
    'moi', public.strela_exige_moi(), 'complet', count(*) < 300)
  from rows r
$$;

-- ------------------------------------------------------------------ réveil et purge
-- Appelée par l'action GitHub « supabase-reveil » tous les 3 jours (un projet gratuit inactif est mis en veille au bout
-- d'une semaine) : une vraie requête sur la base, et la purge des parties supprimées depuis plus de 60 jours.
create or replace function public.strela_ping() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  delete from public.partie where etat = 'supprimee' and maj < now() - interval '60 days';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'at', now(), 'profils', (select count(*) from public.profil), 'purgees', n);
end $$;

-- ------------------------------------------------------------------ droits des fonctions
revoke execute on all functions in schema public from public, anon;
grant execute on function public.strela_ping() to anon, authenticated;
grant execute on function public.strela_moi(), public.strela_visibles(), public.strela_partie_visible(text, uuid) to authenticated;
grant execute on function
  public.strela_compte(uuid, text), public.strela_profil(jsonb), public.strela_mon_compte(), public.strela_supprimer_compte(),
  public.strela_amis(), public.strela_demander_ami(text), public.strela_repondre_ami(uuid, boolean), public.strela_retirer_ami(uuid),
  public.strela_envoyer(jsonb), public.strela_supprimer(text[]), public.strela_recevoir(double precision, text, uuid)
  to authenticated;

-- ------------------------------------------------------------------ présence (Supabase Realtime)
-- Canal privé « strela-presence » : seuls les téléphones connectés (connexion anonyme) peuvent s'y joindre ; chacun
-- n'y publie que son identifiant de profil et son état (en ligne, en partie). Ignoré si Realtime est absent.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'realtime')
     and exists (select 1 from pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    execute 'alter table realtime.messages enable row level security';
    execute 'drop policy if exists strela_presence_lire on realtime.messages';
    execute 'create policy strela_presence_lire on realtime.messages for select to authenticated using (realtime.topic() = ''strela-presence'' and public.strela_moi() is not null)';
    execute 'drop policy if exists strela_presence_ecrire on realtime.messages';
    execute 'create policy strela_presence_ecrire on realtime.messages for insert to authenticated with check (realtime.topic() = ''strela-presence'' and public.strela_moi() is not null)';
  end if;
end $$;
