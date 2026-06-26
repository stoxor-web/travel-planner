# Travel Planner — Lucas S. Edition

Application web personnelle de planification de voyages, hébergeable sur GitHub Pages et synchronisée avec Firebase / Google.

## Version V4.6 — Suggestions intelligentes avancées

Cette version renforce la page **Suggestions** pour en faire un vrai centre d’alertes :

- suggestions adaptées au style de voyage : économique, équilibré, confort, aventure ;
- détection plus claire des incohérences horaires ;
- alertes liées au budget prévu / réel ;
- bouton **Corriger automatiquement** pour ajouter des tâches, checklists ou postes de budget sans supprimer les données ;
- page Suggestions plus visuelle : score global, scores détaillés, cartes d’alertes, niveaux critique / à vérifier / bon point ;
- panneau **IA & Web** : prompt IA prêt à copier et recherches web ciblées selon la destination, la durée, les centres d’intérêt et le style du voyage ;
- aucune dépendance obligatoire à une API IA payante ;
- conservation de la carte OSM stable sans Leaflet ;
- conservation de Firebase comme source principale de sauvegarde ;
- aucun fichier `firebase-config.example`.

## Fonctionnement

1. Publier le dossier sur GitHub Pages.
2. Vérifier que `js/firebase-config.js` contient la configuration Firebase du projet.
3. Copier `firestore.rules` dans Firebase Console si les règles ont changé.
4. Ouvrir le site, se connecter avec Google, puis créer ou ouvrir un voyage.

## Fichiers importants

```text
index.html
css/style.css
js/app.js
js/suggestions.js
js/budget.js
js/itinerary.js
js/map.js
js/storage.js
js/firebase-sync.js
js/firebase-config.js
assets/icons/
assets/images/
```

## Notes

La recherche IA / Web ajoutée dans la page Suggestions ne lance pas automatiquement d’appel API payant. Le site génère :

- un prompt IA copiable ;
- des liens de recherche web ciblés ;
- des corrections locales sûres via JavaScript.

Les corrections automatiques n’inventent pas d’horaires et ne suppriment aucune donnée. Elles ajoutent surtout des tâches, postes de budget ou checklists à vérifier.
