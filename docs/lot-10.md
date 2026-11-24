# Strela — Lot 10 : amis, synchronisation et stats partagées (cadré le 24/11/2026)

Dépôt : OrbitalVKL/STRELA. Règles habituelles : DA Strela (jetons de `assets/theme.css`, pas de bleu de lien), données conservées à la mise à jour, affichages qui ne se remettent pas à zéro en navigation, retour vers l'écran d'origine, textes explicatifs repliés derrière un (i). Claude est autonome : regrouper, publier dès que c'est vert.

**Contrainte** : aucun service payant, aucune carte bancaire. Volume visé : 2 utilisateurs aujourd'hui, 4 à 5 au maximum.

## 1. Principe

Les joueurs qui ont l'appli peuvent devenir **amis** de façon permanente. Entre amis, **tout est partagé** automatiquement : parties multijoueur (soirée, en ligne) et entraînements. Une partie jouée sur un seul téléphone en soirée apparaît dans l'historique et les stats de chaque ami qui y a joué. Tout doit être **transparent** : aucune manipulation de synchronisation pour l'utilisateur.

## 2. Infrastructure

- **Supabase**, offre gratuite (sans carte bancaire) : authentification, base Postgres, temps réel.
- **Compte invisible** : à la première ouverture après mise à jour, connexion anonyme Supabase ; aucun email ni mot de passe. Identifiant de compte stable, conservé dans les données de l'appli, la sauvegarde et l'export.
- **Récupération** : prévoir dans la sauvegarde/l'export de quoi retrouver son compte sur un nouveau téléphone (jeton ou code de récupération), sinon documenter la limite.
- **Hors ligne d'abord** : l'appli reste maîtresse en local et fonctionne sans réseau. File d'envoi locale ; synchronisation en arrière-plan à l'ouverture, à la fin de chaque partie/séance et au retour du réseau. Conflits : impossibles par conception, car seul le créateur modifie une partie (cf. 5).
- **Mise en veille du projet gratuit** : Supabase suspend un projet gratuit inactif environ une semaine. Prévoir un réveil automatique gratuit (ex. action GitHub planifiée qui fait une requête légère), et documenter la reprise manuelle si besoin.
- **Sécurité** : règles d'accès par ligne (RLS) : je lis mes données et celles de mes amis acceptés ; je n'écris que les parties que j'ai créées et mon propre profil. Clés publiques seulement dans l'appli.
- **Signalisation du mode en ligne** : peut basculer sur Supabase Realtime si plus fiable que le serveur actuel (au choix du dev, l'indiquer).
- Mettre à jour `confidentialite.html` : ce qui est stocké en ligne, où, et comment tout supprimer.

## 3. Modèle de données (en ligne)

- **profil** : id, pseudo, avatar, animation de tour, jeux de fléchettes, date de dernière activité.
- **amitie** : demandeur, destinataire, état (en attente / acceptée / refusée), dates.
- **partie** : id, créateur, type (soirée, en ligne, entraînement), jeu et options, dates, état (terminée, abandonnée, supprimée).
- **participation** : partie, joueur (id de profil lié, ou joueur local sans compte), ordre, résultat.
- **volees / flechettes** : comme le modèle local actuel (position exacte, saisie verticale ou cible, défis, bust).
- Les joueurs **locaux** sans compte restent dans la partie avec un identifiant local ; ils ne sont pas partagés comme profils.

## 4. Joueurs : trois types

La liste de joueurs est refondue en trois sections :

1. **Mon profil** : le mien, modifiable, synchronisé.
2. **Joueurs locaux** : créés sur ce téléphone, hors ligne, gérés par moi (comme aujourd'hui).
3. **Amis** : profils liés, **en lecture seule** sur mon téléphone (pseudo, avatar, animation viennent de leur téléphone). Je peux seulement les retirer de mes amis.

Un ami peut être ajouté à une partie de soirée comme n'importe quel joueur.

## 5. Droits sur les parties

- Le **créateur** d'une partie (téléphone qui l'a lancée) en est seul maître : lui seul peut la corriger ou la supprimer.
- Les joueurs rattachés la voient dans leur historique et leurs stats, **sans pouvoir la modifier**.
- **Suppression** : une partie supprimée par son créateur **disparaît aussi chez tous les autres** (cas rare : partie abandonnée ou à ne pas compter). Suppression douce en base puis purge.

## 6. Ajouter un ami

- Écran **Amis** : mon QR code + code court (5–6 caractères) ; bouton scanner / saisir un code.
- Demande envoyée → l'autre accepte ou refuse. Liste des demandes en attente.
- Retirer un ami : le lien est coupé, les parties communes restent dans l'historique de chacun.

## 7. Rattachement des profils existants (mise en place)

Cas actuel : des joueurs existent déjà en local sur plusieurs téléphones, parfois avec le même pseudo, et l'historique contient des parties où ils figurent comme joueurs locaux.

- À l'acceptation d'une amitié, l'appli propose : « Ce joueur de ta liste locale, c'est lui ? » avec suggestion par pseudo identique ou proche ; choix manuel possible, ou « aucun ».
- Si confirmé : le joueur local est **fusionné** dans le profil ami ; toutes les anciennes parties où il apparaît sont rattachées à son identifiant, puis envoyées en ligne pour qu'elles apparaissent chez lui.
- Côté ami : s'il avait lui-même créé un profil local portant mon nom, même proposition symétrique.
- Fusion annulable tant que la synchronisation n'a pas eu lieu ; journalisée (cf. journal du lot 9.5).
- Pour les nouveaux joueurs ensuite : le lien est natif dès l'ajout, sans cette étape.

## 8. Stats

- Deux familles : **Stats multijoueur** (remplace « Stats soirée » : soirée + en ligne) et **Stats entraînement**. Le bandeau en haut des stats (lot 9.5 C1) prend ces libellés.
- **Sélecteur de joueur** en haut des stats : moi, ou n'importe quel ami. Toutes les stats existantes (courbes, cartes de chaleur, badges, records, exercices) sont consultables pour un ami.
- Badges, records et classements calculés sur les parties partagées.
- Filtre local / en ligne conservé.

**Tout est partagé, sans exception** : historique fléchette par fléchette, courbes, cartes de chaleur, records, moqueries et célébrations reçues, défis réussis ou ratés, badges simples, **badges à rangs** (bronze / argent / or, lot 7.8), badges et défis d'entraînement, exercices et plan d'entraînement, jeux de fléchettes. Les badges et rangs d'un ami s'affichent chez moi comme chez lui (même date, même partie, même volée).

**Nouveaux badges multijoueur en ligne** (validés par Guillaume le 24/11/2026) :

- **Premier contact** : première partie en ligne terminée.
- **Longue distance** : victoire en ligne contre un ami.
- **Revanche** : battre en ligne un ami qui vous avait battu à la partie précédente.
- **Sang-froid** : gagner en ligne après avoir été dernier à mi-partie.
- **Fidèle au poste** : 10 / 50 / 150 parties en ligne (bronze / argent / or).
- **Reconnexion héroïque** : gagner une partie en ligne après une coupure réseau.

## 9. Témoin de présence

- Sur la liste d'amis et les avatars : pastille **en ligne** (appli ouverte) et **en partie** (partie ou entraînement en cours), via la présence Supabase Realtime.
- Discrète, aux couleurs de la DA ; dernière activité affichée sinon (« vu il y a 2 h »).
- Réglage pour masquer sa propre présence.

## 10. Réglages

- Section **Compte et amis** : mon identifiant, synchronisation (état, dernière synchro, forcer), présence visible ou non, supprimer mes données en ligne.
- La synchronisation se coupe proprement si la variante installée n'a pas d'accès réseau.

## 10 bis. Robustesse dans le temps

- **Versions d'appli différentes** : chaque donnée envoyée porte un numéro de version de format. Une appli plus ancienne ignore proprement ce qu'elle ne connaît pas, sans planter ni perdre de données ; si le format est trop récent, elle affiche « Mets à jour Strela pour voir les parties de tes amis ». Les migrations de format restent rétrocompatibles.
- **Joueurs locaux qui installent l'appli plus tard** (ex. Tsia, Gilles) : à l'ajout en ami, même rattachement qu'en 7, depuis le téléphone de chaque ami qui l'avait en joueur local ; tout son historique remonte dans son profil. Plusieurs téléphones peuvent rattacher le même joueur local : les parties s'additionnent sans doublon.
- **Sauvegarde de la base en ligne** : l'offre gratuite n'en garde pas. Export automatique gratuit (ex. action GitHub planifiée, chaque semaine, dans un dépôt privé ou en artefact), avec procédure de restauration documentée. Les données locales de chaque téléphone restent la première source : la base peut être reconstruite à partir d'elles.

## 11. Tests

- Moteur de synchronisation testé sans réseau (file d'envoi, reprise, suppression propagée).
- Fusion de profils : pseudo identique, parties anciennes, annulation.
- Deux navigateurs Playwright : ajout d'ami par code, partie de soirée sur un téléphone visible chez l'autre, suppression propagée, présence.
- Vrai test par Guillaume à deux téléphones.

## Prompt pour Claude Code

> Session sur OrbitalVKL/STRELA. Lis `CLAUDE.md` et `docs/`, puis ce cahier (à copier dans `docs/lot-10.md`). Termine d'abord proprement ce qui est en cours (lot 9.5, puis lot 9). Mets en place Supabase en offre gratuite, sans carte bancaire ; Guillaume crée lui-même le projet Supabase en parallèle (compte, projet, connexion anonyme, script SQL) : ne le crée pas. Développe tout de ton côté avec l'adresse du projet et la clé publique en configuration (valeurs factices, tests sans réseau) ; écris le script SQL complet (tables, règles d'accès RLS, présence) dans \`supabase/schema.sql\`. Ne demande l'adresse et la clé publique qu'au moment où tu ne peux plus avancer sans elles, ou à la fin. Réalise le lot dans cet ordre : infra et compte invisible → amis → rattachement des profils existants → synchronisation des parties → stats partagées → présence. Une branche et une demande de fusion par étape, publiées dès que la CI est verte. Tiens `CLAUDE.md` (« État ») et `docs/` à jour. Surveille ta limite d'utilisation : si tu en approches, pause propre (branche poussée, état dans `docs/lot-10-avancement.md`) puis reprise dès que possible. À la fin de chaque étape, message court à Guillaume : **Fait** / **À toi** (quoi installer, quoi tester, à un ou deux téléphones, et ce qui n'a pas pu être vérifié).
