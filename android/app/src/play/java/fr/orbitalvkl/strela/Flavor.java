package fr.orbitalvkl.strela;

/**
 * Variante « play » (Google Play, lot 6) : rien en plus du tronc commun. Pas de mise à jour intégrée (Play s'en
 * charge) : ni code de téléchargement, ni installation, ni accès réseau (pas de permission INTERNET).
 */
class Flavor {
    final MainActivity act;

    Flavor(MainActivity a) { act = a; }

    Bridge bridge() { return new Bridge(act); }

    void start() { }

    void stop() { }
}
