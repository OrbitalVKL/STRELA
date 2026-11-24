# Lot 10 (amis, synchronisation, stats partagées) — avancement

Cahier : [docs/lot-10.md](lot-10.md) ; architecture : [docs/cloud.md](cloud.md). Lot 9.5 et 0.20.1 étaient finis et
publiés : rien à terminer avant.

| Étape | Version | Contenu | État |
|---|---|---|---|
| 1 | 0.21.0 | infra Supabase (schéma SQL complet, client, faux serveur de test sur vrai Postgres), compte invisible, Réglages › Compte et amis, réveil et copie de la base (action GitHub), confidentialité | fait |
| 2 | 0.22.0 | amis : écran Amis (QR + code, scanner / saisir), demandes, liste de joueurs en trois sections, amis en lecture seule | à faire |
| 3 | 0.23.0 | rattachement des joueurs locaux aux amis (fusion annulable, journalisée) | à faire |
| 4 | 0.24.0 | synchronisation des parties et séances (file d'envoi, réception, suppression propagée, format) | à faire |
| 5 | 0.25.0 | stats partagées (sélecteur de joueur, Stats multijoueur / entraînement, badges en ligne) | à faire |
| 6 | 0.26.0 | présence (Realtime) | à faire |

## Décisions (prises sans Guillaume, à lui dire)

- Toutes les écritures passent par des fonctions SQL (« security definer ») ; les tables ne sont lisibles qu'à travers la
  RLS et ne s'écrivent jamais directement.
- Identifiant du compte = UUID tiré par le téléphone + secret ; plusieurs connexions anonymes peuvent s'y rattacher
  (second téléphone, réinstallation, base restaurée). Code de récupération de 47 caractères (rare à taper : la
  sauvegarde le contient).
- Parties en ligne : une seule ligne `partie` avec la partie entière en JSON (`donnees`), comme sur le téléphone, plus
  une table `participation` (profils, joueurs locaux) pour les droits ; pas de table de volées séparée.
- Partie supprimée : purge 60 jours après la suppression douce.
- Supprimer ses données en ligne coupe la synchronisation ; la rallumer crée un nouveau compte (nouveau code d'ami).
  Si un second téléphone partage le compte, il le recrée à sa prochaine synchronisation (limite acceptée).
- « Retrouver un compte » sur un téléphone qui avait déjà le sien : l'ancien profil reste en ligne, orphelin.
- Signalisation du mode en ligne : PeerJS gardé (voir docs/cloud.md).
- Copie hebdomadaire chiffrée dans les artefacts de l'action (le dépôt est public), 90 jours.

## Prochain geste

Étape 2 (amis) : écran `#/amis` (mon QR code + code d'ami, saisir un code, scanner — BarcodeDetector si présent, sinon
l'appareil photo du téléphone via une page `ami.html`), demandes en attente, liste de joueurs en trois sections,
profil d'ami en lecture seule (rangé dans `players` avec un champ `friend` = UUID ; identifiant local `u:<uuid>`).
Plan de la traduction des identifiants (étapes 3 et 4) : les parties gardent les identifiants locaux ; à l'envoi, un
joueur lié part avec son UUID (`links` : identifiant local → UUID) ; à la réception, l'UUID d'un ami redevient
l'identifiant du joueur local fusionné (ou `u:<uuid>`), l'UUID du compte redevient le joueur du profil.
