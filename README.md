# Travel Planner — Lucas S. Edition

Application web personnelle de planification de voyages, hébergeable sur GitHub Pages et synchronisée avec Google/Firebase.

## Correctif visuel stable

Cette archive est une version complète prête à publier. Elle corrige les problèmes de rendu pouvant apparaître quand GitHub Pages ou le navigateur gardent une ancienne version du CSS/JS en cache.

Corrections appliquées :

- ajout d’un cache-busting sur `style.css` et tous les scripts JavaScript ;
- ajout d’un CSS critique dans `index.html` pour masquer correctement les vues et modales avant chargement complet ;
- restauration des variables CSS manquantes utilisées par certaines cartes ;
- stabilisation de la recherche globale ;
- conservation de la configuration Firebase active ;
- conservation de la carte OSM stable sans Leaflet ;
- vérification que tous les fichiers appelés par `index.html` existent.

## Déploiement conseillé

1. Supprimer l’ancien contenu du dépôt GitHub Pages.
2. Copier tout le contenu de cette archive.
3. Publier / pousser sur GitHub.
4. Attendre quelques minutes.
5. Ouvrir le site en navigation privée ou vider le cache du navigateur.

## Fichiers importants

```text
index.html
css/style.css
js/app.js
js/firebase-config.js
js/firebase-sync.js
js/storage.js
js/map.js
js/utils.js
firestore.rules
```

## Firebase

Le fichier `js/firebase-config.js` contient la configuration active du projet Firebase `travel-planner-60337`.

À vérifier dans Firebase :

1. Authentication → Google activé.
2. Authorized domains contient `stoxor-web.github.io`, `localhost` et `127.0.0.1`.
3. Firestore Rules contient le contenu de `firestore.rules`.

## Communauté

La page Communauté utilise la collection Firestore :

```text
communityTrips
```

Elle est lisible publiquement. La publication, le vote, la modification et la suppression restent encadrés par Firebase Authentication.
