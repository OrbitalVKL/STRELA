// Strela — écran de secours (lot 4) : une erreur inattendue n'aboutit jamais à une page vide.
// Script classique (pas un module), chargé avant l'appli : il marche même si un module ne se charge pas. Il montre
// RECHARGER et EXPORTER LA SAUVEGARDE ; l'export relit la base du téléphone telle qu'elle est sur le disque
// (sans passer par l'appli, peut-être en panne), sinon ce que l'appli a en mémoire (window.__strelaExport). Le fichier
// a le format de la sauvegarde (src/data/backup.js, « strela-sauvegarde » version 1) : IMPORTER le relit.
// Livraison : passerelle de l'APK (lot 5, strelaNative.saveBackup) ou téléchargement.
(function () {
  'use strict';
  var shown = false;
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var fileName = function () {
    var d = new Date();
    return 'strela-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
  };
  var version = function () {
    var el = document.querySelector('#build [data-k="version"]');
    return el ? el.textContent.trim() : 'dev';
  };

  /** Écran de secours (HTML) : message, RECHARGER, EXPORTER LA SAUVEGARDE, détail de l'erreur. */
  function html(message) {
    return '<div class="screen rescue" role="alertdialog" aria-label="Erreur inattendue">'
      + '<div class="home-head"><h1 class="home-title" data-shrink>STRELA</h1></div>'
      + '<div class="pad">'
      + '<p class="rescue-h">UNE ERREUR INATTENDUE</p>'
      + '<p>Strela a rencontré un problème et ne peut pas continuer. Les joueurs et les parties sont restés sur le téléphone : '
      + 'RECHARGER suffit en général. Par précaution, EXPORTER LA SAUVEGARDE en garde une copie.</p>'
      + '<div class="btns">'
      + '<button type="button" class="btn accent big" onclick="strelaRescueReload()">RECHARGER</button>'
      + '<button type="button" class="btn" onclick="strelaRescueExport(this)">EXPORTER LA SAUVEGARDE</button>'
      + '</div>'
      + '<p class="note" id="rescue-status" role="status"></p>'
      + '<p class="note">Détail : <span class="rescue-msg">' + esc(message || 'erreur inconnue') + '</span> · v' + esc(version()) + '</p>'
      + '</div></div>';
  }

  /** Montre l'écran de secours à la place de l'appli (une seule fois). */
  function rescue(err) {
    if (shown) return;
    shown = true;
    var msg = err && (err.stack || err.message) ? String(err.message || err) : String(err || '');
    try { console.error('Strela : écran de secours', err); } catch (e) { /* rien */ }
    var app = document.getElementById('app');
    if (!app) return;
    // Remplacer #app par une copie sans écouteurs : l'appli, peut-être en panne, ne réagit plus aux touches.
    var fresh = app.cloneNode(false);
    fresh.innerHTML = html(msg);
    app.parentNode.replaceChild(fresh, app);
    document.body.dataset.rescue = '1';
    // APK (lot 6) : le retour n'a plus rien à faire dans la page ; Android peut faire sortir (retour prédictif).
    try { if (window.strelaNative && window.strelaNative.setBackHandled) window.strelaNative.setBackHandled(false); } catch (e) { /* rien */ }
    window.scrollTo(0, 0);
  }

  /** Base du téléphone relue telle quelle, sans jamais la créer ni la mettre à niveau. */
  function readDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB absent')); return; }
      var r;
      try { r = indexedDB.open('strela'); } catch (e) { reject(e); return; }
      r.onupgradeneeded = function () { r.transaction.abort(); }; // pas de base : ne pas en créer une vide
      r.onerror = function () { reject(r.error || new Error('base absente')); };
      r.onblocked = function () { reject(new Error('base occupée')); };
      r.onsuccess = function () {
        var db = r.result;
        try {
          var tx = db.transaction(['players', 'games', 'settings'], 'readonly');
          var out = { dbVersion: db.version };
          var get = function (store, key) {
            var q = tx.objectStore(store)[key]();
            q.onsuccess = function () { out[store + '.' + key] = q.result; };
          };
          get('players', 'getAll'); get('games', 'getAll'); get('settings', 'getAllKeys'); get('settings', 'getAll');
          tx.oncomplete = function () { db.close(); resolve(out); };
          tx.onerror = function () { db.close(); reject(tx.error); };
        } catch (e) { db.close(); reject(e); }
      };
    });
  }

  function fromDb(raw) {
    var settings = {};
    (raw['settings.getAllKeys'] || []).forEach(function (k, i) { settings[k] = raw['settings.getAll'][i]; });
    var games = (raw['games.getAll'] || []).map(function (g) {
      var o = {}; for (var k in g) if (Object.prototype.hasOwnProperty.call(g, k)) o[k] = g[k];
      if (o.endedAt === undefined) o.endedAt = null;
      return o;
    });
    return {
      format: 'strela-sauvegarde', version: 1, app: version(), exportedAt: new Date().toISOString(), dbVersion: raw.dbVersion,
      players: raw['players.getAll'] || [], games: games,
      settings: { display: settings.display || null, lastSetup: settings.lastSetup || null },
    };
  }

  function deliver(name, text) {
    var n = window.strelaNative;
    if (n && typeof n.saveBackup === 'function') {
      var r = {};
      try { r = JSON.parse(n.saveBackup(name, text, true)); } catch (e) { r = {}; } // lot 5 : Téléchargements/Strela + partage
      if (!r.ok) throw new Error(r.error || 'passerelle muette');
      return r.path;
    }
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    return 'téléchargements';
  }

  function say(text) { var el = document.getElementById('rescue-status'); if (el) el.textContent = text; }

  window.strelaRescue = rescue;
  window.strelaRescueHtml = html;
  window.strelaRescueReload = function () { location.reload(); };
  window.strelaRescueExport = function (btn) {
    if (btn) btn.disabled = true;
    say('Lecture des données…');
    var memory = function () { return typeof window.__strelaExport === 'function' ? window.__strelaExport() : null; };
    readDb().then(fromDb).catch(function () { return memory(); }).then(function (data) {
      if (!data) throw new Error('aucune donnée lisible');
      var name = fileName();
      var where = deliver(name, JSON.stringify(data));
      var np = (data.players || []).length, ng = (data.games || []).length;
      say(name + ' enregistré (' + where + ') : ' + np + ' joueur' + (np > 1 ? 's' : '') + ', ' + ng + ' partie' + (ng > 1 ? 's' : '') + '.');
    }).catch(function (e) {
      say('Export impossible : ' + ((e && e.message) || e) + '.');
    }).then(function () { if (btn) btn.disabled = false; });
  };

  // Erreurs de programmation non rattrapées : écran de secours. Les refus ordinaires du navigateur (partage annulé,
  // autorisation refusée…) ne sont pas des pannes.
  var BENIGN = /^(AbortError|NotAllowedError|NotSupportedError|SecurityError|InvalidStateError|NotFoundError)$/;
  window.addEventListener('error', function (ev) {
    if (!ev || !ev.error) return; // ressource introuvable, script tiers : pas une panne de l'appli
    rescue(ev.error);
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var e = ev && ev.reason;
    if (!e || (e.name && BENIGN.test(e.name))) return;
    if (e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError || e instanceof SyntaxError) rescue(e);
  });
  // Démarrage qui n'aboutit pas (module introuvable ou en erreur, base bloquée) : jamais de page vide.
  window.addEventListener('load', function () {
    setTimeout(function () { if (!document.body.dataset.ready) rescue(new Error('démarrage impossible (l\'appli ne s\'est pas chargée)')); }, 10000);
  });
}());
