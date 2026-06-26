# Travel Planner — Lucas S. Edition

Version V4.8 — réparation stable, design professionnel et Firebase actif.

## Ce qui est corrigé

- Firebase reste configuré et actif avec connexion Google.
- Le projet est livré comme un dossier complet cohérent, pas comme un correctif partiel.
- La carte ne dépend plus de Leaflet : elle utilise une carte OpenStreetMap maison plus stable.
- Les dépenses prévues/réelles, payeur et répartition type TriCount sont recâblées correctement.
- Les boutons avancés redeviennent actifs : assistant de création, modèles, recherche globale, bouton flottant, partage, ajout rapide, checklists.
- L’accueil redevient un centre de contrôle visuel avec score, budget, étapes, alertes et mode voyage.
- Le cache des fichiers CSS/JS est renouvelé avec une nouvelle version.

## Déploiement GitHub Pages

1. Remplacer tout le contenu du dépôt par le contenu de ce dossier.
2. Vérifier que `js/firebase-config.js` est bien présent.
3. Copier `firestore.rules` dans Firebase si les règles ont changé.
4. Pousser vers GitHub.
5. Ouvrir le site en navigation privée pour éviter l’ancien cache.

## Firebase

Le fichier `js/firebase-config.js` contient la configuration active du projet Firebase. Aucun fichier `firebase-config.example` n’est fourni.

## Test rapide

- Se connecter avec Google.
- Créer un voyage depuis un modèle.
- Ajouter deux étapes avec coordonnées ou recherche d’adresse.
- Ouvrir Carte et tester zoom, déplacement, recentrage.
- Ajouter une dépense avec payé par / répartition.
- Recharger la page et vérifier que Firebase restaure les données.

Créé par Lucas S.
