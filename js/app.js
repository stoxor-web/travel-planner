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

  const titles = {
    dashboard: 'Tableau de bord',
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
      MapView.resetFilters();
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
    bindCloudActions();
    window.addEventListener('resize', () => MapView.invalidate());
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
      MapView.initMap();
      renderMap();
      MapView.invalidate();
    }
    if (view === 'budget') renderBudget();
    if (view === 'suggestions') renderSuggestions();
    if (view === 'itinerary') renderItinerary();
  }

  function renderAll() {
    renderTripSelector();
    renderDashboard();
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
    showStatus('Connecte-toi avec Google pour utiliser le planificateur.');
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
      grid.innerHTML = '<div class="empty-state">Chargement…</div>';
      return;
    }

    if (!user || !appReady) {
      grid.innerHTML = `
        <div class="login-gate">
          <div class="login-gate__icon">☁️</div>
          <h2>Connecte-toi pour commencer</h2>
          <p>Retrouve tes voyages et sauvegarde automatiquement tes modifications.</p>
          <button class="button button--primary" id="dashboardSignInBtn">Continuer avec Google</button>
        </div>
      `;
      document.getElementById('dashboardSignInBtn')?.addEventListener('click', handleCloudSignIn);
      return;
    }

    if (!state.trips.length) {
      grid.innerHTML = '<div class="empty-state">Aucun voyage pour ce compte. Crée ton premier itinéraire.</div>';
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

  function renderTripForm() {
    const form = $('#tripForm');
    const trip = activeTrip();
    form.querySelectorAll('input, textarea, select, button').forEach(element => { element.disabled = !trip && element.type !== 'submit'; });
    if (!trip) {
      form.reset();
      return;
    }
    const fields = ['name', 'description', 'area', 'startDate', 'endDate', 'travellers', 'maxBudget', 'currency', 'status', 'style', 'pace', 'interests'];
    fields.forEach(field => { if (form.elements[field]) form.elements[field].value = trip[field] ?? ''; });
  }

  function saveTripForm(event) {
    event.preventDefault();
    if (!requireCloudReady()) return;
    let trip = activeTrip();
    if (!trip) trip = Storage.normalizeTrip({});
    const data = new FormData(event.currentTarget);
    ['name', 'description', 'area', 'startDate', 'endDate', 'currency', 'status', 'style', 'pace', 'interests'].forEach(key => { trip[key] = String(data.get(key) || ''); });
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
    const ok = await confirmAction('Supprimer ce voyage ?', `“${trip?.name || 'Voyage'}” sera supprimé de Firebase pour ton compte Google.`);
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
    form.elements.lat.value = step?.lat ?? '';
    form.elements.lng.value = step?.lng ?? '';
    form.elements.arrivalDate.value = step?.arrivalDate || '';
    form.elements.departureDate.value = step?.departureDate || '';
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
      arrivalDate: String(data.get('arrivalDate') || ''),
      departureDate: String(data.get('departureDate') || ''),
      duration: String(data.get('duration') || ''),
      cost: Number(data.get('cost')) || 0,
      priority: String(data.get('priority') || 'optionnel'),
      color: String(data.get('color') || '#2563eb'),
      links: U.linksToArray(data.get('links')),
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
    Itinerary.renderSummary($('#itinerarySummary'), trip, state.settings);
    Itinerary.renderItinerary($('#itineraryList'), trip, state.settings, (stepId, field, value) => {
      const current = activeTrip();
      const step = current?.steps.find(item => item.id === stepId);
      if (!step) return;
      step[field] = field === 'segmentCost' ? Number(value) || 0 : value;
      persist('Segment mis à jour.');
    });
  }

  function renderBudget() {
    const trip = activeTrip();
    Budget.renderStats($('#budgetStats'), trip);
    Budget.renderBreakdown($('#budgetBreakdown'), trip);
    Budget.drawChart($('#budgetChart'), trip);
    Budget.renderExpenses($('#expensesList'), trip, { edit: openExpenseDialog, delete: deleteExpense });
  }

  function openExpenseDialog(expenseId = null) {
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
    form.elements.amount.value = expense?.amount || '';
    form.elements.status.value = expense?.status || 'prévue';
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
    const expense = {
      id,
      label: String(data.get('label') || 'Dépense'),
      category: String(data.get('category') || 'autres'),
      amount: Number(data.get('amount')) || 0,
      status: String(data.get('status') || 'prévue'),
      date: String(data.get('date') || ''),
      stepId: String(data.get('stepId') || ''),
      note: String(data.get('note') || '')
    };
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
    Suggestions.render($('#scorePanel'), $('#suggestionsList'), activeTrip(), state.settings);
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
    container.innerHTML = Object.entries(trip.checklists).map(([category, items]) => `
      <article class="checklist">
        <h3>${U.escapeHtml(category)}</h3>
        ${(items || []).map(item => `
          <label>
            <input type="checkbox" data-check-category="${U.escapeHtml(category)}" data-check-id="${item.id}" ${item.done ? 'checked' : ''} />
            <span contenteditable="true" data-check-text="${item.id}" data-check-category="${U.escapeHtml(category)}">${U.escapeHtml(item.text)}</span>
          </label>
        `).join('')}
      </article>
    `).join('');
    container.querySelectorAll('[data-check-id]').forEach(input => input.addEventListener('change', () => {
      const list = trip.checklists[input.dataset.checkCategory] || [];
      const item = list.find(entry => entry.id === input.dataset.checkId);
      if (item) item.done = input.checked;
      state = Storage.save(state);
      renderSuggestions();
      scheduleCloudAutosave();
    }));
    container.querySelectorAll('[data-check-text]').forEach(span => span.addEventListener('blur', () => {
      const list = trip.checklists[span.dataset.checkCategory] || [];
      const item = list.find(entry => entry.id === span.dataset.checkText);
      if (item) item.text = span.textContent.trim() || item.text;
      state = Storage.save(state);
      scheduleCloudAutosave();
    }));
  }

  function addChecklistItem() {
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    if (!trip) return showStatus('Sélectionne un voyage.');
    const category = prompt('Dans quelle liste ajouter cet élément ?', 'avant départ');
    if (!category) return;
    const text = prompt('Élément à ajouter ?', '');
    if (!text) return;
    trip.checklists ||= U.createDefaultChecklists();
    trip.checklists[category] ||= [];
    trip.checklists[category].push({ id: U.uid('todo'), text, done: false });
    persist('Élément ajouté.');
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
    $$('#settingsPanel [data-setting]').forEach(input => {
      const [group, key] = input.dataset.setting.split('.');
      input.value = state.settings?.[group]?.[key] ?? '';
    });
  }

  function saveSettings() {
    if (!requireCloudReady()) return;
    $$('#settingsPanel [data-setting]').forEach(input => {
      const [group, key] = input.dataset.setting.split('.');
      state.settings[group] ||= {};
      state.settings[group][key] = Number(input.value) || 0;
    });
    state = Storage.save(state);
    renderAll();
    scheduleCloudAutosave();
    showStatus('Paramètres enregistrés.');
  }

  function renderMap() {
    const trip = activeTrip();
    MapView.renderFilters($('#mapFilters'), trip, () => renderMap());
    MapView.renderMapSteps($('#mapStepsList'), trip);
    MapView.updateMap(trip, state.settings);
  }

  function bindCloudActions() {
    if (!CloudSync) return;
    const bind = (id, handler) => {
      const element = document.getElementById(id);
      if (element) element.addEventListener('click', handler);
    };
    bind('cloudAuthBtn', handleCloudAuth);
    bind('cloudSignInBtn', handleCloudSignIn);
    bind('cloudSignOutBtn', handleCloudSignOut);
  }

  async function initCloudSync() {
    if (!CloudSync) {
      cloudLoading = false;
      showStatus('Module de connexion introuvable.');
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
        showStatus(error.message || 'Chargement impossible.');
      });
    });

    try {
      if (!CloudSync.isConfigured()) {
        cloudLoading = false;
        appReady = false;
        updateCloudUi({ configured: false, status: 'Configuration Google manquante.' });
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
      showStatus(error.message || 'Connexion impossible.');
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
    showStatus('Voyages chargés.');
  }

  function updateCloudUi(payload = {}) {
    if (!CloudSync) return;
    const user = payload.user ?? CloudSync.getUser();
    const configured = payload.configured ?? CloudSync.isConfigured();
    const status = payload.status || CloudSync.getStatus();
    const statusEl = document.getElementById('cloudStatus');
    const profile = document.getElementById('cloudProfile');
    const avatar = document.getElementById('cloudAvatar');
    const name = document.getElementById('cloudUserName');
    const email = document.getElementById('cloudUserEmail');
    const topButton = document.getElementById('cloudAuthBtn');
    const signInBtn = document.getElementById('cloudSignInBtn');
    const signOutBtn = document.getElementById('cloudSignOutBtn');
    const deleteCloudBtn = document.getElementById('deleteCloudDataBtn');
    const syncMeta = document.getElementById('cloudSyncMeta');
    const protectedControls = ['newTripBtn', 'createFirstTripBtn', 'tripSelector', 'saveSettingsBtn'];

    document.body.classList.toggle('is-cloud-locked', !appReady || !user);

    if (statusEl) statusEl.textContent = status || (configured ? 'Connexion Google requise.' : 'Configuration Google manquante.');
    if (profile) profile.hidden = !user;
    if (avatar && user) avatar.src = user.photoURL || '';
    if (name && user) name.textContent = user.displayName || 'Compte Google';
    if (email && user) email.textContent = user.email || '';
    if (topButton) topButton.textContent = user ? '☁️ Connecté' : '☁️ Connexion Google';
    if (signInBtn) {
      signInBtn.disabled = !configured || Boolean(user);
      signInBtn.textContent = user ? 'Connecté avec Google' : 'Se connecter avec Google';
    }
    if (signOutBtn) signOutBtn.disabled = !user;
    if (deleteCloudBtn) deleteCloudBtn.disabled = !user || !appReady;
    if (syncMeta) syncMeta.textContent = cloudLastSavedAt ? `Dernière sauvegarde : ${U.formatDate(cloudLastSavedAt)} ${new Date(cloudLastSavedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Sauvegarde automatique après connexion.';

    protectedControls.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.disabled = !appReady || !user;
    });
  }

  async function handleCloudAuth() {
    if (!CloudSync?.isConfigured()) {
      switchView('settings');
      showStatus('Configuration Google manquante.');
      return;
    }
    if (CloudSync.getUser()) {
      switchView('settings');
      return;
    }
    await handleCloudSignIn();
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
      showStatus(error.message || 'Connexion impossible.');
      updateCloudUi({ status: error.message });
      renderAll();
    }
  }

  async function handleCloudSignOut() {
    const ok = await confirmAction('Se déconnecter ?', 'Les voyages seront retirés de cette session. Ils resteront dans Firebase pour ce compte Google.');
    if (!ok) return;
    try {
      await flushCloudAutosave();
      await CloudSync.signOut();
      state = Storage.createEmptyState();
      appReady = false;
      loadedCloudUid = null;
      renderAll();
      showStatus('Déconnexion Google effectuée.');
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
      if (!silent) showStatus('Sauvegardé.');
    } catch (error) {
      console.error(error);
      updateCloudUi({ status: error.message });
      if (!silent) showStatus(error.message || 'Sauvegarde impossible.');
    }
  }

  function scheduleCloudAutosave(delay = 650) {
    if (!appReady || !CloudSync?.getUser()) return;
    clearTimeout(cloudAutosaveTimer);
    updateCloudUi({ status: 'Sauvegarde…' });
    cloudAutosaveTimer = setTimeout(() => saveCloudStateNow(true), delay);
  }

  async function flushCloudAutosave() {
    clearTimeout(cloudAutosaveTimer);
    await saveCloudStateNow(true);
  }

  async function deleteCloudData() {
    if (!requireCloudReady()) return;
    const ok = await confirmAction('Supprimer tous les voyages ?', 'Tous les voyages de ce compte Google seront supprimés. Cette action est définitive.');
    if (!ok) return;
    try {
      await CloudSync.deleteState();
      state = Storage.createEmptyState();
      appReady = true;
      renderAll();
      updateCloudUi({ status: 'Données supprimées. Tu peux créer un nouveau voyage.' });
      showStatus('Données supprimées.');
    } catch (error) {
      console.error(error);
      showStatus(error.message || 'Suppression impossible.');
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
