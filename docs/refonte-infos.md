# Refonte de la présentation des infos (demande du 26/11/2026)

Demande de Guillaume :
- séparer l'entraînement des parties réelles ;
- garder les mêmes indicateurs des deux côtés ;
- d'une stat ou d'un record, ouvrir le déroulé de la partie ;
- accéder aux infos et à la liste des parties de la même façon des deux côtés ;
- étudier des tuiles plutôt que des écrans à faire défiler ;
- une interface intuitive et claire.

Méthode : faire l'inventaire, organiser, choisir les indicateurs, puis montrer des maquettes en images. Le code ne
commence qu'après le choix de Guillaume.

## 1. Inventaire (v0.25.0)

### Parties réelles (X01, Cricket, soirées, en ligne)

| Écran | Adresse, fichier | Ce qu'il montre | Mène au déroulé ? |
|---|---|---|---|
| Accueil | `#/`, v2/home2.js | Carte « Dernière partie » (X01 seulement), carte « En tête · 30 jours », 6 tuiles | Dernière partie : oui (haut de la partie) |
| Historique | `#/historique`, v2/history2.js | Cartes par soirée ou par jour, repliées ; filtres joueur, état, mois ; vainqueur | Oui, en 3 appuis (tuile, carte, ligne) |
| Détail d'une partie | `#/partie/<id>`, history.js | Joueurs (manches, moyenne, fléchettes, meilleure volée) ; tour par tour par manche, panneau d'une volée (cible, fléchettes) ; verres ; fiche ; suppression | — |
| Fin de manche, fin de partie | `#/manche`, `#/fin`, results.js | Classement (manches, moyenne, fléchettes, meilleure volée, finition), records battus, badges gagnés, cible du vainqueur | Badges seulement |
| Cricket : fin, détail | cricket.js | Classement (points, MPR, meilleure volée en marques), tableau final, liste des volées | Non (volées non cliquables) |
| Profil › Résumé | `#/joueur/<id>`, profile.js | Moyenne, parties, victoires, meilleure volée, niveau d'entraînement, badges ; records datés ; 5 meilleures volées ; derniers badges ; rivaux | Meilleures volées : haut de la partie ; **records : non** |
| Profil › Parties | `#/joueur/<id>/parties`, stats2.js › playerGamesHtml | Période, source ; phrase de tendance, forme du soir, moyenne, 9 premières, victoires ; **10 blocs repliés** (amis, score et volées, précision, finition, défis, courbe, meilleures et pires volées, face-à-face, au fil des verres, Cricket, carte de la cible) | Points de courbe et listes de volées : haut de la partie ; tuiles de chiffres : non |
| Profil › Badges | profile.js › badgesHtml | Vitrine par familles, « presque », chronologie | Badge : **jusqu'à la volée** ; record : non |
| Tableau d'honneur | `#/honneur`, honours.js | Le plus de badges, événements par mois | Badge : volée ; record : profil seulement |
| Classement | `#/classement`, stats2.js | Palmarès (meilleur et pire pour 13 chiffres), tableau | Jamais vers une partie |
| Face-à-face | `#/face/<a>/<b>`, stats.js | Bilan, parties communes, abandonnées | Oui (haut de la partie) |
| Soirée | `#/soiree/<id>`, v2/soireedash.js | Podium, totaux, faits marquants, cartes des joueurs (19 chiffres), défis, verres, parties | Parties, défis : haut de la partie ; **faits marquants : non** |

### Entraînement (exercices, jeux de cible, X01 et Cricket en solo)

