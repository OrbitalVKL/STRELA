#!/bin/sh
# Strela — page embarquée dans l'APK (lot 5) : le site construit (_site/, tools/build-site.mjs) copié dans
# android/app/src/main/assets/www/, sans le service worker (inutile et gênant dans l'APK : la page y est servie par
# WebViewAssetLoader, toujours hors ligne) ni le résumé des tests. Lancé par apk.yml et ci.yml.
set -e
cd "$(dirname "$0")/.."
WWW=android/app/src/main/assets/www
rm -rf "$WWW"
mkdir -p "$WWW"
cp -r _site/index.html _site/manifest.webmanifest _site/assets _site/src "$WWW/"
# Données de maquette comprises (sommaire ?maquette, depuis les Réglages) : quelques ko, utiles pour vérifier l'APK.
echo "page embarquée : $(du -sh "$WWW" | cut -f1) dans $WWW"
