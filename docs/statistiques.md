# Statistiques — définitions exactes (lot 3)

Tout est **recalculé à partir des fléchettes** enregistrées (rien n'est stocké) : `playerStats()` et `faceToFace()`
de `src/engine/stats.js`, résumé d'une partie par `playerSummary()`. Vérifié de bout en bout par
`tests/chiffres.test.js` : parties scriptées jouées dans la vraie appli (bust, partie abandonnée, joueur supprimé),
chiffres lus à l'écran et comparés à des valeurs calculées à la main (le calcul est écrit en tête du test).

## Ce qui compte

- **Parties prises en compte** : les parties closes (terminées ou abandonnées) de la période choisie (7 jours,
  30 jours, tout), d'après leur date de début. La partie en cours ne compte pas tant qu'elle n'est pas rangée.
- **Volée** : une volée close (3 fléchettes, bust ou finition). Une volée commencée puis laissée en plan (partie
  abandonnée en pleine volée) ne compte nulle part.
- **Bust** : la volée compte ses fléchettes et **0 point**.
- **Partie abandonnée** : ses volées comptent dans les moyennes, les 100+ / 140+ / 180, la carte des segments ; elle
  compte dans « parties jouées » ; aucune victoire, et elle ne compte pas dans les face-à-face (listée à part).
- **Partie supprimée** (lot 3) : elle disparaît de tout, comme si elle n'avait pas été jouée.
- **Joueur supprimé** : ses parties avec d'autres restent et comptent pour les autres (moyennes, victoires) ; il
  n'est plus un adversaire dans les face-à-face.

## Chiffres

| Chiffre | Définition |
|---|---|
| Moyenne sur 3 fléchettes | total des points marqués (bust = 0) ÷ nombre de fléchettes lancées × 3 |
| 9 premières | même calcul, limité aux 3 premières volées du joueur dans chaque manche (moins si la manche finit avant) |
| Taux de finition | volées gagnées ÷ volées commencées sur une finition jouable (reste qu'on peut finir en 3 fléchettes selon la sortie : 170 au plus en sortie double, hors 169, 168, 166, 165, 163, 162, 159) |
| Taux de doubles | fléchettes qui ont fini la manche ÷ fléchettes lancées quand **une seule** pouvait finir (en sortie double : reste pair de 2 à 40, ou 50 ; en sortie simple : reste jouable d'une fléchette). « — » s'il n'y a eu aucune occasion |
| Meilleure finition | plus grand reste fini d'une seule volée |
| Manche la plus courte | moins de fléchettes lancées par le joueur dans une manche qu'il a gagnée |
| 100+ / 140+ / 180 | volées de 100 à 139, de 140 à 179, et de 180 (une volée en bust ne compte pas) |
| Victoires | parties gagnées ÷ parties jouées (abandonnées comprises) |
| Moyenne d'une partie (évolution, face-à-face) | moyenne sur 3 fléchettes du joueur dans cette partie |
| Carte des segments | chaque fléchette lancée, par zone (simple, double, triple, 25, 50, à côté) |

## Face-à-face (lot 3)

Du point de vue du joueur dont on regarde les stats, contre un adversaire, sur la période choisie :

- **Bilan** : parties communes terminées gagnées par lui (VICTOIRES) et par l'adversaire (DÉFAITES) ; une partie
  gagnée par un troisième joueur est comptée à part (« gagnée par un autre joueur »).
- **Bilan des manches** : dans ces mêmes parties, manches gagnées par lui et par l'adversaire.
- **Liste** : les parties communes terminées, de la plus récente à la plus ancienne : date, jeu, GAGNÉ / PERDU /
  GAGNÉE PAR …, manches de l'un et de l'autre, moyenne de chacun. Puis les parties abandonnées, à part, qui ne
  comptent pas.
- Tout est écrit en toutes lettres : rien ne repose sur la couleur.

## Historique

Chaque case du tableau tour par tour donne les fléchettes de la volée, son total (« BUST » pour un bust) et le reste
après la volée (inchangé sur un bust) ; une finition est marquée « GAGNÉ ». Le résumé d'une partie donne, par joueur :
manches gagnées, moyenne sur 3 fléchettes, fléchettes lancées, meilleure volée (bust = 0).
