package fr.orbitalvkl.strela;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Mise à jour depuis l'appli (sur le modèle de Grafit) : dernière release de OrbitalVKL/STRELA (API GitHub, HTTPS),
 * téléchargement de strela.apk dans le cache, installation par PackageInstaller. Android refuse toute mise à jour qui
 * ne porte pas la même signature que l'appli installée ; les données (base de la page) sont gardées.
 * Recherche : sur appui (RECHERCHER UNE MISE À JOUR), ou automatique (lot 6) au lancement, hors partie, si le réglage
 * le permet, au plus une fois par 24 h (heure de la dernière recherche gardée) ; le résultat est gardé (version,
 * adresse) pour que le repère « mise à jour disponible » reste d'un lancement à l'autre. Rien n'est téléchargé sans
 * appui sur INSTALLER. Variante « github » seulement (src/github).
 * Envoie à la page : { update: { current, latest, available, state: idle|checking|downloading|installing|error,
 * progress, size, msg, checkedAt, auto } }.
 */
class Updater {
    static final String API = "https://api.github.com/repos/OrbitalVKL/STRELA/releases/latest";
    static final String DOWNLOADS = "https://github.com/OrbitalVKL/STRELA/releases/download/";
    static final String LATEST_PAGE = "https://github.com/OrbitalVKL/STRELA/releases/latest";
    static final String ACTION = "fr.orbitalvkl.strela.INSTALL_STATUS";
    static final long DAY = 24L * 3600 * 1000;
    final MainActivity act;
    final SharedPreferences prefs;
    String latest = null, url = null, state = "idle", msg = "";
    long size = 0, checkedAt = 0;
    int progress = 0;
    boolean busy = false, auto = false;

    Updater(MainActivity a) {
        act = a;
        prefs = a.getSharedPreferences("updates", Context.MODE_PRIVATE);
        latest = prefs.getString("latest", null);
        url = prefs.getString("url", null);
        size = prefs.getLong("size", 0);
        checkedAt = prefs.getLong("checkedAt", 0);
    }

    /** Recherche automatique : GitHub au plus une fois par 24 h ; sinon l'état gardé est renvoyé tel quel. */
    void autoCheck() {
        long now = System.currentTimeMillis();
        if (busy || (checkedAt > 0 && now - checkedAt < DAY && now >= checkedAt)) { report(); return; }
        auto = true;
        check();
    }

    String current() { return act.version(); }

    static int[] parse(String v) {
        String[] p = v.replaceAll("[^0-9.]", "").split("\\.");
        int[] r = new int[3];
        for (int i = 0; i < 3 && i < p.length; i++) try { r[i] = Integer.parseInt(p[i]); } catch (Exception e) { r[i] = 0; }
        return r;
    }

    static boolean newer(String a, String b) {            // a > b ?
        int[] x = parse(a), y = parse(b);
        for (int i = 0; i < 3; i++) if (x[i] != y[i]) return x[i] > y[i];
        return false;
    }

    boolean available() { return latest != null && url != null && newer(latest, current()); }

    JSONObject state() {
        JSONObject u = new JSONObject();
        try {
            u.put("current", current());
            if (latest != null) u.put("latest", latest);
            u.put("available", available());
            u.put("state", state);
            u.put("progress", progress);
            if (size > 0) u.put("size", size);
            if (!msg.isEmpty()) u.put("msg", msg);
            if (checkedAt > 0) u.put("checkedAt", checkedAt);
            u.put("auto", auto);
        } catch (Exception e) { /* */ }
        return u;
    }

    void report() {
        try { JSONObject d = new JSONObject(); d.put("update", state()); act.push(d); } catch (Exception e) { /* */ }
    }

