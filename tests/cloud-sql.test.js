// Lot 10 : supabase/schema.sql joué pour de vrai dans un Postgres local (tools/lib/pg.mjs), avec ce qu'il faut de
// Supabase (rôles anon / authenticated, auth.uid()). Comptes, rattachement par le secret, amis, droits par ligne,
// envoi et réception des parties, suppression propagée, réveil. Sauté sans Postgres.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pgAvailable, startPg, TEST_RPC } from '../tools/lib/pg.mjs';

// En CI (GitHub : Postgres installé sur les machines Ubuntu), l'absence de Postgres est une erreur, pas un saut.
const skip = !pgAvailable() && !process.env.CI && 'Postgres absent';
let pg = null;
const U = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;   // connexions anonymes
const P = n => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;   // profils
const SECRET = n => `SECRET${String(n).padStart(14, '0')}`;

const rpc = async (sub, fn, args = {}) => {
  const tag = 'q' + Math.random().toString(36).slice(2, 8);
  const out = await pg.sql(`select test_rpc('${fn}', $${tag}$${JSON.stringify(args)}$${tag}$::jsonb)`, sub ? { as: 'authenticated', sub } : { as: 'anon' });
  return out ? JSON.parse(out) : null;
};
const fails = async (p, re) => { await assert.rejects(p, e => re.test(e.message), `attendu : ${re}`); };

before(async () => {
  if (skip) return;
  pg = await startPg();
  await pg.sql(`insert into auth.users (id) select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 20) n`);
});
after(() => { if (pg) pg.stop(); });

