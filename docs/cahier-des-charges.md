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
| Historique | parties passées, détail volée par volée et fléchette par fléchette, impacts de chaque volée sur la cible ; supprimer une partie (détail, ou appui long puis sélection de plusieurs), avec confirmation (lot 3) |
| Stats joueur | sur 7 jours, 30 jours, depuis toujours ; face-à-face contre chaque adversaire (lot 3 : bilan en toutes lettres, parties communes) |

### Écran de jeu (portrait et paysage)

L'appli accepte les deux orientations ; l'écran de jeu suit la rotation du téléphone sans rien perdre. Les autres
écrans restent utilisables en paysage (mise en page simple, défilement accepté).

**Commun aux deux orientations**

- **À qui c'est de jouer**, d'un coup d'œil et de loin : bandeau du joueur actif en aplat de la couleur de fond de
  son avatar, avatar de 56 px au moins, pseudo dont les capitales font 32 px de haut au moins, « FLÉCHETTE 2/3 »,
  manche. Le joueur suivant est repéré dans la bande des autres, sans sa couleur (filet en haut, « SUIVANT ») : en
  jeu, la seule couleur de joueur à l'écran est celle du joueur en cours (lot 1.3).
- Reste à faire en très grand : **120 px de haut au minimum** (chiffres), lisible à 2-3 m.
- 3 cases de fléchettes + total de la volée ; autres joueurs (avatar, reste). Lot 3 : chaque case vide montre une
  fléchette dessinée (combien il en reste d'un coup d'œil) et, quand une finition est jouable, le segment conseillé
  pour cette fléchette (T20 · T20 · D20 pour 140), mis à jour après chaque fléchette.
- **Touches au relâcher** (lot 3) : retour visuel dès l'appui, action au relâcher, seulement si le doigt n'a pas
  glissé (10 px) et si Android n'a pas pris le geste (remonter du bas de l'écran ne saisit rien). Marge basse au moins
  égale à la zone des gestes système.
- **Annonces vocales** (lot 3, voix française du téléphone, réglage OUI par défaut) : total de chaque volée, « bust »,
  « PSEUDO, il reste 40 » quand un joueur commence son tour avec une finition jouable, « manche, PSEUDO ! »,
  « partie, PSEUDO ! », « cent quatre-vingts ! » appuyé. Jamais de retard de saisie ; une annonce coupe la précédente.
- **Sons** (lot 3, Web Audio, réglage OUI par défaut) : clic à chaque fléchette (différent pour double et triple),
  sons du bust, de la validation, de la finition.
- **Célébrations** (lot 3) : bandeau gradué pour 100+, 140+, 180 et chaque finition, dans la couleur du joueur ou en
  vidéo inverse (jamais le rouge du bust) ; il ne bloque pas la saisie, un appui le ferme.
- **Corriger une fléchette validée** (lot 3) : depuis le panneau cible + historique ; acceptée seulement si le déroulé
  de la partie ne change pas (sinon : ANNULER), avec confirmation qui chiffre l'effet.
- **Validation de chaque volée** : plus de passage automatique. Après la 3e fléchette ou un bust, la volée reste
  affichée (joueur, fléchettes, total ou BUST) et un grand bouton **VALIDER** passe au joueur suivant ; il est à la
  couleur du joueur qui vient de lancer et ne dit que « VALIDER », sur une ligne, en grand (lot 2 : le suivant n'est
  montré qu'une fois, par « SUIVANT » dans la bande des autres joueurs). En attendant,
  ANNULER reste actif pour corriger ; les autres touches de saisie sont visiblement inactives. Une fléchette de
  finition mène toujours à l'écran de fin de manche, qui sert de validation. C'est un état de l'interface (le moteur
  ne change pas), enregistré avec la partie en cours : il survit à une fermeture de l'appli.
- **Annonce** : à la validation, « À TOI, PSEUDO » occupe le haut de l'écran pendant ~0,8 s, puis le bandeau du
  nouveau joueur glisse en place. Une saisie pendant l'annonce l'interrompt (jamais d'attente).
- **Chiffres en rouleau** : quand un nombre change (reste, total de la volée, restes des autres), chaque chiffre roule
  verticalement vers sa nouvelle valeur (~300 ms), dans un sens quand le nombre baisse, dans l'autre quand il monte
  (ANNULER). Une saisie rapide interrompt l'animation et n'est jamais retardée.
- **Cible** (SVG, lot 1.2) : aux couleurs d'une cible réglementaire (simples noir / crème, doubles et triples rouge /
  vert, 25 vert, 50 rouge, couronne noire et numéros blancs, fils métalliques), les mêmes en sombre et en clair.
  La petite cible ne montre que la volée en cours, en marques rondes numérotées 1, 2, 3, et se vide à chaque volée ;
  la cible agrandie bascule entre VOLÉE et MANCHE (volées précédentes du joueur en discret). Une fléchette saisie au
  pavé est placée au centre de son segment ; le 0 n'est pas marqué. La même cible sert partout (saisie en paysage,
  historique, fins de manche et de partie, stats).
- **Historique** (partie en cours : menu pause ou cible agrandie ; parties terminées : détail) : pour chaque manche,
  un tableau avec une colonne par joueur (avatar et pseudo en tête) et une ligne par tour ; chaque case donne, dans
  cet ordre, les 3 fléchettes du tour (« T20 · 5 · 1 », « 0 » pour un raté), le total de la volée en gros et le reste
  en petit (lot 1.3), un bust en rouge avec BUST, une finition en valeur ; le tour en cours est repéré ; un appui sur
  une case montre ses fléchettes sur la cible. De 5 à 8 joueurs, le tableau défile de côté, la colonne des tours reste
  fixe ; si une case est trop étroite, ses fléchettes passent sur deux lignes ou en plus petit, toujours toutes
  visibles (les pseudos d'en-tête, eux, peuvent finir en « … » : l'avatar identifie le joueur). On le ferme pour revenir exactement où on en était.
