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
  let communityTrips = [];
  let communityLoading = false;
  let communityLoaded = false;

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
  const APP_VERSION = 'V4.9 Premium';
  const ADMIN_EMAIL = 'lucas.scribe01@gmail.com';

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
    on('communityRefreshBtn', 'click', () => loadCommunityTrips(true));
    on('communityPublishBtn', 'click', openCommunityPublishDialog);
    on('communityPublishForm', 'submit', publishCommunityTrip);
    on('communitySearchInput', 'input', renderCommunity);
    on('communityCountryFilter', 'change', renderCommunity);
    on('communityCategoryFilter', 'change', renderCommunity);
    on('communitySortFilter', 'change', renderCommunity);
    on('openWizardBtn', 'click', openWizardDialog);
    on('tripWizardForm', 'submit', saveWizardTrip);
    on('addChecklistBlockBtn', 'click', addChecklistBlock);
    on('fabMainBtn', 'click', toggleFabMenu);
    on('fabAddTrip', 'click', () => { closeFabMenu(); createNewTrip(); });
    on('fabAddStep', 'click', () => { closeFabMenu(); openStepDialog(); });
    on('fabAddExpense', 'click', () => { closeFabMenu(); openExpenseDialog(); });
    on('fabOpenChecklist', 'click', () => { closeFabMenu(); switchView('preparation'); });
    on('fabOpenToday', 'click', () => { closeFabMenu(); switchView('today'); });
    on('todayAddStepBtn', 'click', () => openStepDialog(null, new Date().toISOString().slice(0, 10)));
    on('todayAddExpenseBtn', 'click', () => openExpenseDialog());
    on('todayOpenMapBtn', 'click', () => switchView('map'));
    on('todayOpenPlanningBtn', 'click', () => switchView('itinerary'));
    on('globalSearchInput', 'input', renderGlobalSearch);
    on('globalSearchInput', 'focus', renderGlobalSearch);
    document.addEventListener('click', event => {
      if (!event.target.closest('.global-search')) hideGlobalSearch();
      if (!event.target.closest('.fab-wrap')) closeFabMenu();
    });
    bindShareActions();
    bindPlaceSearch();
    bindStepDateGuards();
    bindCloudActions();
    window.addEventListener('resize', () => MapView.invalidate());
    $$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => {
      const dialog = document.getElementById(button.dataset.closeDialog);
      if (dialog?.open) dialog.close('cancel');
    }));
  }

  function switchView(view) {
    if (!titles[view]) view = 'dashboard';
    if (!appReady && !['dashboard', 'community', 'settings'].includes(view)) view = 'dashboard';
    currentView = view;
    location.hash = view;
    $$('.view').forEach(section => section.classList.toggle('is-visible', section.id === `view-${view}`));
    $$('.nav-item').forEach(item => item.classList.toggle('is-active', item.dataset.viewLink === view));
    $('#pageTitle').textContent = titles[view];
    if (view === 'today') renderToday();
    if (view === 'map') {
      MapView.initMap();
      renderMap();
      MapView.invalidate();
    }
    if (view === 'budget') renderBudget();
    if (view === 'suggestions') renderSuggestions();
    if (view === 'itinerary') renderItinerary();
    if (view === 'community') { renderCommunity(); loadCommunityTrips(false); }
  }

  function renderAll() {
    renderTripSelector();
    renderDashboard();
    renderToday();
    renderTripTemplates();
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
    renderLegalYear();
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
    const focus = $('#dashboardFocus');
    const user = CloudSync?.getUser();

    if (cloudLoading) {
      if (focus) focus.innerHTML = '';
      grid.innerHTML = '<div class="empty-state">Chargement de tes voyages depuis Firebase…</div>';
      return;
    }

    if (!user || !appReady) {
      if (focus) focus.innerHTML = '';
      grid.innerHTML = `
        <div class="auth-landing">
          <div class="auth-card">
            <span class="auth-card__badge"><span></span> Espace privé synchronisé</span>
            <h2>Prépare, suis et partage tes voyages.</h2>
            <p>Connecte-toi avec Google pour retrouver tes voyages, ton budget, ton planning et tes checklists sur tous tes appareils.</p>
            <button class="button button--primary button--google auth-card__button" id="dashboardSignInBtn"><span class="google-mark">G</span> Continuer avec Google</button>
            <div class="auth-card__meta"><span>Cloud Firebase</span><span>Mode voyage</span><span>Carte OSM stable</span></div>
          </div>
          <div class="auth-preview">
            <div class="auth-preview__top"><span></span><span></span><span></span></div>
            <div class="auth-route-card"><small>Aperçu</small><strong>Roadtrip Tokyo → Kyoto</strong><div class="auth-route-line"><i></i><i></i><i></i><i></i></div></div>
            <div class="auth-mini-grid"><div><strong>82%</strong><small>prêt</small></div><div><strong>12</strong><small>étapes</small></div><div><strong>3</strong><small>alertes</small></div></div>
          </div>
        </div>`;
      document.getElementById('dashboardSignInBtn')?.addEventListener('click', handleCloudSignIn);
      return;
    }

    const trip = activeTrip();
    renderDashboardFocus(trip);

    if (!state.trips.length) {
      grid.innerHTML = '<div class="empty-state">Aucun voyage pour ce compte. Crée ton premier itinéraire ou utilise un modèle.</div>';
      return;
    }

    grid.innerHTML = state.trips.map(trip => renderTripCard(trip)).join('');
    grid.querySelectorAll('[data-open-trip]').forEach(button => button.addEventListener('click', () => {
      if (!requireCloudReady()) return;
      state.activeTripId = button.dataset.openTrip;
      state = Storage.save(state);
      renderAll();
      scheduleCloudAutosave();
      switchView('trip');
    }));
    grid.querySelectorAll('[data-continue-trip]').forEach(button => button.addEventListener('click', () => {
      state.activeTripId = button.dataset.continueTrip;
      state = Storage.save(state);
      renderAll();
      switchView('itinerary');
    }));
    grid.querySelectorAll('[data-share-trip]').forEach(button => button.addEventListener('click', () => {
      state.activeTripId = button.dataset.shareTrip;
      state = Storage.save(state);
      renderAll();
      openShareDialog();
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

  function renderDashboardFocus(trip) {
    const container = $('#dashboardFocus');
    if (!container) return;
    if (!trip) {
      container.innerHTML = '';
      return;
    }
    const budget = Budget.computeBudget(trip);
    const insight = Suggestions.evaluate(trip, state.settings);
    const next = nextTravelItem(trip);
    const cover = trip.coverImage ? `style="background-image:linear-gradient(120deg,rgba(7,22,43,.78),rgba(15,118,110,.42)),url('${escapeAttr(trip.coverImage)}')"` : '';
    container.innerHTML = `
      <section class="control-center panel">
        <div class="control-center__cover" ${cover}>
          <span class="badge badge--glass">${U.escapeHtml(trip.status || 'brouillon')}</span>
          <h2>${U.escapeHtml(trip.name)}</h2>
          <p>${U.escapeHtml(trip.area || 'Zone à préciser')} · ${getTripDurationDays(trip) || 1} jour(s) · ${Number(trip.travellers) || 1} voyageur(s)</p>
        </div>
        <div class="control-center__body">
          <div class="quick-summary">
            <article><span>Préparation</span><strong>${insight.score}%</strong></article>
            <article><span>Budget</span><strong>${U.formatMoney(budget.total, trip.currency)}</strong><small>${trip.maxBudget ? `sur ${U.formatMoney(trip.maxBudget, trip.currency)}` : 'plafond libre'}</small></article>
            <article><span>Étapes</span><strong>${trip.steps.length}</strong><small>${Itinerary.buildSegments(trip, state.settings).length} trajet(s)</small></article>
            <article><span>Alertes</span><strong>${insight.items.filter(item => item.level === 'danger' || item.level === 'warning').length}</strong><small>à vérifier</small></article>
          </div>
          <div class="travel-mode-card">
            <p class="eyebrow">Mode voyage</p>
            <h3>${next ? U.escapeHtml(next.title) : 'Prêt à partir'}</h3>
            <p>${next ? U.escapeHtml(next.meta) : 'Ajoute des étapes datées pour obtenir une consultation rapide pendant le séjour.'}</p>
            <div class="button-row">
              <button class="button button--primary" data-open-view="today">Mode aujourd’hui</button>
              <button class="button" data-open-view="itinerary">Planning</button>
              <button class="button" data-open-view="budget">Dépense rapide</button>
              <button class="button" data-open-view="map">Carte</button>
            </div>
          </div>
        </div>
      </section>`;
    container.querySelectorAll('[data-open-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.openView)));
  }

  function renderTripCard(trip) {
    const budget = Budget.computeBudget(trip);
    const insight = Suggestions.evaluate(trip, state.settings);
    const cover = trip.coverImage ? `style="background-image:linear-gradient(180deg,rgba(7,23,57,.06),rgba(7,23,57,.74)),url('${escapeAttr(trip.coverImage)}')"` : '';
    const next = nextTravelItem(trip);
    return `
      <article class="trip-card trip-card--pro">
        <div class="trip-card__cover" ${cover}>
          <span class="badge badge--glass">${U.escapeHtml(trip.status)}</span>
          <span class="trip-score">${insight.score}% prêt</span>
        </div>
        <div class="trip-card__content">
          <div class="trip-card__top">
            <div><h3>${U.escapeHtml(trip.name)}</h3><p>${U.escapeHtml(trip.area || 'zone non renseignée')}</p></div>
            <span>${trip.steps.length} étape(s)</span>
          </div>
          <div class="trip-card__meta trip-card__meta--grid">
            <span>📅 ${U.formatDate(trip.startDate)} → ${U.formatDate(trip.endDate)}</span>
            <span>💶 ${U.formatMoney(budget.total, trip.currency)}${trip.maxBudget ? ` / ${U.formatMoney(trip.maxBudget, trip.currency)}` : ''}</span>
            <span>🧭 ${next ? U.escapeHtml(next.title) : 'Planning à compléter'}</span>
          </div>
          <div class="progress"><span style="width:${Math.min(100, insight.score)}%"></span></div>
          <div class="trip-card__actions">
            <button class="button button--primary" data-continue-trip="${trip.id}">Continuer</button>
            <button class="button" data-open-trip="${trip.id}">Modifier</button>
            <button class="button" data-share-trip="${trip.id}">Partager</button>
            <button class="button" data-duplicate-trip="${trip.id}">Dupliquer</button>
            <button class="button button--danger" data-delete-trip="${trip.id}">Supprimer</button>
          </div>
        </div>
      </article>`;
  }

  function nextTravelItem(trip) {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const steps = U.sortSteps(trip?.steps || []);
    const next = steps.find(step => (step.arrivalDate || '') >= todayKey) || steps[0];
    if (!next) return null;
    const time = [next.arrivalDate ? U.formatDate(next.arrivalDate) : '', next.arrivalTime || ''].filter(Boolean).join(' · ');
    return { title: next.name, meta: `${next.type || 'étape'}${time ? ` · ${time}` : ''}${next.address ? ` · ${next.address}` : ''}` };
  }


  function renderToday() {
    const hero = $('#todayHero');
    const side = $('#todayQuickActions');
    const timeline = $('#todayTimeline');
    if (!hero || !side || !timeline) return;
    const trip = activeTrip();
    if (!trip) {
      hero.innerHTML = '<div class="empty-state">Sélectionne un voyage pour activer le mode Aujourd’hui.</div>';
      side.innerHTML = '';
      timeline.innerHTML = '';
      return;
    }
    const data = getTodayTravelData(trip);
    const budget = Budget.computeBudget(trip);
    const alert = Suggestions.evaluate(trip, state.settings).items.find(item => item.level === 'danger' || item.level === 'warning');
    const cover = trip.coverImage ? `style="background-image:linear-gradient(120deg,rgba(5,18,38,.84),rgba(12,118,110,.34)),url('${escapeAttr(trip.coverImage)}')"` : '';
    hero.innerHTML = `
      <div class="today-hero__cover" ${cover}>
        <span class="badge badge--glass">${U.escapeHtml(trip.status || 'prévu')}</span>
        <h2>${U.escapeHtml(trip.name)}</h2>
        <p>${U.escapeHtml(trip.area || 'Destination à préciser')} · ${getTripDurationDays(trip) || 1} jour(s)</p>
      </div>
      <div class="today-hero__body">
        <p class="eyebrow">Mode voyage</p>
        <h3>${data.currentLabel}</h3>
        <div class="today-next-card">
          <small>Prochaine étape</small>
          <strong>${data.next ? U.escapeHtml(data.next.name) : 'Aucune étape datée'}</strong>
          <span>${data.next ? formatStepDateTime(data.next) : 'Ajoute des dates et horaires au planning.'}</span>
          ${data.next?.address ? `<a href="${openMapUrl(data.next)}" target="_blank" rel="noreferrer">Ouvrir l’adresse</a>` : ''}
        </div>
      </div>`;
    side.innerHTML = `
      <div class="today-actions-head"><strong>Actions rapides</strong><small>Utile pendant le voyage</small></div>
      <div class="today-actions-grid">
        <button class="button button--primary" id="todayAddExpenseBtn">+ Dépense</button>
        <button class="button" id="todayAddStepBtn">+ Étape</button>
        <button class="button" id="todayOpenPlanningBtn">Planning</button>
        <button class="button" id="todayOpenMapBtn">Carte</button>
      </div>
      <div class="today-mini-metrics">
        <article><span>Budget prévu</span><strong>${U.formatMoney(budget.plannedTotal, trip.currency)}</strong></article>
        <article><span>Réel saisi</span><strong>${U.formatMoney(budget.actualTotal, trip.currency)}</strong></article>
        <article><span>Alertes</span><strong>${Suggestions.evaluate(trip, state.settings).items.filter(item => item.level !== 'success').length}</strong></article>
      </div>
      ${alert ? `<div class="today-alert"><strong>À vérifier</strong><p>${U.escapeHtml(alert.message)}</p></div>` : `<div class="today-alert today-alert--ok"><strong>Tout semble cohérent</strong><p>Aucune alerte prioritaire pour le moment.</p></div>`}`;
    const steps = data.todaySteps.length ? data.todaySteps : U.sortSteps(trip.steps || []).slice(0, 6);
    timeline.innerHTML = `
      <div class="panel__header"><div><p class="eyebrow">Consultation rapide</p><h2>${data.todaySteps.length ? 'Programme du jour' : 'Prochaines étapes'}</h2></div></div>
      <div class="today-list">
        ${steps.length ? steps.map(step => `
          <article class="today-item">
            <span class="today-time">${[step.arrivalTime, step.departureTime ? `→ ${step.departureTime}` : ''].filter(Boolean).join(' ') || 'Horaire à préciser'}</span>
            <div><strong>${U.escapeHtml(step.name)}</strong><p>${U.escapeHtml(step.type || 'étape')} · ${step.address ? U.escapeHtml(step.address) : 'adresse à compléter'}</p></div>
            <button class="button" data-today-edit="${step.id}">Modifier</button>
          </article>
        `).join('') : '<div class="empty-state">Aucune étape. Ajoute ton premier lieu.</div>'}
      </div>`;
    timeline.querySelectorAll('[data-today-edit]').forEach(button => button.addEventListener('click', () => openStepDialog(button.dataset.todayEdit)));
    ['todayAddExpenseBtn','todayAddStepBtn','todayOpenPlanningBtn','todayOpenMapBtn'].forEach(id => {
      const old = document.getElementById(id);
      if (!old) return;
      if (id === 'todayAddExpenseBtn') old.addEventListener('click', () => openExpenseDialog());
      if (id === 'todayAddStepBtn') old.addEventListener('click', () => openStepDialog(null, new Date().toISOString().slice(0,10)));
      if (id === 'todayOpenPlanningBtn') old.addEventListener('click', () => switchView('itinerary'));
      if (id === 'todayOpenMapBtn') old.addEventListener('click', () => switchView('map'));
    });
  }

  function getTodayTravelData(trip) {
    const todayKey = new Date().toISOString().slice(0, 10);
    const steps = U.sortSteps(trip?.steps || []);
    const todaySteps = steps.filter(step => (step.arrivalDate || step.departureDate) === todayKey);
    const next = todaySteps[0] || steps.find(step => (step.arrivalDate || '') >= todayKey) || steps[0] || null;
    const currentLabel = todaySteps.length ? `Aujourd’hui · ${todaySteps.length} étape(s)` : (next ? 'Prochaine étape à préparer' : 'Aucun programme');
    return { todayKey, todaySteps, next, currentLabel };
  }

  function formatStepDateTime(step) {
    return [step.arrivalDate ? U.formatDate(step.arrivalDate) : '', step.arrivalTime || '', step.departureTime ? `départ ${step.departureTime}` : ''].filter(Boolean).join(' · ');
  }

  function openMapUrl(step) {
    if (U.isValidCoord(step)) return `https://www.openstreetmap.org/?mlat=${Number(step.lat)}&mlon=${Number(step.lng)}#map=15/${Number(step.lat)}/${Number(step.lng)}`;
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(step.address || step.name || '')}`;
  }


  function escapeAttr(value) {
    return U.escapeHtml(String(value || '')).replace(/"/g, '&quot;');
  }

  function getTripDurationDays(trip) {
    if (!trip?.startDate || !trip?.endDate) return 0;
    const start = new Date(`${trip.startDate}T00:00:00`);
    const end = new Date(`${trip.endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
  }

  function inferCommunityCategory(trip) {
    const text = `${trip?.style || ''} ${trip?.pace || ''} ${trip?.interests || ''} ${trip?.description || ''}`.toLowerCase();
    if (text.includes('road') || text.includes('voiture')) return 'roadtrip';
    if (text.includes('famille')) return 'famille';
    if (text.includes('plage')) return 'plage';
    if (text.includes('nature') || text.includes('randonnée')) return 'nature';
    if (text.includes('gastronomie') || text.includes('restaurant')) return 'gastronomie';
    if (text.includes('culture') || text.includes('musée')) return 'culture';
    if (text.includes('aventure')) return 'aventure';
    if (text.includes('économique') || text.includes('budget')) return 'budget';
    if (text.includes('confort')) return 'confort';
    return 'citybreak';
  }


  function isCommunityAdmin() {
    const email = (CloudSync?.getUser()?.email || '').toLowerCase();
    return email === ADMIN_EMAIL.toLowerCase();
  }


  function renderCommunity() {
    const grid = $('#communityGrid');
    if (!grid) return;
    const stats = $('#communityStats');
    const adminPanel = $('#communityAdminPanel');
    const countryFilter = $('#communityCountryFilter');
    const categoryFilter = $('#communityCategoryFilter');
    const sortFilter = $('#communitySortFilter');
    const searchInput = $('#communitySearchInput');

    const countries = [...new Set(communityTrips.map(item => item.country || item.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    if (countryFilter) {
      const selected = countryFilter.value;
      countryFilter.innerHTML = '<option value="">Tous les pays</option>' + countries.map(country => `<option value="${escapeAttr(country)}">${U.escapeHtml(country)}</option>`).join('');
      countryFilter.value = countries.includes(selected) ? selected : '';
    }

    if (communityLoading) {
      if (stats) stats.innerHTML = '';
      grid.innerHTML = '<div class="empty-state">Chargement des voyages partagés…</div>';
      return;
    }

    if (!CloudSync?.isConfigured()) {
      grid.innerHTML = '<div class="empty-state">Firebase doit être configuré pour afficher la communauté.</div>';
      return;
    }

    let list = [...communityTrips];
    const search = (searchInput?.value || '').trim().toLowerCase();
    const country = countryFilter?.value || '';
    const category = categoryFilter?.value || '';
    const sort = sortFilter?.value || 'trend';

    if (search) {
      list = list.filter(item => `${item.title} ${item.area} ${item.country} ${item.category} ${item.style} ${item.description} ${(item.highlights || []).join(' ')}`.toLowerCase().includes(search));
    }
    if (country) list = list.filter(item => (item.country || item.area) === country);
    if (category) list = list.filter(item => item.category === category);

    list.sort((a, b) => {
      if (sort === 'recent') return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
      if (sort === 'popular') return (Number(b.upVotes) || 0) - (Number(a.upVotes) || 0);
      if (sort === 'duration') return (Number(b.durationDays) || 0) - (Number(a.durationDays) || 0);
      if (sort === 'budgetLow') return (Number(a.publicBudget || 0) || 0) - (Number(b.publicBudget || 0) || 0);
      return (Number(b.trendScore) || 0) - (Number(a.trendScore) || 0) || String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
    });

    const totalVotes = communityTrips.reduce((sum, item) => sum + (Number(item.upVotes) || 0) + (Number(item.downVotes) || 0), 0);
    if (stats) {
      const topCountry = countries[0] || '—';
      stats.innerHTML = `
        <article class="stat-card"><span>Voyages publics</span><strong>${communityTrips.length}</strong></article>
        <article class="stat-card"><span>Pays / zones</span><strong>${countries.length}</strong></article>
        <article class="stat-card"><span>Votes</span><strong>${totalVotes}</strong></article>
        <article class="stat-card"><span>Résultats affichés</span><strong>${list.length}</strong></article>
      `;
    }
    if (adminPanel) {
      const admin = isCommunityAdmin();
      adminPanel.hidden = !admin;
      adminPanel.innerHTML = admin ? `<div class="admin-strip"><strong>Mode admin Lucas S.</strong><span>Tu peux retirer une publication de la communauté si elle est inadaptée.</span><span>${communityTrips.length} publication(s) surveillée(s)</span></div>` : '';
    }

    if (!communityLoaded && !communityTrips.length) {
      grid.innerHTML = '<div class="empty-state">Clique sur Actualiser pour charger les voyages partagés.</div>';
      return;
    }
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state">Aucun voyage ne correspond à ces filtres.</div>';
      return;
    }

    const user = CloudSync?.getUser();
    grid.innerHTML = list.map(item => {
      const userVote = user && item.votes ? Number(item.votes[user.uid]) || 0 : 0;
      const canCopy = item.allowCopy !== false && item.trip;
      const owner = user && item.ownerUid === user.uid;
      const admin = isCommunityAdmin();
      const budgetText = item.hideBudget ? 'Budget masqué' : `${U.formatMoney(item.publicBudget || 0, item.currency || '€')} estimé`;
      const highlights = (item.highlights || []).slice(0, 4).map(step => `<span>${U.escapeHtml(step)}</span>`).join('');
      const cover = item.coverImage ? `style="background-image:linear-gradient(180deg,rgba(7,23,57,.12),rgba(7,23,57,.72)),url('${escapeAttr(item.coverImage)}')"` : '';
      return `
        <article class="community-card">
          <div class="community-cover" ${cover}>
            <span class="community-pill">${U.escapeHtml(item.category || 'voyage')}</span>
            <span class="community-trend">🔥 ${Number(item.trendScore) || 0}</span>
          </div>
          <div class="community-card__body">
            <div class="community-card__head">
              <div>
                <h3>${U.escapeHtml(item.title || 'Voyage partagé')}</h3>
                <p>${U.escapeHtml(item.country || item.area || 'Zone non renseignée')} · ${Number(item.durationDays) || '?'} j · ${Number(item.stepsCount) || 0} étapes</p>
              </div>
              <span class="badge">${U.escapeHtml(item.style || 'style libre')}</span>
            </div>
            <p>${U.escapeHtml(item.description || 'Itinéraire partagé par la communauté.')}</p>
            <div class="community-highlights">${highlights || '<span>Étapes à découvrir</span>'}</div>
            <div class="community-meta">
              <span>👤 ${U.escapeHtml(item.ownerName || 'Voyageur')}</span>
              <span>💶 ${U.escapeHtml(budgetText)}</span>
              <span>👍 ${Number(item.upVotes) || 0} · 👎 ${Number(item.downVotes) || 0}</span>
            </div>
            <div class="community-actions">
              <button class="button ${userVote === 1 ? 'button--primary' : ''}" data-community-vote="1" data-community-id="${item.id}">+ Tendance</button>
              <button class="button ${userVote === -1 ? 'button--danger' : ''}" data-community-vote="-1" data-community-id="${item.id}">-</button>
              <button class="button" data-community-copy="${item.id}" ${canCopy ? '' : 'disabled'}>Copier</button>
              ${owner || admin ? `<button class="button button--danger" data-community-delete="${item.id}">${admin && !owner ? 'Admin retirer' : 'Retirer'}</button>` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');

    grid.querySelectorAll('[data-community-vote]').forEach(button => button.addEventListener('click', () => voteCommunityTrip(button.dataset.communityId, Number(button.dataset.communityVote))));
    grid.querySelectorAll('[data-community-copy]').forEach(button => button.addEventListener('click', () => copyCommunityTrip(button.dataset.communityCopy)));
    grid.querySelectorAll('[data-community-delete]').forEach(button => button.addEventListener('click', () => deleteCommunityTrip(button.dataset.communityDelete)));
  }

  async function loadCommunityTrips(force = false) {
    if (!CloudSync?.isConfigured() || communityLoading || (communityLoaded && !force)) {
      renderCommunity();
      return;
    }
    communityLoading = true;
    renderCommunity();
    try {
      await CloudSync.init();
      communityTrips = await CloudSync.listCommunityTrips();
      communityLoaded = true;
    } catch (error) {
      console.error(error);
      showStatus(error.message || 'Impossible de charger la communauté.');
    } finally {
      communityLoading = false;
      renderCommunity();
    }
  }

  function openCommunityPublishDialog() {
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    if (!trip) return showStatus('Crée ou sélectionne un voyage à partager.');
    const form = $('#communityPublishForm');
    form.reset();
    form.elements.title.value = trip.name || '';
    form.elements.country.value = trip.area || '';
    form.elements.category.value = inferCommunityCategory(trip);
    form.elements.coverImage.value = trip.coverImage || '';
    form.elements.description.value = trip.description || '';
    $('#communityPublishDialog').showModal();
  }

  function buildCommunityPayload(trip, form) {
    const data = new FormData(form);
    const hideBudget = Boolean(data.get('hideBudget'));
    const hideNotes = Boolean(data.get('hideNotes'));
    const allowCopy = Boolean(data.get('allowCopy'));
    const budget = Budget.computeBudget(trip);
    const steps = U.sortSteps(trip.steps || []);
    const publicSteps = steps.map((step, index) => ({
      id: step.id || U.uid('step'),
      order: index,
      name: step.name || `Étape ${index + 1}`,
      type: step.type || 'ville',
      lat: step.lat === '' || step.lat == null ? '' : Number(step.lat),
      lng: step.lng === '' || step.lng == null ? '' : Number(step.lng),
      address: step.address || '',
      arrivalDate: step.arrivalDate || '',
      arrivalTime: step.arrivalTime || '',
      departureDate: step.departureDate || '',
      departureTime: step.departureTime || '',
      duration: step.duration || '',
      cost: hideBudget ? 0 : Number(step.cost) || 0,
      priority: step.priority || 'optionnel',
      color: step.color || '#2563eb',
      notes: hideNotes ? '' : (step.notes || ''),
      links: [],
      transportToNext: step.transportToNext || 'car',
      segmentCost: hideBudget ? 0 : Number(step.segmentCost) || 0,
      segmentNote: hideNotes ? '' : (step.segmentNote || '')
    }));
    const publicTrip = Storage.normalizeTrip({
      id: trip.id,
      name: String(data.get('title') || trip.name || 'Voyage partagé'),
      description: String(data.get('description') || trip.description || ''),
      area: String(data.get('country') || trip.area || ''),
      coverImage: String(data.get('coverImage') || trip.coverImage || ''),
      startDate: trip.startDate || '',
      endDate: trip.endDate || '',
      travellers: trip.travellers || 1,
      currency: trip.currency || '€',
      status: 'public',
      style: trip.style || 'équilibré',
      pace: trip.pace || 'normal',
      interests: trip.interests || '',
      steps: publicSteps,
      expenses: hideBudget ? [] : (trip.expenses || []).map(expense => ({ ...expense, note: '' })),
      checklists: {}
    });
    return {
      sourceTripId: trip.id,
      title: String(data.get('title') || trip.name || 'Voyage partagé'),
      country: String(data.get('country') || trip.area || ''),
      area: String(data.get('country') || trip.area || ''),
      category: String(data.get('category') || inferCommunityCategory(trip)),
      style: trip.style || 'équilibré',
      pace: trip.pace || 'normal',
      interests: trip.interests || '',
      description: String(data.get('description') || trip.description || ''),
      coverImage: String(data.get('coverImage') || trip.coverImage || ''),
      currency: trip.currency || '€',
      publicBudget: hideBudget ? 0 : Number(budget.total) || 0,
      hideBudget,
      hideNotes,
      allowCopy,
      durationDays: getTripDurationDays(trip),
      stepsCount: steps.length,
      highlights: steps.slice(0, 6).map(step => step.name).filter(Boolean),
      trip: publicTrip
    };
  }

  async function publishCommunityTrip(event) {
    event.preventDefault();
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    if (!trip) return;
    try {
      await flushCloudAutosave();
      const doc = await CloudSync.publishCommunityTrip(buildCommunityPayload(trip, event.currentTarget));
      $('#communityPublishDialog').close();
      communityLoaded = false;
      await loadCommunityTrips(true);
      switchView('community');
      showStatus(`Voyage publié dans la communauté : ${doc.title}.`);
    } catch (error) {
      console.error(error);
      showStatus(error.message || 'Publication impossible.');
    }
  }

  async function voteCommunityTrip(id, value) {
    try {
      if (!CloudSync?.getUser()) {
        showStatus('Connecte-toi avec Google pour voter.');
        await handleCloudSignIn();
        return;
      }
      const updated = await CloudSync.voteCommunityTrip(id, value);
      const index = communityTrips.findIndex(item => item.id === id);
      if (index >= 0) communityTrips[index] = updated;
      renderCommunity();
    } catch (error) {
      console.error(error);
      showStatus(error.message || 'Vote impossible.');
    }
  }

  async function copyCommunityTrip(id) {
    const item = communityTrips.find(entry => entry.id === id);
    if (!item?.trip) return showStatus('Voyage communautaire introuvable.');
    if (!appReady || !CloudSync?.getUser()) {
      showStatus('Connecte-toi avec Google pour copier ce voyage.');
      await handleCloudSignIn();
      return;
    }
    const copy = Storage.normalizeTrip({
      ...U.clone(item.trip),
      id: U.uid('trip'),
      name: `${item.title || item.trip.name} — inspiration`,
      status: 'brouillon',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    state = Storage.upsertTrip(state, copy);
    scheduleCloudAutosave();
    renderAll();
    switchView('trip');
    showStatus('Voyage copié dans ton espace.');
  }

  async function deleteCommunityTrip(id) {
    const ok = await confirmAction('Retirer ce voyage de la communauté ?', 'La publication publique sera supprimée, mais ton voyage privé restera dans ton espace.');
    if (!ok) return;
    try {
      await CloudSync.deleteCommunityTrip(id);
      communityTrips = communityTrips.filter(item => item.id !== id);
      renderCommunity();
      showStatus('Publication communautaire supprimée.');
    } catch (error) {
      console.error(error);
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
    ['name', 'description', 'area', 'coverImage', 'startDate', 'endDate', 'travellersNames', 'currency', 'status', 'style', 'pace', 'interests'].forEach(key => { trip[key] = String(data.get(key) || ''); });
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

  function openStepDialog(stepId = null, presetDate = '') {
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
    if (form.elements.address) form.elements.address.value = step?.address || '';
    if (form.elements.arrivalTime) form.elements.arrivalTime.value = step?.arrivalTime || '';
    if (form.elements.departureTime) form.elements.departureTime.value = step?.departureTime || '';
    form.elements.arrivalDate.value = step?.arrivalDate || presetDate || '';
    form.elements.departureDate.value = step?.departureDate || presetDate || '';
    updateStepDateStatus();
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
      links: U.linksToArray(data.get('links')),
      notes: String(data.get('notes') || ''),
      transportToNext: existing?.transportToNext || 'car',
      segmentCost: existing?.segmentCost || 0,
      segmentNote: existing?.segmentNote || '',
      journal: existing?.journal || { notes: '', photoLinks: '', rating: '', realExpenses: '', weather: '', afterthoughts: '' }
    };
    const validation = validateStepDates(step);
    if (!validation.ok) {
      showStatus(validation.message);
      updateStepDateStatus(validation.message);
      return;
    }
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
    Itinerary.renderDayPlanner($('#dayPlannerBoard'), trip, state.settings, {
      addStep: date => openStepDialog(null, date),
      editStep: openStepDialog,
      moveStepToDay: (stepId, date) => {
        const current = activeTrip();
        const step = current?.steps.find(item => item.id === stepId);
        if (!step) return;
        step.arrivalDate = date;
        if (!step.departureDate || step.departureDate < date) step.departureDate = date;
        persist('Étape déplacée.');
      }
    });
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
    renderBudgetAlerts(trip);
    Budget.renderDaily($('#budgetDaily'), trip);
    Budget.renderPeople($('#budgetPeople'), trip);
    Budget.renderBreakdown($('#budgetBreakdown'), trip);
    Budget.drawChart($('#budgetChart'), trip);
    Budget.renderExpenses($('#expensesList'), trip, { edit: openExpenseDialog, delete: deleteExpense });
  }

  function renderBudgetAlerts(trip) {
    const container = $('#budgetAlerts');
    if (!container) return;
    if (!trip) {
      container.innerHTML = '';
      return;
    }
    const budget = Budget.computeBudget(trip);
    const alerts = [];
    if (budget.max && budget.total > budget.max) alerts.push(`Budget prévu dépassé de ${U.formatMoney(budget.total - budget.max, trip.currency)}.`);
    if (budget.actualTotal > budget.plannedTotal && budget.plannedTotal > 0) alerts.push(`Les dépenses réelles dépassent le prévu de ${U.formatMoney(budget.actualTotal - budget.plannedTotal, trip.currency)}.`);
    const names = budget.names || [];
    const unbalanced = names.filter(name => Math.abs(budget.balances?.[name]?.balance || 0) > 1);
    if (unbalanced.length > 1) alerts.push('Répartition type TriCount : certaines personnes doivent équilibrer les paiements.');
    container.innerHTML = alerts.length ? alerts.map(text => `<div class="budget-alert">⚠️ ${U.escapeHtml(text)}</div>`).join('') : '<div class="budget-ok">✅ Budget cohérent pour le moment.</div>';
  }

  function openExpenseDialog(expenseId = null) {
    const trip = activeTrip();
    if (!trip) return showStatus('Crée d’abord un voyage.');
    const form = $('#expenseForm');
    form.reset();
    const names = Budget.travellerNames(trip);
    form.elements.stepId.innerHTML = '<option value="">Aucune étape</option>' + U.sortSteps(trip.steps).map(step => `<option value="${step.id}">${U.escapeHtml(step.name)}</option>`).join('');
    form.elements.paidBy.innerHTML = '<option value="">Non renseigné</option>' + names.map(name => `<option value="${U.escapeHtml(name)}">${U.escapeHtml(name)}</option>`).join('');
    const expense = trip.expenses.find(item => item.id === expenseId);
    $('#expenseDialogTitle').textContent = expense ? 'Modifier une dépense' : 'Ajouter une dépense';
    form.elements.id.value = expense?.id || '';
    form.elements.label.value = expense?.label || '';
    form.elements.category.value = expense?.category || 'autres';
    form.elements.plannedAmount.value = expense?.plannedAmount ?? expense?.amount ?? '';
    form.elements.actualAmount.value = expense?.actualAmount ?? expense?.realAmount ?? '';
    form.elements.status.value = expense?.status || 'prévue';
    form.elements.paidBy.value = expense?.paidBy || '';
    form.elements.date.value = expense?.date || '';
    form.elements.stepId.value = expense?.stepId || '';
    form.elements.note.value = expense?.note || '';
    const split = new Set(expense?.splitBetween || expense?.splitWith || names);
    $('#expenseSplitPeople').innerHTML = names.map(name => `
      <label class="chip-check"><input type="checkbox" name="splitBetween" value="${U.escapeHtml(name)}" ${split.has(name) ? 'checked' : ''} /> <span>${U.escapeHtml(name)}</span></label>
    `).join('');
    $('#expenseDialog').showModal();
  }

  function saveExpenseForm(event) {
    event.preventDefault();
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    if (!trip) return;
    const data = new FormData(event.currentTarget);
    const id = data.get('id') || U.uid('expense');
    const plannedAmount = Number(data.get('plannedAmount')) || 0;
    const actualAmount = Number(data.get('actualAmount')) || 0;
    const expense = {
      id,
      label: String(data.get('label') || 'Dépense'),
      category: String(data.get('category') || 'autres'),
      plannedAmount,
      actualAmount,
      amount: plannedAmount,
      status: String(data.get('status') || 'prévue'),
      paidBy: String(data.get('paidBy') || ''),
      splitBetween: data.getAll('splitBetween').map(String),
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
    Suggestions.render($('#scorePanel'), $('#suggestionsList'), activeTrip(), state.settings, { onFix: applySuggestionFix });
  }

  function applySuggestionFix(action) {
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    if (!trip || !action) return;
    trip.checklists ||= U.createDefaultChecklists();
    trip.expenses ||= [];
    const addTask = (listName, text) => {
      trip.checklists[listName] ||= [];
      if (!trip.checklists[listName].some(item => String(item.text || '').toLowerCase() === text.toLowerCase())) {
        trip.checklists[listName].push({ id: U.uid('todo'), text, done: false });
      }
    };
    if (action === 'budget-basics') {
      ['transport','logement','nourriture'].forEach(category => {
        if (!trip.expenses.some(expense => expense.category === category)) {
          trip.expenses.push({ id: U.uid('expense'), label: `Budget ${category}`, category, plannedAmount: 0, actualAmount: 0, amount: 0, status: 'prévue', date: '', paidBy: '', splitBetween: Budget.travellerNames(trip), note: 'Ajouté automatiquement depuis l’assistant.' });
        }
      });
      persist('Postes de budget ajoutés.');
      switchView('budget');
      return;
    }
    if (action === 'airport-task') {
      addTask('avion', 'Vérifier numéro de vol, terminal et marge avant départ');
      addTask('transferts', 'Prévoir le transfert aéroport ↔ logement');
      persist('Tâches aéroport ajoutées.');
      switchView('preparation');
      return;
    }
    if (action === 'hotel-task') {
      addTask('logement', 'Ajouter ou vérifier les hébergements de chaque nuit');
      persist('Tâche logement ajoutée.');
      switchView('preparation');
      return;
    }
    if (action === 'prep-task') {
      addTask('avant départ', 'Vérifier les documents, réservations, budget et transports');
      persist('Tâche de préparation ajoutée.');
      switchView('preparation');
      return;
    }
    if (action === 'time-check') {
      addTask('planning', 'Vérifier les horaires incohérents ou trop serrés');
      persist('Tâche horaire ajoutée.');
      switchView('itinerary');
      return;
    }
    if (action === 'comfort-transfer') {
      addTask('transferts', 'Ajouter les horaires et notes de transfert pour les trajets importants');
      persist('Tâche transfert ajoutée.');
      switchView('preparation');
      return;
    }
    addTask('avant départ', 'Vérifier : ' + action);
    persist('Tâche ajoutée.');
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
    MapView.renderRoutes?.($('#mapRoutesList'), trip, state.settings, (stepId, field, value) => {
      const current = activeTrip();
      const step = current?.steps.find(item => item.id === stepId);
      if (!step) return;
      step[field] = field === 'segmentCost' ? Number(value) || 0 : value;
      persist('Trajet mis à jour.');
    });
    MapView.renderMapSteps($('#mapStepsList'), trip);
    MapView.updateMap(trip, state.settings);
  }

  function renderTripTemplates() {
    const container = $('#tripTemplates');
    if (!container) return;
    const templates = [
      { key: 'citybreak', title: 'City break', icon: '🏙️', desc: '2 à 4 jours, visites, restaurants, hôtel central.' },
      { key: 'roadtrip', title: 'Roadtrip', icon: '🚗', desc: 'Trajets, pauses, carburant, étapes intermédiaires.' },
      { key: 'plane', title: 'Voyage en avion', icon: '✈️', desc: 'Aéroport, vols, transferts et marges horaires.' },
      { key: 'nature', title: 'Nature / aventure', icon: '🥾', desc: 'Randonnée, météo, santé, checklist terrain.' }
    ];
    container.innerHTML = templates.map(t => `<button type="button" class="template-card" data-template-create="${t.key}"><span>${t.icon}</span><strong>${t.title}</strong><small>${t.desc}</small></button>`).join('');
    container.querySelectorAll('[data-template-create]').forEach(button => button.addEventListener('click', () => createTripFromTemplate(button.dataset.templateCreate)));
  }

  function createTripFromTemplate(template = 'citybreak') {
    if (!requireCloudReady()) return;
    const presets = {
      citybreak: { name: 'Nouveau city break', style: 'équilibré', pace: 'normal', interests: 'ville, culture, gastronomie', area: '' },
      roadtrip: { name: 'Nouveau roadtrip', style: 'aventure', pace: 'normal', interests: 'route, nature, points de vue', area: '' },
      plane: { name: 'Nouveau voyage en avion', style: 'confort', pace: 'normal', interests: 'ville, culture, transports', area: '' },
      nature: { name: 'Nouvelle aventure nature', style: 'aventure', pace: 'tranquille', interests: 'nature, randonnée, photo', area: '' }
    };
    const trip = Storage.normalizeTrip({ ...(presets[template] || presets.citybreak), currency: '€', travellers: 1, status: 'brouillon', steps: [], expenses: [] });
    trip.checklists = U.createDefaultChecklists();
    if (template === 'roadtrip') trip.checklists.voiture ||= [{ id: U.uid('todo'), text: 'Vérifier le véhicule', done: false }];
    if (template === 'plane') trip.checklists.avion ||= [{ id: U.uid('todo'), text: 'Check-in en ligne', done: false }];
    if (template === 'nature') trip.checklists.randonnée ||= [{ id: U.uid('todo'), text: 'Vérifier la météo', done: false }];
    state = Storage.upsertTrip(state, trip);
    renderAll();
    scheduleCloudAutosave();
    switchView('trip');
    showStatus('Modèle de voyage créé.');
  }

  function openWizardDialog() {
    if (!requireCloudReady()) return;
    const dialog = $('#tripWizardDialog');
    const form = $('#tripWizardForm');
    if (!dialog || !form) return;
    form.reset();
    dialog.showModal();
  }

  function saveWizardTrip(event) {
    event.preventDefault();
    if (!requireCloudReady()) return;
    const data = new FormData(event.currentTarget);
    const template = String(data.get('template') || '');
    const trip = Storage.normalizeTrip({
      name: String(data.get('name') || 'Nouveau voyage'),
      area: String(data.get('area') || ''),
      coverImage: String(data.get('coverImage') || ''),
      startDate: String(data.get('startDate') || ''),
      endDate: String(data.get('endDate') || ''),
      travellersNames: String(data.get('travellersNames') || ''),
      travellers: Math.max(1, String(data.get('travellersNames') || '').split(',').filter(Boolean).length || 1),
      maxBudget: Number(data.get('maxBudget')) || 0,
      currency: String(data.get('currency') || '€'),
      style: String(data.get('style') || 'équilibré'),
      pace: String(data.get('pace') || 'normal'),
      interests: String(data.get('interests') || ''),
      description: String(data.get('description') || ''),
      status: 'brouillon',
      steps: []
    });
    const startName = String(data.get('startPlace') || '').trim();
    const endName = String(data.get('endPlace') || '').trim();
    if (startName) trip.steps.push({ order: 0, name: startName, type: template === 'plane' ? 'aéroport' : 'ville', arrivalDate: trip.startDate, departureDate: trip.startDate, color: '#2563eb', priority: 'indispensable', transportToNext: template === 'plane' ? 'plane' : 'car' });
    if (endName) trip.steps.push({ order: trip.steps.length, name: endName, type: 'ville', arrivalDate: trip.endDate || trip.startDate, departureDate: trip.endDate || trip.startDate, color: '#14b8a6', priority: 'indispensable' });
    state = Storage.upsertTrip(state, trip);
    $('#tripWizardDialog').close();
    renderAll();
    scheduleCloudAutosave();
    switchView('itinerary');
    showStatus('Voyage guidé créé.');
  }

  function renderGlobalSearch() {
    const input = $('#globalSearchInput');
    const box = $('#globalSearchResults');
    if (!input || !box) return;
    const query = input.value.trim().toLowerCase();
    if (!query || !appReady) return hideGlobalSearch();
    const results = [];
    (state.trips || []).forEach(trip => {
      if (`${trip.name} ${trip.area} ${trip.description}`.toLowerCase().includes(query)) results.push({ label: `Voyage · ${trip.name}`, view: 'dashboard', tripId: trip.id });
      (trip.steps || []).forEach(step => {
        if (`${step.name} ${step.address} ${step.notes} ${step.type}`.toLowerCase().includes(query)) results.push({ label: `Étape · ${step.name}`, view: 'itinerary', tripId: trip.id });
      });
      (trip.expenses || []).forEach(expense => {
        if (`${expense.label} ${expense.category} ${expense.note}`.toLowerCase().includes(query)) results.push({ label: `Dépense · ${expense.label}`, view: 'budget', tripId: trip.id });
      });
    });
    if (!results.length) return hideGlobalSearch();
    box.hidden = false;
    box.innerHTML = results.slice(0, 8).map((result, index) => `<button type="button" data-search-index="${index}">${U.escapeHtml(result.label)}</button>`).join('');
    box.querySelectorAll('[data-search-index]').forEach(button => button.addEventListener('click', () => {
      const result = results[Number(button.dataset.searchIndex)];
      state.activeTripId = result.tripId;
      state = Storage.save(state);
      renderAll();
      switchView(result.view);
      hideGlobalSearch();
      input.value = '';
    }));
  }

  function hideGlobalSearch() {
    const box = $('#globalSearchResults');
    if (box) { box.hidden = true; box.innerHTML = ''; }
  }

  function addChecklistBlock() {
    if (!requireCloudReady()) return;
    const trip = activeTrip();
    if (!trip) return showStatus('Sélectionne un voyage.');
    const name = prompt('Nom du nouveau bloc ?', 'nouvelle liste');
    if (!name) return;
    trip.checklists ||= U.createDefaultChecklists();
    if (!trip.checklists[name]) trip.checklists[name] = [];
    persist('Bloc de préparation ajouté.');
  }

  function toggleFabMenu() {
    const menu = $('#fabMenu');
    if (menu) menu.hidden = !menu.hidden;
  }

  function closeFabMenu() {
    const menu = $('#fabMenu');
    if (menu) menu.hidden = true;
  }

  function bindShareActions() {
    const bind = (id, handler) => document.getElementById(id)?.addEventListener('click', handler);
    bind('createPublicShareBtn', createPublicShare);
    bind('createPrivateShareBtn', createPrivateShare);
    bind('copyShareLinkBtn', copyShareLink);
  }

  function openShareDialog() {
    if (!requireCloudReady()) return;
    const dialog = $('#shareDialog');
    if (!dialog) return showStatus('Module de partage introuvable.');
    $('#shareLinkInput').value = '';
    dialog.showModal();
  }

  function publicTripUrl(kind = 'share') {
    const trip = activeTrip();
    if (!trip) return location.href.split('#')[0];
    return `${location.href.split('#')[0]}#${kind}:${encodeURIComponent(trip.id)}`;
  }

  function createPublicShare() {
    $('#shareLinkInput').value = publicTripUrl('share');
    showStatus('Lien lecture seule préparé.');
  }

  function createPrivateShare() {
    $('#shareLinkInput').value = publicTripUrl('collab');
    showStatus('Lien de collaboration préparé. Vérifie les emails autorisés.');
  }

  async function copyShareLink() {
    const value = $('#shareLinkInput')?.value || publicTripUrl('share');
    try { await navigator.clipboard.writeText(value); showStatus('Lien copié.'); }
    catch { showStatus('Copie impossible. Sélectionne le lien manuellement.'); }
  }

  function bindPlaceSearch() {
    const input = $('#placeSearchInput');
    const button = $('#placeSearchBtn');
    if (!input || !button || !window.TravelGeocoder) return;
    button.addEventListener('click', runPlaceSearch);
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); runPlaceSearch(); } });
  }

  async function runPlaceSearch() {
    const input = $('#placeSearchInput');
    const status = $('#placeSearchStatus');
    const results = $('#placeSearchResults');
    const query = input?.value?.trim();
    if (!query || !window.TravelGeocoder) return;
    status.textContent = 'Recherche…';
    results.hidden = true;
    results.innerHTML = '';
    try {
      const items = await window.TravelGeocoder.search(query, { trip: activeTrip() });
      if (!items.length) {
        status.textContent = 'Aucun résultat trouvé.';
        return;
      }
      status.textContent = `${items.length} résultat(s)`;
      results.hidden = false;
      results.innerHTML = items.slice(0, 6).map((item, index) => `<button type="button" data-place-index="${index}"><strong>${U.escapeHtml(item.name)}</strong><small>${U.escapeHtml(item.address || '')}</small></button>`).join('');
      results.querySelectorAll('[data-place-index]').forEach(button => button.addEventListener('click', () => applyPlaceResult(items[Number(button.dataset.placeIndex)])));
    } catch (error) {
      console.error(error);
      status.textContent = 'Recherche indisponible pour le moment.';
    }
  }

  function applyPlaceResult(item) {
    const form = $('#stepForm');
    if (!form || !item) return;
    form.elements.name.value = item.name || form.elements.name.value;
    form.elements.address.value = item.address || '';
    form.elements.lat.value = item.lat || '';
    form.elements.lng.value = item.lng || '';
    if (item.type && [...form.elements.type.options].some(option => option.value === item.type)) form.elements.type.value = item.type;
    $('#placeSearchResults').hidden = true;
    $('#placeSearchStatus').textContent = 'Lieu appliqué à l’étape.';
  }

  function bindStepDateGuards() {
    const form = $('#stepForm');
    if (!form) return;
    ['arrivalDate', 'arrivalTime', 'departureDate', 'departureTime'].forEach(name => form.elements[name]?.addEventListener('change', () => {
      normalizeStepDatesInForm(form);
      updateStepDateStatus();
    }));
  }

  function normalizeStepDatesInForm(form) {
    if (!form) return;
    const arrivalDate = form.elements.arrivalDate.value;
    if (arrivalDate && !form.elements.departureDate.value) form.elements.departureDate.value = arrivalDate;
    if (arrivalDate && form.elements.departureDate.value && form.elements.departureDate.value < arrivalDate) form.elements.departureDate.value = arrivalDate;
    if (arrivalDate && form.elements.departureDate.value === arrivalDate && form.elements.arrivalTime.value && form.elements.departureTime.value && form.elements.departureTime.value < form.elements.arrivalTime.value) {
      form.elements.departureTime.value = form.elements.arrivalTime.value;
    }
  }

  function validateStepDates(step) {
    if (!step.arrivalDate || !step.departureDate) return { ok: true };
    if (step.departureDate < step.arrivalDate) return { ok: false, message: 'Le départ ne peut pas être avant l’arrivée.' };
    if (step.departureDate === step.arrivalDate && step.arrivalTime && step.departureTime && step.departureTime < step.arrivalTime) return { ok: false, message: 'L’heure de départ ne peut pas être avant l’heure d’arrivée.' };
    return { ok: true };
  }

  function updateStepDateStatus(message = '') {
    const status = $('#stepDateStatus');
    if (!status) return;
    if (message) {
      status.textContent = message;
      status.classList.add('is-error');
      return;
    }
    status.classList.remove('is-error');
    status.textContent = 'Indique quand tu arrives sur place, puis quand tu repars. Le départ ne peut pas être avant l’arrivée.';
  }

  function renderLegalYear() {
    const year = $('#legalYear');
    if (year) year.textContent = new Date().getFullYear();
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
    const protectedControls = ['newTripBtn', 'createFirstTripBtn', 'loadDemoBtn', 'tripSelector', 'saveSettingsBtn'];

    document.body.classList.toggle('is-cloud-locked', !appReady || !user);

    if (statusEl) statusEl.textContent = status || (configured ? 'Connexion Google requise.' : 'Firebase non configuré.');
    if (profile) profile.hidden = !user;
    if (avatar && user) avatar.src = user.photoURL || '';
    if (name && user) name.textContent = user.displayName || 'Compte Google';
    if (email && user) email.textContent = user.email || '';
    if (topButton) {
      topButton.classList.toggle('is-connected', Boolean(user));
      topButton.innerHTML = user
        ? `<span class="cloud-dot"></span><span>Connecté</span>`
        : `<span class="cloud-dot"></span><span>Connexion Google</span>`;
    }
    if (signInBtn) {
      signInBtn.disabled = !configured || Boolean(user);
      signInBtn.textContent = user ? 'Connecté avec Google' : 'Se connecter avec Google';
    }
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
      showStatus(error.message || 'Connexion Google impossible.');
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
    const ok = await confirmAction('Supprimer toutes les données Firebase ?', 'Tous les voyages de ce compte Google seront supprimés de Firestore. Cette action est définitive.');
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
