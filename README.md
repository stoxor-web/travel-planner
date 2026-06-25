# Travel Planner — Firebase + carte corrigée

Application personnelle de planification de voyages, hébergeable sur GitHub Pages et synchronisée avec Firebase via connexion Google.

## Mise à jour incluse

Cette version corrige la carte et améliore l'affichage des trajets :

- correctif CSS Leaflet intégré localement ;
- protection contre les cartes blanches ou les tuiles mal positionnées ;
- recalcul automatique de la taille de la carte à l'ouverture de l'onglet ;
- affichage des trajets point par point dans le panneau de carte ;
- style différent selon le transport : voiture, avion, train, bus, vélo, marche, bateau ;
- possibilité de modifier le mode de transport directement depuis la carte ;
- recentrage sur un segment en cliquant sur le trajet ;
- affichage des distances, durées et coûts estimés par segment ;
- correction de l'enregistrement de l'adresse d'une étape ;
- recherche de lieu réactivée dans le formulaire d'étape.

## Fonctionnement de la carte

Le site utilise Leaflet avec OpenStreetMap. Les trajets sont tracés à vol d'oiseau pour rester gratuits et compatibles GitHub Pages, sans API payante ni serveur de routage.

Pour un segment Paris → Tokyo en avion, la carte affiche une ligne de transport aérien. Pour un segment en voiture, train ou bus, elle affiche le même segment avec un style différent et les estimations correspondantes.

## Firebase

Le site utilise le document Firestore :

```text
travelPlannerUsers/{uid}
```

Chaque utilisateur connecté avec Google accède uniquement à ses propres voyages grâce aux règles Firestore.

## Fichiers importants

```text
index.html
css/style.css
js/app.js
js/map.js
js/geocoder.js
js/firebase-config.js
js/firebase-sync.js
firestore.rules
```

Le fichier `js/firebase-config.js` doit contenir la configuration Firebase du projet.

## Publication GitHub Pages

1. Remplacer les fichiers du dépôt par ceux de cette archive.
2. Conserver le bon `js/firebase-config.js`.
3. Pousser les modifications sur GitHub.
4. Attendre la mise à jour GitHub Pages.
5. Tester : connexion Google, ajout de deux étapes, onglet Carte, bouton Recentrer.

## Diagnostic carte

Dans l'onglet Carte, le bouton `Diagnostic` indique :

- si Leaflet est chargé ;
- si le CSS carte est appliqué ;
- si la zone de carte a une taille correcte ;
- combien d'étapes possèdent des coordonnées.
