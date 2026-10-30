package fr.orbitalvkl.strela;

import android.content.Context;
import android.media.AudioAttributes;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;

import java.util.Locale;

/**
 * Annonces vocales en français par la synthèse vocale d'Android (TextToSpeech), la Web Speech API n'étant pas fiable
 * dans une WebView. Mêmes annonces et même réglage qu'au lot 3 (feedback.js) : une annonce coupe la précédente.
 */
class Speech {
    final Context ctx;
    TextToSpeech tts;
    volatile String state = "loading";      // loading | ok | none (pas de voix française) | absent (pas de moteur)
    volatile String name = "";

    Speech(Context c) {
        ctx = c;
        try {
            tts = new TextToSpeech(c, status -> {
                if (status != TextToSpeech.SUCCESS) { state = "absent"; return; }
                int r = tts.setLanguage(Locale.FRANCE);
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) { state = "none"; return; }
                tts.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                Voice v = tts.getVoice();
                name = v != null ? v.getName() : "voix française";
                String engine = tts.getDefaultEngine();
                if (engine != null && engine.contains("google")) name = "Google · " + name;
                state = "ok";
            });
        } catch (Exception e) { state = "absent"; }
    }

    boolean speak(String text, boolean strong) {
        if (!"ok".equals(state) || tts == null) return false;
        tts.setPitch(strong ? 1.25f : 1f);
        tts.setSpeechRate(strong ? 0.9f : 1.08f);
        return tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "strela") == TextToSpeech.SUCCESS;
    }

    void stop() { if (tts != null) try { tts.stop(); } catch (Exception e) { /* */ } }

    void shutdown() { if (tts != null) try { tts.shutdown(); } catch (Exception e) { /* */ } }

    String info() { return Bridge.json("state", state, "name", name, "native", true); }
}
