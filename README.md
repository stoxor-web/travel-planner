# Travel Planner — Lucas S. Edition

Application web personnelle de planification de voyages, hébergeable sur GitHub Pages et synchronisée avec Google/Firebase.

## Mise à jour V4.4 — interface professionnelle + planning horaire

Cette version améliore fortement la présentation du site et la page Planning :

- rendu visuel plus premium et plus cohérent ;
- cartes, bulles, blocs et panneaux mieux hiérarchisés ;
- tableau de bord, topbar et cartes plus propres ;
- planning jour par jour présenté comme une timeline ;
- blocs d’étapes avec arrivée, départ, heure, position, coût et notes ;
- ajout des champs **heure d’arrivée** et **heure de départ** dans chaque étape ;
- trajets point par point enrichis avec départ, arrivée, durée, distance, coût et référence ;
- modification directe des dates/heures depuis la feuille de route ;
- carte OSM stable sans Leaflet avec bulles de lieux enrichies ;
- icônes et favicon conservés ;
- aucune création de fichier `firebase-config.example`.

## Fichiers importants

```text
index.html
css/style.css
js/app.js
js/itinerary.js
js/map.js
js/storage.js
js/utils.js
```

## Déploiement

Remplace tout le contenu du dépôt GitHub Pages par le contenu de cette archive, puis attends quelques minutes que GitHub Pages mette à jour le site.

Si l’ancien style apparaît encore, vide le cache du navigateur ou ouvre le site en navigation privée.

## Firebase

Le fichier `js/firebase-config.js` est conservé dans l’archive. Les données restent synchronisées via Firestore après connexion Google.


## V4.5 — Centre de contrôle et assistant horaire

Cette version ajoute :

- un accueil en mode centre de contrôle ;
- un mode voyage pour consultation rapide pendant le séjour ;
- des cartes voyages avec image de couverture et statut ;
- un assistant intelligent plus détaillé, groupé par gravité ;
- la détection automatique des incohérences horaires ;
- des alertes de marge courte entre deux étapes ;
- une vérification de stabilité de la carte OSM maison sans Leaflet.

Le fichier `firebase-config.example` n’est pas utilisé ni recréé.
