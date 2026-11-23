package fr.orbitalvkl.strela;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;

/**
 * Saisie à la voix (lot 9.3) : reconnaissance vocale d'Android (SpeechRecognizer), en français, hors ligne de
 * préférence. Appuyer pour parler : une écoute par appui, arrêtée par Android au silence (ou par un nouvel appui) ;
 * jamais d'écoute permanente. La phrase entendue (et les autres propositions du moteur) est envoyée à la page
 * (événement strela-native { listen }), qui l'analyse (src/engine/voice.js). Rien n'est enregistré par Strela.
 * Tout se passe sur le fil de l'interface (exigé par SpeechRecognizer).
 */
class Listen {
    static final int REQ_MIC = 21;
    final MainActivity act;
    SpeechRecognizer rec;
    boolean onDevice = false;               // reconnaissance sur le téléphone (Android 12 et plus, si disponible)
    boolean onDeviceFailed = false;         // langue absente sur le téléphone : on passe au moteur habituel
    boolean listening = false;
    boolean startAfterPermission = false;

    Listen(MainActivity a) { act = a; }

    boolean available() {
        try { return SpeechRecognizer.isRecognitionAvailable(act) || onDeviceAvailable(); } catch (Exception e) { return false; }
    }

    boolean onDeviceAvailable() {
        if (Build.VERSION.SDK_INT < 31) return false;
        try { return SpeechRecognizer.isOnDeviceRecognitionAvailable(act); } catch (Exception e) { return false; }
    }

    String permission() {
        if (act.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) return "granted";
        return act.shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO) ? "denied" : "ask";
    }

    String info() {
        return Bridge.json("available", available(), "onDevice", onDeviceAvailable() && !onDeviceFailed, "permission", permission(), "listening", listening);
    }

    /** Appui sur le micro : 'started', 'permission' (Android la demande, l'écoute suit si accordée), 'absent', 'error'. */
    String start() {
        if (!available()) return "absent";
        if (!"granted".equals(permission())) {
            startAfterPermission = true;
            act.runOnUiThread(() -> act.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC));
            return "permission";
        }
        act.speech.stop(); // l'appli ne s'écoute pas elle-même
        act.runOnUiThread(this::begin);
        return "started";
    }

    void onPermission(boolean granted) {
        send("permission", "granted", granted);
        if (granted && startAfterPermission) { act.speech.stop(); begin(); }
        startAfterPermission = false;
    }

    void begin() {
        try {
            destroy();
            onDevice = onDeviceAvailable() && !onDeviceFailed;
            rec = onDevice && Build.VERSION.SDK_INT >= 31 ? SpeechRecognizer.createOnDeviceSpeechRecognizer(act) : SpeechRecognizer.createSpeechRecognizer(act);
            rec.setRecognitionListener(listener);
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR")
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "fr-FR")
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, act.getPackageName())
                .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L);
            // Vocabulaire des fléchettes : aide le moteur sur le téléphone (Android 13 et plus).
            if (Build.VERSION.SDK_INT >= 33) {
                i.putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, new ArrayList<>(Arrays.asList(
                    "simple", "double", "triple", "vingt", "seize", "dix-huit", "dix-neuf", "dix-sept", "bull", "centre",
                    "cinquante", "vingt-cinq", "demi-bull", "intérieur", "extérieur", "dehors", "raté", "à côté", "annuler", "valider")));
            }
            listening = true;
            rec.startListening(i);
            send("start", "onDevice", onDevice);
        } catch (Exception e) {
            listening = false;
            Log.w("Strela", "écoute impossible : " + e.getMessage());
            send("error", "code", -1, "message", String.valueOf(e.getMessage()));
        }
    }

    /** Nouvel appui pendant l'écoute : on arrête d'écouter, la phrase déjà dite est analysée. */
    void stop() { act.runOnUiThread(() -> { if (rec != null && listening) try { rec.stopListening(); } catch (Exception e) { /* */ } }); }

    /** Écran quitté, appli en arrière-plan : on abandonne l'écoute. */
    void cancel() {
        act.runOnUiThread(() -> {
            if (rec != null && listening) { try { rec.cancel(); } catch (Exception e) { /* */ } send("end", "cancelled", true); }
            listening = false;
        });
    }

    void destroy() {
        if (rec != null) { try { rec.destroy(); } catch (Exception e) { /* */ } rec = null; }
    }

    void send(String type, Object... kv) {
        try {
            JSONObject l = new JSONObject();
            l.put("type", type);
            for (int k = 0; k + 1 < kv.length; k += 2) l.put((String) kv[k], kv[k + 1]);
            JSONObject d = new JSONObject();
            d.put("listen", l);
            act.push(d);
        } catch (Exception e) { /* */ }
    }

    static JSONArray texts(Bundle b) {
        JSONArray a = new JSONArray();
        ArrayList<String> l = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (l != null) for (String s : l) a.put(s);
        return a;
    }

    final RecognitionListener listener = new RecognitionListener() {
        @Override public void onReadyForSpeech(Bundle p) { send("ready"); }
        @Override public void onBeginningOfSpeech() { send("speech"); }
        @Override public void onRmsChanged(float db) { }
        @Override public void onBufferReceived(byte[] b) { }
        @Override public void onEndOfSpeech() { send("heard"); }
        @Override public void onPartialResults(Bundle b) { send("partial", "texts", texts(b)); }
        @Override public void onEvent(int t, Bundle b) { }
        @Override public void onResults(Bundle b) {
            listening = false;
            send("result", "texts", texts(b));
        }
        @Override public void onError(int code) {
            boolean wasListening = listening;
            listening = false;
            // Langue française absente du moteur du téléphone : on réessaie aussitôt avec le moteur habituel.
            if (onDevice && (code == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED || code == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)) {
                onDeviceFailed = true;
                if (wasListening) { begin(); return; }
            }
            send("error", "code", code);
        }
    };
}
