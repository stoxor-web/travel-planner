# 📐 Style Guide - Travel Planner Code Standards

## Vue d'ensemble

Ce document définit les standards de code pour Travel Planner v4.20+. Il assure la **cohérence**, la **lisibilité** et la **maintenabilité** du code.

---

## 1. HTML Standards

### Structure et Indentation

```html
<!-- Indentation : 2 espaces -->
<div class="container">
  <header>
    <nav>
      <button>Lien</button>
    </nav>
  </header>
</div>
```

### Nommage des IDs

```html
<!-- Kebab-case pour les IDs (camelCase en JS) -->
<button id="newTripBtn">Ajouter</button>
<form id="emailLoginForm">...</form>
<dialog id="confirmDialog">...</dialog>
```

### Nommage des Classes

```html
<!-- Kebab-case pour les classes -->
<div class="dashboard-hero">
  <div class="hero-metrics">
    <div class="metric">...</div>
  </div>
</div>
```

### Attributs requis

```html
<!-- Toujours inclure -->
<input 
  id="emailField"
  type="email" 
  placeholder="email@example.com"
  aria-label="Email"
  autocomplete="email"
/>

<button 
  id="submitBtn"
  type="button"
  aria-label="Soumettre le formulaire"
>
  Soumettre
</button>
```

### Ordre des attributs

```html
<!-- Ordre recommandé -->
<input 
  id="..."              <!-- ID -->
  class="..."           <!-- Classes -->
  type="..."            <!-- Type/Role -->
  name="..."            <!-- Nom -->
  value="..."           <!-- Valeur initiale -->
  placeholder="..."     <!-- Placeholder -->
  aria-label="..."      <!-- Accessibilité -->
  aria-describedby="..." <!-- Accessibilité -->
  data-...="..."        <!-- Data attributes -->
/>
```

### Commentaires

```html
<!-- Commentaires avant les sections majeures -->

<!-- Dashboard Hero Section -->
<section class="view" id="view-dashboard">
  <!-- Content -->
</section>

<!-- Authentication Methods -->
<div class="auth-choice-grid">
  <!-- Methods -->
</div>
```

### Sections et groupes

```html
<!-- Grouper logiquement les contenus connexes -->

<!-- Main app shell -->
<div id="app" class="app-shell">
  <!-- Sidebar -->
  <aside class="sidebar">...</aside>
  
  <!-- Main content -->
  <main class="main">...</main>
</div>

<!-- Floating elements -->
<button class="fab">+</button>
<div class="fab-menu">...</div>

<!-- Modal dialogs -->
<dialog id="stepDialog">...</dialog>
```

---

## 2. CSS Standards

### Structure des fichiers

```css
/* 
 * Section header with border
 * ============================================================================
 */

/* Subsection if needed */

/* Individual rule sets */
.class {
  /* properties */
}
```

### Ordre des propriétés

```css
.element {
  /* Display & Layout */
  display: flex;
  flex-direction: column;
  gap: 12px;
  
  /* Dimensions */
  width: 100%;
  height: auto;
  min-height: 44px;
  
  /* Position */
  position: relative;
  inset: 0 0 auto 0;
  z-index: 10;
  
  /* Spacing */
  margin: 0 0 16px;
  padding: 12px;
  
  /* Border & Shadow */
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: var(--soft-shadow);
  
  /* Background & Color */
  background: var(--surface);
  color: var(--text);
  
  /* Typography */
  font-family: inherit;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.5;
  
  /* Effects */
  opacity: 1;
  transition: 0.18s;
  
  /* Misc */
  cursor: pointer;
}
```

### Utilisation de variables CSS

```css
/* ✅ BON */
.button {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}

/* ❌ MAUVAIS */
.button {
  background: #1769e8;
  border-color: #1769e8;
  color: #fff;
}
```

### Media Queries

```css
/* Mobile-first approach */
.container {
  grid-template-columns: 1fr;
}

/* Tablet+ */
@media (min-width: 860px) {
  .container {
    grid-template-columns: 1fr 1fr;
  }
}

/* Desktop+ */
@media (min-width: 1180px) {
  .container {
    grid-template-columns: 1fr 1fr 1fr;
  }
}
```

### Commentaires

```css
/* Section header avec description */
/* ============================================================================ */

/* Subsection comment */

/* Single-line comment for rules */
.class {
  property: value;
}
```

