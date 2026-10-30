# Strela (СТРЕЛА) — cahier des charges

Application Android de comptage de fléchettes X01, pour Guillaume. Interface entièrement en français ;
seul le titre de l'appli reste en russe : **СТРЕЛА**.

## 1. Périmètre

**Version 1**

- Compteur X01 (301, 501, 701) à saisie manuelle des fléchettes.
- Fonctionne hors ligne ; toutes les données restent sur le téléphone.

**Hors version 1**

- Comptage automatique par caméra.
- Cricket et autres jeux (le moteur est conçu pour pouvoir en accueillir plus tard).
- Jeu en ligne, comptes utilisateurs.
- iPhone.

## 2. Règles X01

- **Configuration** : score de départ 301, 501 ou 701 ; sortie « simple » ou « double » ; nombre de
  manches à gagner N (1 par défaut) ; 1 à 8 joueurs, dans un ordre donné.
- **Fléchette** = segment (0 à 20, ou 25) × multiplicateur (1 simple, 2 double, 3 triple).
  25 n'existe qu'en simple (25) ou en double (50, qui compte comme un double). 0 = à côté, en simple
  seulement. Pas de triple 25. Toute saisie invalide est refusée.
- **Volée** : 3 fléchettes au plus. Elle se termine après la 3e fléchette, sur une finition ou sur un bust.
- **Entrée libre** : pas besoin d'un double pour commencer.
- **Sortie simple** : la manche est gagnée quand le reste tombe exactement à 0 ; bust si le reste devient négatif.
- **Sortie double** : bust si le reste devient négatif, s'il vaut 1, ou s'il tombe à 0 sur autre chose
  qu'un double (D1 à D20 ou 50).
- **Bust** : la volée s'arrête aussitôt, le joueur revient au reste qu'il avait au début de la volée, la main passe.
- **Manche gagnée** : on passe à la manche suivante ; le premier à lancer tourne d'un cran à chaque manche.
- **Partie gagnée** dès qu'un joueur atteint N manches.
- **ANNULER** retire la dernière fléchette. Cela doit marcher à travers les changements de joueur, les bust,
  les fins de manche et la fin de partie (une partie finie redevient en cours).

Conception : l'état d'une partie se recalcule entièrement à partir de sa configuration et de la liste
ordonnée de ses fléchettes. Détail du moteur : [moteur-x01.md](moteur-x01.md).

## 3. Joueurs

- Un joueur = un pseudo et un avatar, gardés d'une partie à l'autre.
- Les joueurs sont **archivés, jamais supprimés** (pour garder leurs statistiques).
- **Avatar**, au choix :
  - une photo (caméra ou galerie), recadrée au carré ;
  - une icône tirée d'une banque d'environ 24 pictogrammes SVG monochromes dessinés pour Strela dans la DA
    (fléchette, cible, animaux, objets ; rien de copié de Dartsmind), sur un fond choisi parmi 8 couleurs sourdes ;
  - à défaut, les initiales.

## 4. Écrans

| Écran | Contenu |
|---|---|
| Accueil | NOUVELLE PARTIE, REPRENDRE, Joueurs, Historique, Stats |
| Joueurs | liste, création, modification, archivage |
| Nouvelle partie | joueurs touchés dans l'ordre de jeu ; 301 / 501 / 701 ; sortie ; manches. Les derniers réglages sont repris ; REVANCHE en une touche |
| Jeu | voir ci-dessous |
| Fin de manche / de partie | résultat, enchaînement |
| Historique | parties passées, détail volée par volée et fléchette par fléchette |
| Stats joueur | sur 7 jours, 30 jours, depuis toujours |

### Écran de jeu (portrait seulement)

- Bandeau du joueur actif en vidéo inverse : avatar, pseudo, manche.
- Reste à faire en très grand : **120 px de haut au minimum**, lisible à 2-3 m.
- 3 cases de fléchettes + total de la volée.
- Finition proposée quand elle est jouable.
- Bande des autres joueurs : avatar et reste.
- Pavé de saisie :
  - **S / D / T** : D et T valent pour une seule fléchette, puis le pavé revient à S ;
  - grille **1 à 20** ;
  - rangée **25 · 50 · 0 · ANNULER** ;
  - touches de **56 px de haut au moins**.
- Retours : vibration courte à chaque fléchette ; bust = bandeau rouge pendant 1,5 s + vibration longue ;
  passage automatique au joueur suivant après ~1 s.
- Écran toujours allumé pendant la partie (Wake Lock sur le web, `FLAG_KEEP_SCREEN_ON` dans l'APK).
- Enregistrement à chaque fléchette : un appel ou une fermeture de l'appli ne fait rien perdre.

## 5. Données

- Entités : **Joueur, Partie, Manche, Volée, Fléchette**.
- Les statistiques sont toujours recalculées à partir des fléchettes (jamais stockées).
- Stockage : IndexedDB.
- Export / import JSON : sauvegarde, et passage de la maquette web à l'APK.

## 6. Statistiques par joueur

- Moyenne sur 3 fléchettes (les volées en bust comptent 0).
- Moyenne des 9 premières fléchettes de chaque manche.
- Taux de finition, taux de réussite des doubles.
- Meilleure finition, manche la plus courte (en fléchettes).
- Volées 100+, 140+, 180.
- Victoires et face-à-face.
- Carte des segments touchés.

## 7. Direction artistique

DA « console Soyuz » reprise de Grafit (OrbitalVKL/GRAFIT) : thème sombre et thème clair, choix
Auto / Sombre / Clair (Auto par défaut), police Martian Mono embarquée, filets fins, angles droits.
Détail : [direction-artistique.md](direction-artistique.md).

## 8. Architecture

- Une page web unique, sans framework lourd ; PWA hors ligne publiée sur GitHub Pages.
- Puis la même page embarquée dans une coquille Android Java WebView (paquet `fr.orbitalvkl.strela`,
  minSdk 30), APK signé publié en release par GitHub Actions, mise à jour depuis l'appli, comme Grafit.

## 9. Lots

| Lot | Contenu | Validation |
|---|---|---|
| 0 | Fondations : cahier des charges, moteur X01 testé, intégration continue, page d'attente sur Pages | — |
| 1 | Maquette de tous les écrans, en sombre et en clair | validation du design |
| 2 | Partie jouable, joueurs et avatars | |
| 3 | Historique et statistiques | |
| 4 | Finitions : propositions de finition, mode nuit, vibrations, export / import | validation des fonctions |
| 5 | APK Android | |
| 6 | Recette | |