test('schéma : rejouable par-dessus lui-même', { skip }, async () => {
  await pg.sql(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  await pg.sql(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  await pg.sql(TEST_RPC);
});

test('compte : création, code d\'ami, second téléphone avec le secret, mauvais secret refusé', { skip }, async () => {
  const r = await rpc(U(1), 'strela_compte', { p_profil: P(1), p_secret: SECRET(1) });
  assert.equal(r.profil, P(1));
  assert.match(r.code_ami, /^[2-9BCDFGHJKMNPQRSTVWXZ]{6}$/);
  // Rejoué (réseau coupé avant la réponse) : même compte, même code.
  assert.equal((await rpc(U(1), 'strela_compte', { p_profil: P(1), p_secret: SECRET(1) })).code_ami, r.code_ami);
  // Un autre téléphone (autre connexion) avec le bon secret : le même profil.
  assert.equal((await rpc(U(2), 'strela_compte', { p_profil: P(1), p_secret: SECRET(1) })).code_ami, r.code_ami);
  await fails(rpc(U(3), 'strela_compte', { p_profil: P(1), p_secret: SECRET(9) }), /strela:refuse/);
  await fails(rpc(U(3), 'strela_compte', { p_profil: P(3), p_secret: 'court' }), /strela:invalide/);
  await fails(rpc(U(3), 'strela_mon_compte'), /strela:sans_compte/);
  await fails(rpc(null, 'strela_mon_compte'), /permission denied|strela:connexion/);
  // Profil : pseudo, avatar, jeux.
  const p = await rpc(U(2), 'strela_profil', { p: { pseudo: 'Guillaume', avatar: { kind: 'icon', icon: 'ours', color: 3 }, anim: 'etoile', jeux: [{ id: 'ds1' }] } });
  assert.equal(p.pseudo, 'Guillaume');
  assert.deepEqual(p.jeux, [{ id: 'ds1' }]);
  const me = await rpc(U(1), 'strela_mon_compte');
  assert.equal(me.pseudo, 'Guillaume', 'le profil est commun aux deux téléphones');
  assert.equal(me.code_ami, r.code_ami);
});

test('droits : aucune écriture directe, aucune lecture des secrets ni des connexions', { skip }, async () => {
  for (const q of [
    `insert into profil (id, code_ami) values ('${P(99)}', 'ZZZZZZ')`,
    `update profil set pseudo = 'x'`,
    `delete from partie`,
    `select * from profil_secret`,
    `select * from appareil`,
  ]) await fails(pg.sql(q, { as: 'authenticated', sub: U(1) }), /permission denied/);
  await fails(pg.sql('select * from profil', { as: 'anon' }), /permission denied/);
  await fails(rpc(null, 'strela_amis'), /permission denied/);
  // Réveil : la seule fonction ouverte sans connexion.
  const ping = await rpc(null, 'strela_ping');
  assert.equal(ping.ok, true);
});

test('amis : demande par code, acceptation, lecture des profils, refus, retrait', { skip }, async () => {
  await rpc(U(4), 'strela_compte', { p_profil: P(4), p_secret: SECRET(4) });
  await rpc(U(4), 'strela_profil', { p: { pseudo: 'Mathilde' } });
  await rpc(U(5), 'strela_compte', { p_profil: P(5), p_secret: SECRET(5) });
  await rpc(U(5), 'strela_profil', { p: { pseudo: 'Inconnu' } });
  const codeM = (await rpc(U(4), 'strela_mon_compte')).code_ami;
  // Avant l'amitié : Mathilde est illisible pour Guillaume.
  assert.equal(await pg.sql(`select count(*) from profil where id = '${P(4)}'`, { as: 'authenticated', sub: U(1) }), '0');
  const d = await rpc(U(1), 'strela_demander_ami', { p_code: codeM.toLowerCase() });
  assert.equal(d.etat, 'attente');
  assert.equal(d.pseudo, 'Mathilde');
  await fails(rpc(U(1), 'strela_demander_ami', { p_code: 'ZZZZZZ' }), /strela:code_inconnu/);
  await fails(rpc(U(1), 'strela_demander_ami', { p_code: (await rpc(U(1), 'strela_mon_compte')).code_ami }), /strela:soi_meme/);
  // Demande en attente : chacun voit le profil de l'autre (pour accepter en connaissance de cause).
  const recues = await rpc(U(4), 'strela_amis');
  assert.equal(recues.length, 1);
  assert.equal(recues[0].pseudo, 'Guillaume');
  assert.equal(recues[0].sens, 'recue');
  assert.equal((await rpc(U(1), 'strela_amis'))[0].sens, 'envoyee');
  await fails(rpc(U(1), 'strela_repondre_ami', { p_autre: P(4), p_accepter: true }), /strela:pas_de_demande/);
  assert.equal((await rpc(U(4), 'strela_repondre_ami', { p_autre: P(1), p_accepter: true })).etat, 'acceptee');
  assert.equal((await rpc(U(2), 'strela_amis'))[0].etat, 'acceptee', 'vu aussi depuis le second téléphone');
  assert.equal(await pg.sql(`select count(*) from profil`, { as: 'authenticated', sub: U(1) }), '2', 'moi et Mathilde, pas l\'inconnu');
  // Refus : l'inconnu demande, Mathilde refuse ; la demande disparaît chez elle.
  const codeG = (await rpc(U(1), 'strela_mon_compte')).code_ami;
  await rpc(U(5), 'strela_demander_ami', { p_code: codeM });
  await rpc(U(4), 'strela_repondre_ami', { p_autre: P(5), p_accepter: false });
  assert.equal((await rpc(U(4), 'strela_amis')).length, 1);
  assert.equal((await rpc(U(5), 'strela_amis'))[0].etat, 'refusee');
  // Deux demandes croisées : la seconde accepte d'office.
  await rpc(U(5), 'strela_demander_ami', { p_code: codeG });
  await rpc(U(1), 'strela_compte', { p_profil: P(1), p_secret: SECRET(1) });
  const codeI = (await rpc(U(5), 'strela_mon_compte')).code_ami;
  assert.equal((await rpc(U(1), 'strela_demander_ami', { p_code: codeI })).etat, 'acceptee');
  await rpc(U(1), 'strela_retirer_ami', { p_autre: P(5) });
  assert.equal((await rpc(U(5), 'strela_amis')).filter(a => a.etat === 'acceptee').length, 0);
});

const partie = (id, extra = {}) => ({ id, type: 'soiree', jeu: 'x01', etat: 'terminee', debut: 1.7e12, fin: 1.7e12 + 6e5, fmt: 1, donnees: { id, darts: [1, 2, 3] }, joueurs: [], ...extra });

test('parties : envoi, réception par les amis seulement, créateur seul maître, suppression propagée', { skip }, async () => {
  // Guillaume (P1) et Mathilde (P4) sont amis ; l'inconnu (P5) ne l'est plus.
  const sent = await rpc(U(1), 'strela_envoyer', { p_parties: [
    partie('g1', { joueurs: [{ ordre: 0, profil: P(1) }, { ordre: 1, local: 'p-tsia' }] }),
    partie('g2', { joueurs: [{ ordre: 0, profil: P(1) }, { ordre: 1, profil: P(4) }] }),
    partie('t1', { type: 'entrainement', jeu: 'groupement', joueurs: [{ ordre: 0, profil: P(1) }] }),
  ] });
  assert.deepEqual(sent.ok, ['g1', 'g2', 't1']);
  const m = await rpc(U(4), 'strela_recevoir', { p_depuis: 0 });
  assert.deepEqual(m.parties.map(x => x.id).sort(), ['g1', 'g2', 't1']);
  assert.equal(m.moi, P(4));
  assert.deepEqual(m.parties.find(x => x.id === 'g1').donnees, { id: 'g1', darts: [1, 2, 3] });
  assert.equal((await rpc(U(5), 'strela_recevoir', { p_depuis: 0 })).parties.length, 0, 'l\'inconnu ne voit rien');
  // Partie de l'inconnu où Mathilde a joué : visible par Mathilde, et par Guillaume (son ami a joué).
  await rpc(U(5), 'strela_envoyer', { p_parties: [partie('i1', { joueurs: [{ ordre: 0, profil: P(5) }, { ordre: 1, profil: P(4) }] })] });
  assert.ok((await rpc(U(4), 'strela_recevoir', { p_depuis: 0 })).parties.some(x => x.id === 'i1'));
  assert.ok((await rpc(U(1), 'strela_recevoir', { p_depuis: 0 })).parties.some(x => x.id === 'i1'));
  // Lecture directe (droits par ligne) : mêmes règles.
  assert.equal(await pg.sql(`select count(*) from partie`, { as: 'authenticated', sub: U(4) }), '4');
  assert.equal(await pg.sql(`select count(*) from participation`, { as: 'authenticated', sub: U(5) }), '2');
  // Seul le créateur écrit : Mathilde ne peut ni écraser ni supprimer g2.
  const r = await rpc(U(4), 'strela_envoyer', { p_parties: [partie('g2', { donnees: { pirate: true } })] });
  assert.deepEqual(r.refusees, ['g2']);
  assert.equal((await rpc(U(4), 'strela_supprimer', { p_ids: ['g2'] })).supprimees, 0);
  // Reçu depuis la dernière fois : seulement ce qui a changé.
  const lastRow = m.parties[m.parties.length - 1]; // curseur : (maj, id) de la dernière reçue
  const last = lastRow.maj;
  assert.ok(Number.isSafeInteger(last), 'maj en microsecondes, entier exact');
  await rpc(U(1), 'strela_envoyer', { p_parties: [partie('g1', { donnees: { id: 'g1', darts: [4] } })] });
  const since = await rpc(U(4), 'strela_recevoir', { p_depuis: last, p_apres_id: lastRow.id });
  assert.deepEqual(since.parties.map(x => x.id).filter(id => id !== 'i1'), ['g1']);
  // Suppression par le créateur : la partie reste visible, marquée supprimée et vide, puis purgée au bout de 60 jours.
  assert.equal((await rpc(U(1), 'strela_supprimer', { p_ids: ['g2'] })).supprimees, 1);
  const del = (await rpc(U(4), 'strela_recevoir', { p_depuis: last, p_apres_id: lastRow.id })).parties.find(x => x.id === 'g2');
  assert.equal(del.etat, 'supprimee');
  assert.equal(del.donnees, null);
  await pg.sql(`update partie set maj = now() - interval '61 days' where id = 'g2'`);
  assert.equal((await rpc(null, 'strela_ping')).purgees, 1);
  // Nouvel ami : tout son historique d'un coup (p_seulement), même ancien.
  const seul = await rpc(U(4), 'strela_recevoir', { p_depuis: 0, p_seulement: P(1) });
  assert.deepEqual(seul.parties.map(x => x.id).sort(), ['g1', 't1']);
});

test('suppression du compte : tout part, les amis ne voient plus rien', { skip }, async () => {
  await rpc(U(6), 'strela_compte', { p_profil: P(6), p_secret: SECRET(6) });
  await rpc(U(6), 'strela_envoyer', { p_parties: [partie('d1', { joueurs: [{ ordre: 0, profil: P(6) }] })] });
  const code6 = (await rpc(U(6), 'strela_mon_compte')).code_ami;
  await rpc(U(1), 'strela_demander_ami', { p_code: code6 });
  await rpc(U(6), 'strela_repondre_ami', { p_autre: P(1), p_accepter: true });
  assert.ok((await rpc(U(1), 'strela_recevoir', { p_depuis: 0 })).parties.some(x => x.id === 'd1'));
  assert.equal((await rpc(U(6), 'strela_supprimer_compte')).supprime, P(6));
  assert.ok(!(await rpc(U(1), 'strela_recevoir', { p_depuis: 0 })).parties.some(x => x.id === 'd1'));
  assert.equal((await rpc(U(1), 'strela_amis')).some(a => a.id === P(6)), false);
  assert.equal(await pg.sql(`select count(*) from auth.users where id = '${U(6)}'`), '0', 'connexion anonyme effacée');
  // Le même identifiant peut resservir (rallumer la synchronisation) : nouveau compte.
  const again = await rpc(U(7), 'strela_compte', { p_profil: P(6), p_secret: SECRET(16) });
  assert.equal(again.nouveau, true, 'profil recréé : le téléphone renverra tout');
});

test('outils : réveil, copie de toutes les tables et remise dans une base neuve', { skip, timeout: 60e3 }, async () => {
  const { fakeSupabase } = await import('../tools/lib/fake-supabase.mjs');
  const { ping, exportAll, restoreAll, TABLES } = await import('../tools/supabase.mjs');
  const src = await fakeSupabase({ pg });
  const dst = await fakeSupabase();
  try {
    assert.equal((await ping({ url: src.url, key: src.key })).ok, true);
    const copy = await exportAll({ url: src.url, secret: src.secret });
    assert.deepEqual(Object.keys(copy.tables), [...TABLES]);
    assert.ok(copy.tables.profil.length >= 4);
    assert.ok(copy.tables.partie.some(x => x.id === 'g1'));
    const counts = await restoreAll(copy, { url: dst.url, secret: dst.secret });
    assert.equal(counts.partie, copy.tables.partie.length);
    for (const t of TABLES) assert.equal(await dst.sql(`select count(*) from ${t}`), String(copy.tables[t].length), t);
    // Après remise : un téléphone se reconnecte (nouvelle connexion anonyme) avec son secret et retrouve son compte.
    await dst.sql(`insert into auth.users (id) values ('${U(19)}')`);
    const r = await dst.sql(`select test_rpc('strela_compte', '{"p_profil":"${P(1)}","p_secret":"${SECRET(1)}"}')`, { as: 'authenticated', sub: U(19) });
    assert.equal(JSON.parse(r).nouveau, false);
  } finally { await src.close(); await dst.close(); }
});
