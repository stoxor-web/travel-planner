https://stoxor-web.github.io/travel-planner/

# Travel Planner — V4.12 réparation stable Firebase

Version complète corrigée et prête à publier avec Firebase actif, connexion Google, carte OpenStreetMap stable sans Leaflet, page Communauté, budget partagé, planning, préparation et carnet.

## Correctifs majeurs

- Réécriture de `app.js` pour réaligner toutes les vues avec le HTML actuel.
- Firebase conservé et configuré dans `js/firebase-config.js`.
- Suppression des erreurs JavaScript qui bloquaient l’interface.
- Carte OSM stable sans dépendance Leaflet.
- Accueil, Aujourd’hui, Communauté, Voyage, Carte, Planning, Budget, Suggestions, Préparation, Carnet et Paramètres recâblés.
- Publication Communauté, votes, copie de voyage et retrait propriétaire/admin corrigés.
- Bouton Google lisible et état connecté propre.
- Footer officiel retravaillé.
- Cache-busting V4.12 sur CSS et JS.
- Aucun fichier `firebase-config.example`.

## Publication

Remplace tout le contenu du dépôt par ce dossier complet, puis lance :

```bash
git add .
git commit -m "V4.12 reparation stable Firebase"
git push origin main
```

Copie aussi le contenu de `firestore.rules` dans Firebase Console → Firestore Database → Rules.

Après publication, ouvre le site en navigation privée ou vide le cache.
