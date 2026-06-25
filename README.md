# Travel Planner — version connexion Google opérationnelle

Application web statique de planification de voyages avec connexion Google obligatoire et sauvegarde automatique dans Cloud Firestore.

Cette version est prévue pour GitHub Pages : les visiteurs arrivent sur l’accueil, se connectent avec Google, puis leurs voyages se chargent automatiquement. Chaque modification est enregistrée en arrière-plan dans Firebase.

## À remplacer dans le dépôt

Remplace ces fichiers :

```text
index.html
README.md
firestore.rules
css/style.css
js/app.js
js/storage.js
js/firebase-sync.js
js/utils.js
```

Garde ton fichier déjà configuré :

```text
js/firebase-config.js
```

L’archive de mise à jour ne l’écrase pas. Un exemple est fourni dans :

```text
js/firebase-config.example.js
```

## Fonctionnement utilisateur

1. L’utilisateur ouvre le site.
2. Il clique sur **Continuer avec Google**.
3. Firebase Authentication valide le compte.
4. Le site charge automatiquement le document Firestore de l’utilisateur.
5. Si aucun document n’existe encore, il est créé.
6. Les voyages sont sauvegardés automatiquement après modification.
7. À la prochaine visite, les données réapparaissent après connexion.

## Données Firestore

Le site utilise un document par compte Google :

```text
travelPlannerUsers/{uid}
```

Le document contient :

```text
ownerUid
ownerEmail
schema
schemaVersion
clientUpdatedAt
updatedAt
state
```

`state` contient les paramètres, le voyage actif et la liste des voyages.

## Règles Firestore

Colle le contenu du fichier `firestore.rules` dans :

```text
Firebase Console → Firestore Database → Rules
```

Ces règles autorisent uniquement l’utilisateur connecté à lire, créer, modifier ou supprimer son propre document.

## Configuration Firebase requise

Dans Firebase Console :

```text
Authentication → Sign-in method → Google → Enable
Authentication → Settings → Authorized domains
```

Ajoute au minimum :

```text
stoxor-web.github.io
localhost
127.0.0.1
```

Dans `js/firebase-config.js`, garde les valeurs de ton application Web Firebase :

```js
window.TRAVEL_PLANNER_FIREBASE_CONFIG = {
  apiKey: '...',
  authDomain: 'ton-projet.firebaseapp.com',
  projectId: 'ton-projet',
  appId: '...',
  storageBucket: 'ton-projet.appspot.com',
  messagingSenderId: '...'
};
```

## Fichiers principaux

```text
travel-planner/
├── index.html
├── README.md
├── firestore.rules
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── firebase-config.js
│   ├── firebase-config.example.js
│   ├── firebase-sync.js
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

## Ce qui a été nettoyé

- Plus d’export/import JSON dans l’interface.
- Plus de sauvegarde locale des voyages.
- Plus de bouton de synchronisation manuel.
- Plus de bouton de voyage exemple sur l’accueil.
- Messages de connexion plus courts.
- Accès aux pages bloqué tant que l’utilisateur n’est pas connecté.
- Gestion d’erreurs Firebase plus claire.
- Connexion Google avec popup et repli redirect si le navigateur bloque la fenêtre.

## Test rapide

Après publication :

1. ouvre `https://stoxor-web.github.io/travel-planner/` ;
2. clique sur **Continuer avec Google** ;
3. accepte la connexion ;
4. crée un voyage ;
5. actualise la page ;
6. reconnecte-toi si nécessaire ;
7. vérifie que le voyage revient automatiquement ;
8. ouvre Firestore Database → Data ;
9. vérifie la présence de `travelPlannerUsers/{uid}`.

## Erreurs courantes

`Ce domaine n’est pas autorisé dans Firebase Authentication.`  
Ajoute `stoxor-web.github.io` dans les domaines autorisés.

`Accès Firebase refusé. Vérifie les règles Firestore.`  
Vérifie les règles `firestore.rules` et que la base Firestore est bien créée.

`Configuration Firebase manquante.`  
Vérifie que `js/firebase-config.js` contient tes vraies valeurs Firebase.
