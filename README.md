# Travel Planner — application personnelle de planification de voyages

Application web statique, gratuite et locale pour préparer des voyages depuis une seule interface : tableau de bord, carte interactive, étapes, feuille de route, budget, suggestions, checklists et carnet de voyage.

Le projet est prévu pour fonctionner avec GitHub Pages, sans serveur payant, sans base de données et sans abonnement obligatoire.

## Fonctionnalités de la première version

- Création, modification, duplication et suppression de voyages.
- Tableau de bord avec dates, zone, nombre d’étapes, statut et budget estimé.
- Formulaire complet : description, voyageurs, budget maximum, devise, style, rythme et centres d’intérêt.
- Gestion des étapes : type, coordonnées GPS, dates, durée, notes, liens, coût, priorité et couleur.
- Réorganisation des étapes avec boutons monter / descendre.
- Carte Leaflet + OpenStreetMap avec marqueurs numérotés, tracé à vol d’oiseau et filtres par catégorie.
- Plusieurs fonds de carte gratuits : classique, clair et terrain.
- Feuille de route automatique entre les étapes.
- Choix du mode de transport par segment.
- Estimation locale des distances, durées et coûts avec formule de Haversine.
- Budget détaillé par catégorie, total, par jour, par personne, comparaison avec budget maximum et graphique simple.
- Suggestions intelligentes locales, sans IA payante : trajets longs, coordonnées manquantes, budget dépassé, journées vides, préparation faible, etc.
- Score du voyage : itinéraire, budget, trajets, journées et préparation.
- Optimisation simple de l’ordre des étapes avec logique du plus proche voisin.
- Checklists de préparation modifiables.
- Carnet de voyage par étape : notes, liens photos, ressenti, météo, dépenses réelles et commentaires.
- Sauvegarde locale avec localStorage.
- Export / import JSON.
- Mode clair / sombre.
- Design responsive compatible ordinateur, tablette et iPhone.

## Architecture

```text
travel-planner/
├── index.html
├── README.md
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── storage.js
│   ├── map.js
│   ├── budget.js
│   ├── itinerary.js
│   ├── suggestions.js
│   └── utils.js
└── assets/
    ├── icons/
    └── images/
```

### Rôle des fichiers

- `index.html` : structure de l’application, vues, formulaires et modales.
- `css/style.css` : interface responsive, cartes, tableaux, thème sombre, version mobile.
- `js/utils.js` : fonctions communes, distances, formats, listes, checklists par défaut.
- `js/storage.js` : sauvegarde localStorage, import/export, duplication, normalisation des données.
- `js/map.js` : carte Leaflet, fonds de carte, marqueurs, tracé et filtres.
- `js/itinerary.js` : feuille de route, segments, distances, durées et coûts.
- `js/budget.js` : calculs de budget, statistiques, répartition et graphique canvas.
- `js/suggestions.js` : moteur de règles, score du voyage et optimisation.
- `js/app.js` : orchestration de l’interface et interactions utilisateur.

## Limites assumées

- Pas de routage réel par défaut, afin d’éviter les API payantes ou limitées. Le tracé principal est à vol d’oiseau.
- Pas de géocodage automatique obligatoire. Pour rester gratuit et fiable, il faut renseigner les coordonnées GPS des étapes.
- Pas de sauvegarde cloud. Les voyages restent dans le navigateur, avec export JSON conseillé.
- La vue satellite n’est pas incluse, car les sources gratuites fiables et durables sont souvent limitées ou soumises à conditions.

## Améliorations possibles

- Import de fichiers GPX ou KML.
- Géocodage optionnel via une instance gratuite compatible Nominatim, avec respect strict des limites d’usage.
- Routage optionnel via OSRM public ou instance personnelle, en gardant le tracé direct comme solution de secours.
- Mode collaboratif via fichiers JSON partagés manuellement.
- Export PDF de la feuille de route.
- Meilleure timeline journalière avec horaires précis.
- Gestion locale d’images avec IndexedDB.
- Statistiques avancées : kilomètres par transport, coût par pays, temps sur place, charge quotidienne.

## Installation locale

Aucune compilation n’est nécessaire.

1. Ouvre le dossier `travel-planner`.
2. Double-clique sur `index.html`.
3. Pour un test plus fiable, lance un petit serveur local :

```bash
python3 -m http.server 8000
```

Puis ouvre :

```text
http://localhost:8000
```

## Publication avec GitHub Pages

1. Crée un dépôt GitHub, par exemple `travel-planner`.
2. Envoie tous les fichiers du dossier dans le dépôt.
3. Va dans **Settings** → **Pages**.
4. Dans **Build and deployment**, choisis **Deploy from a branch**.
5. Sélectionne la branche `main` et le dossier `/root`.
6. Enregistre.
7. GitHub Pages publiera le site à une adresse du type :

```text
https://ton-utilisateur.github.io/travel-planner/
```

## Conseils d’utilisation

- Crée un voyage puis ajoute au moins deux étapes pour obtenir la carte et la feuille de route.
- Renseigne les coordonnées GPS pour chaque lieu.
- Ajoute les dépenses principales avant de détailler les petites catégories.
- Exporte régulièrement tes voyages en JSON, surtout avant de vider le navigateur ou de changer d’appareil.
- Les données ne sont pas synchronisées entre ordinateur et iPhone sauf via import/export JSON.