### Nommage des classes

```css
/* Kebab-case, descriptive, semantic */

/* Good */
.dashboard-hero
.section-heading
.auth-method-card
.button--primary
.button--danger
.is-active
.is-visible

/* Bad */
.red-box
.big-title
.container1
.thing_here
.bUtToN
```

### État et modificateurs (BEM-like)

```css
/* Base class */
.button { }

/* Modifiers with -- */
.button--primary { }
.button--danger { }
.button--ghost { }

/* States with .is- */
.is-active { }
.is-visible { }
.is-connected { }

/* Within component with - */
.button-row { }
.form-actions { }
```

### Dark mode

```css
:root {
  --bg: #f4f7fb;
  --text: #101828;
}

body.dark {
  --bg: #0d1320;
  --text: #eef4ff;
}

/* Usage - automatic */
.element {
  background: var(--bg);
  color: var(--text);
}
```

---

## 3. JavaScript Standards

### Module pattern

```javascript
(function () {
  'use strict';

  // Dependencies
  const U = window.TravelUtils;
  const Storage = window.TravelStorage;

  // Module-level variables
  let state = {};
  let cache = {};

  // Initialization
  function init() {
    setupEventListeners();
    renderUI();
  }

  // Main functions
  function setupEventListeners() {
    // ...
  }

  // Helper functions
  function helperFunction() {
    // ...
  }

  // Expose public API
  window.TravelModuleName = {
    init,
    publicFunction
  };

  // Auto-init if document ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

### Nommage des variables

```javascript
// Constants - UPPER_SNAKE_CASE
const MAX_TRIPS = 100;
const DEFAULT_CURRENCY = 'EUR';
const API_TIMEOUT = 5000;

// Functions - camelCase, verbes
function initializeApp() { }
function handleClick() { }
function validateEmail() { }
function fetchTrips() { }

// Variables - camelCase
let currentView = 'dashboard';
let isLoading = false;
let userData = { };

// Booleans - is*, has*, can*
let isConnected = false;
let hasError = true;
let canEdit = false;
```

### Formatage du code

```javascript
// Indentation : 2 espaces
function example() {
  if (condition) {
    doSomething();
  }
}

// Espaces autour des opérateurs
let result = x + y;
if (a === b) { }

// Longs arguments : multi-ligne
function createTrip(
  name,
  country,
  startDate,
  endDate,
  budget
) {
  // ...
}

// Appels de fonction : multi-ligne si long
const trip = Storage.save(
  state,
  {
    name: 'Paris',
    country: 'France'
  }
);
```

### Documentations avec JSDoc

```javascript
/**
 * Initializes the application
 * @function
 * @returns {void}
 */
function init() {
  // ...
}

/**
 * Saves a trip to storage
 * @function
 * @param {Object} trip - Trip object
 * @param {string} trip.name - Trip name
 * @param {string} trip.country - Destination country
 * @returns {Object} Saved trip with ID
 */
function saveTrip(trip) {
  // ...
}

/**
 * Handles form submission
 * @function
 * @param {Event} event - Form submit event
 * @throws {Error} If validation fails
 * @returns {Promise<void>}
 */
async function handleSubmit(event) {
  // ...
}
```

### Pas de minification

```javascript
// ✅ BON
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function switchView(viewName) {
  const elements = $$('.view');
  elements.forEach(el => {
    el.classList.remove('is-visible');
  });
  
  const newView = $(`#view-${viewName}`);
  if (newView) {
    newView.classList.add('is-visible');
  }
}

// ❌ MAUVAIS - Impossible à maintenir
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];function sv(v){$$('.view').forEach(e=>e.classList.remove('is-visible'));($(`#view-${v}`)||{}).classList.add('is-visible')}
```

---

## 4. Accessibilité (a11y)

### Attributs ARIA requis

```html
<!-- Boutons de navigation -->
<button 
  id="dashboardBtn"
  aria-label="Tableau de bord"
  data-view-link="dashboard"
>
  🏠 <span>Accueil</span>
</button>

<!-- Inputs -->
<input 
  id="emailField"
  type="email"
  aria-label="Adresse email"
  aria-describedby="emailHelp"
/>
<small id="emailHelp">Nous ne partagerons pas votre email</small>

