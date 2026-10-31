package fr.orbitalvkl.strela;

import android.webkit.JavascriptInterface;

/**
 * Passerelle de la variante « github » : celle du tronc commun (Bridge) et la mise à jour depuis l'appli (Updater).
 * Dans la variante play, ces fonctions n'existent pas : la page n'affiche ni bouton ni repère de mise à jour.
 */
public class UpdateBridge extends Bridge {
    final Updater updater;

    UpdateBridge(MainActivity a, Updater u) { super(a); updater = u; }

    /** RECHERCHER UNE MISE À JOUR (Réglages) : interroge GitHub. */
    @JavascriptInterface
    public void checkUpdate() { updater.check(); }

    /**
     * Recherche automatique (lot 6), demandée par la page au lancement, hors partie, si le réglage le permet : GitHub
     * n'est interrogé qu'une fois par 24 h au plus ; sinon l'état gardé de la dernière recherche est renvoyé.
     */
    @JavascriptInterface
    public void autoCheckUpdate() { updater.autoCheck(); }

    @JavascriptInterface
    public void installUpdate() { updater.install(); }

    @JavascriptInterface
    public String updateState() { return updater.state().toString(); }
}
