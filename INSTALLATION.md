# 📦 Guide d'Installation et Déploiement

## Installation locale

### Prérequis
- Git
- Un navigateur moderne (Chrome, Firefox, Safari, Edge)
- Connexion internet (pour Firebase)

### Étapes

#### 1. Cloner le dépôt

```bash
git clone https://github.com/stoxor-web/travel-planner.git
cd travel-planner
```

#### 2. Configurer Firebase

**Créez `js/firebase-config.js`** à partir de votre console Firebase :

```javascript
// Firebase Configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
```

**Où trouver ces clés** :
1. Firebase Console → Project Settings
2. Copier les valeurs de votre projet
3. Coller dans `firebase-config.js`

#### 3. Vérifier les fichiers

```bash
# Vérifier que tout est en place
ls -la js/firebase-config.js
ls -la css/style.css
ls -la assets/
```

#### 4. Servir localement

**Option A : Python**
```bash
python -m http.server 8000
# Accédez à http://localhost:8000
```

**Option B : Node.js (http-server)**
```bash
npm install -g http-server
http-server
# Accédez à http://localhost:8080
```

**Option C : VS Code Live Server**
```
Click droit sur index.html → Open with Live Server
```

---

## Déploiement sur GitHub Pages

### Prérequis
- Dépôt GitHub
- Accès en écriture au dépôt

### Étapes de déploiement

#### 1. Vérifier la branche

```bash
git status
# Devrait être sur 'main' ou 'master'
git branch -a
```

#### 2. Ajouter les fichiers

```bash
# Ajouter tous les fichiers améliorés
git add .

# Vérifier les changements
git status
```

#### 3. Créer un commit

```bash
git commit -m "V4.20 - Code quality improvements: HTML formatted, CSS documented, improved accessibility"
```

#### 4. Pousser vers GitHub

```bash
git push origin main
# ou
git push origin master
```

#### 5. Vérifier le déploiement

- Aller sur : `https://github.com/stoxor-web/travel-planner`
- Aller à **Settings** → **Pages**
- Vérifier que la source est `main` (ou `master`)
- Le site sera disponible à : `https://stoxor-web.github.io/travel-planner/`

#### 6. Attendre la publication

- GitHub publie généralement en 30 secondes à 1 minute
- Vérifier l'onglet **Deployments** pour le statut
- Rafraîchir le site après quelques secondes

---

## Configuration Firebase

### Créer un projet Firebase

#### 1. Aller sur Firebase Console

```
https://console.firebase.google.com/
```

#### 2. Créer un nouveau projet

- Cliquer sur "Add project"
- Entrer le nom du projet
- Accepter les conditions
- Cliquer "Create project"

#### 3. Ajouter une app web

- Dans la section "Get started by adding Firebase to your app"
- Cliquer sur l'icône web `</>`
- Entrer le nom de l'app
- Cliquer "Register app"
- Copier la configuration

#### 4. Configurer Authentication

##### Activer Google Sign-In

1. Aller à **Authentication** → **Sign-in method**
2. Cliquer sur **Google**
3. Activer et cliquer **Save**
4. Configurer le consentement OAuth si demandé

##### Activer Email/Password

1. Aller à **Authentication** → **Sign-in method**
2. Cliquer sur **Email/Password**
3. Activer **Email/Password** et **Email link (passwordless)**
4. Cliquer **Save**

##### Activer Anonymous Auth

1. Aller à **Authentication** → **Sign-in method**
2. Cliquer sur **Anonymous**
3. Activer
4. Cliquer **Save**

#### 5. Configurer Firestore

##### Créer la base de données

1. Aller à **Firestore Database**
2. Cliquer **Create database**
3. Choisir **Production mode** ou **Test mode**
4. Choisir la région (Europe/us-central1)
5. Cliquer **Create**

##### Ajouter les règles

1. Aller à **Firestore Database** → **Rules**
2. Remplacer le contenu par celui de `firestore.rules`
3. Cliquer **Publish**