- Retours : vibration courte à chaque fléchette ; bust = zone du reste en aplat rouge + vibration longue. Sur le web,
  Chrome ne vibre ni en mode silencieux ni quand le retour haptique d'Android est coupé ; l'APK (lot 5) utilisera le
  vibreur natif d'Android. Réglages : TESTER LA VIBRATION et ligne de diagnostic (lot 1.2). **Lot 2** : sur le Pixel 10
  Pro de Guillaume (appli installée, retour haptique activé), rien ne vibre, même avec TESTER LA VIBRATION. On n'insiste
  pas côté web : les appels et le bouton de test restent, **le lot 5 passe par le vibreur natif d'Android** (coquille
  APK, `Vibrator` / `VibrationEffect`, exposé à la page par l'interface Java de la WebView).
- **Robustesse** (lot 1.2) : rien ne se chevauche ni ne sort de l'écran, quels que soient la taille de l'écran et les
  réglages de taille d'affichage et de police (Android, Chrome) ; un texte trop long se coupe avec « … », un bloc trop
  chargé se compacte. Vérifié automatiquement en CI.
- Écran toujours allumé pendant la partie (Wake Lock sur le web, `FLAG_KEEP_SCREEN_ON` dans l'APK).
- Enregistrement à chaque fléchette : un appel ou une fermeture de l'appli ne fait rien perdre.

**Portrait : saisie au pavé**

- Petite cible à côté des 3 cases (sans réduire le reste ni le pavé) ; un appui ouvre le panneau cible + historique
  (lot 3 : la cible en grand en haut, le tableau de la partie dessous, dans le même panneau ; une case touchée montre
  ses fléchettes sur la cible ; une fléchette touchée se corrige).
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
- Partie en cours : en plus des fléchettes, le nombre de fléchettes déjà validées (volée en attente de VALIDER, et fin
  de manche pas encore passée par MANCHE SUIVANTE).
- Joueur supprimé : son identifiant est remplacé dans ses parties par un identifiant anonyme (détail :
  [moteur-x01.md](moteur-x01.md)).
- Les statistiques sont toujours recalculées à partir des fléchettes (jamais stockées).
- Stockage : IndexedDB (lot 2), base versionnée avec migrations, sur le téléphone seulement. La partie en cours est
  écrite à chaque fléchette, ANNULER et VALIDER : une fermeture brutale ne perd au plus que l'écriture en cours, et
  l'appli rouverte propose REPRENDRE à l'état exact. Stockage persistant demandé à Chrome (sinon il peut effacer les
  données d'un site quand la place manque). Une mise à jour de l'appli ne touche jamais aux données. Détail :
  [interface.md](interface.md), « Enregistrement ».
- Export / import JSON (lot 3) : sauvegarde (Réglages › Sauvegarde), et passage de la page web à l'APK. Fichier
  `strela-AAAAMMJJ-HHMM.json` ; import avec aperçu, REMPLACER TOUT ou FUSIONNER ; fichier invalide ou d'une version
  future refusé sans rien toucher. Détail : [interface.md](interface.md), « Lot 3 ».

## 6. Statistiques par joueur

- Moyenne sur 3 fléchettes (les volées en bust comptent 0).
- Moyenne des 9 premières fléchettes de chaque manche.
- Taux de finition, taux de réussite des doubles.
- Meilleure finition, manche la plus courte (en fléchettes).
- Volées 100+, 140+, 180.
- Victoires et face-à-face.
- Définitions exactes et vérification (lot 3) : [statistiques.md](statistiques.md).
- Carte des segments touchés.

## 6 bis. Réglages

Thème Auto / Sombre / Clair, mode nuit (option du sombre), **sons** et **annonces vocales** oui / non (lot 3, avec
TESTER LA VOIX et l'état de la voix française), vibrations, **animations** oui / non (chiffres en rouleau, glissement
du bandeau, célébrations) ; les animations sont coupées d'office si le téléphone demande moins d'animations.
Sauvegarde : EXPORTER / IMPORTER (lot 3).

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
| 1.2 | Corrections : rotation de l'appli installée, vibrations (test et diagnostic), mini-cible de la volée en cours, historique en tableau, cible aux vraies couleurs, superpositions (test automatique), palette d'avatar | validation du design |
| 1.3 | Corrections : 3 fléchettes dans chaque case de l'historique, une seule couleur de joueur à l'écran (le joueur en cours), VALIDER à la couleur du lanceur avec le nom du suivant (retiré au lot 2) | design validé (v0.1.3) |
| 2 | Partie jouable et enregistrée (IndexedDB, reprise), vrais joueurs (photo recadrée), VALIDER sans le nom du suivant | validation des fonctions de la partie |
| 3 | Corrections de jeu (touches au relâcher, fléchettes et finition dans les cases, correction d'une fléchette, panneau cible + historique), suppression de parties, face-à-face, annonces vocales, sons, célébrations, export / import, chiffres vérifiés | validation des fonctions |
| 4 | Finitions : propositions de finition (affinées), mode nuit, vibrations | validation des fonctions |
| 5 | APK Android | |
| 6 | Recette | |
