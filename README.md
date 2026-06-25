# Travel Planner

Application web personnelle de planification de voyages, hébergeable sur GitHub Pages, avec connexion Google et sauvegarde automatique Firebase.

## Version actuelle

Cette version utilise Firebase comme source principale des données :

- connexion Google obligatoire ;
- chargement automatique des voyages depuis Firestore ;
- sauvegarde transparente après modification ;
- aucune sauvegarde locale visible ;
- aucun export/import JSON dans l’interface ;
- carte OSM intégrée sans Leaflet pour éviter les problèmes de tuiles cassées ;
- affichage des trajets point par point avec transport différent pour chaque segment : avion, voiture, train, bus, marche, vélo, bateau ou autre ;
- planning jour par jour inspiré des planificateurs visuels de voyage.

## Carte

La carte ne dépend plus de Leaflet. Elle utilise un rendu OSM léger développé directement dans `js/map.js` :

- récupération des tuiles OpenStreetMap ;
- placement manuel des tuiles ;
- marqueurs numérotés ;
- lignes entre les étapes ;
- ligne courbe pour l’avion ;
- styles différents selon le transport ;
- zoom, recentrage et déplacement à la souris ou au doigt ;
- ouverture d’un segment dans OpenStreetMap.

Cette approche évite le bug où les tuiles Leaflet apparaissaient décalées ou superposées.

## Fichiers principaux

```text
travel-planner/
├── index.html
├── README.md
├── firestore.rules
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── budget.js
│   ├── firebase-config.js
│   ├── firebase-sync.js
│   ├── geocoder.js
│   ├── itinerary.js
│   ├── map.js
│   ├── storage.js
│   ├── suggestions.js
│   └── utils.js
└── assets/
```

## Firebase

Le fichier `js/firebase-config.js` doit contenir la vraie configuration Firebase du projet.

Les règles Firestore sont fournies dans `firestore.rules`.

## Publication GitHub Pages

1. Remplacer les fichiers du dépôt par ceux de cette version.
2. Vérifier que `js/firebase-config.js` contient bien la configuration Firebase réelle.
3. Publier sur GitHub Pages.
4. Ouvrir le site, se connecter avec Google et tester un voyage avec plusieurs étapes.

## Test conseillé

Créer un voyage avec ces étapes :

1. Aéroport de Paris-Charles-de-Gaulle — transport suivant : avion.
2. Aéroport international de Tokyo — transport suivant : voiture ou train.
3. Hôtel à Tokyo.

La page Carte doit afficher :

- une grande carte stable ;
- les marqueurs numérotés ;
- un segment avion en pointillés courbé ;
- un segment voiture/train entre l’aéroport et l’hôtel ;
- les distances, durées et coûts estimés dans le panneau de gauche.