| Écran | Adresse, fichier | Ce qu'il montre | Mène au déroulé ? |
|---|---|---|---|
| Accueil de l'entraînement | `#/entrainement`, training.js › trainingHub | Niveau et critères, exercice proposé, exercices (dernier score, objectif), tuiles Stats, Conseils, Armurerie, **8 dernières séances** | Séances : oui ; dernier score d'un exercice : non |
| Fin de séance, détail | `#/entrainement/fin`, `#/entrainement/seance/<id>` | Exercices : valeur principale, dans la cible, groupement, coach, objectif, comparaison aux séances précédentes. X01 solo : moyenne, fléchettes, manches, finition, triples, doubles, meilleure volée, 100+, 9 premières, bust, défis, évolution, grille des volées. Cricket solo : MPR, marques, meilleure volée | Grille des volées : aucune volée ne s'ouvre |
| Profil › Entraînement | `#/joueur/<id>/entrainement`, trainstats.js › trainStatsHtml | Niveau, période, source, jeu de fléchettes, exercice ; chiffres ; évolution du X01 solo ; courbe ; carte de chaleur ; tendances ; par jeu de fléchettes ; par exercice ; **liste des séances (au fond de la page)** | Séances : oui ; **points de courbe : non** (adresse calculée, jamais utilisée) ; meilleure valeur d'un exercice : non |
| Feuille KPI | trainreport.js | Précision, groupement, dans la cible, séances, fléchettes, courbe, badges | — |
| Badges d'entraînement | profil › Badges, trainhonours.js | Paliers, petits défis en séance | Palier : séance (haut) ; petit défi : séance (haut) |

### Ce qui gêne aujourd'hui

1. **Deux rangements différents.**
   - Les parties ont un Historique ; les séances n'ont pas de liste à elles (8 sur l'accueil de l'entraînement,
     toutes au fond de l'onglet du profil).
   - Les stats sont dans deux onglets du profil, construits différemment.
2. **Indicateurs différents pour un même jeu.**
   - Il manque au X01 solo : 140+ et 180 à part, plus grosse finition, manche la plus courte (calculée mais jamais
     affichée), réussite à la finition par chance.
   - « Doubles » ne dit pas la même chose : en partie, c'est la réussite au double de fin ; à l'entraînement, ce sont
     les doubles touchés.
   - Pas de records d'entraînement : le 135 de Patrick n'apparaît nulle part comme record.
3. **Peu de liens vers le déroulé.**
   - Seuls les badges mènent à la volée.
   - Les records, faits marquants, palmarès, tuiles de chiffres et points des courbes d'entraînement ne mènent
     nulle part.
   - Côté données : `records.js` ne garde pas la partie d'un record, `stats.js` ne garde pas la volée de la pire volée
     d'une partie, et `badges.js › recordsAt` ne garde qu'une date.
4. **Longs défilements.**
   - Profil › Parties : 10 blocs repliés sous 3 chiffres.
   - Profil › Entraînement : environ 12 blocs, la liste des séances tout en bas.

## 2. Organisation proposée

Deux espaces au rangement identique. On passe de l'un à l'autre par une bascule ; tout est rangé au même endroit des
deux côtés.

| | PARTIES (X01, Cricket, soirées, en ligne) | ENTRAÎNEMENT (exercices, jeux de cible, X01 et Cricket en solo) |
|---|---|---|
| **Jouer** | Nouvelle partie, soirée, en ligne, reprendre | Coaché, libre, jeux, reprendre |
| **Historique** | Liste des parties, groupées par soirée ou par jour | Liste des séances, groupées par jour : même composant, mêmes filtres (joueur, type, période) |
| **Stats** | Tableau de bord en tuiles, par familles | Même tableau, mêmes familles (plus celle des exercices) |
| **Records** | Un record par indicateur ; chaque record ouvre la partie sur sa volée | Pareil (le 135 de Patrick y est) |
| **Badges** | Badges de partie | Badges d'entraînement |

- **Profil d'un joueur** : les deux espaces en onglets (Parties, Entraînement), avec le même tableau de tuiles filtré
  sur lui.
- **Restent côté Parties** : soirée (tableau de bord, rapport), classement, face-à-face.
- **Restent hors des deux** : réglages, joueurs, armurerie (jeux de fléchettes), conseils, nouveautés.

