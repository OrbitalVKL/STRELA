# Formulaire « Sécurité des données » — réponses préparées (lot 6)

Play Console › Règles et programmes › Contenu de l'appli › Sécurité des données. Réponses pour la **variante play**
(`fr.orbitalvkl.strela.play`, sans permission INTERNET : elle ne peut rien envoyer).

## Collecte et partage

| Question | Réponse |
|---|---|
| Votre appli collecte-t-elle ou partage-t-elle l'un des types de données utilisateur requis ? | **Non** |

Au sens de Google Play, « collecter » veut dire transmettre des données hors de l'appareil. Strela n'en transmet
aucune : joueurs, photos d'avatar, parties, statistiques et réglages restent dans le stockage privé de l'appli. Le
traitement fait sur l'appareil seulement (recadrage d'une photo, calcul des statistiques) n'est pas une collecte.

Le formulaire s'arrête là : les questions sur le chiffrement en transit et la suppression des données ne sont posées
que si l'appli collecte quelque chose.

## Ce que la fiche affichera

« Aucune donnée collectée » et « Aucune donnée partagée avec des tiers ».

## Justificatifs (si Google demande des précisions)

- Permissions de la variante play : VIBRATE et RECORD_AUDIO (lot 9.3, saisie à la voix ; et une permission interne
  d'AndroidX, propre à l'appli). Ni INTERNET, ni appareil photo, ni stockage, ni localisation, ni contacts.
- Partie en ligne (lot 9.2) : absente de la variante play (pas d'INTERNET), rien à déclarer.
- Micro (lot 9.3) : ouvert seulement après un appui sur le bouton micro, le temps d'une phrase ; la reconnaissance est
  faite par le service vocal du téléphone (SpeechRecognizer d'Android), l'appli ne reçoit que le texte, ne garde ni
  le son ni le texte et ne peut rien envoyer (pas d'INTERNET). Au sens de Play, l'appli ne collecte donc pas
  d'« enregistrements audio » ; si Google demande, répondre « traité sur l'appareil, non collecté ». Vérifié à chaque compilation
  (`tests/android.test.js`, manifeste fusionné).
- Photos : prises par l'appareil photo d'Android ou choisies par son sélecteur ; l'appli n'a pas la permission caméra.
- Sauvegarde : fichier écrit dans Téléchargements/Strela à la demande de l'utilisateur, ou partagé par le menu de
  partage d'Android quand il le choisit (c'est lui qui envoie, pas l'appli).
- Aucune bibliothèque de publicité, de mesure d'audience ou de rapport de plantage.
- Politique de confidentialité : https://orbitalvkl.github.io/STRELA/confidentialite.html

## Autres déclarations de « Contenu de l'appli »

| Déclaration | Réponse |
|---|---|
| Accès à l'appli | Toutes les fonctionnalités sont disponibles sans identifiant ni accès particulier |
| Annonces | L'appli ne contient pas d'annonces |
| Identifiant publicitaire | Non utilisé |
| Appli gouvernementale | Non |
| Fonctionnalités financières | Aucune |
| Santé | Aucune fonctionnalité de santé |
| Appli d'actualités | Non |
