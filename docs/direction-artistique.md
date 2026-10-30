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
- Cible : filets fins `--faint`, simples alternés fond / `--fg` à 10 %, double et triple alternés `--red` / `--fg`
  à 40 %, numéros `--dim`. Impacts en carrés (rien d'arrondi) ; la loupe de saisie est carrée elle aussi.

## Rappel Grafit (pour les lots 4-5)

- `index.html` unique ; service worker « réseau d'abord (3 s), cache sinon » pour la page.
- `android/` : coquille Java WebView, page servie par `WebViewAssetLoader` sur
  `https://appassets.androidplatform.net/assets/…`, `FLAG_KEEP_SCREEN_ON` piloté par la page,
  `Updater.java` : dernière release GitHub → téléchargement → `PackageInstaller`.
- `.github/workflows/apk.yml` : copie la page dans `android/app/src/main/assets/www/`, version lue dans la
  page, clé de signature chiffrée dans le dépôt (`android/signing.p12.enc`, AES-256 PBKDF2), phrase de passe
  en secret GitHub, `gradle assembleRelease`, release `apk-vX.Y.Z`.
