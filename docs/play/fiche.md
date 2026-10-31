# Fiche Google Play — textes (lot 6)

Tout est prêt à copier dans la Play Console (Présence sur le Store › Fiche principale), langue **français (France)**.
Rien n'est envoyé : voir [checklist.md](checklist.md). Les longueurs sont vérifiées par `tests/play.test.js`.

## Nom de l'appli (30 caractères au plus)

```
Strela, compteur de fléchettes
```

Le titre demandé, « Strela — compteur de fléchettes », fait **31 caractères** : Google Play en refuse plus de 30.
Proposition ci-dessus (30, virgule à la place du tiret). Autre possibilité : « Strela – fléchettes X01 » (23).
Sur le téléphone, l'appli garde le nom court **Strela**.

## Description courte (80 caractères au plus)

```
Compteur de fléchettes X01 hors ligne : saisie rapide, finitions, stats.
```

## Description longue (4 000 caractères au plus)

```
Strela compte vos parties de fléchettes en X01 (301, 501, 701), sans compte, sans publicité et sans connexion : tout reste sur le téléphone.

SAISIE RAPIDE
• Un pavé de grandes touches pour les simples, doubles et triples, utilisable d'une main entre deux volées.
• En paysage, saisie directe sur une cible aux couleurs réglementaires, avec une loupe sous le doigt.
• ANNULER retire la dernière fléchette, même après un changement de joueur, un bust ou une fin de manche.
• Correction d'une fléchette déjà jouée, si le déroulé de la partie ne change pas.

LES RÈGLES, SANS Y PENSER
• Sortie simple ou double, bust, manches à gagner, de 1 à 8 joueurs.
• Finition conseillée à chaque volée, selon le double préféré de chaque joueur (D20, D16…) et s'il préfère éviter le bull.
• Annonces vocales en français (total de la volée, bust, finition jouable), sons et vibrations, chacun réglable.
• Célébrations discrètes pour les 100, 140 et 180, et pour les finitions.

JOUEURS ET STATISTIQUES
• Chaque joueur a son pseudo et son avatar : initiales, photo recadrée ou l'un des 40 pictogrammes dessinés pour Strela, sur l'un de 16 fonds.
• Moyenne sur 3 fléchettes, 9 premières, taux de finition et de doubles, meilleures finitions, 100+, 140+, 180.
• Face-à-face entre deux joueurs, historique complet partie par partie et volée par volée.
• Une partie interrompue reprend exactement où elle en était.

VOS DONNÉES RESTENT CHEZ VOUS
• Aucune donnée collectée, transmise ou partagée ; aucun accès à Internet.
• Sauvegarde dans un fichier que vous rangez où vous voulez, et import pour changer de téléphone.

UNE CONSOLE SOBRE
Thème sombre ou clair (ou celui du téléphone), mode nuit pour la pénombre, police Martian Mono, angles droits : un écran lisible de loin, pensé pour rester posé près de la cible.
```

## Catégorie et coordonnées

- Type : **Application** ; catégorie : **Sports** (un compteur pour un jeu d'adresse ; voir
  [classification.md](classification.md)).
- Adresse e-mail de contact : **[E-MAIL DE CONTACT]** (la même dans `package.json`, champ `strela.contact`, qui la
  met dans l'écran À propos et la politique de confidentialité).
- Politique de confidentialité : https://orbitalvkl.github.io/STRELA/confidentialite.html

## Images

| Élément | Fichier | Format |
|---|---|---|
| Icône | [icone-512.png](icone-512.png) | 512 × 512, PNG |
| Image de présentation | [presentation-1024x500.jpg](presentation-1024x500.jpg) | 1024 × 500, JPEG |
| Captures de téléphone (2 à 8) | [captures/](captures/) | 1080 × 1920 (portrait) et 1920 × 1080 (paysage), JPEG |

Captures (sombre et clair pour chacune ; en choisir 8 au plus, par exemple les 6 en sombre et 2 en clair) :
1. accueil ; 2. saisie et finition conseillée ; 3. statistiques d'un joueur ; 4. banque d'avatars (carabine choisie) ;
5. saisie sur la cible en paysage ; 6. historique de la partie en cours, en paysage.
Données fictives de la maquette. Refaire les images : `node tools/make-icons.mjs` et `node tools/play-assets.mjs`.