<!-- Dialogues -->
<dialog id="confirmDialog">
  <h2 id="confirmTitle">Êtes-vous sûr ?</h2>
  <p id="confirmMessage">Cette action ne peut pas être annulée</p>
  <!-- aria-labelledby utilisé automatiquement -->
</dialog>
```

### Clavier et focus

```css
/* Visible focus states */
button:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

input:focus-visible {
  border-color: var(--primary);
  box-shadow: 0 0 0 4px rgba(23, 105, 232, 0.13);
}
```

### Textes alternatifs

```html
<!-- Images -->
<img 
  src="logo.png" 
  alt="Travel Planner Logo"
/>

<!-- Icônes fonctionnelles -->
<button aria-label="Fermer">×</button>
<button aria-label="Menu">≡</button>

<!-- Icônes décoratives -->
<span aria-hidden="true">🌙</span>
```

---

## 5. Performance

### Chargement des scripts

```html
<!-- Au lieu de -->
<script src="app.js"></script>

<!-- Utiliser defer pour non-bloquant -->
<script defer src="app.js"></script>

<!-- Ordre : dépendances en premier -->
<script defer src="firebase-config.js"></script>
<script defer src="utils.js"></script>
<script defer src="app.js"></script>
```

### Optimisation CSS

```css
/* ✅ Éviter les sélecteurs trop spécifiques */
.sidebar .nav-item { }

/* ❌ Mauvais */
body > .app-shell > .sidebar > .nav-list > .nav-item { }

/* ✅ Utiliser des classes efficaces */
.nav-item { }

/* ❌ Éviter les transitions sur tout */
* {
  transition: all 0.3s;
}

/* ✅ Être spécifique */
.button {
  transition: transform 0.18s, box-shadow 0.18s;
}
```

---

## 6. Testing

### Checklist de test

- [ ] Responsive sur desktop (1920px+)
- [ ] Responsive sur tablet (860px)
- [ ] Responsive sur mobile (520px)
- [ ] Tous les formulaires fonctionnent
- [ ] Firebase synchronise correctement
- [ ] Dark mode fonctionne
- [ ] Aucune erreur console
- [ ] Pas de console warnings
- [ ] Clavier navigation fonctionne
- [ ] Screen reader support OK

### Tests manuels

```javascript
// Console - Vérifier l'état
console.log(state);

// Console - Vérifier les modules
console.log(window.TravelStorage);
console.log(window.TravelCloudSync);

// Console - Tester une fonction
TravelUtils.getPlaceTypes();
```

---

## 7. Conventions de nommage - Résumé

```
File names:     index.html, style.css, app.js
CSS classes:    .dashboard-hero, .is-active
CSS IDs:        N/A (éviter)
JS variables:   camelCase
JS constants:   UPPER_SNAKE_CASE
JS functions:   camelCase avec verbes
HTML IDs:       camelCase (appelé de JS)
HTML classes:   kebab-case (stylé avec CSS)
Data attrs:     data-view-link, data-fab
```

---

## 8. Commit messages

```bash
# Format
git commit -m "TYPE: brief description"

# Types
feat:     Nouvelle fonctionnalité
fix:      Correction de bug
refactor: Restructuration du code
docs:     Changement de documentation
style:    Formatage, styles CSS
perf:     Optimisation de performance
a11y:     Amélioration accessibilité

# Exemples
git commit -m "feat: add export to PDF feature"
git commit -m "fix: resolve Firebase sync issue"
git commit -m "refactor: improve CSS organization"
git commit -m "docs: add installation guide"
git commit -m "a11y: improve form labels"
```

---

## 9. Pull Request checklist

- [ ] Code suit ce guide
- [ ] Tests passent
- [ ] Pas de console errors
- [ ] Documentation mise à jour
- [ ] Screenshots si UI changes
- [ ] Commit messages explicites

---

## 10. Outils recommandés

### Editeurs
- VS Code (recommandé)
- Prettier (formatage)
- ESLint (linting)
- StyleLint (CSS)

### Extensions VS Code
```json
{
  "extensions": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "stylelint.vscode-stylelint",
    "denoland.vscode-deno",
    "firefox-devtools.vscode-firefox-debug"
  ]
}
```

### Configuration .prettierrc
```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "none",
  "printWidth": 100
}
```

---

**Travel Planner Code Standards v4.20** ✨

Coherence. Quality. Maintainability.
