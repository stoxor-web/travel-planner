# Travel Planner — Lucas S. Edition

Version **V4.9 Premium**.

Application web personnelle de planification de voyages, hébergée sur GitHub Pages et synchronisée avec Firebase / Google.

## Nouveautés V4.9

- Accueil renforcé en centre de contrôle.
- Cartes de voyages plus visuelles, avec image, statut, score et résumé utile.
- Nouvelle page **Aujourd’hui** pour consulter rapidement le voyage pendant le séjour.
- Assistant de cohérence plus détaillé : budget, horaires, style de voyage, oublis et corrections locales.
- Détection des incohérences horaires : départ avant arrivée, trajet impossible, marge trop courte.
- Budget/TriCount amélioré : voyageurs, payé par, participants et remboursements suggérés.
- Page Communauté plus propre avec un **mode admin Lucas S.**.
- Identité visuelle renforcée : couleurs de marque, cartes premium, footer officiel.
- Firebase reste actif avec `js/firebase-config.js` inclus et configuré.
- Aucun fichier `firebase-config.example`.

## Installation GitHub Pages

Remplace tout le contenu de ton dépôt `travel-planner` par le contenu du ZIP, puis publie :

```bash
git add .
git commit -m "V4.9 premium"
git push origin main
```

Après publication, ouvre le site en navigation privée pour éviter un ancien cache.

## Firebase

Le site utilise :

- Firebase Authentication avec Google ;
- Cloud Firestore pour les voyages privés ;
- `communityTrips` pour les voyages publiés dans la communauté.

Recopie le fichier `firestore.rules` dans Firebase Console → Firestore Database → Rules.

Le mode admin communautaire est réservé à :

```text
lucas.scribe01@gmail.com
```

## Fichiers principaux

```text
index.html
css/style.css
js/app.js
js/storage.js
js/firebase-config.js
js/firebase-sync.js
js/map.js
js/itinerary.js
js/budget.js
js/suggestions.js
js/utils.js
firestore.rules
assets/
```
