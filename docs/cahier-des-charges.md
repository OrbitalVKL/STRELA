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
- **Archiver** un joueur : il n'est plus proposé au lancement d'une partie ; ses parties et ses stats restent ; on
  peut le réactiver.
- **Supprimer** un joueur (lot 1.1), après une confirmation nette qui chiffre les conséquences : le joueur et ses
  statistiques disparaissent. Ses parties jouées avec d'autres restent dans l'historique et dans les stats des autres,
  où il apparaît comme « Joueur supprimé » avec un avatar neutre ; les stats des autres restent justes, mais il
  n'apparaît plus comme adversaire dans leurs face-à-face. Une partie jouée seul par lui disparaît. Un joueur de la
  partie en cours ne peut pas être supprimé : le message demande de finir ou d'abandonner la partie d'abord.
- **Avatar**, au choix :
  - une photo (caméra ou galerie), recadrée au carré ;
  - une icône tirée d'une banque d'environ 24 pictogrammes SVG monochromes dessinés pour Strela dans la DA
    (fléchette, cible, animaux, objets ; rien de copié de Dartsmind), sur un fond choisi parmi 8 couleurs sourdes ;
  - à défaut, les initiales.

## 4. Écrans

| Écran | Contenu |
|---|---|
| Accueil | NOUVELLE PARTIE, REPRENDRE, Joueurs, Historique, Stats |
| Joueurs | liste, création, modification, archivage, suppression |
| Nouvelle partie | joueurs touchés dans l'ordre de jeu ; 301 / 501 / 701 ; sortie ; manches. Les derniers réglages sont repris ; REVANCHE en une touche |
| Jeu | voir ci-dessous |
| Fin de manche / de partie | résultat, enchaînement |
| Historique | parties passées, détail volée par volée et fléchette par fléchette, impacts de chaque volée sur la cible |
| Stats joueur | sur 7 jours, 30 jours, depuis toujours |

### Écran de jeu (portrait et paysage)

L'appli accepte les deux orientations ; l'écran de jeu suit la rotation du téléphone sans rien perdre. Les autres
écrans restent utilisables en paysage (mise en page simple, défilement accepté).

**Commun aux deux orientations**

- **À qui c'est de jouer**, d'un coup d'œil et de loin : bandeau du joueur actif en aplat de la couleur de fond de
  son avatar, avatar de 56 px au moins, pseudo dont les capitales font 32 px de haut au moins, « FLÉCHETTE 2/3 »,
  manche. Le joueur suivant est repéré dans la bande des autres (filet de sa couleur, « SUIVANT »).
- Reste à faire en très grand : **120 px de haut au minimum** (chiffres), lisible à 2-3 m.
- 3 cases de fléchettes + total de la volée ; finition proposée quand elle est jouable ; autres joueurs (avatar, reste).
- **Validation de chaque volée** : plus de passage automatique. Après la 3e fléchette ou un bust, la volée reste
  affichée (joueur, fléchettes, total ou BUST) et un grand bouton **VALIDER** passe au joueur suivant. En attendant,
  ANNULER reste actif pour corriger ; les autres touches de saisie sont visiblement inactives. Une fléchette de
  finition mène toujours à l'écran de fin de manche, qui sert de validation. C'est un état de l'interface (le moteur
  ne change pas), enregistré avec la partie en cours : il survit à une fermeture de l'appli.
- **Annonce** : à la validation, « À TOI, PSEUDO » occupe le haut de l'écran pendant ~0,8 s, puis le bandeau du
  nouveau joueur glisse en place. Une saisie pendant l'annonce l'interrompt (jamais d'attente).
- **Chiffres en rouleau** : quand un nombre change (reste, total de la volée, restes des autres), chaque chiffre roule
  verticalement vers sa nouvelle valeur (~300 ms), dans un sens quand le nombre baisse, dans l'autre quand il monte
  (ANNULER). Une saisie rapide interrompt l'animation et n'est jamais retardée.
- **Cible** (SVG, DA de l'appli) : impacts de la volée en cours numérotés 1, 2, 3 ; en plus discret, ceux des volées
  précédentes du joueur actif dans la manche. Une fléchette saisie au pavé est placée au centre de son segment ; le 0
  n'est pas marqué. La même cible sert au détail de l'historique et aux écrans de fin de manche et de partie.
- **Historique de la partie en cours** (menu pause, ou depuis la cible agrandie) : manche par manche, volée par volée,
  chaque fléchette et le reste après chaque volée ; on le ferme pour revenir exactement où on en était.
- Retours : vibration courte à chaque fléchette ; bust = zone du reste en aplat rouge + vibration longue.
- Écran toujours allumé pendant la partie (Wake Lock sur le web, `FLAG_KEEP_SCREEN_ON` dans l'APK).
- Enregistrement à chaque fléchette : un appel ou une fermeture de l'appli ne fait rien perdre.

**Portrait : saisie au pavé**

- Petite cible à côté des 3 cases (sans réduire le reste ni le pavé) ; un appui l'agrandit.
- Pavé de saisie :
  - **S / D / T** : D et T valent pour une seule fléchette, puis le pavé revient à S ;
  - grille **1 à 20** ;
  - rangée **25 · 50 · 0 · ANNULER** ;
  - touches de **56 px de haut au moins** ;
  - volée en attente : VALIDER couvre le haut du pavé.

**Paysage : saisie sur la cible**

- À gauche : bandeau du joueur actif, reste en très grand, 3 cases et total, finition, autres joueurs, puis
  **RATÉ (0) · ANNULER · VALIDER**.
- À droite : la cible, aussi grande que la hauteur le permet. On saisit en la touchant : dès l'appui, une loupe
  (×2,5) montre la zone sous le doigt, décalée pour ne pas être cachée par lui, avec le nom de la zone en gros
  (« T20 », « D16 », « 25 », « 50 ») ; on glisse pour ajuster, on lâche pour enregistrer. Un lâcher hors de la cible
  annule le geste (il ne compte pas 0). La position réelle du doigt est gardée pour marquer l'impact.
- Vibrations et bust comme en portrait.

## 5. Données

- Entités : **Joueur, Partie, Manche, Volée, Fléchette**.
- Fléchette = segment × multiplicateur, plus la position touchée sur la cible quand elle a été saisie en paysage.
- Partie en cours : en plus des fléchettes, le nombre de fléchettes déjà validées (volée en attente de VALIDER).
- Joueur supprimé : son identifiant est remplacé dans ses parties par un identifiant anonyme (détail :
  [moteur-x01.md](moteur-x01.md)).
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

## 6 bis. Réglages

Thème Auto / Sombre / Clair, mode nuit (option du sombre), vibrations, **animations** oui / non (chiffres en
rouleau, glissement du bandeau) ; les animations sont coupées d'office si le téléphone demande moins d'animations.

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
| 1.1 | Corrections de la maquette : suppression des joueurs, validation des volées, chiffres en rouleau, cible, historique en cours, joueur actif plus visible, paysage avec saisie sur la cible | validation du design |
| 2 | Partie jouable, joueurs et avatars | |
| 3 | Historique et statistiques | |
| 4 | Finitions : propositions de finition, mode nuit, vibrations, export / import | validation des fonctions |
| 5 | APK Android | |
| 6 | Recette | |
