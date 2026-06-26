(function () {
  'use strict';

  const U = window.TravelUtils;
  const Storage = window.TravelStorage;
  const Budget = window.TravelBudget;
  const Itinerary = window.TravelItinerary;
  const Suggestions = window.TravelSuggestions;
  const MapView = window.TravelMap;
  const CloudSync = window.TravelCloudSync;
  const Geocoder = window.TravelGeocoder;

  let state = Storage.load();
  let appReady = false;
  let cloudLoading = true;
  let cloudLastSavedAt = '';
  let loadedCloudUid = null;
  let currentView = 'dashboard';
  let autosaveTimer = null;
  let communityTrips = [];

  const titles = {
    dashboard: 'Tableau de bord',
    today: 'Aujourd’hui',
    community: 'Communauté',
    trip: 'Voyage',
    map: 'Carte du voyage',
    itinerary: 'Planning',
    budget: 'Budget',
    suggestions: 'Suggestions',
    preparation: 'Préparation',
    journal: 'Carnet de voyage',
    settings: 'Paramètres'
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    state = Storage.save(state || {});
    document.getElementById('legalYear')?.append(new Date().getFullYear());
    populateStaticSelects();
    bindNavigation();
    bindActions();
    applyTheme(state.settings?.theme || 'light');
    renderAllSafe();
    switchView(location.hash.replace('#', '') || 'dashboard', { silent: true });
    initCloudSync();
  }

  function populateStaticSelects() {
    const typeSelect = $('#stepForm select[name="type"]');
    if (typeSelect) typeSelect.innerHTML = U.placeTypes.map(type => `<option value="${type}">${type}</option>`).join('');
    const categorySelect = $('#expenseForm select[name="category"]');
    if (categorySelect) categorySelect.innerHTML = U.expenseCategories.map(category => `<option value="${category}">${category}</option>`).join('');
  }

  function bindNavigation() {
    $$('[data-view-link]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.viewLink)));
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-view-link]');
      if (!button || button.classList.contains('nav-item')) return;
      event.preventDefault();
      switchView(button.dataset.viewLink);
    });
    window.addEventListener('hashchange', () => switchView(location.hash.replace('#', '') || 'dashboard', { silent: true }));
  }

  function bindActions() {
    const on = (id, event, handler) => { const el = document.getElementById(id); if (el) el.addEventListener(event, handler); };
    on('newTripBtn', 'click', () => createNewTrip());
    on('createFirstTripBtn', 'click', () => createNewTrip());
    on('loadDemoBtn', 'click', () => loadDemoTrip());
    on('tripSelector', 'change', event => { state.activeTripId = event.target.value || null; persist('Voyage actif sélectionné.'); });
    on('themeToggle', 'click', toggleTheme);
    on('tripForm', 'submit', saveTripForm);
    on('openWizardBtn', 'click', openTripWizard);
    on('tripWizardForm', 'submit', saveTripWizard);
    on('addStepBtn', 'click', () => openStepDialog());
    on('stepForm', 'submit', saveStepForm);
    on('addExpenseBtn', 'click', () => openExpenseDialog());
    on('expenseForm', 'submit', saveExpenseForm);
    on('fitMapBtn', 'click', MapView.fitBounds);
    on('refreshItineraryBtn', 'click', renderItinerary);
    on('optimizeBtn', 'click', optimizeActiveTrip);
    on('addChecklistBlockBtn', 'click', addChecklistBlock);
    on('addChecklistItemBtn', 'click', addChecklistItem);
    on('saveSettingsBtn', 'click', saveSettings);
    on('deleteCloudDataBtn', 'click', deleteCloudData);
    on('cloudAuthBtn', 'click', handleCloudAuth);
    on('cloudSignInBtn', 'click', handleCloudSignIn);
    on('cloudSignOutBtn', 'click', handleCloudSignOut);
    on('communityPublishBtn', 'click', openCommunityPublish);
    on('communityRefreshBtn', 'click', refreshCommunity);
    on('communityPublishForm', 'submit', publishCommunity);
    on('communitySearchInput', 'input', renderCommunity);
    on('communityCountryFilter', 'change', renderCommunity);
    on('communityCategoryFilter', 'change', renderCommunity);
    on('communitySortFilter', 'change', renderCommunity);
    on('fabMainBtn', 'click', toggleFabMenu);
    on('fabAddTrip', 'click', () => { closeFabMenu(); createNewTrip(); });
    on('fabAddStep', 'click', () => { closeFabMenu(); openStepDialog(); });
    on('fabAddExpense', 'click', () => { closeFabMenu(); openExpenseDialog(); });
    on('fabOpenToday', 'click', () => { closeFabMenu(); switchView('today'); });
    on('fabOpenChecklist', 'click', () => { closeFabMenu(); switchView('preparation'); });
    on('globalSearchInput', 'input', renderGlobalSearch);

    $$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => {
      const dialog = document.getElementById(button.dataset.closeDialog);
      if (dialog?.open) dialog.close('cancel');
    }));

    window.addEventListener('resize', () => MapView.invalidate());
    attachPlaceSearch();
  }

  function renderAllSafe() {
    try { renderAll(); }
    catch (error) {
      console.error(error);
      showStatus(`Erreur corrigible : ${error.message || error}`);
    }
  }

  function renderAll() {
    state = Storage.save(state || {});
    renderTripSelector();
    renderDashboard();
    renderToday();
    renderCommunity();
    renderTripForm();
    renderSteps();
    renderItinerary();
    renderBudget();
    renderSuggestions();
    renderChecklists();
    renderJournal();
    renderSettings();
    renderMap();
    updateCloudUi();
  }

  function switchView(view, options = {}) {
    if (!titles[view]) view = 'dashboard';
    if (!appReady && !['dashboard', 'settings'].includes(view)) view = 'dashboard';
    currentView = view;
    if (!options.silent && location.hash.replace('#', '') !== view) location.hash = view;
    $$('.view').forEach(section => section.classList.toggle('is-visible', section.id === `view-${view}`));
    $$('.nav-item').forEach(item => item.classList.toggle('is-active', item.dataset.viewLink === view));
    const title = $('#pageTitle'); if (title) title.textContent = titles[view];
    if (view === 'map') { MapView.initMap(); renderMap(); MapView.invalidate(); }
    if (view === 'community') refreshCommunity(false);
  }

  function activeTrip() { return appReady ? Storage.getTrip(state) : null; }
  function requireCloudReady() {
    if (appReady && CloudSync?.getUser()) return true;
    switchView('dashboard');
    showStatus('Connecte-toi avec Google pour utiliser le planificateur.');
    return false;
  }

  function persist(message) {
    if (!appReady || !CloudSync?.getUser()) { showStatus('Connexion Google requise.'); return; }
    state = Storage.save(state);
    renderAllSafe();
    scheduleCloudAutosave();
    if (message) showStatus(message);
  }

  function showStatus(message, timeout = 3200) {
    const banner = $('#statusBanner');
    if (!banner || !message) return;
    banner.textContent = message;
    banner.hidden = false;
    clearTimeout(showStatus.timer);
    showStatus.timer = setTimeout(() => { banner.hidden = true; }, timeout);
  }

  function applyTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
    const btn = $('#themeToggle'); if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  function toggleTheme() { state.settings.theme = document.body.classList.contains('dark') ? 'light' : 'dark'; applyTheme(state.settings.theme); persist('Thème mis à jour.'); }

  function renderTripSelector() {
    const selector = $('#tripSelector');
    if (!selector) return;
    const trips = Array.isArray(state.trips) ? state.trips : [];
    selector.innerHTML = trips.length ? trips.map(trip => `<option value="${trip.id}">${U.escapeHtml(trip.name)}</option>`).join('') : '<option value="">Aucun voyage</option>';
    selector.value = state.activeTripId || '';
  }

  function renderDashboard() {
    const focus = $('#dashboardFocus');
    const templates = $('#tripTemplates');
    const grid = $('#tripsGrid');
    const trips = Array.isArray(state.trips) ? state.trips : [];
    if (!grid) return;

    if (cloudLoading) {
      if (focus) focus.innerHTML = '';
      if (templates) templates.innerHTML = '';
      grid.innerHTML = '<div class="empty-state">Chargement de tes voyages…</div>';
      return;
    }

    if (!CloudSync?.getUser() || !appReady) {
      if (focus) focus.innerHTML = '';
      if (templates) templates.innerHTML = '';
      grid.innerHTML = `<div class="login-gate"><div class="login-gate__icon">☁️</div><h2>Connexion Google</h2><p>Connecte-toi pour retrouver tes voyages, ton budget, tes checklists et ton carnet.</p><button class="button button--primary" id="dashboardSignInBtn">Se connecter avec Google</button></div>`;
      $('#dashboardSignInBtn')?.addEventListener('click', handleCloudSignIn);
      return;
    }

    const trip = activeTrip();
    if (focus) focus.innerHTML = trip ? renderFocusCard(trip) : '<div class="panel empty-state">Aucun voyage actif. Crée ton premier voyage pour démarrer.</div>';
    if (templates) renderTemplates(templates);
    if (!trips.length) {
      grid.innerHTML = '<div class="empty-state">Aucun voyage pour ce compte. Crée ton premier itinéraire.</div>';
      return;
    }
    grid.innerHTML = trips.map(renderTripCard).join('');
    bindTripCardActions(grid);
  }

  function renderFocusCard(trip) {
    const budget = Budget.computeBudget(trip);
    const score = Suggestions.analyzeTrip?.(trip, state.settings)?.globalScore || 0;
    const next = nextStep(trip);
    return `<section class="control-center panel"><div class="control-center__cover" style="background-image:${trip.coverImage ? `url('${U.escapeHtml(trip.coverImage)}')` : 'linear-gradient(135deg, rgba(37,99,235,.92), rgba(20,184,166,.75))'}"></div><div class="control-center__body"><p class="eyebrow">Voyage actif</p><h2>${U.escapeHtml(trip.name)}</h2><p>${U.escapeHtml(trip.description || trip.area || 'Préparation en cours.')}</p><div class="stats-grid"><div class="stat-card"><strong>${score}%</strong><span>préparation</span></div><div class="stat-card"><strong>${trip.steps.length}</strong><span>étape(s)</span></div><div class="stat-card"><strong>${U.formatMoney(budget.actualTotal || budget.plannedTotal, trip.currency)}</strong><span>budget</span></div><div class="stat-card"><strong>${next ? U.formatDate(next.arrivalDate) : '—'}</strong><span>prochaine étape</span></div></div><div class="button-row"><button class="button button--primary" data-view-link="itinerary">Planning</button><button class="button" data-view-link="today">Aujourd’hui</button><button class="button" data-view-link="suggestions">Alertes</button></div></div></section>`;
  }

  function renderTripCard(trip) {
    const budget = Budget.computeBudget(trip);
    const score = Suggestions.analyzeTrip?.(trip, state.settings)?.globalScore || 0;
    const cover = trip.coverImage ? `background-image:url('${U.escapeHtml(trip.coverImage)}')` : 'background:linear-gradient(135deg, rgba(37,99,235,.95), rgba(20,184,166,.78))';
    return `<article class="trip-card trip-card--premium"><div class="trip-card__cover" style="${cover}"><span class="badge">${U.escapeHtml(trip.status)}</span></div><div class="trip-card__top"><div><h3>${U.escapeHtml(trip.name)}</h3><p>${U.escapeHtml(trip.area || 'Zone non renseignée')}</p></div><strong>${score}%</strong></div><div class="trip-card__meta"><span>📅 ${U.formatDate(trip.startDate)} → ${U.formatDate(trip.endDate)}</span><span>📍 ${trip.steps.length} étape(s)</span><span>💶 ${U.formatMoney(budget.plannedTotal, trip.currency)}${trip.maxBudget ? ` / ${U.formatMoney(trip.maxBudget, trip.currency)}` : ''}</span></div><div class="trip-card__actions"><button class="button button--primary" data-open-trip="${trip.id}">Ouvrir</button><button class="button" data-duplicate-trip="${trip.id}">Dupliquer</button><button class="button" data-delete-trip="${trip.id}">Supprimer</button></div></article>`;
  }

  function bindTripCardActions(root) {
    root.querySelectorAll('[data-open-trip]').forEach(button => button.addEventListener('click', () => { state.activeTripId = button.dataset.openTrip; persist('Voyage ouvert.'); switchView('trip'); }));
    root.querySelectorAll('[data-duplicate-trip]').forEach(button => button.addEventListener('click', () => { state = Storage.duplicateTrip(state, button.dataset.duplicateTrip); persist('Voyage dupliqué.'); }));
    root.querySelectorAll('[data-delete-trip]').forEach(button => button.addEventListener('click', () => deleteTrip(button.dataset.deleteTrip)));
  }

  function renderTemplates(container) {
    const items = [
      ['citybreak', 'City break', '🏙️', '2-4 jours'], ['roadtrip', 'Roadtrip', '🚗', 'route + étapes'], ['avion', 'Voyage en avion', '✈️', 'aéroport + transfert'], ['nature', 'Aventure nature', '🥾', 'checklist outdoor']
    ];
    container.innerHTML = items.map(([key, label, icon, desc]) => `<button class="template-card" data-template="${key}"><span>${icon}</span><strong>${label}</strong><small>${desc}</small></button>`).join('');
    container.querySelectorAll('[data-template]').forEach(btn => btn.addEventListener('click', () => createTripFromTemplate(btn.dataset.template)));
  }

  function renderToday() {
    const hero = $('#todayHero'); const side = $('#todayQuickActions'); const timeline = $('#todayTimeline');
    if (!hero || !side || !timeline) return;
    const trip = activeTrip();
    if (!trip) { hero.innerHTML = '<div class="empty-state">Connecte-toi et sélectionne un voyage.</div>'; side.innerHTML = ''; timeline.innerHTML = ''; return; }
    const steps = U.sortSteps(trip.steps || []);
    const next = nextStep(trip) || steps[0];
    hero.innerHTML = `<p class="eyebrow">Mode voyage</p><h2>${next ? U.escapeHtml(next.name) : 'Aucune étape'}</h2><p>${next ? `${U.formatDate(next.arrivalDate)}${next.arrivalTime ? ` · ${next.arrivalTime}` : ''} · ${U.escapeHtml(next.address || next.type || '')}` : 'Ajoute des étapes pour utiliser le mode voyage.'}</p><div class="button-row"><button class="button button--primary" id="todayAddExpense">+ Dépense rapide</button><button class="button" id="todayAddNote">+ Note</button><button class="button" data-view-link="map">Carte</button></div>`;
    $('#todayAddExpense')?.addEventListener('click', () => openExpenseDialog());
    $('#todayAddNote')?.addEventListener('click', () => switchView('journal'));
    side.innerHTML = `<p class="eyebrow">Résumé rapide</p><h3>${U.escapeHtml(trip.name)}</h3><p>${trip.steps.length} étape(s) · ${Budget.computeBudget(trip).days} jour(s)</p><p>${Suggestions.analyzeTrip?.(trip, state.settings)?.suggestions?.filter(s => s.level !== 'success').length || 0} point(s) à vérifier</p>`;
    timeline.innerHTML = steps.length ? steps.slice(0, 8).map((step, i) => `<article class="timeline-row"><span class="step-marker" style="background:${step.color || '#2563eb'}">${i + 1}</span><div><h3>${U.escapeHtml(step.name)}</h3><p>${U.formatDate(step.arrivalDate)}${step.arrivalTime ? ` · arrivée ${step.arrivalTime}` : ''}${step.departureTime ? ` · départ ${step.departureTime}` : ''}</p></div></article>`).join('') : '<div class="empty-state">Aucune étape à afficher.</div>';
  }

  function nextStep(trip) {
    const today = new Date().toISOString().slice(0, 10);
    return U.sortSteps(trip?.steps || []).find(step => !step.arrivalDate || step.arrivalDate >= today) || U.sortSteps(trip?.steps || []).at(-1) || null;
  }

  function renderTripForm() {
    const form = $('#tripForm'); if (!form) return;
    const trip = activeTrip();
    form.querySelectorAll('input, textarea, select, button').forEach(el => { if (el.type !== 'submit' && el.id !== 'openWizardBtn') el.disabled = !trip; });
    if (!trip) { form.reset(); return; }
    ['name','description','area','coverImage','startDate','endDate','maxBudget','currency','status','style','pace','interests'].forEach(key => { if (form.elements[key]) form.elements[key].value = trip[key] ?? ''; });
    if (form.elements.travellers) form.elements.travellers.value = trip.travellers || 1;
    if (form.elements.travellersNames) form.elements.travellersNames.value = (trip.travellersNames || []).join(', ');
  }

  function saveTripForm(event) {
    event.preventDefault(); if (!requireCloudReady()) return;
    const data = new FormData(event.currentTarget);
    const trip = activeTrip() || Storage.normalizeTrip({});
    ['name','description','area','coverImage','startDate','endDate','currency','status','style','pace','interests'].forEach(key => trip[key] = String(data.get(key) || ''));
    trip.travellers = Math.max(1, Number(data.get('travellers')) || 1);
    trip.travellersNames = String(data.get('travellersNames') || '').split(',').map(v => v.trim()).filter(Boolean);
    trip.maxBudget = Number(data.get('maxBudget')) || 0;
    state = Storage.upsertTrip(state, trip);
    persist('Voyage enregistré.');
  }

  function createNewTrip() {
    if (!CloudSync?.getUser()) return handleCloudSignIn();
    const trip = Storage.normalizeTrip({ name: 'Nouveau voyage', status: 'brouillon' });
    state = Storage.upsertTrip(state, trip);
    persist('Nouveau voyage créé.');
    switchView('trip');
  }

  function createTripFromTemplate(template) {
    if (!CloudSync?.getUser()) return handleCloudSignIn();
    const presets = { citybreak: 'City break', roadtrip: 'Roadtrip', avion: 'Voyage en avion', nature: 'Aventure nature' };
    const trip = Storage.normalizeTrip({ name: presets[template] || 'Nouveau voyage', style: template === 'nature' ? 'aventure' : 'équilibré', status: 'brouillon' });
    state = Storage.upsertTrip(state, trip);
    persist('Modèle ajouté.');
    switchView('trip');
  }

  function openTripWizard() { if (!requireCloudReady()) return; $('#tripWizardDialog')?.showModal(); }
  function saveTripWizard(event) {
    event.preventDefault(); if (!requireCloudReady()) return;
    const data = new FormData(event.currentTarget);
    const trip = Storage.normalizeTrip({
      name: data.get('name') || 'Nouveau voyage', area: data.get('area') || '', coverImage: data.get('coverImage') || '', startDate: data.get('startDate') || '', endDate: data.get('endDate') || '', travellersNames: data.get('travellersNames') || '', maxBudget: Number(data.get('maxBudget')) || 0, currency: data.get('currency') || '€', style: data.get('style') || 'équilibré', pace: data.get('pace') || 'normal', interests: data.get('interests') || '', description: data.get('description') || ''
    });
    const start = String(data.get('startPlace') || '').trim(); const end = String(data.get('endPlace') || '').trim();
    if (start) trip.steps.push(Storage.normalizeTrip({ steps: [{ name: start, type: 'ville', arrivalDate: trip.startDate, departureDate: trip.startDate, priority: 'indispensable', color: '#2563eb' }] }).steps[0]);
    if (end) trip.steps.push(Storage.normalizeTrip({ steps: [{ name: end, type: 'ville', arrivalDate: trip.endDate, departureDate: trip.endDate, priority: 'indispensable', color: '#14b8a6', order: 1 }] }).steps[0]);
    state = Storage.upsertTrip(state, trip);
    $('#tripWizardDialog')?.close();
    persist('Voyage guidé créé.');
    switchView('trip');
  }

  function loadDemoTrip() {
    if (!requireCloudReady()) return;
    const trip = Storage.normalizeTrip({ name: 'Roadtrip exemple', area: 'France · Italie', status: 'prévu', startDate: '2026-07-12', endDate: '2026-07-18', maxBudget: 1800, travellers: 2, travellersNames: ['Lucas', 'Marie'], steps: [
      { name: 'Paris', type: 'ville', lat: 48.8566, lng: 2.3522, arrivalDate: '2026-07-12', arrivalTime: '08:00', departureDate: '2026-07-12', departureTime: '09:00', color: '#2563eb', transportToNext: 'car', order: 0 },
      { name: 'Lyon', type: 'ville', lat: 45.764, lng: 4.8357, arrivalDate: '2026-07-12', arrivalTime: '14:00', departureDate: '2026-07-14', departureTime: '10:00', color: '#14b8a6', transportToNext: 'train', order: 1 },
      { name: 'Venise', type: 'ville', lat: 45.4408, lng: 12.3155, arrivalDate: '2026-07-14', arrivalTime: '18:00', departureDate: '2026-07-18', color: '#f97316', order: 2 }
    ], expenses: [{ label: 'Hôtels', category: 'logement', plannedAmount: 680, paidBy: 'Lucas', splitBetween: ['Lucas', 'Marie'] }] });
    state = Storage.upsertTrip(state, trip);
    persist('Voyage exemple ajouté.');
  }

  async function deleteTrip(id) {
    const trip = state.trips.find(t => t.id === id);
    if (!await confirmAction('Supprimer ce voyage ?', `“${trip?.name || 'Voyage'}” sera supprimé.`)) return;
    state = Storage.deleteTrip(state, id); persist('Voyage supprimé.');
  }

  function renderSteps() {
    const list = $('#stepsList'); if (!list) return;
    const trip = activeTrip();
    if (!trip) { list.innerHTML = '<div class="empty-state">Sélectionne un voyage.</div>'; return; }
    const steps = U.sortSteps(trip.steps || []);
    if (!steps.length) { list.innerHTML = '<div class="empty-state">Ajoute un départ, des arrêts et une destination finale.</div>'; return; }
    list.innerHTML = steps.map((step, index) => `<article class="step-row"><div class="step-marker" style="background:${step.color || '#2563eb'}">${index + 1}</div><div><span class="badge">${U.escapeHtml(step.type)} · ${U.escapeHtml(step.priority)}</span><h3>${U.escapeHtml(step.name)}</h3><p>Arrivée : ${U.formatDate(step.arrivalDate)}${step.arrivalTime ? ` · ${step.arrivalTime}` : ''} · Départ : ${U.formatDate(step.departureDate)}${step.departureTime ? ` · ${step.departureTime}` : ''}</p><p>${U.escapeHtml(step.address || (U.isValidCoord(step) ? `${step.lat}, ${step.lng}` : 'coordonnées manquantes'))}</p></div><div class="row-actions"><button class="button" data-move-step="up" data-step-id="${step.id}" ${index === 0 ? 'disabled' : ''}>↑</button><button class="button" data-move-step="down" data-step-id="${step.id}" ${index === steps.length - 1 ? 'disabled' : ''}>↓</button><button class="button" data-edit-step="${step.id}">Modifier</button><button class="button" data-delete-step="${step.id}">Supprimer</button></div></article>`).join('');
    list.querySelectorAll('[data-edit-step]').forEach(btn => btn.addEventListener('click', () => openStepDialog(btn.dataset.editStep)));
    list.querySelectorAll('[data-delete-step]').forEach(btn => btn.addEventListener('click', () => deleteStep(btn.dataset.deleteStep)));
    list.querySelectorAll('[data-move-step]').forEach(btn => btn.addEventListener('click', () => moveStep(btn.dataset.stepId, btn.dataset.moveStep)));
  }

  function openStepDialog(stepId = null, date = '') {
    const trip = activeTrip(); if (!trip) return showStatus('Crée d’abord un voyage.');
    const form = $('#stepForm'); if (!form) return;
    form.reset();
    const step = trip.steps.find(s => s.id === stepId);
    $('#stepDialogTitle').textContent = step ? 'Modifier une étape' : 'Ajouter une étape';
    ['id','name','type','address','lat','lng','arrivalDate','arrivalTime','departureDate','departureTime','duration','cost','priority','color','links','notes'].forEach(key => { if (form.elements[key]) form.elements[key].value = ''; });
    if (step) {
      Object.entries(step).forEach(([key, val]) => { if (form.elements[key]) form.elements[key].value = Array.isArray(val) ? val.join(', ') : val ?? ''; });
    } else if (date) { form.elements.arrivalDate.value = date; form.elements.departureDate.value = date; }
    form.elements.type.value ||= 'ville'; form.elements.priority.value ||= 'optionnel'; form.elements.color.value ||= '#2563eb';
    $('#stepDialog')?.showModal();
  }

  function validStepDates(data) {
    const aDate = String(data.get('arrivalDate') || ''); const dDate = String(data.get('departureDate') || aDate || '');
    const aTime = String(data.get('arrivalTime') || '00:00'); const dTime = String(data.get('departureTime') || '23:59');
    if (aDate && dDate && new Date(`${dDate}T${dTime}`) < new Date(`${aDate}T${aTime}`)) return false;
    return true;
  }

  function saveStepForm(event) {
    event.preventDefault(); if (!requireCloudReady()) return;
    const trip = activeTrip(); const data = new FormData(event.currentTarget);
    if (!validStepDates(data)) return showStatus('Le départ ne peut pas être avant l’arrivée.', 4200);
    const id = data.get('id') || U.uid('step'); const existing = trip.steps.find(s => s.id === id);
    const step = { ...(existing || {}), id, order: existing?.order ?? trip.steps.length, name: String(data.get('name') || 'Étape'), type: String(data.get('type') || 'ville'), address: String(data.get('address') || ''), lat: data.get('lat') === '' ? '' : Number(data.get('lat')), lng: data.get('lng') === '' ? '' : Number(data.get('lng')), arrivalDate: String(data.get('arrivalDate') || ''), arrivalTime: String(data.get('arrivalTime') || ''), departureDate: String(data.get('departureDate') || data.get('arrivalDate') || ''), departureTime: String(data.get('departureTime') || ''), duration: String(data.get('duration') || ''), cost: Number(data.get('cost')) || 0, priority: String(data.get('priority') || 'optionnel'), color: String(data.get('color') || '#2563eb'), links: U.linksToArray(data.get('links')), notes: String(data.get('notes') || ''), transportToNext: existing?.transportToNext || 'car', segmentCost: Number(existing?.segmentCost) || 0, segmentNote: existing?.segmentNote || '', journal: existing?.journal || {} };
    const index = trip.steps.findIndex(s => s.id === id); if (index >= 0) trip.steps[index] = step; else trip.steps.push(step);
    normalizeOrders(trip); $('#stepDialog')?.close(); persist('Étape enregistrée.');
  }

  async function deleteStep(id) { const trip = activeTrip(); if (!trip) return; if (!await confirmAction('Supprimer cette étape ?', 'Elle sera retirée du planning.')) return; trip.steps = trip.steps.filter(s => s.id !== id); normalizeOrders(trip); persist('Étape supprimée.'); }
  function moveStep(id, direction) { const trip = activeTrip(); if (!trip) return; const steps = U.sortSteps(trip.steps); const i = steps.findIndex(s => s.id === id); const j = direction === 'up' ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= steps.length) return; [steps[i], steps[j]] = [steps[j], steps[i]]; trip.steps = steps.map((s, order) => ({ ...s, order })); persist('Ordre mis à jour.'); }
  function normalizeOrders(trip) { trip.steps = U.sortSteps(trip.steps || []).map((s, order) => ({ ...s, order })); }

  function renderItinerary() { const trip = activeTrip(); if ($('#itinerarySummary')) Itinerary.renderSummary($('#itinerarySummary'), trip, state.settings); if ($('#dayPlannerBoard')) Itinerary.renderDayPlanner($('#dayPlannerBoard'), trip, state.settings, { editStep: openStepDialog, addStep: date => openStepDialog(null, date) }); if ($('#itineraryList')) Itinerary.renderItinerary($('#itineraryList'), trip, state.settings, updateSegment); }
  function updateSegment(stepId, field, value) { const step = activeTrip()?.steps.find(s => s.id === stepId); if (!step) return; step[field] = field === 'segmentCost' ? Number(value) || 0 : value; persist('Trajet mis à jour.'); }

  function renderBudget() {
    const trip = activeTrip();
    if ($('#budgetStats')) Budget.renderStats($('#budgetStats'), trip);
    if ($('#budgetDaily')) Budget.renderDaily($('#budgetDaily'), trip);
    if ($('#budgetPeople')) Budget.renderPeople($('#budgetPeople'), trip);
    if ($('#budgetBreakdown')) Budget.renderBreakdown($('#budgetBreakdown'), trip);
    if ($('#budgetChart')) Budget.drawChart($('#budgetChart'), trip);
    if ($('#expensesList')) Budget.renderExpenses($('#expensesList'), trip, { edit: openExpenseDialog, delete: deleteExpense });
    renderBudgetAlerts(trip);
  }
  function renderBudgetAlerts(trip) {
    const el = $('#budgetAlerts'); if (!el) return; if (!trip) { el.innerHTML = ''; return; }
    const b = Budget.computeBudget(trip); const alerts = [];
    if (b.max && b.plannedTotal > b.max) alerts.push(`Budget prévu dépassé de ${U.formatMoney(b.plannedTotal - b.max, trip.currency)}.`);
    if (b.actualTotal > b.plannedTotal && b.actualTotal > 0) alerts.push(`Le réel dépasse le prévu de ${U.formatMoney(b.actualTotal - b.plannedTotal, trip.currency)}.`);
    el.innerHTML = alerts.length ? alerts.map(a => `<div class="status-banner status-banner--compact">${U.escapeHtml(a)}</div>`).join('') : '';
  }

  function openExpenseDialog(expenseId = null) {
    const trip = activeTrip(); if (!trip) return showStatus('Crée d’abord un voyage.'); const form = $('#expenseForm'); if (!form) return; form.reset();
    const names = Budget.travellerNames(trip); const expense = trip.expenses.find(e => e.id === expenseId);
    form.elements.paidBy.innerHTML = '<option value="">Non renseigné</option>' + names.map(name => `<option value="${U.escapeHtml(name)}">${U.escapeHtml(name)}</option>`).join('');
    form.elements.stepId.innerHTML = '<option value="">Aucune étape</option>' + U.sortSteps(trip.steps).map(s => `<option value="${s.id}">${U.escapeHtml(s.name)}</option>`).join('');
    $('#expenseSplitPeople').innerHTML = names.map(name => `<label class="chip-check"><input type="checkbox" name="splitBetween" value="${U.escapeHtml(name)}" checked><span>${U.escapeHtml(name)}</span></label>`).join('');
    $('#expenseDialogTitle').textContent = expense ? 'Modifier une dépense' : 'Ajouter une dépense';
    if (expense) { ['id','label','category','plannedAmount','actualAmount','status','paidBy','date','stepId','note'].forEach(k => { if (form.elements[k]) form.elements[k].value = expense[k] ?? ''; }); $('#expenseSplitPeople').querySelectorAll('input').forEach(input => input.checked = !expense.splitBetween?.length || expense.splitBetween.includes(input.value)); }
    $('#expenseDialog')?.showModal();
  }
  function saveExpenseForm(event) { event.preventDefault(); if (!requireCloudReady()) return; const trip = activeTrip(); const data = new FormData(event.currentTarget); const id = data.get('id') || U.uid('expense'); const expense = { id, label: String(data.get('label') || 'Dépense'), category: String(data.get('category') || 'autres'), plannedAmount: Number(data.get('plannedAmount')) || 0, amount: Number(data.get('plannedAmount')) || 0, actualAmount: data.get('actualAmount') === '' ? '' : Number(data.get('actualAmount')) || 0, status: String(data.get('status') || 'prévue'), paidBy: String(data.get('paidBy') || ''), splitBetween: data.getAll('splitBetween'), date: String(data.get('date') || ''), stepId: String(data.get('stepId') || ''), note: String(data.get('note') || '') }; const index = trip.expenses.findIndex(e => e.id === id); if (index >= 0) trip.expenses[index] = expense; else trip.expenses.push(expense); $('#expenseDialog')?.close(); persist('Dépense enregistrée.'); }
  async function deleteExpense(id) { const trip = activeTrip(); if (!trip) return; if (!await confirmAction('Supprimer cette dépense ?', 'Elle sera retirée du budget.')) return; trip.expenses = trip.expenses.filter(e => e.id !== id); persist('Dépense supprimée.'); }

  function renderSuggestions() { if ($('#scorePanel')) Suggestions.render($('#scorePanel'), $('#suggestionsList'), activeTrip(), state.settings); }
  async function optimizeActiveTrip() { const trip = activeTrip(); if (!trip || trip.steps.length < 3) return showStatus('Ajoute au moins trois étapes.'); if (!await confirmAction('Optimiser l’ordre ?', 'Le premier et le dernier point restent fixes.')) return; trip.steps = Suggestions.optimizeOrder(trip, state.settings); persist('Ordre optimisé.'); }

  function renderChecklists() {
    const el = $('#checklists'); if (!el) return; const trip = activeTrip(); if (!trip) { el.innerHTML = '<div class="empty-state">Sélectionne un voyage.</div>'; return; }
    trip.checklists ||= U.createDefaultChecklists();
    el.innerHTML = Object.entries(trip.checklists).map(([cat, items]) => `<article class="checklist"><div class="checklist__head"><h3 contenteditable="true" data-checklist-title="${U.escapeHtml(cat)}">${U.escapeHtml(cat)}</h3><button class="button" data-delete-block="${U.escapeHtml(cat)}">Supprimer</button></div>${(items || []).map(item => `<label><input type="checkbox" data-check-id="${item.id}" data-check-category="${U.escapeHtml(cat)}" ${item.done ? 'checked' : ''}><span contenteditable="true" data-check-text="${item.id}" data-check-category="${U.escapeHtml(cat)}">${U.escapeHtml(item.text)}</span><button class="mini-delete" data-delete-task="${item.id}" data-check-category="${U.escapeHtml(cat)}" type="button">×</button></label>`).join('')}<button class="button" data-add-task="${U.escapeHtml(cat)}">+ tâche</button></article>`).join('');
    el.querySelectorAll('[data-check-id]').forEach(input => input.addEventListener('change', () => { const item = trip.checklists[input.dataset.checkCategory]?.find(i => i.id === input.dataset.checkId); if (item) item.done = input.checked; persist('Checklist mise à jour.'); }));
    el.querySelectorAll('[data-check-text]').forEach(span => span.addEventListener('blur', () => { const item = trip.checklists[span.dataset.checkCategory]?.find(i => i.id === span.dataset.checkText); if (item) item.text = span.textContent.trim() || item.text; persist('Tâche modifiée.'); }));
    el.querySelectorAll('[data-add-task]').forEach(btn => btn.addEventListener('click', () => { const text = prompt('Nouvelle tâche ?'); if (!text) return; trip.checklists[btn.dataset.addTask].push({ id: U.uid('todo'), text, done: false }); persist('Tâche ajoutée.'); }));
    el.querySelectorAll('[data-delete-task]').forEach(btn => btn.addEventListener('click', () => { trip.checklists[btn.dataset.checkCategory] = trip.checklists[btn.dataset.checkCategory].filter(i => i.id !== btn.dataset.deleteTask); persist('Tâche supprimée.'); }));
    el.querySelectorAll('[data-delete-block]').forEach(btn => btn.addEventListener('click', async () => { if (!await confirmAction('Supprimer ce bloc ?', btn.dataset.deleteBlock)) return; delete trip.checklists[btn.dataset.deleteBlock]; persist('Bloc supprimé.'); }));
  }
  function addChecklistBlock() { const trip = activeTrip(); if (!trip) return; const name = prompt('Nom du bloc ?', 'Nouvelle liste'); if (!name) return; trip.checklists ||= {}; trip.checklists[name] ||= []; persist('Bloc ajouté.'); }
  function addChecklistItem() { addChecklistBlock(); }

  function renderJournal() { const el = $('#journalList'); if (!el) return; const trip = activeTrip(); if (!trip?.steps?.length) { el.innerHTML = '<div class="empty-state">Ajoute des étapes pour créer un carnet.</div>'; return; } el.innerHTML = U.sortSteps(trip.steps).map(step => { step.journal ||= {}; return `<article class="journal-row"><span class="badge">${U.escapeHtml(step.type)}</span><h3>${U.escapeHtml(step.name)}</h3><div class="form-grid mt"><label>Notes<textarea class="input" data-journal-field="notes" data-step-id="${step.id}" rows="3">${U.escapeHtml(step.journal.notes || '')}</textarea></label><label>Photos / liens<textarea class="input" data-journal-field="photoLinks" data-step-id="${step.id}" rows="3">${U.escapeHtml(step.journal.photoLinks || '')}</textarea></label><label>Ressenti<input class="input" data-journal-field="rating" data-step-id="${step.id}" value="${U.escapeHtml(step.journal.rating || '')}"></label><label>Dépenses réelles<input class="input" type="number" data-journal-field="realExpenses" data-step-id="${step.id}" value="${U.escapeHtml(step.journal.realExpenses || '')}"></label></div></article>`; }).join(''); el.querySelectorAll('[data-journal-field]').forEach(field => field.addEventListener('change', () => { const step = trip.steps.find(s => s.id === field.dataset.stepId); step.journal ||= {}; step.journal[field.dataset.journalField] = field.value; persist('Carnet mis à jour.'); })); }

  function renderSettings() { $$('#settingsPanel [data-setting]').forEach(input => { const parts = input.dataset.setting.split('.'); input.value = parts.length === 1 ? (state.settings?.[parts[0]] ?? '') : (state.settings?.[parts[0]]?.[parts[1]] ?? ''); }); }
  function saveSettings() { if (!requireCloudReady()) return; $$('#settingsPanel [data-setting]').forEach(input => { const parts = input.dataset.setting.split('.'); if (parts.length === 1) state.settings[parts[0]] = Number(input.value) || input.value || ''; else { state.settings[parts[0]] ||= {}; state.settings[parts[0]][parts[1]] = Number(input.value) || 0; } }); persist('Paramètres enregistrés.'); }

  function renderMap() { const trip = activeTrip(); if ($('#mapFilters')) MapView.renderFilters($('#mapFilters'), trip, renderMap); if ($('#mapStepsList')) MapView.renderMapSteps($('#mapStepsList'), trip); if ($('#mapRoutesList')) MapView.renderMapRoutes($('#mapRoutesList'), trip, state.settings, (stepId, mode) => { const step = trip?.steps.find(s => s.id === stepId); if (step) { step.transportToNext = mode; persist('Transport mis à jour.'); } }); MapView.updateMap(trip, state.settings); }

  async function initCloudSync() {
    if (!CloudSync) { cloudLoading = false; showStatus('Module Firebase indisponible.'); renderAllSafe(); return; }
    CloudSync.onAuthChange(payload => { updateCloudUi(payload); handleCloudUserChange(payload.user).catch(error => { console.error(error); cloudLoading = false; appReady = false; updateCloudUi({ status: friendlyFirebaseError(error), kind: 'error' }); renderAllSafe(); }); });
    try { await CloudSync.init(); await CloudSync.waitForAuthState(); }
    catch (error) { console.error(error); cloudLoading = false; appReady = false; updateCloudUi({ status: friendlyFirebaseError(error), kind: 'error' }); renderAllSafe(); }
  }
  async function handleCloudUserChange(user) { if (!user) { loadedCloudUid = null; appReady = false; cloudLoading = false; state = Storage.createEmptyState(); renderAllSafe(); return; } if (loadedCloudUid === user.uid && appReady) return; loadedCloudUid = user.uid; cloudLoading = true; appReady = false; renderAllSafe(); const backup = await CloudSync.loadState(); state = Storage.save(backup?.state || Storage.createEmptyState()); cloudLastSavedAt = backup?.clientUpdatedAt || ''; if (!backup?.state) { await CloudSync.saveState(state); cloudLastSavedAt = new Date().toISOString(); } appReady = true; cloudLoading = false; renderAllSafe(); showStatus('Voyages chargés.'); refreshCommunity(false); }
  function updateCloudUi(payload = {}) { const user = payload.user ?? CloudSync?.getUser?.(); const configured = payload.configured ?? CloudSync?.isConfigured?.(); const status = payload.status || CloudSync?.getStatus?.() || ''; const top = $('#cloudAuthBtn'); const statusEl = $('#cloudStatus'); const avatar = $('#cloudAvatar'); const profile = $('#cloudProfile'); const name = $('#cloudUserName'); const email = $('#cloudUserEmail'); const signIn = $('#cloudSignInBtn'); const signOut = $('#cloudSignOutBtn'); const del = $('#deleteCloudDataBtn'); document.body.classList.toggle('is-cloud-locked', !user || !appReady); if (top) { top.classList.toggle('is-connected', Boolean(user)); top.innerHTML = user ? `${user.photoURL ? `<img class="auth-pill__avatar" src="${U.escapeHtml(user.photoURL)}" alt="">` : '<span class="cloud-dot"></span>'}<span class="auth-pill__text"><strong>Connecté</strong><small>${U.escapeHtml(user.displayName || user.email || 'Google')}</small></span>` : '<span class="cloud-dot"></span><span class="auth-pill__text"><strong>Connexion</strong><small>Google</small></span>'; } if (statusEl) { statusEl.className = `cloud-status ${user ? 'cloud-status--success' : payload.kind === 'error' ? 'cloud-status--error' : 'cloud-status--idle'}`; statusEl.innerHTML = `<span class="cloud-status__dot"></span><span>${U.escapeHtml(user ? 'Connecté et synchronisé.' : (configured ? status || 'Connecte-toi avec Google.' : 'Firebase non configuré.'))}</span>`; } if (profile) profile.hidden = !user; if (avatar && user) avatar.src = user.photoURL || 'assets/icons/icon-192.png'; if (name && user) name.textContent = user.displayName || 'Compte Google'; if (email && user) email.textContent = user.email || ''; if (signIn) signIn.disabled = Boolean(user) || !configured; if (signOut) signOut.disabled = !user; if (del) del.disabled = !user || !appReady; const meta = $('#cloudSyncMeta'); if (meta) meta.textContent = user ? (cloudLastSavedAt ? `Dernière sauvegarde : ${new Date(cloudLastSavedAt).toLocaleString('fr-FR')}` : 'Sauvegarde automatique active') : 'Non connecté'; }
  async function handleCloudAuth() { if (CloudSync?.getUser()) return switchView('settings'); return handleCloudSignIn(); }
  async function handleCloudSignIn() { try { cloudLoading = true; renderAllSafe(); await CloudSync.signIn(); } catch (error) { cloudLoading = false; showStatus(friendlyFirebaseError(error), 5000); updateCloudUi({ status: friendlyFirebaseError(error), kind: 'error' }); renderAllSafe(); } }
  async function handleCloudSignOut() { if (!await confirmAction('Se déconnecter ?', 'Les voyages restent sauvegardés dans Firebase.')) return; await flushCloudAutosave(); await CloudSync.signOut(); }
  async function saveCloudStateNow(silent = true) { if (!appReady || !CloudSync?.getUser()) return; try { state = Storage.save(state); await CloudSync.saveState(state); cloudLastSavedAt = new Date().toISOString(); updateCloudUi(); if (!silent) showStatus('Sauvegardé.'); } catch (error) { console.error(error); showStatus(friendlyFirebaseError(error), 5000); } }
  function scheduleCloudAutosave(delay = 700) { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => saveCloudStateNow(true), delay); }
  async function flushCloudAutosave() { clearTimeout(autosaveTimer); await saveCloudStateNow(true); }
  async function deleteCloudData() { if (!requireCloudReady()) return; if (!await confirmAction('Réinitialiser le compte ?', 'Tous tes voyages Firebase seront supprimés.')) return; await CloudSync.deleteState(); state = Storage.createEmptyState(); appReady = true; renderAllSafe(); showStatus('Compte réinitialisé.'); }

  function friendlyFirebaseError(error) { const msg = error?.message || String(error || ''); if (msg.includes('permissions') || msg.includes('PERMISSION_DENIED')) return 'Accès Firestore refusé. Vérifie les règles Firebase.'; if (msg.includes('auth/unauthorized-domain')) return 'Domaine non autorisé dans Firebase Authentication.'; if (msg.includes('length')) return 'Données anciennes corrigées. Recharge la page si nécessaire.'; return msg || 'Erreur Firebase.'; }

  async function refreshCommunity(show = true) { if (!CloudSync?.listCommunityTrips) return; try { communityTrips = await CloudSync.listCommunityTrips(); renderCommunity(); if (show) showStatus('Communauté actualisée.'); } catch (error) { console.error(error); $('#communityGrid') && ($('#communityGrid').innerHTML = `<div class="empty-state">${U.escapeHtml(friendlyFirebaseError(error))}</div>`); } }
  function renderCommunity() { const grid = $('#communityGrid'); if (!grid) return; const stats = $('#communityStats'); const countryFilter = $('#communityCountryFilter'); const q = ($('#communitySearchInput')?.value || '').toLowerCase(); const category = $('#communityCategoryFilter')?.value || ''; const country = countryFilter?.value || ''; let rows = [...communityTrips]; const countries = U.unique(rows.map(r => r.country)).sort(); if (countryFilter && countryFilter.options.length <= 1) countryFilter.innerHTML = '<option value="">Tous les pays</option>' + countries.map(c => `<option value="${U.escapeHtml(c)}">${U.escapeHtml(c)}</option>`).join(''); rows = rows.filter(r => (!q || `${r.title} ${r.country} ${r.category} ${r.description}`.toLowerCase().includes(q)) && (!category || r.category === category) && (!country || r.country === country)); const sort = $('#communitySortFilter')?.value || 'trend'; rows.sort((a,b) => sort === 'recent' ? String(b.clientUpdatedAt || '').localeCompare(String(a.clientUpdatedAt || '')) : sort === 'budgetLow' ? (Number(a.trip?.maxBudget)||0)-(Number(b.trip?.maxBudget)||0) : (Number(b.score)||0)-(Number(a.score)||0)); if (stats) stats.innerHTML = `<div class="stat-card"><strong>${communityTrips.length}</strong><span>voyage(s)</span></div><div class="stat-card"><strong>${countries.length}</strong><span>pays</span></div><div class="stat-card"><strong>${rows[0]?.score || 0}</strong><span>meilleure tendance</span></div>`; grid.innerHTML = rows.length ? rows.map(renderCommunityCard).join('') : '<div class="empty-state">Aucun voyage public pour ces filtres.</div>'; grid.querySelectorAll('[data-community-vote]').forEach(btn => btn.addEventListener('click', () => voteCommunity(btn.dataset.communityVote, Number(btn.dataset.voteValue)))); grid.querySelectorAll('[data-community-copy]').forEach(btn => btn.addEventListener('click', () => copyCommunityTrip(btn.dataset.communityCopy))); grid.querySelectorAll('[data-community-delete]').forEach(btn => btn.addEventListener('click', () => deleteCommunityTrip(btn.dataset.communityDelete))); }
  function renderCommunityCard(item) { const canDelete = CloudSync?.isAdmin?.() || item.ownerUid === CloudSync?.getUser?.()?.uid; const cover = item.coverImage ? `background-image:url('${U.escapeHtml(item.coverImage)}')` : 'background:linear-gradient(135deg,#2563eb,#14b8a6)'; return `<article class="community-card trip-card"><div class="trip-card__cover" style="${cover}"><span class="badge">${U.escapeHtml(item.category || 'voyage')}</span></div><h3>${U.escapeHtml(item.title || 'Voyage partagé')}</h3><p>${U.escapeHtml(item.description || item.country || '')}</p><div class="trip-card__meta"><span>🌍 ${U.escapeHtml(item.country || 'Non renseigné')}</span><span>⭐ ${Number(item.score)||0} tendance</span><span>👤 ${U.escapeHtml(item.ownerName || 'Utilisateur')}</span></div><div class="trip-card__actions"><button class="button" data-community-vote="${item.id}" data-vote-value="1">+ Tendance</button><button class="button" data-community-vote="${item.id}" data-vote-value="-1">−</button>${item.allowCopy !== false ? `<button class="button button--primary" data-community-copy="${item.id}">Copier</button>` : ''}${canDelete ? `<button class="button button--danger" data-community-delete="${item.id}">Retirer</button>` : ''}</div></article>`; }
  function openCommunityPublish() { const trip = activeTrip(); if (!trip) return showStatus('Sélectionne un voyage à publier.'); const form = $('#communityPublishForm'); if (!form) return; form.reset(); form.elements.title.value = trip.name || ''; form.elements.country.value = trip.area || ''; form.elements.coverImage.value = trip.coverImage || ''; form.elements.description.value = trip.description || ''; $('#communityPublishDialog')?.showModal(); }
  async function publishCommunity(event) { event.preventDefault(); if (!requireCloudReady()) return; const trip = activeTrip(); const data = new FormData(event.currentTarget); try { await CloudSync.publishCommunityTrip(trip, { title: data.get('title'), country: data.get('country'), category: data.get('category'), coverImage: data.get('coverImage'), description: data.get('description'), hideBudget: data.get('hideBudget') === 'on', hideNotes: data.get('hideNotes') === 'on', allowCopy: data.get('allowCopy') === 'on' }); $('#communityPublishDialog')?.close(); await refreshCommunity(false); switchView('community'); showStatus('Voyage publié dans la communauté.'); } catch (error) { console.error(error); showStatus(friendlyFirebaseError(error), 6000); } }
  async function voteCommunity(id, value) { try { await CloudSync.voteCommunityTrip(id, value); await refreshCommunity(false); } catch (error) { showStatus(friendlyFirebaseError(error), 5000); } }
  function copyCommunityTrip(id) { const item = communityTrips.find(t => t.id === id); if (!item?.trip) return; const copy = Storage.normalizeTrip({ ...U.clone(item.trip), id: U.uid('trip'), name: `${item.title || item.trip.name} — copie`, status: 'brouillon' }); state = Storage.upsertTrip(state, copy); persist('Voyage copié dans ton espace.'); switchView('trip'); }
  async function deleteCommunityTrip(id) { if (!await confirmAction('Retirer cette publication ?', 'Elle disparaîtra de la communauté.')) return; try { await CloudSync.deleteCommunityTrip(id); await refreshCommunity(false); showStatus('Publication retirée.'); } catch (error) { showStatus(friendlyFirebaseError(error), 5000); } }

  function renderGlobalSearch() { const box = $('#globalSearchResults'); const input = $('#globalSearchInput'); if (!box || !input) return; const q = input.value.trim().toLowerCase(); if (!q) { box.hidden = true; box.innerHTML = ''; return; } const results = []; (state.trips || []).forEach(trip => { if (`${trip.name} ${trip.area} ${trip.description}`.toLowerCase().includes(q)) results.push({ label: trip.name, type: 'voyage', action: () => { state.activeTripId = trip.id; persist(); switchView('trip'); } }); (trip.steps || []).forEach(step => { if (`${step.name} ${step.address} ${step.notes}`.toLowerCase().includes(q)) results.push({ label: `${step.name} — ${trip.name}`, type: 'étape', action: () => { state.activeTripId = trip.id; persist(); openStepDialog(step.id); } }); }); }); box.innerHTML = results.slice(0, 8).map((r, i) => `<button data-search-index="${i}"><strong>${U.escapeHtml(r.label)}</strong><small>${r.type}</small></button>`).join('') || '<div class="empty-state">Aucun résultat.</div>'; box.hidden = false; box.querySelectorAll('[data-search-index]').forEach(btn => btn.addEventListener('click', () => { results[Number(btn.dataset.searchIndex)].action(); box.hidden = true; input.value = ''; })); }
  function toggleFabMenu() { const menu = $('#fabMenu'); if (menu) menu.hidden = !menu.hidden; }
  function closeFabMenu() { const menu = $('#fabMenu'); if (menu) menu.hidden = true; }

  function attachPlaceSearch() { Geocoder?.attachStepSearch?.({ input: $('#placeSearchInput'), button: $('#placeSearchBtn'), resultsContainer: $('#placeSearchResults'), statusElement: $('#placeSearchStatus'), onSelect: place => { const f = $('#stepForm'); if (!f) return; f.elements.name.value = place.name || ''; f.elements.address.value = place.address || place.displayName || ''; f.elements.lat.value = place.lat; f.elements.lng.value = place.lng; f.elements.type.value = U.placeTypes.includes(place.type) ? place.type : 'autre'; } }); }

  function confirmAction(title, message) { const dialog = $('#confirmDialog'); if (!dialog?.showModal) return Promise.resolve(confirm(`${title}\n${message}`)); $('#confirmTitle').textContent = title; $('#confirmMessage').textContent = message; return new Promise(resolve => { const onClose = () => { dialog.removeEventListener('close', onClose); resolve(dialog.returnValue === 'default'); }; dialog.addEventListener('close', onClose); dialog.showModal(); }); }
})();
