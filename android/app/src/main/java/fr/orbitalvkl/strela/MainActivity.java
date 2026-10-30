package fr.orbitalvkl.strela;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Log;
import android.view.KeyEvent;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.File;

/**
 * Strela : la page Strela embarquée dans l'APK (assets/www, copiée par apk.yml), servie par WebViewAssetLoader sur
 * https://appassets.androidplatform.net (origine sûre : IndexedDB, Web Audio, modules ES), dans une WebView ; et la
 * passerelle « strelaNative » (Bridge) vers le vibreur, la voix, les fichiers et la mise à jour.
 * Hors ligne complet : seules les pages embarquées sont chargées ; tout autre lien s'ouvre dans le navigateur.
 * Rotation sans recharger la page (configChanges) ; retour d'Android confié à la page (window.strelaBack).
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String ORIGIN = "https://" + HOST;
    static final String START = ORIGIN + "/assets/www/index.html";
    static final String AUTHORITY = "fr.orbitalvkl.strela.files";
    static final int REQ_FILE = 11;

    WebView web;
    FrameLayout root;
    Bridge bridge;
    Speech speech;
    Updater updater;
    boolean pageReady = false;
    boolean immersive = false;
    volatile int backs = 0;                 // retours reçus (diagnostic, vérification sur émulateur)
    int gestureCss = 0;                     // zone des gestes en bas, en px CSS, au-delà de la marge déjà laissée
    ValueCallback<Uri[]> fileCallback;      // sélecteur de fichiers de la page en attente
    Uri photoUri;                           // photo en cours de prise de vue

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Log.i("Strela", "onCreate" + (state != null ? " (activité recréée)" : ""));
        speech = new Speech(this);
        updater = new Updater(this);
        bridge = new Bridge(this);

        web = new WebView(this);
        root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        // Bord à bord (imposé par Android 15) : le cadre laisse la place des barres système et de la découpe de la
        // caméra ; la zone des gestes en bas (getMandatorySystemGestureInsets) est transmise à la page, qui en fait la
        // marge basse du pavé (--gesture-native). En plein écran (partie), les barres sont masquées : seule la zone des
        // gestes reste, et la page la connaît.
        root.setOnApplyWindowInsetsListener((v, ins) -> {
            Insets bars = ins.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            Insets gest = ins.getInsets(WindowInsets.Type.mandatorySystemGestures());
            float d = getResources().getDisplayMetrics().density;
            int css = Math.round(Math.max(0, gest.bottom - bars.bottom) / d);
            if (css != gestureCss) { gestureCss = css; pushGesture(); }
            return WindowInsets.CONSUMED;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);          // sons Web Audio sans geste préalable
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);                          // photo et sauvegarde choisies (content://)
        s.setTextZoom(100);                                     // la page applique elle-même la police du téléphone
        s.setUserAgentString(s.getUserAgentString() + " StrelaAPK/" + version());
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(s, false); // la page a ses propres thèmes
        }
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);     // APK de test seulement (vérifications sur émulateur)
        web.setBackgroundColor(getColor(R.color.bg));
        root.setBackgroundColor(getColor(R.color.bg));

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* aucun navigateur */ }
                return true;
            }
            // Touche retour : jamais confiée à la page web (la WebView la garderait pour elle) ; l'activité la traite.
            @Override
            public boolean shouldOverrideKeyEvent(WebView v, KeyEvent e) {
                return e.getKeyCode() == KeyEvent.KEYCODE_BACK || super.shouldOverrideKeyEvent(v, e);
            }
            @Override
            public void onPageFinished(WebView v, String url) {
                pageReady = true;
                pushGesture();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                return chooseFile(cb, p);
            }
        });
        web.addJavascriptInterface(bridge, "strelaNative");
        // Retour d'Android 13 et plus (OnBackInvokedDispatcher, déclaré dans le manifeste) ; avant : onBackPressed().
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }
        IntentFilter f = new IntentFilter(Updater.ACTION);
        ContextCompat.registerReceiver(this, updater.receiver, f, ContextCompat.RECEIVER_NOT_EXPORTED);
        // Activité recréée (thème du téléphone changé) : la page revient où elle était ; sinon, l'accueil.
        if (state == null || web.restoreState(state) == null) web.loadUrl(START);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    String version() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
    }

    // ------------------------------------------------------------------ sélecteur de fichiers (photo, sauvegarde)
    /**
     * Sélecteur de la page : photo d'avatar (accept image/*) → appareil photo direct si la page le demande
     * (capture), sinon choix entre la galerie et l'appareil photo ; sauvegarde (accept JSON) → sélecteur de documents.
     */
    boolean chooseFile(ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams p) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = cb;
        photoUri = null;
        boolean image = false;
        for (String t : p.getAcceptTypes()) if (t != null && t.startsWith("image")) image = true;
        try {
            Intent pick;
            if (image) {
                Intent camera = cameraIntent();
                if (p.isCaptureEnabled() && camera != null) pick = camera;
                else {
                    Intent gallery = new Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*");
                    if (gallery.resolveActivity(getPackageManager()) == null) {
                        gallery = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
                    }
                    pick = Intent.createChooser(gallery, "Photo de l'avatar");
                    if (camera != null) pick.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                }
            } else {
                pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                    .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
            }
            startActivityForResult(pick, REQ_FILE);
            return true;
        } catch (ActivityNotFoundException e) {
            fileCallback = null;
            return false;
        }
    }

    /** Prise de vue par l'appareil photo d'Android, dans un fichier du cache (FileProvider) ; null sans appareil. */
    Intent cameraIntent() {
        Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (i.resolveActivity(getPackageManager()) == null) return null;
        try {
            File dir = new File(getCacheDir(), "photos");
            dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File o : old) o.delete();
            File f = new File(dir, "photo-" + System.currentTimeMillis() + ".jpg");
            photoUri = FileProvider.getUriForFile(this, AUTHORITY, f);
            i.putExtra(MediaStore.EXTRA_OUTPUT, photoUri);
            i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return i;
        } catch (Exception e) { return null; }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        Log.i("Strela", "fichier choisi : " + res + " " + (data != null ? data.getData() : null) + (fileCallback == null ? " (page perdue)" : ""));
        if (req != REQ_FILE || fileCallback == null) return;
        Uri[] out = null;
        if (res == RESULT_OK) {
            if (data != null && data.getData() != null) out = new Uri[]{data.getData()};
            else if (data != null && data.getClipData() != null && data.getClipData().getItemCount() > 0) out = new Uri[]{data.getClipData().getItemAt(0).getUri()};
            else if (photoUri != null && new File(new File(getCacheDir(), "photos"), photoUri.getLastPathSegment()).length() > 0) out = new Uri[]{photoUri};
        }
        fileCallback.onReceiveValue(out);
        fileCallback = null;
    }

    // ------------------------------------------------------------------ écran (pilotés par la page)
    void keepScreenOn(boolean on) {
        runOnUiThread(() -> {
            if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    /** Plein écran immersif pendant la partie : barres masquées, rappelées par un geste depuis le bord. */
    void immersiveMode(boolean on) {
        runOnUiThread(() -> {
            immersive = on;
            WindowInsetsController c = getWindow().getInsetsController();
            if (c == null) return;
            if (on) {
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                c.hide(WindowInsets.Type.systemBars());
            } else c.show(WindowInsets.Type.systemBars());
        });
    }

    /** Thème de la page : fond de la fenêtre et icônes des barres système lisibles (claires sur sombre). */
    void setDark(boolean dark) {
        runOnUiThread(() -> {
            int bg = dark ? 0xFF0A0C0E : 0xFFECEDEE;
            root.setBackgroundColor(bg);
            web.setBackgroundColor(bg);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(dark ? 0 : light, light);
            }
        });
    }

    void pushGesture() {
        if (!pageReady) return;
        runOnUiThread(() -> web.evaluateJavascript(
            "document.documentElement.style.setProperty('--gesture-native','" + gestureCss + "px')", null));
    }

    /** Envoi à la page : window.dispatchEvent(new CustomEvent('strela-native', {detail})). */
    void push(JSONObject detail) {
        if (!pageReady) return;
        String js = "window.dispatchEvent(new CustomEvent('strela-native',{detail:" + detail + "}))";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    /**
     * Retour d'Android : confié à la page (window.strelaBack), qui ferme d'abord un panneau ou un menu ouvert, puis
     * remonte d'un écran ; en partie, elle ouvre le menu pause. Elle répond false seulement à l'accueil : Strela passe
     * alors en arrière-plan (jamais de sortie directe en pleine partie).
     */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() { goBack(); }

    /** Touche retour (clavier, adb, navigation à 3 boutons) prise avant la WebView, qui sinon la garde pour elle. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (e.getAction() == KeyEvent.ACTION_UP && !e.isCanceled()) goBack();
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    long lastBack = 0;

    void goBack() {
        long now = android.os.SystemClock.uptimeMillis();
        if (now - lastBack < 250) return;   // le même retour arrivé par deux chemins (touche et geste)
        lastBack = now;
        backs++;
        Log.i("Strela", "retour (page prête : " + pageReady + ")");
        if (!pageReady) { moveTaskToBack(true); return; }
        web.evaluateJavascript("window.strelaBack ? window.strelaBack() : false", v -> {
            Log.i("Strela", "retour traité par la page : " + v);
            if (!"true".equals(v)) moveTaskToBack(true);
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        if (immersive) immersiveMode(true);
    }

    @Override
    protected void onPause() {
        speech.stop();
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        try { unregisterReceiver(updater.receiver); } catch (Exception e) { /* */ }
        speech.shutdown();
        web.destroy();
        super.onDestroy();
    }

}
