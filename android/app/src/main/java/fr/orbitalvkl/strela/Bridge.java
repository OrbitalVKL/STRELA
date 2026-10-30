package fr.orbitalvkl.strela;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Passerelle « strelaNative » : ce que la page demande à Android. Appelée par la WebView sur son fil à elle (jamais le
 * fil de l'interface) ; les réponses sont des chaînes (JSON quand il y a plusieurs valeurs). La page s'en sert à la
 * place des API web quand elle la trouve (src/ui/native.js), avec les API web en repli dans le navigateur.
 * Seules les pages embarquées sont chargées dans la WebView (MainActivity) : aucune autre origine n'y a accès.
 */
public class Bridge {
    final MainActivity act;

    Bridge(MainActivity a) { act = a; }

    static String json(Object... kv) {
        JSONObject o = new JSONObject();
        try { for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]); } catch (Exception e) { /* */ }
        return o.toString();
    }

    /** Version de l'appli et du téléphone (diagnostic). */
    @JavascriptInterface
    public String info() {
        return json("version", act.version(), "sdk", Build.VERSION.SDK_INT, "model", Build.MANUFACTURER + " " + Build.MODEL);
    }

    // ------------------------------------------------------------------ vibreur
    /**
     * Vibration : `pattern` = durée en ms, ou tableau JSON [vibre, pause, vibre…] (les motifs de nav.js, BUZZ).
     * Réponse : 'sent' (confiée au vibreur), 'absent' (pas de vibreur), 'error'.
     */
    @JavascriptInterface
    public String vibrate(String pattern) {
        try {
            VibratorManager vm = (VibratorManager) act.getSystemService(MainActivity.VIBRATOR_MANAGER_SERVICE);
            Vibrator v = vm == null ? null : vm.getDefaultVibrator();
            if (v == null || !v.hasVibrator()) return "absent";
            VibrationEffect effect;
            String p = pattern.trim();
            if (p.startsWith("[")) {
                JSONArray a = new JSONArray(p);
                long[] t = new long[a.length() + 1];
                t[0] = 0;
                for (int i = 0; i < a.length(); i++) t[i + 1] = Math.max(0, Math.min(5000, a.getLong(i)));
                effect = VibrationEffect.createWaveform(t, -1);
            } else {
                effect = VibrationEffect.createOneShot(Math.max(1, Math.min(5000, Long.parseLong(p))), VibrationEffect.DEFAULT_AMPLITUDE);
            }
            // Usage « média » (jeu) : pas coupé avec le retour haptique tactile, comme l'était la vibration des pages web.
            if (Build.VERSION.SDK_INT >= 33) v.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_MEDIA));
            else v.vibrate(effect);
            return "sent";
        } catch (Exception e) { return "error"; }
    }

    // ------------------------------------------------------------------ voix
    /** Annonce en français (coupe la précédente) ; `strong` : appuyée (180). Faux si la voix n'est pas prête. */
    @JavascriptInterface
    public boolean speak(String text, boolean strong) { return act.speech.speak(text, strong); }

    @JavascriptInterface
    public void stopSpeaking() { act.speech.stop(); }

    /** État de la voix : { state: loading|ok|none|absent, name } (même sens que voiceInfo() de feedback.js). */
    @JavascriptInterface
    public String voice() { return act.speech.info(); }

    // ------------------------------------------------------------------ fichiers
    /**
     * Sauvegarde : écrite dans Téléchargements/Strela/<name> (MediaStore, sans permission) ; `share` : puis proposée au
     * menu de partage d'Android (copie dans le cache, FileProvider). Réponse { ok, path } ou { ok: false, error }.
     */
    @JavascriptInterface
    public String saveBackup(String name, String text, boolean share) {
        try {
            if (!name.matches("strela-[0-9]{8}-[0-9]{4}\\.json")) throw new IllegalArgumentException("nom de fichier refusé");
            byte[] data = text.getBytes(StandardCharsets.UTF_8);
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, name);
            v.put(MediaStore.Downloads.MIME_TYPE, "application/json");
            v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Strela");
            Uri u = act.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (u == null) throw new IllegalStateException("Téléchargements inaccessibles");
            try (OutputStream os = act.getContentResolver().openOutputStream(u)) {
                if (os == null) throw new IllegalStateException("écriture impossible");
                os.write(data);
            }
            String shown = name;
            try (android.database.Cursor c = act.getContentResolver().query(u, new String[]{MediaStore.Downloads.DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) shown = c.getString(0); // Android renomme si le fichier existe déjà
            } catch (Exception e) { /* nom demandé */ }
            if (share) share(name, data);
            return json("ok", true, "path", "Téléchargements/Strela/" + shown, "shared", share);
        } catch (Exception e) {
            return json("ok", false, "error", String.valueOf(e.getMessage()));
        }
    }

    void share(String name, byte[] data) throws Exception {
        File dir = new File(act.getCacheDir(), "share");
        dir.mkdirs();
        File[] old = dir.listFiles();
        if (old != null) for (File o : old) o.delete();
        File f = new File(dir, name);
        try (FileOutputStream os = new FileOutputStream(f)) { os.write(data); }
        Uri uri = FileProvider.getUriForFile(act, MainActivity.AUTHORITY, f);
        Intent send = new Intent(Intent.ACTION_SEND).setType("application/json")
            .putExtra(Intent.EXTRA_STREAM, uri).putExtra(Intent.EXTRA_SUBJECT, name)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, "Partager la sauvegarde");
        act.runOnUiThread(() -> { try { act.startActivity(chooser); } catch (Exception e) { /* aucune appli de partage */ } });
    }

    /** Où sont les données (dossier privé de l'appli, WebView) et leur taille en octets. */
    @JavascriptInterface
    public String storage() {
        File dir = new File(act.getDataDir(), "app_webview");
        return json("dir", dir.getAbsolutePath(), "bytes", size(dir));
    }

    static long size(File f) {
        if (f == null || !f.exists()) return 0;
        if (f.isFile()) return f.length();
        long n = 0;
        File[] l = f.listFiles();
        if (l != null) for (File c : l) n += size(c);
        return n;
    }

    // ------------------------------------------------------------------ écran
    @JavascriptInterface
    public void keepScreenOn(boolean on) { act.keepScreenOn(on); }

    @JavascriptInterface
    public void immersive(boolean on) { act.immersiveMode(on); }

    @JavascriptInterface
    public void setDark(boolean dark) { act.setDark(dark); }

    /** Zone des gestes en bas de l'écran, en px CSS (aussi posée dans --gesture-native). */
    @JavascriptInterface
    public int gestureInset() { return act.gestureCss; }

    // ------------------------------------------------------------------ mise à jour (Updater)
    @JavascriptInterface
    public void checkUpdate() { act.updater.check(); }

    @JavascriptInterface
    public void installUpdate() { act.updater.install(); }

    @JavascriptInterface
    public String updateState() { return act.updater.state().toString(); }
}