**Règle de navigation, partout** :
- **tuile → fiche de l'indicateur → partie ou séance → volée** ;
- un record, une meilleure ou pire volée, un fait marquant ou un point de courbe ouvre directement le déroulé, surligné
  sur la volée.

## 3. Indicateurs

Les familles sont les mêmes des deux côtés dès que le jeu s'y prête. Le X01 solo de l'entraînement a exactement les
indicateurs du X01 en partie.

| Famille | Indicateurs | Parties | Entraînement |
|---|---|---|---|
| Score (X01) | Moyenne / 3 fl. ; Moyenne des 9 premières fléchettes ; Meilleure moyenne d'une partie | oui | X01 solo |
| Volées (X01) | Meilleure volée ; Pire volée ; 100+ ; 140+ ; 180 ; Bust | oui | X01 solo |
| Finition (X01) | Réussite au double de fin (%) ; Plus grosse finition ; Manche la plus courte (fléchettes) | oui | X01 solo |
| Précision | Triples (%) ; **Doubles touchés** (%) ; Bulls ; Hors cible | oui | oui ; plus précision (cm), dans la cible (%), groupement (cm) pour les exercices |
| Cricket | MPR ; Meilleure volée (marques) | oui | Cricket solo |
| Résultats | Parties, victoires (%), face-à-face | oui | — |
| Résultats | Séances, objectif tenu, niveau | — | oui |
| Exercices et jeux de cible | Meilleur et dernier score de chaque exercice ou jeu | — | oui |

- **Tuiles affichées d'office** :
  - X01 : Moyenne, 9 premières, Meilleure volée, Finition %, 100+ / 140+ / 180, Triples %.
  - Exercices : Précision, Dans la cible, Groupement, Niveau.
- **Mis à l'écart** (soirée, ou fiche de l'indicateur) : « le plus de 1 », « au fil des verres », simples
  intérieurs et extérieurs, régularité, répartition des volées.
- **Chaque meilleure ou pire valeur garde sa source** : partie ou séance, et numéro de la volée.

## 4. Maquettes

Deux propositions en images, envoyées le 26/11. Elles sont faites hors du dépôt, d'après la DA. Chacune montre cinq
écrans en Parties et en Entraînement : accueil, tableau de bord, fiche d'un indicateur, déroulé ouvert sur une volée,
historique.

- **A « Deux espaces »**
  - Une bascule PARTIES | ENTRAÎNEMENT en haut de l'accueil, puis 6 tuiles.
  - Stats : une famille par onglet, environ 6 tuiles par écran, sans défilement.
- **B « Barre du bas »**
  - Quatre onglets fixes en bas : Jouer, Historique, Stats, Records.
  - Une bascule Parties | Entraînement en tête de chaque onglet.
  - Stats : grandes tuiles avec une mini-courbe, une page par famille.

Choix de Guillaume : *(à venir)*.

## 5. Code, une fois la maquette choisie (lot C)

1. `src/engine/indicators.js` (pur) :
   - la liste des indicateurs (clé, libellé, famille, unité, sens, calcul), commune aux parties et aux séances X01 et
     Cricket ;
   - chaque meilleure ou pire valeur avec sa source ;
   - records d'entraînement.
2. Adresses du déroulé ouvert sur une volée : `#/partie/<id>/v<n>`, `#/entrainement/seance/<id>/v<n>`. Elles
   remplacent `selectLogCell`. La grille des volées d'une séance sait ouvrir une volée.
3. Un seul composant de liste (historique des parties et des séances).
4. Tableau de bord en tuiles et fiche d'indicateur. Ils remplacent les blocs de `playerGamesHtml` et `trainStatsHtml`.
5. Accueil et navigation selon la maquette. Les anciennes adresses redirigent.
6. Tests :
   - mêmes chiffres pour une partie et une séance X01 identiques ;
   - parcours stat → déroulé → volée des deux côtés ;
   - sommaire, chevauchement, captures.
