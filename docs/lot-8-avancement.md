# Lot 8 (23/11/2026) : entraînement, stats et distribution — avancement

Cahier des charges : « Strela — Lot 8 : entraînement, stats et distribution » (réflexion vocale du 23/11/2026, document
de Guillaume, copié dans la conversation de la session). Ce fichier dit où en est le travail ; à relire à la reprise.

## Points vérifiés dans le code (avant de coder)

- **1.1 Position exacte** : oui, conservée. La saisie au doigt (paysage) enregistre `pos` (repère de board.js, au
  millième) pour chaque fléchette, et l'analyse s'en sert (écarts, groupement) dès que la position concorde avec la
  zone. Rien à corriger. Défaut voisin (1.2) : un hors cible posé gardait sa position mais n'entrait jamais dans les
  écarts (`realPoint` → null), et on ne pouvait poser qu'en deçà de la couronne des numéros.
- **3.4 Dernier point à 0 %** : pas de division par zéro (les valeurs nulles sont écartées), la séance en cours n'est pas
  dans `store.trainings`. Causes possibles, sans accès aux données de Guillaume : (a) une séance arrêtée tôt (ARRÊTER
  ET VOIR L'ANALYSE après une ou deux fléchettes à côté) compte comme une autre ; (b) sur triple 20 / triples / doubles,
  la « précision » ne comptait que les fléchettes dans le triple ou le double visé (0/30 = 0 % même toutes dans le 20) ;
  (c) un hors cible comptait comme raté plat. Corrigé en passant la précision à la distance à la cible visée (hors cible
  posé compris) et en ignorant les séances sans fléchette.
- **8.3 Export KPI des soirées** : existe. Rapport de soirée en 4 feuilles A4 dessinées sur canvas
  (src/ui/soireereport.js : podium, chronologie, duels, chiffres / défis / badges), exporté en IMAGE (PNG des 4 empilées)
  ou PDF (sheet.js › pdfFromJpegs, Bridge.saveFile) ; plus le résumé à partager 1080 × 1920 (soireesummary.js). Rien pour
  l'entraînement.

## Découpage en publications

| Publication | Contenu | État |
|---|---|---|
| 0.15.0 | 1 (saisie, précision, marqueur, règle de passage), 2 (règles et aide), 3 (stats : tendances, graphes, période, 0 %, chaleur, bandeau), 4 (listes en cartes) | fait, publié (#35) |
| 0.16.0 | 5 (exercices ludiques, défis en X01 solo, badges d'entraînement, petits défis en séance) | fait (publication en cours) |
| 0.17.0 | 6 (modes, accueil, tutoriel), 7 (réglages, mise à jour), 8 (sauvegarde, export IA, feuille KPI entraînement), 9 (lien d'installation, page et guide) | à faire |

## Décisions

- Précision = **distance moyenne à la cible visée** (cm, sur une vraie cible), hors cible posés compris ; un hors cible
  saisi au pavé (sans position) compte dans les fléchettes et le hors cible, pas dans la distance. « Dans la cible »
  reste le résultat des exercices.
- Zone de saisie au doigt : jusqu'à 10 cm au-delà du double (rayon réel 270 mm, `OFF_R` du repère de l'appli).
- 20-19-18 : 21 fléchettes par numéro (7 volées) pour les séances nouvelles (`rules: 2`) ; les anciennes gardent 20.
- Libre : nombre de fléchettes par multiples de 3.

## Prochain geste

Voir la première ligne « en cours » du tableau ; le détail des sous-tâches cochées est tenu ci-dessous.

## Fait

- 0.15.0 : sections 1 à 4 entières (détail : docs/entrainement.md « Lot 8 du 23/11 » ; tests : tests/lot8-stats.test.js).

- 0.16.0 : section 5 entière (détail : docs/entrainement.md « jeux de cible, défis, badges » ; tests : tests/lot8-jeux.test.js).

## Pour 0.16.0 (section 5), notes d'origine

- Exercices ludiques (5.1, à valider par Guillaume) : Killer solo, Serpent (parcours de secteurs dans l'ordre de la
  cible), Shanghai, Moitié (halve-it), Plus haut, Roulette, Golf 9 trous, Mur de 60, plus Tour de l'horloge et Cricket
  solo déjà là. Règles écrites dans `RULES` comme les autres ; `advance` à fixer pour chacun.
- Défis en X01 solo (5.2) : réutiliser engine/defis.js (même tirage et même validation qu'en soirée), réglage « Défis »
  et fréquence au lancement d'un jeu solo.
- Badges d'entraînement (5.3) et petits défis en séance (5.4) : sur le modèle de engine/badges.js, calcul rétroactif.
