# Direction artistique — « console Soyuz »

Reprise de Grafit (OrbitalVKL/GRAFIT, public, **lecture seule** : on ne le modifie jamais).
Source de vérité des couleurs : `src/ui/theme.js` ; `assets/theme.css` les reprend à l'identique
(vérifié par `tests/theme.test.js`).

## Couleurs

Atténué = 62 % du texte mélangé au fond ; discret = 30 % (même calcul que `mix()` dans Grafit).

| Jeton CSS | Rôle | Sombre | Clair |
|---|---|---|---|
| `--bg` | fond | `#0A0C0E` | `#ECEDEE` |
| `--fg` | texte | `#CFD2D4` | `#14171A` |
| `--dim` | atténué (62 %) | `#848789` | `#66686B` |
| `--faint` | discret (30 %), filets | `#454749` | `#ABADAE` |
| `--red` | rouge (aplats) | `#9E4A4A` | `#9E4A4A` |
| `--red-text` | texte rouge | `#C26A6A` | `#9E4A4A` (*) |
| `--red-ink` | texte sur aplat rouge (bandeau BUST) | `#F6ECEC` | `#F6ECEC` |
| `--inv-fg` / `--inv-bg` | vidéo inverse | `#0C0F12` sur `#CFD2D4` | `#ECEDEE` sur `#14171A` |
| `--av-0` … `--av-7` | fonds d'avatar (les deux thèmes) : ardoise `#234870`, sapin `#3F7352`, olive `#464415`, ocre `#8B6135`, brique `#6D312C`, prune `#57385E`, pétrole `#0D7281`, graphite `#69686B` | | |

Fonds d'avatar (lot 1.2) : retouchés pour que deux d'entre eux ne se confondent jamais, y compris de loin sur le
bandeau du joueur : écart CIEDE2000 d'au moins 20 entre deux fonds (`deltaE()` de theme.js, testé), contre 6,4 pour
l'ancien couple ardoise / graphite et 9,3 pour sapin / pétrole ; encre `#ECEDEE` lisible sur chacun (4,6:1 au moins).
Aucune couleur n'est interdite dans une partie : deux joueurs peuvent garder la même.

(*) En clair, `#C26A6A` sur `#ECEDEE` ne donne que 3,2:1 de contraste (illisible de loin) ; le texte
rouge prend le rouge de base `#9E4A4A` (5,1:1). `#F6ECEC` vient de Grafit (REDINK).
Le discret (`--faint`) sert aux filets et aux éléments vraiment secondaires, pas à du texte à lire.

## Thème

`<html data-theme="auto|dark|light">`. Auto (défaut) suit le réglage du téléphone
(`prefers-color-scheme`). Le choix est gardé dans `localStorage` sous `strela.theme` (sera repris dans
les réglages de l'appli). La balise `theme-color` suit le fond.

## Typographie et formes

- Police **Martian Mono** (variable : graisse 100–800, chasse 75–112,5 %), embarquée dans
  `assets/fonts/` (latin, latin étendu, cyrillique ; licence OFL dans `assets/fonts/OFL.txt`).
  Aucun appel à Google Fonts : tout marche hors ligne.
- Libellés en capitales avec léger espacement (`.caps`), chiffres tabulaires pour les scores.
- Filets fins de 1 px (`--rule`), **angles droits partout**, rien d'arrondi (`border-radius: 0` global).
- Vidéo inverse (`.inv`) pour l'état sélectionné et VALIDER ; aplat rouge (`.alert`) pour le bust et les
  confirmations graves (supprimer un joueur).
- Joueur actif (lot 1.1) : bandeau en **aplat de la couleur de fond de son avatar** (`--av-0` … `--av-7`, encre
  `--av-ink`), pour reconnaître le joueur de loin ; même aplat pour l'annonce « À TOI » et filet de cette couleur
  sur le joueur suivant. Pseudo en Martian Mono étroite (`font-stretch: 75 %`).
- Cible (lot 1.2) : voir ci-dessous. Seule exception au « rien d'arrondi » : la cible elle-même et ses marques
  d'impact, rondes pour être lues comme des fléchettes plantées. La loupe de saisie reste carrée.

## Cible (lot 1.2)

Couleurs d'une cible réglementaire, légèrement désaturées pour rester dans la DA mais franchement rouge et vert.
La cible est un objet physique : **mêmes couleurs en sombre et en clair** (jetons `--board-*`, définis une seule
fois dans `:root` ; source : `BOARD_COLORS` de `src/ui/theme.js`, testé par `tests/cible.test.js`).

| Jeton | Rôle | Valeur |
|---|---|---|
| `--board-black` | simples du 20 et d'un secteur sur deux | `#1E2022` |
| `--board-cream` | autres simples | `#E4D9BC` |
| `--board-red` | doubles et triples des secteurs noirs, 50 | `#B0443D` |
| `--board-green` | doubles et triples des secteurs crème, 25 | `#2F7D50` |
| `--board-ring` | couronne des numéros | `#151719` |
| `--board-num` | numéros (blancs) | `#F2F0EA` |
| `--board-wire` | fils métalliques fins entre les zones | `#A2A7AC` |
| `--board-mark` / `--board-mark-ink` | marque d'impact : disque clair, cercle et numéro sombres | `#FAF8F2` / `#0E1012` |

Ordre des numéros : 20 en haut, puis 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5 dans le sens
horaire (`SECTORS`, `zoneTone()` de `src/engine/board.js`). Anneaux élargis (0,15 du rayon) pour la saisie au doigt.
Marque de la volée en cours : disque clair cerclé de sombre, numéro 1, 2, 3 (lisible sur le noir comme sur le crème) ;
volées précédentes : petit point sombre cerclé de clair. Carte des segments des stats : la cible assombrie, chaque
zone éclairée d'autant plus qu'elle a été touchée.

## Rappel Grafit (pour les lots 4-5)

- `index.html` unique ; service worker « réseau d'abord (3 s), cache sinon » pour la page.
- `android/` : coquille Java WebView, page servie par `WebViewAssetLoader` sur
  `https://appassets.androidplatform.net/assets/…`, `FLAG_KEEP_SCREEN_ON` piloté par la page,
  `Updater.java` : dernière release GitHub → téléchargement → `PackageInstaller`.
- `.github/workflows/apk.yml` : copie la page dans `android/app/src/main/assets/www/`, version lue dans la
  page, clé de signature chiffrée dans le dépôt (`android/signing.p12.enc`, AES-256 PBKDF2), phrase de passe
  en secret GitHub, `gradle assembleRelease`, release `apk-vX.Y.Z`.
