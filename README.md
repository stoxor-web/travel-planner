# Travel Planner — Lucas S. Edition

Version V4.3 — réparation visuelle stable.

Cette version remet le site dans un état propre et complet après les derniers correctifs partiels. Elle contient tous les fichiers nécessaires au fonctionnement normal sur GitHub Pages avec Firebase.

## Corrections principales

- Archive complète, pas un patch partiel.
- Retour du fichier indispensable `js/utils.js`.
- Carte OSM maison stable, sans Leaflet.
- Favicon ajouté pour l’onglet du navigateur.
- Icône d’application ajoutée pour mobile.
- Logo officiel ajouté dans les assets.
- Correction du rectangle blanc sous la recherche.
- Masquage forcé des éléments `hidden`.
- Topbar et bouton Google plus propres.
- Aucun fichier `firebase-config.example`.

## Fichiers importants

```text
index.html
css/style.css
js/app.js
js/utils.js
js/map.js
js/firebase-config.js
js/firebase-sync.js
firestore.rules
assets/icons/favicon.ico
assets/icons/favicon-32.png
assets/icons/apple-touch-icon.png
assets/icons/icon-192.png
assets/icons/icon-512.png
assets/images/travel-planner-logo.png
```

## Mise en ligne

1. Supprimer les anciens fichiers du dépôt GitHub `travel-planner`, sauf si tu veux conserver l’historique Git.
2. Déposer tout le contenu de cette archive.
3. Vérifier que `js/firebase-config.js` est bien présent.
4. Copier `firestore.rules` dans Firebase si les règles ont changé.
5. Attendre le déploiement GitHub Pages.
6. Ouvrir le site en navigation privée pour vérifier que l’ancien cache ne gêne pas.

## Test rapide

- Le logo doit apparaître dans la barre latérale.
- L’icône doit apparaître dans l’onglet du navigateur.
- La barre de recherche ne doit plus afficher de rectangle vide.
- La carte doit afficher des tuiles OSM correctement alignées.
- La navigation doit fonctionner après connexion Google.

## Remarque

La carte n’utilise plus Leaflet. Elle est rendue directement par le code du site afin d’éviter les bugs de tuiles décalées ou de CSS Leaflet manquant.
