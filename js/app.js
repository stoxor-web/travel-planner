(function () {
  'use strict';

  const U = window.TravelUtils;
  const Storage = window.TravelStorage;
  const Budget = window.TravelBudget;
  const Itinerary = window.TravelItinerary;
  const Suggestions = window.TravelSuggestions;
  const MapView = window.TravelMap;
  const CloudSync = window.TravelCloudSync;

  let state = Storage.load();
  let cloudAutosaveTimer = null;
  let cloudLastSavedAt = '';
  let loadedCloudUid = null;
  let appReady = false;
  let cloudLoading = true;
  let currentView = 'dashboard';
  let communityTripsCache = [];
  let communityLoading = false;

  const titles = {
    dashboard: 'Tableau de bord',
    today: 'Aujourd’hui',
    community: 'Communauté',
    trip: 'Créer ou modifier un voyage',
    map: 'Carte du voyage',
    itinerary: 'Feuille de route',
    budget: 'Budget',
    suggestions: 'Suggestions',
    preparation: 'Préparation',
    journal: 'Carnet de voyage',
    settings: 'Paramètres'
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function init() {
    populateStaticSelects();
    bindNavigation();
    bindActions();
    applyTheme(state.settings.theme || 'light');
    renderAll();
    switchView(location.hash?.replace('#', '') || 'dashboard');
    initCloudSync();
  }

  function populateStaticSelects() {
    const typeSelect = $('#stepForm select[name="type"]');
    typeSelect.innerHTML = U.placeTypes.map(type => `<option value="${type}">${type}</option>`).join('');
    const categorySelect = $('#expenseForm select[name="category"]');
    categorySelect.innerHTML = U.expenseCategories.map(category => `<option value="${category}">${category}</option>`).join('');
  }

  function bindNavigation() {
    $$('[data-view-link]').forEach(button => {
      button.addEventListener('click', event => {
        const view = event.currentTarget.dataset.viewLink;
        switchView(view);
      });
    });
    window.addEventListener('hashchange', () => switchView(location.hash.replace('#', '') || 'dashboard'));
  }

  function bindActions() {
    const on = (id, event, handler) => {
      const element = document.getElementById(id);
      if (element) element.addEventListener(event, handler);
    };

    on('newTripBtn', 'click', createNewTrip);
    on('createFirstTripBtn', 'click', createNewTrip);
    on('loadDemoBtn', 'click', loadDemoTrip);
    on('tripSelector', 'change', event => {
      if (!requireCloudReady()) return;
      state.activeTripId = event.target.value || null;
      state = Storage.save(state);
      renderAll();
      scheduleCloudAutosave();
    });
    on('themeToggle', 'click', () => {
      state.settings.theme = document.body.classList.contains('dark') ? 'light' : 'dark';
      state = Storage.save(state);
      applyTheme(state.settings.theme);
      renderBudget();
      scheduleCloudAutosave();
    });
    on('tripForm', 'submit', saveTripForm);
    on('settingsForm', 'submit', event => { event.preventDefault(); saveSettings(); });
    on('addStepBtn', 'click', () => openStepDialog());
    on('stepForm', 'submit', saveStepForm);
    on('addExpenseBtn', 'click', () => openExpenseDialog());
    on('expenseForm', 'submit', saveExpenseForm);
    on('fitMapBtn', 'click', MapView.fitBounds);
    on('refreshItineraryBtn', 'click', () => renderItinerary());
    on('optimizeBtn', 'click', optimizeActiveTrip);
    on('addChecklistItemBtn', 'click', addChecklistItem);
    on('saveSettingsBtn', 'click', saveSettings);
    on('deleteCloudDataBtn', 'click', deleteCloudData);
    on('communityPublishBtn', 'click', openPublishDialog);
    on('communityRefreshBtn', 'click', () => renderCommunity(true));
    on('publishForm', 'submit', publishCommunityTrip);
    ['communitySearchInput', 'communityCountryFilter', 'communityCategoryFilter', 'communitySortFilter'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.addEventListener(id === 'communitySearchInput' ? 'input' : 'change', () => renderCommunity(false));
    });
    bindCloudActions();
    window.addEventListener('resize', () => MapView.fitBounds?.());
    $$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => {
      const dialog = document.getElementById(button.dataset.closeDialog);
      if (dialog?.open) dialog.close('cancel');
    }));
  }

  function switchView(view) {
    if (!titles[view]) view = 'dashboard';
    if (!appReady && !['dashboard', 'settings'].includes(view)) view = 'dashboard';
    currentView = view;
    location.hash = view;
    $$('.view').forEach(section => section.classList.toggle('is-visible', section.id === `view-${view}`));
    $$('.nav-item').forEach(item => item.classList.toggle('is-active', item.dataset.viewLink === view));
    $('#pageTitle').textContent = titles[view];
    if (view === 'map') {
      renderMap();
      MapView.fitBounds?.();
    }
    if (view === 'today') renderToday();
    if (view === 'community') renderCommunity(false);
    if (view === 'budget') renderBudget();
    if (view === 'suggestions') renderSuggestions();
    if (view === 'itinerary') renderItinerary();
  }

  function renderAll() {
    renderTripSelector();
    renderDashboard();
    renderToday();
    renderCommunity(false);
    renderTripForm();
    renderSteps();
    renderItinerary();
    renderBudget();
    renderSuggestions();
    renderChecklists();
    renderJournal();
    renderSettings();
    renderMap();
  }

  function activeTrip() {
    if (!appReady) return null;
    return Storage.getTrip(state);
  }

  function requireCloudReady() {
    if (appReady && CloudSync?.getUser()) return true;
    switchView('dashboard');
    showStatus('Connecte-toi avec Google ou e-mail pour utiliser le planificateur.');
    return false;
  }

  function persist(message) {
    if (!requireCloudReady()) return;
    state = Storage.save(state);
    renderAll();
    scheduleCloudAutosave();
    if (message) showStatus(message);
  }

  function showStatus(message) {
    const banner = $('#statusBanner');
    banner.textContent = message;
    banner.hidden = false;
    clearTimeout(showStatus.timeout);
    showStatus.timeout = setTimeout(() => { banner.hidden = true; }, 2800);
  }

  function applyTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
    $('#themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  function renderTripSelector() {
    const selector = $('#tripSelector');
    selector.innerHTML = state.trips.length
      ? state.trips.map(trip => `<option value="${trip.id}">${U.escapeHtml(trip.name)}</option>`).join('')
      : '<option value="">Aucun voyage</option>';
    selector.value = state.activeTripId || '';
  }

  function renderDashboard() {
    const grid = $('#tripsGrid');
    const user = CloudSync?.getUser();

    if (cloudLoading) {
      grid.innerHTML = '<div class="empty-state">Chargement de Firebase…</div>';
      return;
    }

    if (!user || !appReady) {
      grid.innerHTML = `
        <div class="login-gate">
          <div class="login-gate__icon">☁️</div>
          <h2>Connexion requise</h2>
          <p>Tes voyages sont synchronisés dans Firebase. Connecte-toi avec Google ou avec ton adresse e-mail.</p>
          <button class="button button--primary" id="dashboardSignInBtn">Choisir un mode de connexion</button>
          <small>Le site n’utilise plus de sauvegarde locale de voyages ni d’export JSON.</small>
        </div>
      `;
      document.getElementById('dashboardSignInBtn')?.addEventListener('click', () => switchView('settings'));
      return;
    }

    if (!state.trips.length) {
      grid.innerHTML = '<div class="empty-state">Aucun voyage dans Firebase pour ce compte. Crée ton premier itinéraire ou charge l’exemple.</div>';
      return;
    }

    grid.innerHTML = state.trips.map(trip => {
      const budget = Budget.computeBudget(trip);
      return `
        <article class="trip-card">
          <div class="trip-card__top">
            <div>
              <span class="badge">${U.escapeHtml(trip.status)}</span>
              <h3>${U.escapeHtml(trip.name)}</h3>
            </div>
            <span>${trip.steps.length} étape(s)</span>
          </div>
          <p>${U.escapeHtml(trip.description || 'Aucune description pour le moment.')}</p>
          <div class="trip-card__meta">
            <span>📅 ${U.formatDate(trip.startDate)} → ${U.formatDate(trip.endDate)}</span>
            <span>🌍 ${U.escapeHtml(trip.area || 'zone non renseignée')}</span>
            <span>💶 ${U.formatMoney(budget.total, trip.currency)}${trip.maxBudget ? ` / ${U.formatMoney(trip.maxBudget, trip.currency)}` : ''}</span>
          </div>
          <div class="trip-card__actions">
            <button class="button button--primary" data-open-trip="${trip.id}">Modifier</button>
            <button class="button" data-duplicate-trip="${trip.id}">Dupliquer</button>
            <button class="button" data-delete-trip="${trip.id}">Supprimer</button>
          </div>
        </article>
      `;
    }).join('');
    grid.querySelectorAll('[data-open-trip]').forEach(button => button.addEventListener('click', () => {
      if (!requireCloudReady()) return;
      state.activeTripId = button.dataset.openTrip;
      state = Storage.save(state);
      renderAll();
      scheduleCloudAutosave();
      switchView('trip');
    }));
    grid.querySelectorAll('[data-duplicate-trip]').forEach(button => button.addEventListener('click', () => {
      if (!requireCloudReady()) return;
      state = Storage.duplicateTrip(state, button.dataset.duplicateTrip);
      renderAll();
      scheduleCloudAutosave();
      showStatus('Voyage dupliqué et synchronisé.');
    }));
    grid.querySelectorAll('[data-delete-trip]').forEach(button => button.addEventListener('click', () => deleteTrip(button.dataset.deleteTrip)));
  }


  function renderToday() {
    const hero = document.getElementById('todayHero');
    const actions = document.getElementById('todayActions');
    const timeline = document.getElementById('todayTimeline');
    if (!hero || !actions || !timeline) return;
    const trip = activeTrip();
    if (!trip) {
      hero.innerHTML = '<p class="eyebrow">Mode voyage</p><h2>Aucun voyage actif</h2><p>Connecte-toi puis crée ou sélectionne un voyage.</p>';
      actions.innerHTML = '<div class="empty-state">Le mode Aujourd’hui apparaîtra ici.</div>';
      timeline.innerHTML = '';
      return;
    }
    const steps = U.sortSteps(trip.steps || []);
    const today = new Date().toISOString().slice(0,10);
    const next = steps.find(step => !step.arrivalDate || step.arrivalDate >= today) || steps[0];
    hero.innerHTML = `
      <p class="eyebrow">Mode voyage</p>
      <h2>${U.escapeHtml(trip.name)}</h2>
      <p>${next ? `Prochaine étape : <strong>${U.escapeHtml(next.name)}</strong>` : 'Ajoute des étapes pour préparer ton séjour.'}</p>
      <div class="stats-grid">
        <div class="stat-card"><strong>${steps.length}</strong><span>étapes</span></div>
        <div class="stat-card"><strong>${U.tripDuration(trip)}</strong><span>jour(s)</span></div>
        <div class="stat-card"><strong>${U.formatMoney(Budget.computeBudget(trip).actualTotal, trip.currency)}</strong><span>réel</span></div>
        <div class="stat-card"><strong>${trip.status || 'prévu'}</strong><span>statut</span></div>
      </div>`;
    actions.innerHTML = `
      <p class="eyebrow">Actions rapides</p>
      <h2>Aujourd’hui</h2>
      <div class="stack">
        <button class="button button--primary" data-quick-step>+ Étape</button>
        <button class="button" data-quick-expense>+ Dépense</button>
        <button class="button" data-view-link="map">Ouvrir la carte</button>
      </div>`;
    actions.querySelector('[data-quick-step]')?.addEventListener('click', () => openStepDialog());
    actions.querySelector('[data-quick-expense]')?.addEventListener('click', () => openExpenseDialog());
    actions.querySelector('[data-view-link="map"]')?.addEventListener('click', () => switchView('map'));
    timeline.innerHTML = `<p class="eyebrow">Étapes proches</p><h2>Consultation rapide</h2><div class="timeline">${steps.slice(0, 8).map((step, index) => `<article class="timeline-row"><span class="badge">${index+1}</span><h3>${U.escapeHtml(step.name)}</h3><p>${U.formatDateTime(step.arrivalDate, step.arrivalTime)}${step.address ? ` · ${U.escapeHtml(step.address)}` : ''}</p></article>`).join('') || '<div class="empty-state">Aucune étape.</div>'}</div>`;
  }

  async function renderCommunity(force = false) {
    const grid = document.getElementById('communityGrid');
    const adminPanel = document.getElementById('communityAdminPanel');
    if (!grid) return;
    if (!CloudSync?.isConfigured()) {
      grid.innerHTML = '<div class="empty-state">Firebase doit être configuré pour afficher la communauté.</div>';
      return;
    }
    if ((force || !communityTripsCache.length) && !communityLoading) {
      communityLoading = true;
      grid.innerHTML = '<div class="empty-state">Chargement de la communauté…</div>';
      try {
        communityTripsCache = await CloudSync.listCommunityTrips();
      } catch (error) {
        console.error(error);
        grid.innerHTML = `<div class="empty-state">${U.escapeHtml(error.message || 'Impossible de charger la communauté.')}</div>`;
      } finally {
        communityLoading = false;
      }
    }
    const query = (document.getElementById('communitySearchInput')?.value || '').toLowerCase();
    const country = document.getElementById('communityCountryFilter')?.value || '';
    const category = document.getElementById('communityCategoryFilter')?.value || '';
    const sort = document.getElementById('communitySortFilter')?.value || 'trend';
    let trips = [...communityTripsCache];
    const countries = [...new Set(trips.map(item => item.country).filter(Boolean))].sort();
    const countryFilter = document.getElementById('communityCountryFilter');
    if (countryFilter && countryFilter.options.length <= 1) {
      countryFilter.innerHTML = '<option value="">Tous les pays</option>' + countries.map(item => `<option value="${U.escapeHtml(item)}">${U.escapeHtml(item)}</option>`).join('');
      countryFilter.value = country;
    }
    if (query) trips = trips.filter(item => [item.title, item.country, item.category, item.description].join(' ').toLowerCase().includes(query));
    if (country) trips = trips.filter(item => item.country === country);
    if (category) trips = trips.filter(item => item.category === category);
    trips.sort((a,b) => sort === 'recent' ? String(b.createdAt?.seconds || '').localeCompare(String(a.createdAt?.seconds || '')) : (Number(b.score||0)-Number(a.score||0)));
    if (adminPanel) {
      adminPanel.hidden = !CloudSync.isAdmin?.();
      adminPanel.innerHTML = CloudSync.isAdmin?.() ? '<p class="eyebrow">Admin</p><h2>Gestion communautaire</h2><p>Compte admin : Lucas S. Tu peux retirer les publications si nécessaire.</p>' : '';
    }
    if (!trips.length) {
      grid.innerHTML = '<div class="empty-state">Aucun voyage communautaire pour ces filtres.</div>';
      return;
    }
    grid.innerHTML = trips.map(item => `
      <article class="trip-card">
        <div class="trip-cover" style="${item.coverImage ? `background-image:url('${U.escapeHtml(item.coverImage)}')` : ''}"></div>
        <div class="trip-body">
          <div class="trip-meta"><span class="badge">${U.escapeHtml(item.category || 'voyage')}</span><span class="badge success">▲ ${Number(item.score||0)}</span></div>
          <h3>${U.escapeHtml(item.title || 'Voyage partagé')}</h3>
          <p>${U.escapeHtml(item.description || item.country || 'Itinéraire partagé par la communauté.')}</p>
          <div class="button-row">
            <button class="button" data-vote-community="${item.id}" data-vote="1">+ Tendance</button>
            <button class="button" data-vote-community="${item.id}" data-vote="-1">-</button>
            ${item.allowCopy !== false ? `<button class="button button--primary" data-copy-community="${item.id}">Copier</button>` : ''}
            ${(CloudSync.isAdmin?.() || item.ownerUid === CloudSync.getUser()?.uid) ? `<button class="button button--danger" data-delete-community="${item.id}">Retirer</button>` : ''}
          </div>
        </div>
      </article>`).join('');
    grid.querySelectorAll('[data-vote-community]').forEach(btn => btn.addEventListener('click', async () => {
      try { await CloudSync.voteCommunityTrip(btn.dataset.voteCommunity, Number(btn.dataset.vote)); await renderCommunity(true); } catch (error) { showStatus(error.message || 'Vote impossible.'); }
    }));
    grid.querySelectorAll('[data-copy-community]').forEach(btn => btn.addEventListener('click', () => copyCommunityTrip(btn.dataset.copyCommunity)));
    grid.querySelectorAll('[data-delete-community]').forEach(btn => btn.addEventListener('click', () => deleteCommunityTrip(btn.dataset.deleteCommunity)));
  }

  function openPublishDialog() {
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    if (!trip) { showStatus('Sélectionne un voyage avant de le publier.'); return; }
    const form = document.getElementById('publishForm');
    if (form) {
      form.reset();
      form.elements.title.value = trip.name || '';
      form.elements.country.value = trip.area || '';
      form.elements.coverImage.value = trip.coverImage || '';
      form.elements.description.value = trip.description || '';
    }
    document.getElementById('publishDialog')?.showModal();
  }

  async function publishCommunityTrip(event) {
    event.preventDefault();
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    const form = event.currentTarget;
    if (!trip || !form) return;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      data.hideBudget = Boolean(form.elements.hideBudget?.checked);
      data.allowCopy = Boolean(form.elements.allowCopy?.checked);
      await CloudSync.publishCommunityTrip(trip, data);
      document.getElementById('publishDialog')?.close();
      await renderCommunity(true);
      showStatus('Voyage publié dans la communauté.');
    } catch (error) {
      console.error(error);
      showStatus(error.message || 'Publication impossible.');
    }
  }

  function copyCommunityTrip(id) {
    if (!requireCloudReady()) return;
    const item = communityTripsCache.find(entry => entry.id === id);
    if (!item?.trip) return;
    const copy = Storage.normalizeTrip({ ...U.clone(item.trip), id: U.uid('trip'), name: `${item.trip.name || item.title} — copie`, status: 'brouillon' });
    state = Storage.upsertTrip(state, copy);
    renderAll();
    scheduleCloudAutosave();
    showStatus('Voyage copié dans ton espace.');
  }

  async function deleteCommunityTrip(id) {
    const ok = await confirmAction('Retirer cette publication ?', 'Elle ne sera plus visible dans la communauté.');
    if (!ok) return;
    try {
      await CloudSync.deleteCommunityTrip(id);
      await renderCommunity(true);
      showStatus('Publication retirée.');
    } catch (error) {
      showStatus(error.message || 'Suppression impossible.');
    }
  }

  function renderTripForm() {
    const form = $('#tripForm');
    const trip = activeTrip();
    form.querySelectorAll('input, textarea, select, button').forEach(element => { element.disabled = !trip && element.type !== 'submit'; });
    if (!trip) {
      form.reset();
      return;
    }
    const fields = ['name', 'description', 'area', 'coverImage', 'startDate', 'endDate', 'travellers', 'travellersNames', 'maxBudget', 'currency', 'status', 'style', 'pace', 'interests'];
    fields.forEach(field => { if (form.elements[field]) form.elements[field].value = trip[field] ?? ''; });
  }

  function saveTripForm(event) {
    event.preventDefault();
    if (!requireCloudReady()) return;
    let trip = activeTrip();
    if (!trip) trip = Storage.normalizeTrip({});
    const data = new FormData(event.currentTarget);
    ['name', 'description', 'area', 'coverImage', 'startDate', 'endDate', 'currency', 'status', 'style', 'pace', 'interests'].forEach(key => { trip[key] = String(data.get(key) || ''); });
    trip.travellersNames = U.normalizeNameList(data.get('travellersNames') || '');
    trip.travellers = Math.max(1, Number(data.get('travellers')) || 1);
    trip.maxBudget = Number(data.get('maxBudget')) || 0;
    trip.updatedAt = new Date().toISOString();
    state = Storage.upsertTrip(state, trip);
    renderAll();
    scheduleCloudAutosave();
    showStatus('Voyage enregistré.');
  }

  function createNewTrip() {
    if (!requireCloudReady()) return;
    const trip = Storage.normalizeTrip({
      name: 'Nouveau voyage',
      currency: '€',
      travellers: 1,
      status: 'brouillon',
      steps: [],
      expenses: []
    });
    state = Storage.upsertTrip(state, trip);
    scheduleCloudAutosave();
    switchView('trip');
    showStatus('Nouveau voyage créé.');
  }

  function loadDemoTrip() {
    if (!requireCloudReady()) return;
    const demo = Storage.normalizeTrip({
      name: 'Exemple — Paris à Venise',
      area: 'France · Italie',
      description: 'Démonstration d’un road trip simple avec étapes, carte, budget et suggestions locales.',
      startDate: '2026-07-12',
      endDate: '2026-07-18',
      travellers: 2,
      maxBudget: 1800,
      currency: '€',
      status: 'prévu',
      style: 'équilibré',
      pace: 'normal',
      interests: 'ville, gastronomie, culture, photo',
      steps: [
        { order: 0, name: 'Paris', type: 'ville', lat: 48.8566, lng: 2.3522, arrivalDate: '2026-07-12', departureDate: '2026-07-12', priority: 'indispensable', color: '#2563eb', transportToNext: 'car', notes: 'Départ le matin.' },
        { order: 1, name: 'Lyon', type: 'ville', lat: 45.764, lng: 4.8357, arrivalDate: '2026-07-12', departureDate: '2026-07-14', cost: 240, priority: 'indispensable', color: '#16a34a', transportToNext: 'car', segmentNote: 'Prévoir une pause sur l’autoroute.' },
        { order: 2, name: 'Milan', type: 'ville', lat: 45.4642, lng: 9.19, arrivalDate: '2026-07-14', departureDate: '2026-07-16', cost: 280, priority: 'optionnel', color: '#f59e0b', transportToNext: 'train' },
        { order: 3, name: 'Venise', type: 'ville', lat: 45.4408, lng: 12.3155, arrivalDate: '2026-07-16', departureDate: '2026-07-18', cost: 360, priority: 'indispensable', color: '#dc2626' }
      ],
      expenses: [
        { label: 'Hôtels', category: 'logement', amount: 680, status: 'prévue', date: '2026-07-12' },
        { label: 'Carburant et péages', category: 'transport', amount: 260, status: 'prévue', date: '2026-07-12' },
        { label: 'Repas', category: 'nourriture', amount: 420, status: 'prévue' },
        { label: 'Musées et activités', category: 'activités', amount: 160, status: 'prévue' }
      ]
    });
    state = Storage.upsertTrip(state, demo);
    renderAll();
    scheduleCloudAutosave();
    switchView('dashboard');
    showStatus('Voyage exemple ajouté.');
  }

  async function deleteTrip(id) {
    if (!requireCloudReady()) return;
    const trip = state.trips.find(item => item.id === id);
    const ok = await confirmAction('Supprimer ce voyage ?', `“${trip?.name || 'Voyage'}” sera supprimé de Firebase pour ton compte.`);
    if (!ok) return;
    state = Storage.deleteTrip(state, id);
    renderAll();
    scheduleCloudAutosave();
    showStatus('Voyage supprimé.');
  }

  function renderSteps() {
    const trip = activeTrip();
    const list = $('#stepsList');
    if (!trip) {
      list.innerHTML = '<div class="empty-state">Crée ou sélectionne un voyage pour ajouter des étapes.</div>';
      return;
    }
    const steps = U.sortSteps(trip.steps);
    if (!steps.length) {
      list.innerHTML = '<div class="empty-state">Ajoute un départ, des arrêts et une destination finale.</div>';
      return;
    }
    list.innerHTML = steps.map((step, index) => `
      <article class="step-row">
        <div class="step-marker" style="background:${step.color || '#2563eb'}">${index + 1}</div>
        <div>
          <span class="badge">${U.escapeHtml(step.type)} · ${U.escapeHtml(step.priority)}</span>
          <h3>${U.escapeHtml(step.name)}</h3>
          <p>${U.formatDate(step.arrivalDate)} → ${U.formatDate(step.departureDate)} · ${U.isValidCoord(step) ? `${step.lat}, ${step.lng}` : 'coordonnées manquantes'}${step.cost ? ` · ${U.formatMoney(step.cost, trip.currency)}` : ''}</p>
          ${step.notes ? `<p>${U.escapeHtml(step.notes)}</p>` : ''}
        </div>
        <div class="row-actions">
          <button class="button" data-move-step="up" data-step-id="${step.id}" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="button" data-move-step="down" data-step-id="${step.id}" ${index === steps.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="button" data-edit-step="${step.id}">Modifier</button>
          <button class="button" data-delete-step="${step.id}">Supprimer</button>
        </div>
      </article>
    `).join('');
    list.querySelectorAll('[data-edit-step]').forEach(button => button.addEventListener('click', () => openStepDialog(button.dataset.editStep)));
    list.querySelectorAll('[data-delete-step]').forEach(button => button.addEventListener('click', () => deleteStep(button.dataset.deleteStep)));
    list.querySelectorAll('[data-move-step]').forEach(button => button.addEventListener('click', () => moveStep(button.dataset.stepId, button.dataset.moveStep)));
  }

  function openStepDialog(stepId = null) {
    const trip = activeTrip();
    if (!trip) return showStatus('Crée d’abord un voyage.');
    const form = $('#stepForm');
    form.reset();
    const step = trip.steps.find(item => item.id === stepId);
    $('#stepDialogTitle').textContent = step ? 'Modifier une étape' : 'Ajouter une étape';
    form.elements.id.value = step?.id || '';
    form.elements.name.value = step?.name || '';
    form.elements.type.value = step?.type || 'ville';
    form.elements.address.value = step?.address || '';
    form.elements.lat.value = step?.lat ?? '';
    form.elements.lng.value = step?.lng ?? '';
    form.elements.arrivalDate.value = step?.arrivalDate || '';
    form.elements.arrivalTime.value = step?.arrivalTime || '';
    form.elements.departureDate.value = step?.departureDate || '';
    form.elements.departureTime.value = step?.departureTime || '';
    form.elements.duration.value = step?.duration || '';
    form.elements.cost.value = step?.cost || '';
    form.elements.priority.value = step?.priority || 'optionnel';
    form.elements.color.value = step?.color || '#2563eb';
    form.elements.links.value = (step?.links || []).join(', ');
    form.elements.notes.value = step?.notes || '';
    $('#stepDialog').showModal();
  }

  function saveStepForm(event) {
    event.preventDefault();
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    if (!trip) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const id = data.get('id') || U.uid('step');
    const existing = trip.steps.find(step => step.id === id);
    const step = {
      ...(existing || {}),
      id,
      order: existing?.order ?? trip.steps.length,
      name: String(data.get('name') || 'Étape'),
      type: String(data.get('type') || 'ville'),
      lat: data.get('lat') === '' ? '' : Number(data.get('lat')),
      lng: data.get('lng') === '' ? '' : Number(data.get('lng')),
      address: String(data.get('address') || ''),
      arrivalDate: String(data.get('arrivalDate') || ''),
      arrivalTime: String(data.get('arrivalTime') || ''),
      departureDate: String(data.get('departureDate') || ''),
      departureTime: String(data.get('departureTime') || ''),
      duration: String(data.get('duration') || ''),
      cost: Number(data.get('cost')) || 0,
      priority: String(data.get('priority') || 'optionnel'),
      color: String(data.get('color') || '#2563eb'),
      links: U.normalizeNameList(data.get('links') || ''),
      notes: String(data.get('notes') || ''),
      transportToNext: existing?.transportToNext || 'car',
      segmentCost: existing?.segmentCost || 0,
      segmentNote: existing?.segmentNote || '',
      journal: existing?.journal || { notes: '', photoLinks: '', rating: '', realExpenses: '', weather: '', afterthoughts: '' }
    };
    const index = trip.steps.findIndex(item => item.id === id);
    if (index >= 0) trip.steps[index] = step;
    else trip.steps.push(step);
    normalizeOrders(trip);
    $('#stepDialog').close();
    persist('Étape enregistrée.');
  }

  async function deleteStep(id) {
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    const step = trip?.steps.find(item => item.id === id);
    const ok = await confirmAction('Supprimer cette étape ?', `“${step?.name || 'Étape'}” sera retirée de la carte, de l’itinéraire et du carnet.`);
    if (!ok) return;
    trip.steps = trip.steps.filter(item => item.id !== id);
    trip.expenses = trip.expenses.map(expense => expense.stepId === id ? { ...expense, stepId: '' } : expense);
    normalizeOrders(trip);
    persist('Étape supprimée.');
  }

  function moveStep(id, direction) {
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    const steps = U.sortSteps(trip.steps);
    const index = steps.findIndex(step => step.id === id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
    trip.steps = steps.map((step, order) => ({ ...step, order }));
    persist('Ordre des étapes mis à jour.');
  }

  function normalizeOrders(trip) {
    trip.steps = U.sortSteps(trip.steps).map((step, order) => ({ ...step, order }));
  }

  function renderItinerary() {
    const trip = activeTrip();
    Itinerary.renderDayPlanner(document.getElementById('itineraryTimeline'), trip, state.settings, {
      addStep: date => openStepDialogForDate(date),
      editStep: id => openStepDialog(id),
      moveStep: (id, direction) => moveStep(id, direction)
    });
  }

  function openStepDialogForDate(date) {
    openStepDialog();
    const form = document.getElementById('stepForm');
    if (form && date) {
      form.elements.arrivalDate.value = date;
      form.elements.departureDate.value = date;
    }
  }

  function renderBudget() {
    const trip = activeTrip();
    const summary = document.getElementById('budgetSummary');
    const list = document.getElementById('expensesList');
    const settlements = document.getElementById('settlementsBox');
    if (!trip) {
      if (summary) summary.innerHTML = '<div class="empty-state">Sélectionne un voyage.</div>';
      if (list) list.innerHTML = '';
      if (settlements) settlements.innerHTML = '';
      return;
    }
    Budget.renderStats(summary, trip);
    Budget.renderExpenses(list, trip, { edit: openExpenseDialog, delete: deleteExpense });
    if (settlements && Budget.renderPeople) Budget.renderPeople(settlements, trip);
  }

  function openExpenseDialog(expenseId = null) {
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    if (!trip) return showStatus('Crée d’abord un voyage.');
    const form = $('#expenseForm');
    form.reset();
    form.elements.stepId.innerHTML = '<option value="">Aucune étape</option>' + U.sortSteps(trip.steps).map(step => `<option value="${step.id}">${U.escapeHtml(step.name)}</option>`).join('');
    const expense = trip.expenses.find(item => item.id === expenseId);
    $('#expenseDialogTitle').textContent = expense ? 'Modifier une dépense' : 'Ajouter une dépense';
    form.elements.id.value = expense?.id || '';
    form.elements.label.value = expense?.label || '';
    form.elements.category.value = expense?.category || 'autres';
    form.elements.planned.value = expense?.planned ?? expense?.amount ?? '';
    form.elements.actual.value = expense?.actual ?? '';
    form.elements.status.value = expense?.status || 'prévue';
    form.elements.paidBy.value = expense?.paidBy || '';
    form.elements.sharedWith.value = Array.isArray(expense?.sharedWith) ? expense.sharedWith.join(', ') : (expense?.sharedWith || '');
    form.elements.date.value = expense?.date || '';
    form.elements.stepId.value = expense?.stepId || '';
    form.elements.note.value = expense?.note || '';
    $('#expenseDialog').showModal();
  }

  function saveExpenseForm(event) {
    event.preventDefault();
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    if (!trip) return;
    const data = new FormData(event.currentTarget);
    const id = data.get('id') || U.uid('expense');
    const expense = Storage.normalizeExpense({
      id,
      label: String(data.get('label') || 'Dépense'),
      category: String(data.get('category') || 'autres'),
      planned: Number(data.get('planned')) || 0,
      actual: Number(data.get('actual')) || 0,
      status: String(data.get('status') || 'prévue'),
      paidBy: String(data.get('paidBy') || ''),
      sharedWith: U.normalizeNameList(data.get('sharedWith') || ''),
      date: String(data.get('date') || ''),
      stepId: String(data.get('stepId') || ''),
      note: String(data.get('note') || '')
    });
    const index = trip.expenses.findIndex(item => item.id === id);
    if (index >= 0) trip.expenses[index] = expense;
    else trip.expenses.push(expense);
    $('#expenseDialog').close();
    persist('Dépense enregistrée.');
  }

  async function deleteExpense(id) {
    if (!requireCloudReady()) return;
    const ok = await confirmAction('Supprimer cette dépense ?', 'Elle sera retirée du calcul du budget.');
    if (!ok) return;
    const trip = activeTrip();
    trip.expenses = trip.expenses.filter(item => item.id !== id);
    persist('Dépense supprimée.');
  }

  function renderSuggestions() {
    Suggestions.render($('#suggestionsScore'), $('#suggestionsList'), activeTrip(), state.settings);
  }

  async function optimizeActiveTrip() {
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    if (!trip || trip.steps.length < 3) return showStatus('Il faut au moins trois étapes pour optimiser le parcours.');
    const optimized = Suggestions.optimizeOrder(trip, state.settings);
    const before = Suggestions.compareRouteDistance(trip.steps, state.settings);
    const after = Suggestions.compareRouteDistance(optimized, state.settings);
    const message = after && before
      ? `Distance estimée actuelle : ${U.formatDistance(before)}. Proposition : ${U.formatDistance(after)}. Le premier et le dernier point restent fixes.`
      : 'Une proposition d’ordre plus logique va remplacer l’ordre actuel. Le premier et le dernier point restent fixes.';
    const ok = await confirmAction('Appliquer l’optimisation ?', message);
    if (!ok) return;
    trip.steps = optimized;
    persist('Ordre optimisé appliqué.');
  }

  function renderChecklists() {
    const trip = activeTrip();
    const container = $('#checklists');
    if (!trip) {
      container.innerHTML = '<div class="empty-state">Sélectionne un voyage pour gérer les checklists.</div>';
      return;
    }
    trip.checklists ||= U.createDefaultChecklists();
    if (!Array.isArray(trip.checklists)) {
      trip.checklists = Object.entries(trip.checklists).map(([title, items]) => ({ id: U.uid('list'), title, items: Array.isArray(items) ? items : [] }));
    }
    container.innerHTML = trip.checklists.map(list => `
      <article class="checklist-card">
        <h3><span contenteditable="true" data-list-title="${list.id}">${U.escapeHtml(list.title)}</span><small>${(list.items || []).filter(item => item.done).length}/${(list.items || []).length}</small></h3>
        ${(list.items || []).map(item => `
          <div class="todo-row">
            <input type="checkbox" data-check-list="${list.id}" data-check-id="${item.id}" ${item.done ? 'checked' : ''} />
            <input class="input" type="text" data-check-text="${item.id}" data-check-list="${list.id}" value="${U.escapeHtml(item.text)}" />
            <button class="button" data-delete-todo="${item.id}" data-check-list="${list.id}" type="button">×</button>
          </div>
        `).join('')}
        <button class="button" data-add-todo="${list.id}" type="button">+ Tâche</button>
      </article>
    `).join('') || '<div class="empty-state">Aucune checklist.</div>';
    container.querySelectorAll('[data-list-title]').forEach(el => el.addEventListener('blur', () => {
      const list = trip.checklists.find(item => item.id === el.dataset.listTitle);
      if (list) list.title = el.textContent.trim() || list.title;
      persist('Checklist mise à jour.');
    }));
    container.querySelectorAll('[data-check-id]').forEach(input => input.addEventListener('change', () => {
      const list = trip.checklists.find(item => item.id === input.dataset.checkList);
      const item = list?.items?.find(entry => entry.id === input.dataset.checkId);
      if (item) item.done = input.checked;
      persist('Checklist mise à jour.');
    }));
    container.querySelectorAll('[data-check-text]').forEach(input => input.addEventListener('change', () => {
      const list = trip.checklists.find(item => item.id === input.dataset.checkList);
      const item = list?.items?.find(entry => entry.id === input.dataset.checkText);
      if (item) item.text = input.value.trim() || item.text;
      persist('Checklist mise à jour.');
    }));
    container.querySelectorAll('[data-add-todo]').forEach(button => button.addEventListener('click', () => {
      const list = trip.checklists.find(item => item.id === button.dataset.addTodo);
      if (list) list.items.push({ id: U.uid('todo'), text: 'Nouvelle tâche', done: false });
      persist('Tâche ajoutée.');
    }));
    container.querySelectorAll('[data-delete-todo]').forEach(button => button.addEventListener('click', () => {
      const list = trip.checklists.find(item => item.id === button.dataset.checkList);
      if (list) list.items = list.items.filter(item => item.id !== button.dataset.deleteTodo);
      persist('Tâche supprimée.');
    }));
  }

  function addChecklistItem() {
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    if (!trip) return showStatus('Sélectionne un voyage.');
    trip.checklists ||= U.createDefaultChecklists();
    trip.checklists.push({ id: U.uid('list'), title: 'Nouvelle liste', items: [{ id: U.uid('todo'), text: 'Nouvelle tâche', done: false }] });
    persist('Bloc ajouté.');
  }

  function renderJournal() {
    const trip = activeTrip();
    const container = $('#journalList');
    if (!trip || !trip.steps.length) {
      container.innerHTML = '<div class="empty-state">Ajoute des étapes pour créer un carnet de voyage.</div>';
      return;
    }
    container.innerHTML = U.sortSteps(trip.steps).map(step => {
      step.journal ||= { notes: '', photoLinks: '', rating: '', realExpenses: '', weather: '', afterthoughts: '' };
      return `
        <article class="journal-row">
          <span class="badge">${U.escapeHtml(step.type)}</span>
          <h3>${U.escapeHtml(step.name)}</h3>
          <div class="form-grid mt">
            <label>Notes personnelles<textarea class="input" rows="3" data-journal-field="notes" data-step-id="${step.id}">${U.escapeHtml(step.journal.notes || '')}</textarea></label>
            <label>Photos / liens<textarea class="input" rows="3" data-journal-field="photoLinks" data-step-id="${step.id}" placeholder="https://...">${U.escapeHtml(step.journal.photoLinks || '')}</textarea></label>
            <label>Avis / ressenti<input class="input" data-journal-field="rating" data-step-id="${step.id}" value="${U.escapeHtml(step.journal.rating || '')}" placeholder="Super, moyen, à refaire..." /></label>
            <label>Dépenses réelles<input class="input" type="number" min="0" step="0.01" data-journal-field="realExpenses" data-step-id="${step.id}" value="${U.escapeHtml(step.journal.realExpenses || '')}" /></label>
            <label>Météo ressentie<input class="input" data-journal-field="weather" data-step-id="${step.id}" value="${U.escapeHtml(step.journal.weather || '')}" placeholder="chaud, pluie, vent..." /></label>
            <label class="wide">Commentaire après visite<textarea class="input" rows="3" data-journal-field="afterthoughts" data-step-id="${step.id}">${U.escapeHtml(step.journal.afterthoughts || '')}</textarea></label>
          </div>
        </article>
      `;
    }).join('');
    container.querySelectorAll('[data-journal-field]').forEach(field => field.addEventListener('change', () => {
      const step = trip.steps.find(item => item.id === field.dataset.stepId);
      if (!step) return;
      step.journal ||= {};
      step.journal[field.dataset.journalField] = field.value;
      state = Storage.save(state);
      scheduleCloudAutosave();
      showStatus('Carnet mis à jour.');
    }));
  }

  function renderSettings() {
    const form = document.getElementById('settingsForm');
    if (!form) return;
    form.elements.autosaveMinutes.value = state.settings?.autosaveMinutes ?? 3;
    form.elements.carSpeed.value = state.settings?.speeds?.car ?? 90;
    form.elements.trainSpeed.value = state.settings?.speeds?.train ?? 120;
    form.elements.walkSpeed.value = state.settings?.speeds?.walk ?? 4.5;
  }

  function saveSettings() {
    if (!requireCloudReady()) return;
    const form = document.getElementById('settingsForm');
    if (!form) return;
    state.settings ||= U.clone(U.defaultSettings);
    state.settings.speeds ||= {};
    state.settings.autosaveMinutes = U.toNumber(form.elements.autosaveMinutes.value, 3);
    state.settings.speeds.car = U.toNumber(form.elements.carSpeed.value, 90);
    state.settings.speeds.train = U.toNumber(form.elements.trainSpeed.value, 120);
    state.settings.speeds.walk = U.toNumber(form.elements.walkSpeed.value, 4.5);
    state = Storage.save(state);
    renderAll();
    scheduleCloudAutosave();
    showStatus('Paramètres enregistrés.');
  }

  function renderMap() {
    const trip = activeTrip();
    MapView.updateMap(trip, state.settings);
    MapView.renderSegments(document.getElementById('mapSegments'), trip, state.settings, (stepId, field, value) => {
      if (!trip) return;
      const step = trip.steps.find(item => item.id === stepId);
      if (!step) return;
      step[field] = field === 'segmentCost' ? U.toNumber(value, 0) : value;
      state = Storage.save(state);
      renderMap();
      scheduleCloudAutosave();
    });
  }

  function bindCloudActions() {
    if (!CloudSync) return;
    const bind = (id, handler) => {
      const element = document.getElementById(id);
      if (element) element.addEventListener('click', handler);
    };
    bind('cloudAuthBtn', handleCloudAuth);
    bind('cloudSignInBtn', handleCloudSignIn);
    bind('cloudEmailRegisterBtn', handleEmailRegister);
    bind('cloudEmailResetBtn', handlePasswordReset);
    bind('cloudSignOutBtn', handleCloudSignOut);
    const emailForm = document.getElementById('emailLoginForm');
    if (emailForm) emailForm.addEventListener('submit', handleEmailSignIn);
  }

  async function initCloudSync() {
    if (!CloudSync) {
      cloudLoading = false;
      showStatus('Module Firebase introuvable.');
      renderAll();
      return;
    }

    CloudSync.onAuthChange(payload => {
      updateCloudUi(payload);
      handleCloudUserChange(payload.user).catch(error => {
        console.error(error);
        cloudLoading = false;
        appReady = false;
        updateCloudUi({ status: error.message });
        renderAll();
        showStatus(error.message || 'Chargement Firebase impossible.');
      });
    });

    try {
      if (!CloudSync.isConfigured()) {
        cloudLoading = false;
        appReady = false;
        updateCloudUi({ configured: false, status: 'Firebase n’est pas configuré dans js/firebase-config.js.' });
        renderAll();
        return;
      }
      await CloudSync.init();
      await CloudSync.waitForAuthState();
    } catch (error) {
      console.error(error);
      cloudLoading = false;
      appReady = false;
      updateCloudUi({ status: error.message, configured: false });
      renderAll();
      showStatus(error.message || 'Initialisation Firebase impossible.');
    }
  }

  async function handleCloudUserChange(user) {
    if (!user) {
      loadedCloudUid = null;
      appReady = false;
      cloudLoading = false;
      state = Storage.createEmptyState();
      renderAll();
      return;
    }

    if (loadedCloudUid === user.uid && appReady) return;

    loadedCloudUid = user.uid;
    appReady = false;
    cloudLoading = true;
    renderAll();

    const backup = await CloudSync.loadState();
    if (backup?.state) {
      state = Storage.save(backup.state);
      cloudLastSavedAt = backup.clientUpdatedAt || '';
    } else {
      state = Storage.createEmptyState();
      await CloudSync.saveState(state);
      cloudLastSavedAt = new Date().toISOString();
    }

    appReady = true;
    cloudLoading = false;
    applyTheme(state.settings.theme || 'light');
    renderAll();
    updateCloudUi({ user, status: CloudSync.getStatus(), configured: true });
    showStatus('Voyages chargés depuis Firebase. Sauvegarde automatique active.');
  }

  function updateCloudUi(payload = {}) {
    if (!CloudSync) return;
    const user = payload.user ?? CloudSync.getUser();
    const configured = payload.configured ?? CloudSync.isConfigured();
    const status = payload.status || CloudSync.getStatus();
    const provider = payload.provider || CloudSync.getProviderLabel?.() || '';
    const statusEl = document.getElementById('cloudStatus');
    const profile = document.getElementById('cloudProfile');
    const avatar = document.getElementById('cloudAvatar');
    const name = document.getElementById('cloudUserName');
    const email = document.getElementById('cloudUserEmail');
    const providerEl = document.getElementById('cloudProvider');
    const topButton = document.getElementById('cloudAuthBtn');
    const signInBtn = document.getElementById('cloudSignInBtn');
    const signOutBtn = document.getElementById('cloudSignOutBtn');
    const emailForm = document.getElementById('emailLoginForm');
    const emailInputs = ['emailAuthEmail', 'emailAuthPassword', 'cloudEmailRegisterBtn', 'cloudEmailResetBtn'];
    const deleteCloudBtn = document.getElementById('deleteCloudDataBtn');
    const syncMeta = document.getElementById('cloudSyncMeta');
    const protectedControls = ['newTripBtn', 'createFirstTripBtn', 'loadDemoBtn', 'tripSelector', 'saveSettingsBtn'];

    document.body.classList.toggle('is-cloud-locked', !appReady || !user);

    if (statusEl) statusEl.textContent = status || (configured ? 'Connexion requise.' : 'Firebase non configuré.');
    if (profile) profile.hidden = !user;
    if (avatar) {
      if (user?.photoURL) {
        avatar.innerHTML = `<img src="${U.escapeHtml(user.photoURL)}" alt="" />`;
      } else {
        avatar.textContent = (user?.email || user?.displayName || 'U').slice(0, 1).toUpperCase();
      }
    }
    if (name && user) name.textContent = user.displayName || user.email?.split('@')[0] || 'Compte utilisateur';
    if (email && user) email.textContent = user.email || '';
    if (providerEl) providerEl.textContent = user ? `Connexion : ${provider || 'Firebase'}` : 'Google ou e-mail';

    if (topButton) {
      topButton.classList.toggle('is-connected', Boolean(user));
      if (user) {
        const label = user.displayName || user.email?.split('@')[0] || 'Connecté';
        const picture = user.photoURL ? `<img src="${U.escapeHtml(user.photoURL)}" alt="" />` : U.escapeHtml(label.slice(0, 1).toUpperCase());
        topButton.innerHTML = `<span class="auth-avatar">${picture}</span><span class="auth-copy"><strong>Connecté</strong><small>${U.escapeHtml(label)}</small></span>`;
      } else {
        topButton.innerHTML = '<span class="auth-avatar">↗</span><span class="auth-copy"><strong>Connexion</strong><small>Google ou e-mail</small></span>';
      }
    }

    if (signInBtn) {
      signInBtn.disabled = !configured || Boolean(user);
      signInBtn.innerHTML = user ? 'Connecté' : '<span class="google-dot">G</span> Continuer avec Google';
    }
    if (emailForm) emailForm.classList.toggle('is-disabled', Boolean(user));
    emailInputs.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.disabled = !configured || Boolean(user);
    });
    if (signOutBtn) signOutBtn.disabled = !user;
    if (deleteCloudBtn) deleteCloudBtn.disabled = !user || !appReady;
    if (syncMeta) syncMeta.textContent = cloudLastSavedAt ? `Dernière sauvegarde : ${U.formatDate(cloudLastSavedAt)} ${new Date(cloudLastSavedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Sauvegarde Firebase automatique active après connexion.';

    protectedControls.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.disabled = !appReady || !user;
    });
  }

  async function handleCloudAuth() {
    if (!CloudSync?.isConfigured()) {
      switchView('settings');
      showStatus('Firebase doit être renseigné dans js/firebase-config.js.');
      return;
    }
    switchView('settings');
    showStatus(CloudSync.getUser() ? 'Compte connecté.' : 'Choisis Google ou e-mail pour te connecter.');
  }

  async function handleCloudSignIn() {
    try {
      cloudLoading = true;
      renderAll();
      await CloudSync.signIn();
      updateCloudUi();
    } catch (error) {
      console.error(error);
      cloudLoading = false;
      showStatus(error.message || 'Connexion Google impossible.');
      updateCloudUi({ status: error.message });
      renderAll();
    }
  }

  async function handleEmailSignIn(event) {
    event?.preventDefault?.();
    try {
      const email = document.getElementById('emailAuthEmail')?.value || '';
      const password = document.getElementById('emailAuthPassword')?.value || '';
      if (!email || !password) {
        showStatus('Indique ton e-mail et ton mot de passe.');
        return;
      }
      cloudLoading = true;
      renderAll();
      await CloudSync.signInWithEmail(email, password);
      updateCloudUi();
    } catch (error) {
      console.error(error);
      cloudLoading = false;
      showStatus(error.message || 'Connexion e-mail impossible.');
      updateCloudUi({ status: error.message });
      renderAll();
    }
  }

  async function handleEmailRegister() {
    try {
      const email = document.getElementById('emailAuthEmail')?.value || '';
      const password = document.getElementById('emailAuthPassword')?.value || '';
      if (!email || !password) {
        showStatus('Indique un e-mail et un mot de passe pour créer le compte.');
        return;
      }
      cloudLoading = true;
      renderAll();
      await CloudSync.registerWithEmail(email, password);
      updateCloudUi();
    } catch (error) {
      console.error(error);
      cloudLoading = false;
      showStatus(error.message || 'Création du compte impossible.');
      updateCloudUi({ status: error.message });
      renderAll();
    }
  }

  async function handlePasswordReset() {
    try {
      const email = document.getElementById('emailAuthEmail')?.value || '';
      if (!email) {
        showStatus('Indique ton adresse e-mail avant de demander la réinitialisation.');
        return;
      }
      await CloudSync.resetPassword(email);
      updateCloudUi({ status: 'E-mail de réinitialisation envoyé.' });
      showStatus('E-mail de réinitialisation envoyé.');
    } catch (error) {
      console.error(error);
      showStatus(error.message || 'Réinitialisation impossible.');
      updateCloudUi({ status: error.message });
    }
  }


  async function handleCloudSignOut() {
    const ok = await confirmAction('Se déconnecter ?', 'Les voyages seront retirés de cette session. Ils resteront dans Firebase pour ce compte.');
    if (!ok) return;
    try {
      await flushCloudAutosave();
      await CloudSync.signOut();
      state = Storage.createEmptyState();
      appReady = false;
      loadedCloudUid = null;
      renderAll();
      showStatus('Déconnexion effectuée.');
    } catch (error) {
      showStatus(error.message || 'Déconnexion impossible.');
    }
  }

  async function saveCloudStateNow(silent = true) {
    if (!appReady || !CloudSync?.getUser()) return;
    try {
      const savedState = Storage.save(state);
      state = savedState;
      await CloudSync.saveState(savedState);
      cloudLastSavedAt = new Date().toISOString();
      updateCloudUi({ status: CloudSync.getStatus() });
      if (!silent) showStatus('Sauvegardé dans Firebase.');
    } catch (error) {
      console.error(error);
      updateCloudUi({ status: error.message });
      if (!silent) showStatus(error.message || 'Sauvegarde Firebase impossible.');
    }
  }

  function scheduleCloudAutosave(delay = 650) {
    if (!appReady || !CloudSync?.getUser()) return;
    clearTimeout(cloudAutosaveTimer);
    updateCloudUi({ status: 'Sauvegarde Firebase en attente…' });
    cloudAutosaveTimer = setTimeout(() => saveCloudStateNow(true), delay);
  }

  async function flushCloudAutosave() {
    clearTimeout(cloudAutosaveTimer);
    await saveCloudStateNow(true);
  }

  async function deleteCloudData() {
    if (!requireCloudReady()) return;
    const ok = await confirmAction('Supprimer toutes les données Firebase ?', 'Tous les voyages de ce compte seront supprimés de Firestore. Cette action est définitive.');
    if (!ok) return;
    try {
      await CloudSync.deleteState();
      state = Storage.createEmptyState();
      appReady = true;
      renderAll();
      updateCloudUi({ status: 'Données Firebase supprimées. Tu peux créer un nouveau voyage.' });
      showStatus('Données Firebase supprimées.');
    } catch (error) {
      console.error(error);
      showStatus(error.message || 'Suppression Firebase impossible.');
    }
  }

  function confirmAction(title, message) {
    const dialog = $('#confirmDialog');
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    return new Promise(resolve => {
      const onClose = () => {
        dialog.removeEventListener('close', onClose);
        resolve(dialog.returnValue === 'default');
      };
      dialog.addEventListener('close', onClose);
      dialog.showModal();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
