package fr.orbitalvkl.strela;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
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
 * ne porte pas la même signature que l'appli installée ; les données (base de la page) sont gardées. Rien ne part sans
 * un appui sur RECHERCHER UNE MISE À JOUR (Réglages).
 * Envoie à la page : { update: { current, latest, available, state: idle|checking|downloading|installing|error,
 * progress, size, msg } }.
 */
class Updater {
    static final String API = "https://api.github.com/repos/OrbitalVKL/STRELA/releases/latest";
    static final String DOWNLOADS = "https://github.com/OrbitalVKL/STRELA/releases/download/";
    static final String ACTION = "fr.orbitalvkl.strela.INSTALL_STATUS";
    final MainActivity act;
    String latest = null, url = null, state = "idle", msg = "";
    long size = 0;
    int progress = 0;
    boolean busy = false;

    Updater(MainActivity a) { act = a; }

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

    void check() {
        if (busy) return;
        busy = true; state = "checking"; msg = ""; report();
        new Thread(() -> {
            try {
                HttpURLConnection c = open(API);
                c.setRequestProperty("Accept", "application/vnd.github+json");
                int code = c.getResponseCode();
                if (code == 404) throw new Exception("aucune version publiée");
                if (code != 200) throw new Exception("GitHub a répondu " + code);
                StringBuilder sb = new StringBuilder();
                try (InputStream in = c.getInputStream()) {
                    byte[] b = new byte[8192]; int n;
                    while ((n = in.read(b)) > 0) sb.append(new String(b, 0, n, "UTF-8"));
                }
                JSONObject r = new JSONObject(sb.toString());
                String tag = r.optString("tag_name", "");
                JSONArray as = r.optJSONArray("assets");
                String u = null; long sz = 0;
                if (as != null) for (int i = 0; i < as.length(); i++) {
                    JSONObject a = as.getJSONObject(i);
                    if ("strela.apk".equals(a.optString("name"))) { u = a.optString("browser_download_url"); sz = a.optLong("size"); }
                }
                // seule source admise : les releases du dépôt Strela
                if (u != null && !u.startsWith(DOWNLOADS)) u = null;
                latest = tag.startsWith("apk-v") ? tag.substring(5) : tag;
                url = u; size = sz; state = "idle";
                msg = available() ? "Version " + latest + " disponible." : "Strela est à jour.";
            } catch (Exception e) {
                state = "error"; msg = "Recherche impossible : " + e.getMessage() + ". Connexion Internet ?";
            }
            busy = false;
            report();
        }).start();
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
                p.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
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

    /** Retour de PackageInstaller : confirmation à demander, échec, ou succès (l'appli redémarre). */
    final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context ctx, Intent i) {
            int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
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
