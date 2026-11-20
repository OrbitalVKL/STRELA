// Strela — tirage au sort de l'ordre de passage (lot 7, vérifié au lot 7.8 après la soirée du 20/11 : « Guillaume sort
// très souvent premier »). JS pur, sans DOM.
//
// Fisher-Yates (Durstenfeld) : pour i de n-1 à 1, on échange l'élément i avec un élément j tiré uniformément dans
// [0, i]. Chacune des n! permutations sort avec la même probabilité, et chaque joueur a 1 chance sur n d'être premier,
// quelle que soit sa place dans la liste de départ. Aucune graine : le hasard vient du téléphone
// (crypto.getRandomValues), Math.random seulement s'il manque. Le tirage d'un entier dans [0, k[ rejette les valeurs
// du haut de l'intervalle 32 bits qui créeraient un biais de modulo (un biais de l'ordre de 10⁻⁹, mais nul ainsi).

const RANGE = 0x100000000; // 2^32

/** Entier 32 bits non signé tiré par le téléphone (ou par Math.random s'il n'a pas de générateur cryptographique). */
export function random32() {
  try {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0];
  } catch (e) {
    return Math.floor(Math.random() * RANGE);
  }
}

/** Entier uniforme dans [0, k[ à partir d'une source 32 bits `next` (rejet des valeurs qui biaiseraient le modulo). */
export function uniformInt(k, next = random32) {
  if (!(k >= 1) || !Number.isInteger(k)) throw new RangeError(`uniformInt : ${k}`);
  const limit = RANGE - (RANGE % k); // multiple de k le plus grand sous 2^32
  for (;;) {
    const x = next();
    if (x < limit) return x % k;
  }
}

/** Copie mélangée de `list` (Fisher-Yates). `next` : source 32 bits (tests) ; par défaut le hasard du téléphone. */
export function shuffled(list, next = random32) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = uniformInt(i + 1, next);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
