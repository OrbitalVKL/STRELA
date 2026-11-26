# Lot 9.6 — avancement

Cahier : docs/lot-9-6.md. Ordre : A (bug de synchro) → B (stats) → C (sons).

## A — séances d'entraînement d'un ami lié : fait (0.24.1)

- Test écrit d'abord : tests/seances-ami-parcours.test.js (deux téléphones, faux Supabase). Il remet la base dans
  l'état laissé par la 0.23.3 et échoue sans la correction ; il échoue aussi sans l'envoi d'une séance finie restée
  ouverte.
- Cause (journal du Pixel, 25/11 21:09:35 → 21:09:55) : réception de 4 parties ou séances de Patrick sur « u:<uuid> »,
  puis rattachement du joueur local « Patrick » en 0.23.3 (« 0 partie(s) de la fiche d'ami reprises ») : la fusion ne
  reprenait pas `friendTrainings` / `friendGames` ; la fiche « u:… » supprimée, ses séances n'étaient plus à personne.
  Ensuite plus aucune « réception » au journal : rien de nouveau n'est arrivé de chez Patrick (cause possible côté
  Patrick : séance laissée sur l'écran de fin, jamais rangée donc jamais envoyée — corrigé).
- Vérifié sans écart : envoi des séances d'avant le lien (le serveur les montre dès l'amitié acceptée), jeu de
  fléchettes inconnu (jamais filtré, « Jeu inconnu »), filtres de période et de jeu (0.23.4), hors ligne puis synchro.
- Détail technique : docs/cloud.md « Séances d'un ami ».

## B — stats contextuelles : fait (0.25.0)

Détail : docs/interface.md « Version 0.25.0 ». Choix faits sans Guillaume (à lui dire) : référence d'une partie = moyenne
des parties précédentes de la période des stats ; secteur d'un exercice comparé à la séance précédente du même exercice ;
« forme du soir » = dernière soirée (sinon dernier jour de jeu) contre les autres parties de la période ; dérive dite
à partir de 9 mm d'écart moyen (seuil du coach) ; flèche verte = jeton `--good-text` (vert de la cible mêlé au texte).

## C — sons contextuels : fait (0.25.0)

Détail : docs/interface.md « Version 0.25.0 ». Choix faits sans Guillaume : en X01, hors zone de finition, triple =
réussi, double ou 15 points et plus = neutre, moins = raté ; volume en 4 crans ; fin d'exercice selon l'objectif du
niveau. Non vérifiable d'ici : le rendu sur le haut-parleur du Pixel (sons trop discrets ou trop forts ?).
