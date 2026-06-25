# Travel Planner — Lucas S. Edition

Application web personnelle de planification de voyages, hébergée sur GitHub Pages et synchronisée avec Firebase via connexion Google.

## Nouveautés V4.2

- Bouton de connexion Google retravaillé avec avatar, état clair et rendu plus professionnel.
- Identité visuelle plus marquée : signature Lucas S., dégradés propriétaires, cartes plus premium et finitions mobile.
- Carte OSM stable sans Leaflet : tuiles OpenStreetMap placées directement par le site, avec déplacement, zoom, recentrage, marqueurs, lignes de trajet et sélection des segments.
- Cartes de voyage enrichies : score, budget, voyageurs, dates, étapes et accès rapide.
- Résumé de consultation rapide pour le voyage actif.
- Bouton flottant `+` pour ajouter voyage, étape, dépense ou ouvrir la préparation.
- Assistant de cohérence amélioré : oublis, budget, hôtels, aéroports, dates, coordonnées, style de voyage.
- Suggestions adaptées au style : économique, confort, aventure, équilibré.
- Modèles de voyage : city break, roadtrip, avion, amis, aventure.
- Planning façon timeline, avec ajout rapide par journée et déplacement d’étapes par glisser-déposer.
- Budget amélioré avec alertes, prévu/réel, budget par jour, budget par personne et équilibrage type TriCount.
- Partage lecture seule amélioré avec options de confidentialité.
- Collaboration privée via lien réservé à des comptes Google autorisés.
- Mode hors ligne léger : affichage du dernier état connu si Firebase est momentanément inaccessible.
- Recherche globale : voyage, étape, note, dépense.
- Sauvegarde automatique immédiate après modification + sauvegarde périodique configurable.
- Footer avec mentions légales et signature “Créé par Lucas S.”.

## Publication

1. Remplacer les fichiers du dépôt GitHub Pages par ceux de l’archive.
2. Conserver `js/firebase-config.js` avec la configuration Firebase réelle.
3. Copier le contenu de `firestore.rules` dans Firebase Console → Firestore Database → Rules.
4. Publier sur GitHub Pages.

## Firebase

Le site utilise :

- Firebase Authentication avec Google ;
- Cloud Firestore pour les voyages privés ;
- `publicTrips` pour les liens en lecture seule ;
- `sharedTrips` pour la collaboration privée.

Aucun fichier `firebase-config.example` n’est utilisé dans le projet.
