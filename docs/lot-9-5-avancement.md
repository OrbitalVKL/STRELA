# Lot 9.5 (retours du 24/11/2026) — avancement

Cahier : [docs/lot-9-5.md](lot-9-5.md). Le lot 9 était fini (9.1 et 9.4 reportés) : rien à mettre en pause.
Une seule branche et une seule demande de fusion (version 0.20.0).

| Point | État |
|---|---|
| A1 connexion en ligne | fait : étapes à l'écran, repli MQTT, ACCESS_NETWORK_STATE, candidats en attente chez l'hôte, journal |
| A2 clavier | fait : place du clavier laissée par la coquille (bord à bord), champ ramené dans la partie visible, code en majuscules |
| A3 historique X01 solo | fait : cause trouvée (voir docs/entrainement.md « Lot 9.5 »), grille depuis les volées du moteur |
| B journal | fait : src/ui/journal.js, Réglages › Développement › Journal |
| C1 sélecteur Soirée / Entraînement | fait : modeband.js (deux moitiés) |
| C2 résumé X01 (volées, grille) | fait |
| C3 impacts par secteur visé | fait (horloge et jeux de cible) |

## Prochain geste

Version 0.20.0 publiée par demande de fusion ; ensuite, retours de Guillaume (à deux téléphones : étape qui échoue,
journal exporté). Puis reprendre le lot 9 reporté (9.1 iPhone, 9.4 audio) s'il le demande.

## Retour du 24/11 après essai (0.20.1)

Journal de Guillaume (deux téléphones à distance, chacun hôte à son tour) : rien ne passait, ni dans un sens ni dans
l'autre. Cause trouvée et reproduite sur le vrai serveur PeerJS (il coupe l'expéditeur d'un message qui n'a pas la
forme de sa bibliothèque) ; corrigée en 0.20.1 (docs/enligne.md « 0.20.1 »). Repli MQTT toujours non vérifié en vrai.
Prochain geste : nouvel essai de Guillaume ; s'il échoue encore, les journaux des **deux** téléphones.
