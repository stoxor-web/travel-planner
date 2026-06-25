# Travel Planner

Application web personnelle de planification de voyages, hébergée sur GitHub Pages et synchronisée avec Firebase via connexion Google.

## Fonctionnement actuel

- Connexion Google obligatoire.
- Données enregistrées dans Cloud Firestore.
- Un document par utilisateur : `travelPlannerUsers/{uid}`.
- Création et modification de voyages.
- Planning jour par jour.
- Carte interactive OpenStreetMap / Leaflet.
- Recherche de lieux avec OpenStreetMap Nominatim.
- Budget, itinéraire, suggestions, préparation et carnet.

## Correctif carte

Cette version renforce fortement la vue Carte :

- Leaflet est chargé uniquement quand la vue Carte est ouverte.
- Deux CDN sont utilisés en secours : unpkg puis cdnjs.
- La carte est recalculée après changement d’onglet.
- Les nouveaux types d’étapes ne restent plus masqués par erreur.
- Si Leaflet ou les tuiles ne se chargent pas, un mode secours affiche les étapes avec des liens OpenStreetMap.
- Un bouton **Diagnostic** est disponible dans la vue Carte pour vérifier l’état du module.

## Firebase

Le fichier `js/firebase-config.js` contient la configuration du projet Firebase.

Les règles Firestore recommandées sont disponibles dans `firestore.rules`.

## Publication GitHub Pages

1. Remplacer les fichiers du dépôt par ceux du projet.
2. Garder `js/firebase-config.js` avec les valeurs Firebase du projet.
3. Vérifier que `stoxor-web.github.io` est autorisé dans Firebase Authentication.
4. Publier avec GitHub Pages.
5. Tester avec un compte Google.

## Test rapide de la carte

1. Se connecter avec Google.
2. Créer un voyage.
3. Ajouter une étape avec une adresse ou des coordonnées.
4. Ouvrir l’onglet **Carte**.
5. Cliquer sur **Recentrer**.
6. En cas de problème, cliquer sur **Diagnostic**.