### Exemple de règles Firestore

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users trips - private
    match /users/{uid}/trips/{tripId} {
      allow read, write: if request.auth.uid == uid;
    }
    
    // Community trips - public read, auth write
    match /communityTrips/{tripId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.uid || 
                               request.auth.token.email == 'admin@example.com';
    }
    
    // Votes - auth required
    match /communityTrips/{tripId}/votes/{voteId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow delete: if request.auth.uid == resource.data.uid;
    }
  }
}
```

---

## Dépannage

### "Cannot read property 'initializeApp' of undefined"

**Cause** : Firebase n'est pas chargé
**Solution** : 
- Vérifier que `firebase-config.js` est présent
- Vérifier que la clé API est valide
- Vérifier la connexion internet

### "Missing or insufficient permissions"

**Cause** : Règles Firestore incorrectes
**Solution** :
- Copier les règles de `firestore.rules`
- Les publier dans Firebase Console
- Attendre 30 secondes
- Rafraîchir le navigateur

### Les données ne se synchronisent pas

**Causes possibles** :
1. Firebase non connecté
2. Utilisateur non authentifié
3. Règles Firestore trop restrictives
4. Navigateur hors ligne

**Solutions** :
- Vérifier la console des erreurs (F12)
- Vérifier que l'utilisateur est connecté
- Vérifier les règles Firestore
- Vérifier la connexion internet

### La carte n'affiche rien

**Cause** : Latitude/Longitude manquantes ou invalides
**Solution** :
- Remplir correctement les étapes avec localisation
- Utiliser la recherche pour auto-compléter
- Vérifier les coordonnées (format décimal)

### L'application est lente

**Solutions** :
- Vider le cache du navigateur
- Désactiver les extensions
- Vérifier la connexion internet
- Vérifier que Firebase répond

---

## Configuration locale avancée

### Développement avec des outils

#### npm packages utiles

```bash
npm install -g
  http-server        # Serveur local
  live-reload        # Rechargement automatique
  prettier           # Formatage code
  eslint             # Linting
  firebase-tools     # CLI Firebase
```

#### npm scripts

Créer `package.json` :

```json
{
  "scripts": {
    "start": "http-server",
    "dev": "live-reload . --include '*.html,*.css,*.js'",
    "format": "prettier --write '**/*.{html,css,js}'",
    "lint": "eslint js/"
  }
}
```

#### Utiliser Firebase CLI

```bash
# Installer Firebase CLI
npm install -g firebase-tools

# Se connecter
firebase login

# Initialiser le projet
firebase init

# Déployer
firebase deploy
```

---

## Optimisations de production

### Avant le déploiement final

```bash
# 1. Vérifier les erreurs console
# Ouvrir F12 et vérifier qu'il n'y a pas d'erreurs

# 2. Tester tous les formulaires
# Créer un voyage, ajouter des étapes, etc.

# 3. Tester la synchronisation Firebase
# Vérifier que les données sont sauvegardées

# 4. Tester sur mobile
# Utiliser F12 → Device Mode pour tester responsive

# 5. Vérifier les perfs (Lighthouse)
# F12 → Lighthouse → Analyze page load
```

### Checklist de déploiement

- [ ] Tous les fichiers sont présents
- [ ] `firebase-config.js` est configuré
- [ ] `firestore.rules` est déployée
- [ ] Authentication providers sont activés
- [ ] Tests locaux réussis
- [ ] Pas d'erreurs console
- [ ] Responsive design testé
- [ ] Firebase synchronisation fonctionne
- [ ] GitHub Pages est activé
- [ ] URL est correcte

---

## Support et aide

### Documentation officielle

- **Firebase** : https://firebase.google.com/docs
- **GitHub Pages** : https://pages.github.com/
- **MDN Web Docs** : https://developer.mozilla.org/

### Ressources

- README.md - Documentation complète
- CHANGELOG.md - Historique des modifications
- css/style.css - Documentation CSS inline
- index.html - Commentaires dans le code

### Besoin d'aide ?

1. Vérifier la documentation
2. Vérifier les erreurs console (F12)
3. Consulter les comments du code
4. Ouvrir une issue GitHub

---

**Installation complète en 5 minutes** ⚡
