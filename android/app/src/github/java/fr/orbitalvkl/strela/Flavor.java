package fr.orbitalvkl.strela;

import android.content.IntentFilter;

import androidx.core.content.ContextCompat;

/**
 * Variante « github » (APK publié en release GitHub, lot 6) : mise à jour depuis l'appli (Updater) et ses fonctions de
 * passerelle (UpdateBridge). La variante play a son propre Flavor, sans rien de cela.
 */
class Flavor {
    final MainActivity act;
    final Updater updater;

    Flavor(MainActivity a) { act = a; updater = new Updater(a); }

    Bridge bridge() { return new UpdateBridge(act, updater); }

    /** Retour de l'installateur d'Android (PackageInstaller). */
    void start() {
        ContextCompat.registerReceiver(act, updater.receiver, new IntentFilter(Updater.ACTION), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    void stop() {
        try { act.unregisterReceiver(updater.receiver); } catch (Exception e) { /* */ }
    }
}
