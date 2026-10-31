# Publication sur Google Play — ce qu'il reste à faire (côté Guillaume)

Tout ce qui pouvait être préparé l'est (lot 6) : variante play (`fr.orbitalvkl.strela.play`, .aab signé), textes,
images, réponses aux formulaires, politique de confidentialité en ligne. Il ne reste que ce qui demande ton compte.

## 1. Compte de développeur

- [ ] Créer un compte Google Play Console **personnel** : https://play.google.com/console/signup (25 $, une fois).
- [ ] Vérifier ton identité (pièce d'identité), ton adresse et ton numéro de téléphone, comme Google le demande.
- [ ] Vérifier l'accès à un appareil Android depuis l'appli Play Console (demandé aux nouveaux comptes).
- [ ] Choisir l'e-mail de contact public, et me le donner : je le mets dans l'appli (À propos) et dans la politique de
      confidentialité, à la place de « [E-MAIL DE CONTACT] ».

## 2. Créer l'appli

- [ ] Play Console › Créer une appli : nom (voir [fiche.md](fiche.md), 30 caractères au plus), langue **français
      (France)**, **Application**, **Gratuite** ; accepter les règles.
- [ ] Signature : accepter **la signature d'applications par Google Play**. Le .aab de la CI est signé avec la clé
      actuelle de Strela, qui devient ta **clé d'importation** (ne jamais changer le secret `STRELA_SIGNING_PASSPHRASE`).

## 3. Fiche et formulaires

- [ ] Fiche principale : textes de [fiche.md](fiche.md), icône [icone-512.png](icone-512.png), image de présentation
      [presentation-1024x500.jpg](presentation-1024x500.jpg), 2 à 8 captures de [captures/](captures/).
- [ ] Catégorie **Sports**, coordonnées (e-mail), politique de confidentialité :
      https://orbitalvkl.github.io/STRELA/confidentialite.html
- [ ] Contenu de l'appli : Sécurité des données et autres déclarations ([securite-donnees.md](securite-donnees.md)),
      Classification et Public cible ([classification.md](classification.md)).

## 4. Test fermé : 12 testeurs pendant 14 jours

Obligatoire pour un compte personnel récent avant la mise en production.

- [ ] Réunir **au moins 12 testeurs** (comptes Google sur des téléphones Android) : liste d'e-mails ou groupe Google.
- [ ] Tests › Test fermé › créer un canal, y ajouter les testeurs.
- [ ] Télécharger le .aab : GitHub › Actions › **apk** › dernière exécution sur `main` › Artifacts ›
      `strela-play-aab-X.Y.Z` (gardé 90 jours) ; le décompresser : `strela-play.aab`.
- [ ] Créer une version dans le canal de test fermé, y envoyer `strela-play.aab`, notes de version en français.
- [ ] Envoyer le lien d'inscription aux testeurs ; chacun accepte et installe depuis le Play Store.
- [ ] Les 12 testeurs (au moins) restent inscrits **14 jours d'affilée** (garder l'appli installée et l'ouvrir de
      temps en temps).

## 5. Production

- [ ] Après les 14 jours : Tableau de bord › **Demander l'accès à la production** (questionnaire sur le test).
- [ ] Une fois accordé : Production › Créer une version › même .aab (ou un plus récent) › envoyer pour examen.
- [ ] Examen par Google (de quelques heures à quelques jours), puis publication.

## Bon à savoir

- Chaque envoi doit avoir un numéro de version plus grand que le précédent : un nouveau .aab sort à chaque version
  (0.6.0 → 600, 0.6.1 → 601…), produit par la CI à chaque fusion sur `main`.
- La version Play et la version GitHub sont **deux applis distinctes** sur le téléphone (identifiants différents) :
  leurs données ne se mélangent pas. Pour passer de l'une à l'autre : Réglages › Sauvegarde › EXPORTER, puis IMPORTER.
- La version Play n'a pas de mise à jour intégrée : le Play Store s'en charge.
