# Travel Planner — V4.1 Design application

Application web personnelle de planification de voyages, hébergeable sur GitHub Pages et synchronisée avec Firebase via connexion Google.


## Nouveautés V4.1 — Aspect visuel

- Interface plus premium avec arrière-plan plus doux et effet application.
- Accueil plus impactant visuellement.
- Cartes voyages modernisées avec couverture graphique et progression.
- Navigation latérale et navigation mobile plus propres.
- Boutons, formulaires, panneaux et modales harmonisés.
- Planning jour par jour mieux présenté.
- Budget, suggestions, préparation et carnet plus lisibles.
- Amélioration des contrastes en mode clair et sombre.
- Finition mobile renforcée pour iPhone.

## Nouveautés V4

- Création de voyage guidée avec assistant.
- Accueil plus moderne avec voyage actif, score, budget et accès rapides.
- Cartes voyages plus visuelles.
- Planning jour par jour plus central.
- Ajout rapide d’éléments dans une journée : ville, hôtel, restaurant, activité, gare, aéroport.
- Trajets point par point avec transport, horaires, référence, coût et note.
- Carte OSM simplifiée et stable, sans dépendre de Leaflet.
- Assistant de cohérence avec score de préparation.
- Budget prévu/réel.
- Budget par jour.
- Budget par personne.
- Répartition des dépenses par prénom.
- Carnet de voyage enrichi par étape.
- Expérience mobile améliorée.
- Partage public en lecture seule via lien Firebase.

## Firebase

Le site utilise :

- Firebase Authentication avec Google ;
- Cloud Firestore pour sauvegarder les voyages ;
- une collection privée `travelPlannerUsers/{uid}` ;
- une collection publique en lecture seule `publicTrips/{shareId}` pour les liens partagés.

Le fichier à conserver avec tes vraies clés est :

```text
js/firebase-config.js
```

Le site utilise uniquement ce fichier de configuration.

## Règles Firestore

Copie le contenu de `firestore.rules` dans Firebase Console → Firestore Database → Rules.

Ces règles permettent :

- à chaque utilisateur connecté de lire/écrire uniquement son propre document ;
- à un lien de partage de lire seulement les voyages publiés dans `publicTrips` ;
- au propriétaire connecté de créer, mettre à jour ou supprimer ses partages.

## Publication GitHub Pages

1. Remplace les fichiers du dépôt GitHub par ceux de cette archive.
2. Le fichier `js/firebase-config.js` est déjà configuré pour le projet Firebase indiqué.
3. Publie sur GitHub Pages.
4. Ouvre le site.
5. Connecte-toi avec Google.
6. Crée un voyage avec l’assistant.

## Test rapide

- Créer un voyage guidé.
- Ajouter deux étapes avec recherche d’adresse.
- Ouvrir Planning.
- Modifier un trajet : avion, voiture, train, horaires, référence.
- Ouvrir Carte.
- Ajouter une dépense prévue et une dépense réelle.
- Ajouter des prénoms pour vérifier la redistribution.
- Cliquer sur Partager pour générer un lien en lecture seule.