    static HttpURLConnection open(String u) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "StrelaAPK");
        c.setInstanceFollowRedirects(true);
        return c;
    }

    /** Recherche sur appui (auto = false) ou automatique (autoCheck). */
    void check() {
        if (busy) return;
        boolean silent = auto;
        busy = true; state = "checking"; msg = ""; report();
        new Thread(() -> {
            try {
                // 1. API de GitHub (version, adresse et taille du fichier). Sans compte, GitHub n'en permet que 60 par heure
                //    et par adresse IP : sur le réseau mobile, l'adresse est partagée et la limite vite atteinte (403).
                // 2. Sinon, la page web « dernière release » (non limitée de la même façon) : sa redirection donne
                //    l'étiquette apk-vX.Y.Z, d'où l'adresse du fichier (lot 6.1).
                String[] found = null;
                String why = null;
                boolean limited = false;
                try { found = fromApi(); }
                catch (RateLimited e) { limited = true; why = e.getMessage(); }
                catch (Exception e) { why = e.getMessage(); }
                if (found == null) {
                    try { found = fromWeb(); }
                    catch (Exception e) {
                        throw new Exception(limited
                            ? "GitHub limite les recherches depuis ce réseau (trop de demandes) : réessaie dans une heure, ou en Wi-Fi"
                            : (why != null ? why : e.getMessage()));
                    }
                }
                String tag = found[0], u = found[1];
                long sz = found[2] == null ? 0 : Long.parseLong(found[2]);
                // seule source admise : les releases du dépôt Strela
                if (u != null && !u.startsWith(DOWNLOADS)) u = null;
                latest = tag.startsWith("apk-v") ? tag.substring(5) : tag;
                url = u; size = sz; state = "idle";
                checkedAt = System.currentTimeMillis();
                prefs.edit().putString("latest", latest).putString("url", url).putLong("size", size).putLong("checkedAt", checkedAt).apply();
                msg = available() ? "Version " + latest + " disponible." : "Strela est à jour.";
            } catch (Exception e) {
                // Recherche automatique sans réseau : rien à dire (pas d'alerte au lancement) ; on réessaiera au suivant.
                state = silent ? "idle" : "error";
                String m = String.valueOf(e.getMessage());
                msg = silent ? "" : m.startsWith("GitHub limite") ? m + "." : "Recherche impossible : " + m + ". Connexion Internet ?";
            }
            auto = false;
            busy = false;
            report();
        }).start();
    }

    /** Limite de l'API de GitHub atteinte (403 ou 429, X-RateLimit-Remaining à 0). */
    static class RateLimited extends Exception { RateLimited(String m) { super(m); } }

    /** Dernière release par l'API : { étiquette, adresse de strela.apk, taille } ; null si la release n'a pas d'APK. */
    static String[] fromApi() throws Exception {
        HttpURLConnection c = open(API);
        c.setRequestProperty("Accept", "application/vnd.github+json");
        int code = c.getResponseCode();
        if (code == 404) throw new Exception("aucune version publiée");
        if (code == 403 || code == 429) {
            String left = c.getHeaderField("X-RateLimit-Remaining");
            if ("0".equals(left) || code == 429) throw new RateLimited("GitHub a répondu " + code + " (limite de l'API)");
        }
        if (code != 200) throw new Exception("GitHub a répondu " + code);
        StringBuilder sb = new StringBuilder();
        try (InputStream in = c.getInputStream()) {
            byte[] b = new byte[8192]; int n;
            while ((n = in.read(b)) > 0) sb.append(new String(b, 0, n, "UTF-8"));
        }
        JSONObject r = new JSONObject(sb.toString());
        String tag = r.optString("tag_name", "");
        JSONArray as = r.optJSONArray("assets");
        if (as != null) for (int i = 0; i < as.length(); i++) {
            JSONObject a = as.getJSONObject(i);
            if ("strela.apk".equals(a.optString("name"))) return new String[]{tag, a.optString("browser_download_url"), String.valueOf(a.optLong("size"))};
        }
        return null;
    }

    /**
     * Dernière release par la page web : https://github.com/OrbitalVKL/STRELA/releases/latest redirige vers
     * …/releases/tag/apk-vX.Y.Z ; le fichier est alors …/releases/download/apk-vX.Y.Z/strela.apk (taille inconnue).
     */
    static String[] fromWeb() throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(LATEST_PAGE).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "StrelaAPK");
        c.setInstanceFollowRedirects(false);
        int code = c.getResponseCode();
        String loc = c.getHeaderField("Location");
        c.disconnect();
        String tag = tagFromLocation(loc);
        if (code / 100 != 3 || tag == null) throw new Exception("GitHub a répondu " + code);
        return new String[]{tag, DOWNLOADS + tag + "/strela.apk", null};
    }

    /** Étiquette apk-vX.Y.Z tirée de l'adresse …/OrbitalVKL/STRELA/releases/tag/apk-vX.Y.Z ; null sinon. */
    static String tagFromLocation(String loc) {
        if (loc == null) return null;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("/OrbitalVKL/STRELA/releases/tag/(apk-v\\d+\\.\\d+\\.\\d+)/?$").matcher(loc);
        return m.find() ? m.group(1) : null;
    }

    void install() {
        if (busy) return;
        if (!available()) { check(); return; }
        if (!act.getPackageManager().canRequestPackageInstalls()) {
            state = "error"; msg = "Autorise « Installer des applis inconnues » pour Strela, puis touche de nouveau INSTALLER."; report();
            act.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + act.getPackageName())));
            return;
        }
        busy = true; state = "downloading"; progress = 0; msg = ""; report();
        new Thread(() -> {
            File f = new File(act.getCacheDir(), "update.apk");
            try {
                HttpURLConnection c = open(url);
                if (c.getResponseCode() != 200) throw new Exception("GitHub a répondu " + c.getResponseCode());
                long total = c.getContentLengthLong() > 0 ? c.getContentLengthLong() : size, got = 0, lastT = 0;
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(f)) {
                    byte[] b = new byte[65536]; int n;
                    while ((n = in.read(b)) > 0) {
                        out.write(b, 0, n); got += n;
                        if (total > 0 && System.currentTimeMillis() - lastT > 300) { progress = (int) (got * 100 / total); lastT = System.currentTimeMillis(); report(); }
                    }
                }
                if (size > 0 && f.length() != size) throw new Exception("fichier incomplet");
                state = "installing"; progress = 100; report();
                PackageInstaller pi = act.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams p = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                p.setAppPackageName(act.getPackageName());
                if (Build.VERSION.SDK_INT >= 31) p.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                int id = pi.createSession(p);
                try (PackageInstaller.Session s = pi.openSession(id)) {
                    try (InputStream in = new FileInputStream(f); OutputStream out = s.openWrite("strela.apk", 0, f.length())) {
                        byte[] b = new byte[65536]; int n;
                        while ((n = in.read(b)) > 0) out.write(b, 0, n);
                        s.fsync(out);
                    }
                    Intent cb = new Intent(ACTION).setPackage(act.getPackageName());
                    PendingIntent pend = PendingIntent.getBroadcast(act, id, cb, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
                    s.commit(pend.getIntentSender());
                }
            } catch (Exception e) {
                state = "error"; msg = "Mise à jour impossible : " + e.getMessage() + "."; busy = false; report();
                f.delete();
            }
        }).start();
    }

    @SuppressWarnings("deprecation")
    static Intent legacyIntent(Intent i) { return (Intent) i.getParcelableExtra(Intent.EXTRA_INTENT); }

    /** Retour de PackageInstaller : confirmation à demander, échec, ou succès (l'appli redémarre). */
    final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context ctx, Intent i) {
            int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent confirm = Build.VERSION.SDK_INT >= 33 ? i.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class) : legacyIntent(i);
                if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); act.startActivity(confirm); }
                return;
            }
            busy = false;
            if (st == PackageInstaller.STATUS_SUCCESS) { state = "idle"; msg = "Installée."; }
            else { state = "error"; msg = st == PackageInstaller.STATUS_FAILURE_ABORTED ? "Installation annulée." : "Installation refusée : " + i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE); }
            new File(act.getCacheDir(), "update.apk").delete();
            report();
        }
    };
}
