https://stoxor-web.github.io/travel-planner/

# Travel Planner — V4.10 UI & Partage

Application web personnelle de planification de voyages créée par Lucas S., hébergeable sur GitHub Pages et synchronisée avec Firebase/Google.

## Correctifs de cette version

- Footer officiel retravaillé avec mentions plus propres.
- Suppression du texte permanent « Connexion requise » dans le bas de la navigation.
- Bouton Google / connecté rendu lisible sur fond clair et sombre.
- Publication Communauté renforcée : formulaire plus fiable, erreurs plus claires, règles Firestore assouplies pour éviter les blocages de publication.
- Conservation de la configuration Firebase active dans `js/firebase-config.js`.
- Aucun fichier `firebase-config.example`.

## Publication

Remplace tout le contenu de ton dépôt GitHub Pages par le contenu de ce dossier, puis publie :

```bash
git add .
git commit -m "V4.10 correction interface et partage communaute"
git push origin main
```

Ensuite, ouvre le site en navigation privée ou vide le cache du navigateur.

## Règles Firebase

Copie le contenu de `firestore.rules` dans Firebase Console → Firestore Database → Rules.

La collection privée reste :

```text
travelPlannerUsers/{uid}
```

La communauté publique utilise :

```text
communityTrips/{tripId}
```

L’administrateur communautaire défini dans les règles est :

```text
lucas.scribe01@gmail.com
```
