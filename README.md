# Travel Planner

Application web statique de planification de voyages avec connexion Google et sauvegarde automatique dans Firebase.

## Fonctionnement

- L'utilisateur se connecte avec Google.
- Ses voyages sont chargés depuis Cloud Firestore.
- Chaque modification est sauvegardée automatiquement.
- Les données sont isolées par compte Google dans `travelPlannerUsers/{uid}`.
- Le site reste hébergeable gratuitement sur GitHub Pages.

## Fichiers importants

```text
index.html
css/style.css
js/firebase-config.js
js/firebase-sync.js
js/app.js
js/storage.js
firestore.rules
```

## Configuration Firebase déjà intégrée

Le fichier `js/firebase-config.js` contient la configuration du projet Firebase :

```js
window.TRAVEL_PLANNER_FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "travel-planner-60337.firebaseapp.com",
  projectId: "travel-planner-60337",
  storageBucket: "travel-planner-60337.firebasestorage.app",
  messagingSenderId: "981112659597",
  appId: "1:981112659597:web:92a0e42989ca6386458cc4",
  measurementId: "G-YMK5EDLSM9"
};
```

Le site n'utilise pas la syntaxe `import { initializeApp } from "firebase/app"`, car GitHub Pages sert directement des fichiers statiques sans étape de compilation npm. Les modules Firebase sont chargés depuis le CDN officiel dans `js/firebase-sync.js`.

## Règles Firestore

Copier le contenu de `firestore.rules` dans :

```text
Firebase Console > Firestore Database > Rules
```

Les règles limitent l'accès aux données de l'utilisateur connecté uniquement.

## Publication GitHub Pages

1. Remplacer les fichiers du dépôt par ceux de ce dossier.
2. Vérifier que le domaine `stoxor-web.github.io` est autorisé dans Firebase Authentication.
3. Publier le dépôt sur GitHub Pages.
4. Ouvrir le site.
5. Cliquer sur `Continuer avec Google`.

## Test rapide

Après connexion :

1. Créer un voyage.
2. Ajouter une étape.
3. Recharger la page.
4. Le voyage doit réapparaître automatiquement.
5. Vérifier dans Firestore la présence de :

```text
travelPlannerUsers/{uid}
```
