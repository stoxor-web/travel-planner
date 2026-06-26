# Travel Planner V4.20 — Documentation Améliorée

> **Planificateur de voyages moderne** avec synchronisation Firebase, gestion budgétaire, itinéraires interactifs et communauté.

<https://stoxor-web.github.io/travel-planner/>

## 📋 Table des matières

1. [🎯 À propos](#-à-propos)
2. [✨ Améliorations V4.20](#-améliorations-v420)
3. [🚀 Démarrage rapide](#-démarrage-rapide)
4. [📁 Structure du projet](#-structure-du-projet)
5. [⚙️ Configuration](#️-configuration)
6. [🏗️ Architecture](#️-architecture)
7. [🔄 Flux de travail](#-flux-de-travail)
8. [📱 Responsive Design](#-responsive-design)
9. [🎨 Design System](#-design-system)
10. [🔐 Sécurité](#-sécurité)
11. [🐛 Débogage](#-débogage)
12. [📝 Notes de version](#-notes-de-version)

---

## 🎯 À propos

Travel Planner est une application web moderne pour planifier vos voyages. Elle offre :

- ✅ **Gestion des voyages** : Créez, modifiez et organisez vos itinéraires
- 💰 **Budget intelligent** : Suivez vos dépenses et divisez les frais
- 🗺️ **Carte interactive** : Visualisez vos étapes sur une carte
- 📅 **Planning détaillé** : Organisez jour par jour
- 🌍 **Communauté** : Partagez vos voyages et découvrez d'autres
- 🔒 **Synchronisation Firebase** : Sauvegarde automatique sécurisée
- 🎭 **Mode sombre** : Interface adaptée à vos préférences
- 📱 **Mobile-first** : Optimisé pour tous les appareils

---

## ✨ Améliorations V4.20

### Code Quality
- **HTML** : Structure lisible avec commentaires explicatifs
  - ✅ Balises sémantiques (header, nav, section, aside)
  - ✅ Attributs ARIA pour accessibilité
  - ✅ Format lisible et maintenable
  - ✅ Commentaires de section

- **CSS** : Formatage complet avec documentation
  - ✅ Variables CSS bien organisées
  - ✅ Commentaires détaillés pour chaque section
  - ✅ Architecture claire (reset, layout, forms, etc.)
  - ✅ Media queries documentées
  - ✅ Dark mode intégré

- **JavaScript** : Prêt pour la documentation
  - ✅ Structure modulaire préservée
  - ✅ Noms de variables explicites
  - ✅ Prêt pour JSDoc

### Performance
- ✅ Chargement différé des scripts (defer)
- ✅ CSS optimisé
- ✅ Images allégées
- ✅ Manifeste PWA

### Accessibilité
- ✅ Attributs ARIA pour navigation
- ✅ Labels associés aux inputs
- ✅ Contraste amélioré
- ✅ Navigation au clavier

### Maintenabilité
- ✅ Code formaté et lisible
- ✅ Structure logique
- ✅ Documentation inline
- ✅ Facilement extensible

---

## 🚀 Démarrage rapide

### 1. Cloner le dépôt

```bash
git clone https://github.com/stoxor-web/travel-planner.git
cd travel-planner
```

### 2. Configuration Firebase

Créez un fichier `js/firebase-config.js` :

```javascript
// Firebase Configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
```

### 3. Déployer sur GitHub Pages

```bash
git add .
git commit -m "V4.20 - Code quality improvements"
git push origin main
```

### 4. Configuration Firebase Rules

Copiez le contenu de `firestore.rules` dans :
**Firebase Console → Firestore Database → Rules → Publier**

---

## 📁 Structure du projet

```
travel-planner/
├── index.html                 # HTML principal (formaté et lisible)
├── css/
│   └── style.css             # Styles complets avec documentation
├── js/
│   ├── app.js                # Application principale
│   ├── utils.js              # Utilitaires (places, categories...)
│   ├── storage.js            # Gestion du localStorage
│   ├── firebase-config.js    # Configuration Firebase
│   ├── firebase-sync.js      # Synchronisation Cloud
│   ├── budget.js             # Module budget
│   ├── itinerary.js          # Module planning
│   ├── suggestions.js        # Suggestions intelligentes
│   ├── geocoder.js           # Géocodage (Nominatim)
│   └── map.js                # Visualisation de carte
├── assets/
│   ├── icons/               # Icônes et favicons
│   └── images/              # Images du projet
├── site.webmanifest         # Manifeste PWA
├── firestore.rules          # Règles Firebase Firestore
└── README.md                # Cette documentation
```

---

## ⚙️ Configuration

### Variables Firebase

Assurez-vous que Firebase Authentication est configuré avec :
- ✅ Google Provider
- ✅ Email/Password Provider
- ✅ Anonymous Provider

### Règles Firestore

Les règles par défaut (`firestore.rules`) permettent :
- Lecture/écriture des données utilisateur
- Partage communautaire
- Votes utilisateurs

### Paramètres utilisateur

Modifiables dans **Paramètres → Estimations & sauvegarde** :
- Vitesse voiture (km/h)
- Vitesse train (km/h)
- Vitesse marche (km/h)
- Fréquence autosave (minutes)

---

## 🏗️ Architecture

### Modularité

Le code est organisé en modules indépendants :

```
window.TravelUtils          → Utilitaires globaux
window.TravelStorage        → Gestion du stockage
window.TravelBudget         → Logique budgétaire
window.TravelItinerary      → Planification
window.TravelSuggestions    → Suggestions IA
window.TravelMap            → Visualisation cartographique
window.TravelCloudSync      → Synchronisation Firebase
```

### Flux de données

```
User Input
    ↓
Event Handler
    ↓
State Update (Storage)
    ↓
Cloud Sync (Firebase)
    ↓
UI Render
    ↓
User View
```

### État de l'application

```javascript
state = {
  activeTripId: string,
  trips: {
    [tripId]: Trip
  },
  settings: {
    theme: 'light' | 'dark',
    autosaveMinutes: number,
    carSpeed: number,
    // ...
  }
}
```

---

## 🔄 Flux de travail

### Créer un voyage

1. Cliquer sur "Nouveau voyage"
2. Remplir les informations
3. Enregistrer
4. L'application le sauvegarde localement + Firebase

### Ajouter des étapes

1. Aller à l'onglet "Planning"
2. Cliquer "+ Ajouter une étape"
3. Rechercher un lieu (Nominatim)
4. Compléter les informations
5. La carte se met à jour automatiquement

### Gérer le budget

1. Aller à l'onglet "Budget"
2. Ajouter une dépense
3. La catégorie de dépense est liée à une étape
4. Status peut être : prévue, payée, à rembourser, partagée
5. Calcul automatique des dépenses et remboursements

### Partager dans la communauté

1. Créer un voyage (au minimum)
2. Cliquer "Partager mon voyage"
3. Remplir les détails publics
4. Publier
5. Les autres utilisateurs peuvent voter et copier

---

## 📱 Responsive Design

### Breakpoints

- **Desktop** : 1180px+
- **Tablet** : 860px - 1179px
- **Mobile** : 520px - 859px
- **Small Mobile** : < 520px

### Adaptations

- **Desktop** : Sidebar fixe, 3 colonnes
- **Tablet** : Sidebar fixe, 2 colonnes, layouts réorganisés
- **Mobile** : Bottom navigation, 1 colonne, modals à plein écran
- **Small** : Conteneurs plus petits, font réduite

---

## 🎨 Design System

### Couleurs (CSS Variables)

```css
/* Light Mode */
--bg: #f4f7fb;              /* Fond */
--surface: #fff;            /* Surfaces */
--text: #101828;            /* Texte */
--primary: #1769e8;         /* Bleu principal */
--primary-2: #0b3b66;       /* Bleu foncé */
--teal: #12b6b0;            /* Vert-bleu */
--coral: #ff725e;           /* Corail */
--success: #16a34a;         /* Succès */
--warning: #f59e0b;         /* Avertissement */
--danger: #dc2626;          /* Danger */

/* Dark Mode */
/* Variables adaptées automatiquement */
```

### Typographie

- **Font** : Inter (sans-serif)
- **Títre H1** : clamp(1.7rem, 3vw, 2.6rem)
- **Títre H2** : 1.8rem - 3.2rem
- **Corps** : 1rem
- **Petits** : 0.88rem - 0.92rem

### Espacement

- **Sidebar** : 278px
- **Padding** : 22px, 16px, 12px
- **Gap** : 22px, 16px, 12px, 8px
- **Border radius** : 24px (normal), 16px (petit)

### Ombres

- **Shadow** : 0 22px 55px rgba(...)
- **Soft shadow** : 0 12px 30px rgba(...)

---

## 🔐 Sécurité

### Authentication

- Google OAuth 2.0
- Email/Password (Firebase)
- Anonymous (Invité local)

### Data Protection

- HTTPS obligatoire (GitHub Pages)
- Chiffrement Firebase
- Données privées par défaut
- Partage optionnel communautaire

### Rules Firestore

```
if (auth != null && auth.uid == resource.data.uid) {
  // Propriétaire : accès complet
  allow read, write;
}
```

---

## 🐛 Débogage

### Console Browser

Ouvrez **F12** et utilisez :

```javascript
// Accéder à l'état
console.log(state);

// Accéder aux modules
console.log(window.TravelStorage);
console.log(window.TravelCloudSync);

// Forcer une sauvegarde
scheduleCloudAutosave();
```

### Problèmes courants

**"Missing or insufficient permissions"**
→ Vérifier firestore.rules est déployée

**Données ne se synchronisent pas**
→ Vérifier Firebase credentials
→ Vérifier auth utilisateur est valide

**Carte n'affiche pas les étapes**
→ Vérifier latitude/longitude sont valides
→ Vérifier Nominatim répond

---

## 📝 Notes de version

### V4.20 (Actuel)
- ✅ Formatage HTML complet
- ✅ Documentation CSS exhaustive
- ✅ Améliorations accessibilité
- ✅ Performances optimisées
- ✅ Code quality enhanced

### V4.18
- Bloc de connexion visuel
- Firebase actif

### V4.16
- Trois modes de connexion
- Email/Password auth
- Anonymous guest access

### V4.15
- Choix connexion Google/Email
- Firebase synchronisation

---

## 🤝 Contribution

Les contributions sont bienvenues ! Pour contribuer :

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

---

## 📄 Licence

Ce projet est créé par **Lucas S.**

Les données sont synchronisées avec Firebase et mappage avec OpenStreetMap.

---

## 📞 Support

Pour les problèmes ou suggestions :
- Ouvrir une issue GitHub
- Vérifier la documentation
- Consulter les règles Firestore

---

**Travel Planner — Plan. Share. Explore.** ✈️
