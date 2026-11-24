// Strela — adresse du projet Supabase et clé publique (lot 10).
//
// Clé PUBLIQUE seulement (« anon » ou « publishable ») : elle est faite pour être dans l'appli ; ce sont les règles de
// supabase/schema.sql qui protègent les données. Jamais la clé « service_role » / « secret » ici.
// Vides : la synchronisation est coupée (Réglages › Compte et amis l'indique). Les tests donnent leur serveur local par
// l'adresse de la page (?cloud=http://127.0.0.1:PORT|CLE).
export const CLOUD_CONFIG = Object.freeze({
  url: '',
  key: '',
});
