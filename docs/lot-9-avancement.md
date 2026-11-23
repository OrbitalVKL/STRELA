# Lot 9 (cadré le 23/11/2026) : saisie à la voix, puis partie en ligne — avancement

Cahier : [docs/lot-9.md](lot-9.md) (copie du document de Guillaume). À faire : **9.3** (saisie à la voix) puis **9.2**
(partie en ligne, score partagé), chacun dans sa branche et sa demande de fusion. **9.1** (iPhone) et **9.4** (audio en
ligne) sont reportés : ne pas les faire. Aucun service payant, aucun compte avec carte bancaire.

## Découpage

| Sous-lot | Version | Contenu | État |
|---|---|---|---|
| 9.3 | 0.18.0 | saisie à la voix (X01, Cricket, entraînement ; APK et navigateur) | fait (demande de fusion en cours) |
| 9.2 | 0.19.0 | partie en ligne, score partagé (WebRTC, salon, hôte qui fait autorité) | à faire |

## 9.3 — décisions

- Appuyer pour parler = **un appui** lance une écoute, arrêtée par Android au silence (ou par un 2e appui) ; pas
  d'appui maintenu (le joueur a souvent des fléchettes en main).
- X01 : touche VOIX dans la rangée S / D / T (le bandeau du joueur était trop serré : test de chevauchement à 360 px,
  police 115 %) ; Cricket et entraînement : dans le bandeau.
- Fléchettes en trop (volée pleine) : ignorées et signalées, pas toute la phrase refusée.
- Confirmation vocale omise quand l'écran annonce déjà (total, bust).
- Réglage OUI par défaut ; le micro n'est demandé qu'au premier appui, après une fenêtre d'explication.
- Variante play : RECORD_AUDIO ajouté aussi (la reconnaissance passe par le service vocal du téléphone, pas par le
  réseau de l'appli) ; docs/play/securite-donnees.md complété.
- Point d'accroche 9.4 : `blockVoice('appel', true)` (voiceinput.js) retire le micro et coupe l'écoute.

## 9.3 — non vérifié

- Vraie reconnaissance (Pixel) : qualité en français dans le bruit, langue hors ligne installée ou non, variantes
  réellement produites par Google (« vin », chiffres…) — à ajuster dans `WORDS` de src/engine/voice.js.
- La CI n'a ni micro ni service vocal sur l'émulateur.

## 9.2 — prochain geste

Lire la section 9.2 du cahier ; commencer par le moteur de synchronisation pur (src/engine/online.js : messages
numérotés, état complet, reprise) et ses tests, puis la signalisation derrière une petite interface.
