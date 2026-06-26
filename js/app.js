(function () {
  'use strict';

  const U = window.TravelUtils;
  const Storage = window.TravelStorage;
  const Budget = window.TravelBudget;
  const Itinerary = window.TravelItinerary;
  const Suggestions = window.TravelSuggestions;
  const MapView = window.TravelMap;
  const Cloud = window.TravelCloudSync;

  const APP_VERSION = 'V4.12 — réparation stable';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const byId = id => document.getElementById(id);

  let state = Storage.load();
  let cloudLoading = true;
  let appReady = false;
  let currentView = 'dashboard';
  let autosaveTimer = null;
  let autosaveInterval = null;
  let lastSavedAt = '';
  let communityTrips = [];

  const titles = {
    dashboard: 'Tableau de bord',
    today: 'Aujourd’hui',
    community: 'Communauté',
    trip: 'Créer ou modifier un voyage',
    map: 'Carte du voyage',
    itinerary: 'Planning',
    budget: 'Budget',
    suggestions: 'Suggestions',
    preparation: 'Préparation',
    journal: 'Carnet de voyage',
    settings: 'Paramètres'
  };

  function init() {
    try {
      populateStaticSelects();
      bindNavigation();
      bindActions();
      bindGeocoder();
      byId('legalYear') && (byId('legalYear').textContent = new Date().getFullYear());
      applyTheme(state.settings?.theme || 'light');
      renderAll();
      switchView(location.hash?.replace('#', '') || 'dashboard', { replace: true });
      initCloud();
    } catch (error) {
      console.error(error);
      emergencyRender(error);
    }
  }

  function emergencyRender(error) {
    const main = $('.main') || document.body;
    main.innerHTML = `<section class="panel"><p class="eyebrow">Réparation</p><h1>Travel Planner</h1><p>Une erreur a été interceptée au démarrage.</p><pre>${U.escapeHtml(error?.message || String(error))}</pre><button class="button button--primary" onclick="location.reload()">Recharger</button></section>`;
  }

  function activeTrip() { return appReady ? Storage.getTrip(state) : null; }
  function hasUser() { return Boolean(Cloud?.getUser?.()); }
  function safeArray(value) { return Array.isArray(value) ? value : []; }

  function populateStaticSelects() {
    const type = $('#stepForm select[name="type"]');
    if (type) type.innerHTML = U.placeTypes.map(t => `<option value="${t}">${t}</option>`).join('');
    const cat = $('#expenseForm select[name="category"]');
    if (cat) cat.innerHTML = U.expenseCategories.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  function bindNavigation() {
    $$('[data-view-link]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.viewLink)));
    window.addEventListener('hashchange', () => switchView(location.hash.replace('#', '') || 'dashboard', { fromHash: true }));
  }

  function bindActions() {
    on('newTripBtn', 'click', () => requireReady() && openWizardOrCreate());
    on('createFirstTripBtn', 'click', () => requireReady() && openWizardOrCreate());
    on('openWizardBtn', 'click', () => requireReady() && openWizard());
    on('tripWizardForm', 'submit', saveWizard);
    on('tripSelector', 'change', e => { if (!requireReady()) return; state.activeTripId = e.target.value; persist('Voyage sélectionné.'); });
    on('themeToggle', 'click', () => { state.settings.theme = document.body.classList.contains('dark') ? 'light' : 'dark'; applyTheme(state.settings.theme); persist(); });
    on('tripForm', 'submit', saveTripForm);
    on('addStepBtn', 'click', () => requireReady() && openStepDialog());
    on('stepForm', 'submit', saveStepForm);
    on('addExpenseBtn', 'click', () => requireReady() && openExpenseDialog());
    on('expenseForm', 'submit', saveExpenseForm);
    on('fitMapBtn', 'click', () => MapView.fitBounds());
    on('refreshItineraryBtn', 'click', renderItinerary);
    on('optimizeBtn', 'click', optimizeActiveTrip);
    on('addChecklistBlockBtn', 'click', addChecklistBlock);
    on('saveSettingsBtn', 'click', saveSettings);
    on('cloudAuthBtn', 'click', handleCloudButton);
    on('cloudSignInBtn', 'click', handleSignIn);
    on('cloudSignOutBtn', 'click', handleSignOut);
    on('deleteCloudDataBtn', 'click', deleteCloudData);
    on('communityPublishBtn', 'click', openCommunityPublishDialog);
    on('communityRefreshBtn', 'click', loadCommunity);
    on('communityPublishForm', 'submit', publishCommunity);
    ['communitySearchInput', 'communityCountryFilter', 'communityCategoryFilter', 'communitySortFilter'].forEach(id => on(id, 'input', renderCommunity));
    on('createPublicShareBtn', 'click', createPublicShare);
    on('createPrivateShareBtn', 'click', createPrivateShare);
    on('copyShareLinkBtn', 'click', () => copyText(byId('shareLinkInput')?.value));
    on('globalSearchInput', 'input', renderGlobalSearch);
    on('fabMainBtn', 'click', toggleFab);
    on('fabAddTrip', 'click', () => { toggleFab(false); openWizardOrCreate(); });
    on('fabAddStep', 'click', () => { toggleFab(false); openStepDialog(); });
    on('fabAddExpense', 'click', () => { toggleFab(false); openExpenseDialog(); });
    on('fabOpenToday', 'click', () => { toggleFab(false); switchView('today'); });
    on('fabOpenChecklist', 'click', () => { toggleFab(false); switchView('preparation'); });
    $$('[data-close-dialog]').forEach(btn => btn.addEventListener('click', () => closeDialog(btn.dataset.closeDialog)));
    window.addEventListener('resize', () => MapView.invalidate());
    bindStepDateLogic();
  }

  function on(id, event, handler) { const el = byId(id); if (el) el.addEventListener(event, handler); }
  function closeDialog(id) { const dialog = byId(id); if (dialog?.open) dialog.close('cancel'); }
  function openDialog(id) { const dialog = byId(id); if (dialog && !dialog.open) dialog.showModal(); }

  function switchView(view, options = {}) {
    if (String(view || '').startsWith('share/')) view = 'dashboard';
    if (!titles[view]) view = 'dashboard';
    if (!appReady && !['dashboard', 'settings', 'community'].includes(view)) view = 'dashboard';
    currentView = view;
    if (!options.fromHash) {
      const newHash = `#${view}`;
      if (options.replace) history.replaceState(null, '', newHash); else if (location.hash !== newHash) location.hash = view;
    }
    $$('.view').forEach(section => section.classList.toggle('is-visible', section.id === `view-${view}`));
    $$('.nav-item').forEach(item => item.classList.toggle('is-active', item.dataset.viewLink === view));
    if (byId('pageTitle')) byId('pageTitle').textContent = titles[view];
    if (view === 'map') { MapView.initMap(); renderMap(); MapView.invalidate(); }
    if (view === 'budget') renderBudget();
    if (view === 'suggestions') renderSuggestions();
    if (view === 'itinerary') renderItinerary();
    if (view === 'today') renderToday();
    if (view === 'community') renderCommunity();
  }

  function renderAll() {
    safeRender(renderTripSelector);
    safeRender(renderDashboard);
    safeRender(renderToday);
    safeRender(renderCommunity);
    safeRender(renderTripForm);
    safeRender(renderSteps);
    safeRender(renderItinerary);
    safeRender(renderBudget);
    safeRender(renderSuggestions);
    safeRender(renderChecklists);
    safeRender(renderJournal);
    safeRender(renderSettings);
    safeRender(renderMap);
    updateCloudUi();
  }
  function safeRender(fn) { try { fn(); } catch (e) { console.error(`Erreur ${fn.name}`, e); showStatus(`Erreur ${fn.name}: ${e.message}`); } }

  function requireReady() {
    if (appReady && hasUser()) return true;
    showStatus('Connecte-toi avec Google pour utiliser le planificateur.');
    handleSignIn();
    return false;
  }

  function showStatus(message) {
    const banner = byId('statusBanner');
    if (!banner) return;
    banner.textContent = message || '';
    banner.hidden = !message;
    clearTimeout(showStatus.timer);
    if (message) showStatus.timer = setTimeout(() => { banner.hidden = true; }, 3500);
  }

  function applyTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
    if (byId('themeToggle')) byId('themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  function renderTripSelector() {
    const sel = byId('tripSelector');
    if (!sel) return;
    const trips = safeArray(state.trips);
    sel.innerHTML = trips.length ? trips.map(t => `<option value="${t.id}">${U.escapeHtml(t.name)}</option>`).join('') : '<option value="">Aucun voyage</option>';
    sel.value = state.activeTripId || '';
    sel.disabled = !appReady;
  }

  function tripScore(trip) { return Suggestions.analyzeTrip(trip, state.settings).globalScore || 0; }
  function coverStyle(trip) {
    const img = trip?.coverImage;
    return img ? `style="background-image:linear-gradient(120deg,rgba(4,16,36,.72),rgba(14,165,163,.45)),url('${U.escapeHtml(img)}')"` : '';
  }

  function renderDashboard() {
    const grid = byId('tripsGrid');
    const focus = byId('dashboardFocus');
    const templates = byId('tripTemplates');
    if (!grid || !focus) return;

    if (cloudLoading) {
      focus.innerHTML = `<section class="panel premium-focus"><p class="eyebrow">Chargement</p><h2>Connexion à Firebase…</h2><p>Le site prépare tes voyages synchronisés.</p></section>`;
      grid.innerHTML = '';
      return;
    }
    if (!hasUser() || !appReady) {
      focus.innerHTML = `<section class="login-gate login-gate--premium"><div class="login-gate__icon">✈️</div><h2>Connecte-toi avec Google</h2><p>Travel Planner synchronise tes voyages avec Firebase pour les retrouver sur tous tes appareils.</p><button class="button button--primary" id="dashboardSignInBtn">Continuer avec Google</button></section>`;
      byId('dashboardSignInBtn')?.addEventListener('click', handleSignIn);
      grid.innerHTML = '';
      if (templates) templates.innerHTML = '';
      return;
    }
    const trip = activeTrip();
    const budget = Budget.computeBudget(trip);
    const alerts = Suggestions.analyzeTrip(trip, state.settings).suggestions.filter(s => s.level !== 'success');
    if (!trip) {
      focus.innerHTML = `<section class="panel premium-focus"><p class="eyebrow">Bienvenue</p><h2>Crée ton premier voyage</h2><p>Utilise l’assistant pour générer ton planning, tes checklists et ton budget.</p><button class="button button--primary" id="emptyCreateBtn">Créer un voyage</button></section>`;
      byId('emptyCreateBtn')?.addEventListener('click', openWizardOrCreate);
      grid.innerHTML = '<div class="empty-state">Aucun voyage pour ce compte Google.</div>';
    } else {
      focus.innerHTML = `<section class="dashboard-command panel" ${coverStyle(trip)}><div><p class="eyebrow">Voyage actif</p><h2>${U.escapeHtml(trip.name)}</h2><p>${U.escapeHtml(trip.area || 'Destination à préciser')} · ${U.formatDate(trip.startDate)} → ${U.formatDate(trip.endDate)}</p></div><div class="dashboard-command__stats"><span><strong>${tripScore(trip)}%</strong> prêt</span><span><strong>${safeArray(trip.steps).length}</strong> étapes</span><span><strong>${U.formatMoney(budget.total, trip.currency)}</strong> prévu</span><span><strong>${alerts.length}</strong> alerte(s)</span></div><div class="button-row"><button class="button button--primary" data-go="today">Mode voyage</button><button class="button" data-go="itinerary">Planning</button><button class="button" data-go="budget">Budget</button><button class="button" data-open-share>Partager</button></div></section>`;
      focus.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.go)));
      focus.querySelector('[data-open-share]')?.addEventListener('click', () => openDialog('shareDialog'));
    }
    renderTemplates(templates);
    const trips = safeArray(state.trips);
    grid.innerHTML = trips.map(tripCard).join('');
    grid.querySelectorAll('[data-open-trip]').forEach(b => b.addEventListener('click', () => { state.activeTripId = b.dataset.openTrip; persist(); switchView('trip'); }));
    grid.querySelectorAll('[data-duplicate-trip]').forEach(b => b.addEventListener('click', () => { state = Storage.duplicateTrip(state, b.dataset.duplicateTrip); persist('Voyage dupliqué.'); }));
    grid.querySelectorAll('[data-delete-trip]').forEach(b => b.addEventListener('click', () => deleteTrip(b.dataset.deleteTrip)));
  }

  function tripCard(trip) {
    const budget = Budget.computeBudget(trip);
    const score = tripScore(trip);
    const alertCount = Suggestions.analyzeTrip(trip, state.settings).suggestions.filter(s => s.level === 'danger' || s.level === 'warning').length;
    return `<article class="trip-card trip-card--cover" ${coverStyle(trip)}><div class="trip-card__top"><div><span class="badge">${U.escapeHtml(trip.status)}</span><h3>${U.escapeHtml(trip.name)}</h3></div><strong>${score}%</strong></div><p>${U.escapeHtml(trip.area || 'Zone non renseignée')}</p><div class="trip-card__meta"><span>📅 ${U.formatDate(trip.startDate)} → ${U.formatDate(trip.endDate)}</span><span>📍 ${safeArray(trip.steps).length} étape(s)</span><span>💶 ${U.formatMoney(budget.total, trip.currency)}${trip.maxBudget ? ` / ${U.formatMoney(trip.maxBudget, trip.currency)}` : ''}</span><span>💡 ${alertCount} alerte(s)</span></div><div class="trip-card__actions"><button class="button button--primary" data-open-trip="${trip.id}">Continuer</button><button class="button" data-duplicate-trip="${trip.id}">Dupliquer</button><button class="button" data-delete-trip="${trip.id}">Supprimer</button></div></article>`;
  }

  function renderTemplates(container) {
    if (!container || safeArray(state.trips).length > 0) { if (container) container.innerHTML = ''; return; }
    const items = [
      ['roadtrip', '🚗 Roadtrip', 'Étapes, trajets voiture, budget carburant.'],
      ['citybreak', '🏙️ City break', 'Planning court, hôtel, visites et restaurants.'],
      ['avion', '✈️ Voyage en avion', 'Aéroports, transferts et marge horaire.'],
      ['family', '👨‍👩‍👧 Famille', 'Rythme doux et checklists complètes.']
    ];
    container.innerHTML = items.map(([id, title, text]) => `<button class="template-card" data-template="${id}"><strong>${title}</strong><span>${text}</span></button>`).join('');
    container.querySelectorAll('[data-template]').forEach(b => b.addEventListener('click', () => createFromTemplate(b.dataset.template)));
  }

  function renderToday() {
    const trip = activeTrip();
    const hero = byId('todayHero');
    const quick = byId('todayQuickActions');
    const timeline = byId('todayTimeline');
    if (!hero || !quick || !timeline) return;
    if (!trip) { hero.innerHTML = '<div class="empty-state">Crée un voyage pour utiliser le mode Aujourd’hui.</div>'; quick.innerHTML = ''; timeline.innerHTML = ''; return; }
    const today = new Date().toISOString().slice(0, 10);
    const steps = U.sortSteps(trip.steps || []);
    const next = steps.find(s => (s.arrivalDate || trip.startDate || today) >= today) || steps[0];
    const budget = Budget.computeBudget(trip);
    const alert = Suggestions.analyzeTrip(trip, state.settings).suggestions.find(s => s.level !== 'success');
    hero.innerHTML = `<p class="eyebrow">Mode voyage</p><h2>${next ? U.escapeHtml(next.name) : 'Aucune étape'}</h2><p>${next ? `${U.formatDate(next.arrivalDate)}${next.arrivalTime ? ` · ${next.arrivalTime}` : ''} · ${U.escapeHtml(next.address || next.type || '')}` : 'Ajoute une étape pour voir la suite.'}</p><div class="button-row"><button class="button button--primary" data-today-action="map">Voir carte</button><button class="button" data-today-action="expense">Dépense rapide</button><button class="button" data-today-action="note">Note rapide</button></div>`;
    quick.innerHTML = `<p class="eyebrow">Résumé rapide</p><h3>${U.escapeHtml(trip.name)}</h3><div class="quick-list"><span>Budget : <strong>${U.formatMoney(budget.actualTotal || budget.total, trip.currency)}</strong></span><span>Étapes : <strong>${steps.length}</strong></span><span>Alerte : <strong>${alert ? U.escapeHtml(alert.message.slice(0, 80)) : 'RAS'}</strong></span></div>`;
    timeline.innerHTML = `<p class="eyebrow">Planning</p><h2>Étapes à venir</h2>${steps.map((s, i) => `<article class="timeline-row"><p class="eyebrow">${U.formatDate(s.arrivalDate)}${s.arrivalTime ? ` · ${s.arrivalTime}` : ''}</p><h3>${i + 1}. ${U.escapeHtml(s.name)}</h3><p>${U.escapeHtml(s.type)} · ${U.escapeHtml(s.address || 'Adresse à compléter')}</p></article>`).join('') || '<div class="empty-state">Aucune étape.</div>'}`;
    hero.querySelector('[data-today-action="map"]')?.addEventListener('click', () => switchView('map'));
    hero.querySelector('[data-today-action="expense"]')?.addEventListener('click', () => openExpenseDialog());
    hero.querySelector('[data-today-action="note"]')?.addEventListener('click', () => { switchView('journal'); });
  }

  function renderTripForm() {
    const form = byId('tripForm'); if (!form) return;
    const trip = activeTrip();
    form.querySelectorAll('input, textarea, select, button').forEach(el => { if (el.type !== 'submit' && el.id !== 'openWizardBtn') el.disabled = !trip; });
    if (!trip) { form.reset(); return; }
    ['name', 'description', 'area', 'coverImage', 'startDate', 'endDate', 'travellers', 'maxBudget', 'currency', 'status', 'style', 'pace', 'interests'].forEach(k => { if (form.elements[k]) form.elements[k].value = trip[k] ?? ''; });
    if (form.elements.travellersNames) form.elements.travellersNames.value = safeArray(trip.travellersNames).join(', ');
  }

  function saveTripForm(e) {
    e.preventDefault(); if (!requireReady()) return;
    const data = new FormData(e.currentTarget);
    const trip = activeTrip() || Storage.normalizeTrip({});
    ['name', 'description', 'area', 'coverImage', 'startDate', 'endDate', 'currency', 'status', 'style', 'pace', 'interests'].forEach(k => trip[k] = String(data.get(k) || ''));
    trip.travellers = Math.max(1, Number(data.get('travellers')) || 1);
    trip.travellersNames = Storage.parseNames(data.get('travellersNames'), trip.travellers);
    trip.travellers = trip.travellersNames.length;
    trip.maxBudget = Number(data.get('maxBudget')) || 0;
    state = Storage.upsertTrip(state, trip);
    persist('Voyage enregistré.');
  }

  function openWizardOrCreate() { openWizard(); }
  function openWizard() { byId('tripWizardForm')?.reset(); openDialog('tripWizardDialog'); }
  function saveWizard(e) {
    e.preventDefault(); if (!requireReady()) return;
    const data = new FormData(e.currentTarget);
    const names = Storage.parseNames(data.get('travellersNames'), 1);
    const trip = Storage.normalizeTrip({
      name: data.get('name') || 'Nouveau voyage', area: data.get('area') || '', coverImage: data.get('coverImage') || '', startDate: data.get('startDate') || '', endDate: data.get('endDate') || '', travellersNames: names, travellers: names.length, maxBudget: Number(data.get('maxBudget')) || 0, currency: data.get('currency') || '€', style: data.get('style') || 'équilibré', pace: data.get('pace') || 'normal', interests: data.get('interests') || '', description: data.get('description') || '', status: 'brouillon'
    });
    const startPlace = String(data.get('startPlace') || '').trim();
    const endPlace = String(data.get('endPlace') || '').trim();
    if (startPlace) trip.steps.push(Storage.normalizeTrip({ steps: [{ name: startPlace, type: 'ville', arrivalDate: trip.startDate, departureDate: trip.startDate, priority: 'indispensable', color: '#2563eb' }] }).steps[0]);
    if (endPlace) trip.steps.push(Storage.normalizeTrip({ steps: [{ name: endPlace, type: 'ville', arrivalDate: trip.endDate, departureDate: trip.endDate, priority: 'indispensable', color: '#14b8a6', order: 1 }] }).steps[0]);
    applyTemplate(trip, data.get('template'));
    state = Storage.upsertTrip(state, trip);
    closeDialog('tripWizardDialog');
    persist('Voyage créé.');
    switchView('trip');
  }
  function createFromTemplate(template) { if (!requireReady()) return; byId('tripWizardForm').elements.template.value = template; openWizard(); }
  function applyTemplate(trip, template) {
    trip.checklists ||= U.createDefaultChecklists();
    if (template === 'roadtrip') trip.expenses.push({ id: U.uid('expense'), label: 'Carburant et péages', category: 'transport', plannedAmount: 0, amount: 0, status: 'prévue' });
    if (template === 'avion') trip.expenses.push({ id: U.uid('expense'), label: 'Billets avion', category: 'transport', plannedAmount: 0, amount: 0, status: 'prévue' });
  }

  function renderSteps() {
    const list = byId('stepsList'); if (!list) return;
    const trip = activeTrip(); if (!trip) { list.innerHTML = '<div class="empty-state">Sélectionne un voyage pour ajouter des étapes.</div>'; return; }
    const steps = U.sortSteps(trip.steps || []);
    list.innerHTML = steps.length ? steps.map((s, i) => `<article class="step-row"><div class="step-marker" style="background:${s.color || '#2563eb'}">${i + 1}</div><div><span class="badge">${U.escapeHtml(s.type)} · ${U.escapeHtml(s.priority)}</span><h3>${U.escapeHtml(s.name)}</h3><p>${U.formatDate(s.arrivalDate)}${s.arrivalTime ? ` ${s.arrivalTime}` : ''} → ${U.formatDate(s.departureDate)}${s.departureTime ? ` ${s.departureTime}` : ''}</p><p>${U.escapeHtml(s.address || (U.isValidCoord(s) ? `${s.lat}, ${s.lng}` : 'coordonnées manquantes'))}</p></div><div class="row-actions"><button class="button" data-move-step="up" data-step-id="${s.id}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="button" data-move-step="down" data-step-id="${s.id}" ${i === steps.length - 1 ? 'disabled' : ''}>↓</button><button class="button" data-edit-step="${s.id}">Modifier</button><button class="button" data-delete-step="${s.id}">Supprimer</button></div></article>`).join('') : '<div class="empty-state">Ajoute un départ, des arrêts et une destination finale.</div>';
    list.querySelectorAll('[data-edit-step]').forEach(b => b.addEventListener('click', () => openStepDialog(b.dataset.editStep)));
    list.querySelectorAll('[data-delete-step]').forEach(b => b.addEventListener('click', () => deleteStep(b.dataset.deleteStep)));
    list.querySelectorAll('[data-move-step]').forEach(b => b.addEventListener('click', () => moveStep(b.dataset.stepId, b.dataset.moveStep)));
  }

  function openStepDialog(id = '') {
    const trip = activeTrip(); if (!trip) return showStatus('Crée d’abord un voyage.');
    const form = byId('stepForm'); form.reset();
    const step = safeArray(trip.steps).find(s => s.id === id);
    byId('stepDialogTitle').textContent = step ? 'Modifier une étape' : 'Ajouter une étape';
    const values = step || { color: '#2563eb', type: 'ville', priority: 'optionnel' };
    ['id','name','type','address','lat','lng','arrivalDate','arrivalTime','departureDate','departureTime','duration','cost','priority','color','notes'].forEach(k => { if (form.elements[k]) form.elements[k].value = values[k] ?? ''; });
    if (form.elements.links) form.elements.links.value = safeArray(values.links).join(', ');
    openDialog('stepDialog');
    validateStepDates();
  }
  function bindStepDateLogic() { ['arrivalDate','arrivalTime','departureDate','departureTime'].forEach(name => $('#stepForm')?.elements[name]?.addEventListener('change', validateStepDates)); }
  function validateStepDates() {
    const form = byId('stepForm'); if (!form) return true;
    const aD = form.elements.arrivalDate.value, dD = form.elements.departureDate.value, aT = form.elements.arrivalTime.value, dT = form.elements.departureTime.value;
    const status = byId('stepDateStatus');
    let ok = true, message = 'Indique quand tu arrives sur place, puis quand tu repars.';
    if (dD && !aD) { form.elements.arrivalDate.value = dD; message = 'Date d’arrivée alignée sur le départ.'; }
    if (aD && dD && dD < aD) { form.elements.departureDate.value = aD; ok = false; message = 'La date de départ a été corrigée : elle ne peut pas être avant l’arrivée.'; }
    if (aD && form.elements.departureDate.value === aD && aT && dT && dT < aT) { form.elements.departureTime.value = aT; ok = false; message = 'L’heure de départ a été corrigée : elle ne peut pas être avant l’arrivée.'; }
    if (status) { status.classList.toggle('is-warning', !ok); status.querySelector('span').textContent = message; }
    return ok;
  }
  function saveStepForm(e) {
    e.preventDefault(); if (!requireReady()) return; validateStepDates();
    const trip = activeTrip(); const form = e.currentTarget; const data = new FormData(form); const id = data.get('id') || U.uid('step');
    const existing = trip.steps.find(s => s.id === id);
    const step = { ...(existing || {}), id, order: existing?.order ?? trip.steps.length, name: data.get('name') || 'Étape', type: data.get('type') || 'ville', address: data.get('address') || '', lat: data.get('lat') === '' ? '' : Number(data.get('lat')), lng: data.get('lng') === '' ? '' : Number(data.get('lng')), arrivalDate: data.get('arrivalDate') || '', arrivalTime: data.get('arrivalTime') || '', departureDate: data.get('departureDate') || '', departureTime: data.get('departureTime') || '', duration: data.get('duration') || '', cost: Number(data.get('cost')) || 0, priority: data.get('priority') || 'optionnel', color: data.get('color') || '#2563eb', links: U.linksToArray(data.get('links')), notes: data.get('notes') || '', transportToNext: existing?.transportToNext || 'car', journal: existing?.journal || {} };
    const idx = trip.steps.findIndex(s => s.id === id); if (idx >= 0) trip.steps[idx] = step; else trip.steps.push(step);
    trip.steps = U.sortSteps(trip.steps).map((s, i) => ({ ...s, order: i }));
    closeDialog('stepDialog'); persist('Étape enregistrée.');
  }
  async function deleteStep(id) { const trip = activeTrip(); const ok = await confirmAction('Supprimer cette étape ?', 'Elle sera retirée du planning et de la carte.'); if (!ok) return; trip.steps = trip.steps.filter(s => s.id !== id); persist('Étape supprimée.'); }
  function moveStep(id, dir) { const trip = activeTrip(); const steps = U.sortSteps(trip.steps); const i = steps.findIndex(s => s.id === id); const j = dir === 'up' ? i - 1 : i + 1; if (j < 0 || j >= steps.length) return; [steps[i], steps[j]] = [steps[j], steps[i]]; trip.steps = steps.map((s, order) => ({ ...s, order })); persist('Ordre mis à jour.'); }

  function renderItinerary() {
    const trip = activeTrip();
    Itinerary.renderSummary(byId('itinerarySummary'), trip, state.settings);
    Itinerary.renderDayPlanner(byId('dayPlannerBoard'), trip, state.settings, { editStep: openStepDialog, addStep: date => openStepDialogForDate(date) });
    Itinerary.renderItinerary(byId('itineraryList'), trip, state.settings, (stepId, field, value) => { const step = activeTrip()?.steps.find(s => s.id === stepId); if (step) { step[field] = field === 'segmentCost' ? Number(value) || 0 : value; persist('Trajet mis à jour.'); } });
  }
  function openStepDialogForDate(date) { openStepDialog(); const form = byId('stepForm'); form.elements.arrivalDate.value = date; form.elements.departureDate.value = date; }

  function renderBudget() {
    const trip = activeTrip();
    Budget.renderStats(byId('budgetStats'), trip);
    Budget.renderDaily(byId('budgetDaily'), trip);
    Budget.renderPeople(byId('budgetPeople'), trip);
    renderBudgetAlerts();
    Budget.drawChart(byId('budgetChart'), trip);
    Budget.renderExpenses(byId('expensesList'), trip, { edit: openExpenseDialog, delete: deleteExpense });
    Budget.renderBreakdown(byId('budgetBreakdown'), trip);
  }
  function renderBudgetAlerts() {
    const el = byId('budgetAlerts'); if (!el) return;
    const trip = activeTrip(); if (!trip) { el.innerHTML = ''; return; }
    const b = Budget.computeBudget(trip); const alerts = [];
    if (b.max && b.total > b.max) alerts.push(`Budget prévu dépassé de ${U.formatMoney(b.total - b.max, trip.currency)}.`);
    if (b.actualTotal > b.plannedTotal && b.actualTotal > 0) alerts.push(`Réel supérieur au prévu de ${U.formatMoney(b.actualTotal - b.plannedTotal, trip.currency)}.`);
    el.innerHTML = alerts.map(a => `<div class="alert-chip alert-chip--budget">${U.escapeHtml(a)}</div>`).join('');
  }
  function openExpenseDialog(id = '') {
    const trip = activeTrip(); if (!trip) return showStatus('Crée d’abord un voyage.');
    const form = byId('expenseForm'); form.reset();
    form.elements.stepId.innerHTML = '<option value="">Aucune étape</option>' + U.sortSteps(trip.steps).map(s => `<option value="${s.id}">${U.escapeHtml(s.name)}</option>`).join('');
    const names = Budget.travellerNames(trip);
    form.elements.paidBy.innerHTML = '<option value="">Non renseigné</option>' + names.map(n => `<option value="${U.escapeHtml(n)}">${U.escapeHtml(n)}</option>`).join('');
    byId('expenseSplitPeople').innerHTML = names.map(n => `<label class="chip-check"><input type="checkbox" name="splitBetween" value="${U.escapeHtml(n)}" checked><span>${U.escapeHtml(n)}</span></label>`).join('');
    const expense = trip.expenses.find(e => e.id === id);
    byId('expenseDialogTitle').textContent = expense ? 'Modifier une dépense' : 'Ajouter une dépense';
    if (expense) {
      ['id','label','category','status','paidBy','date','stepId','note'].forEach(k => { if (form.elements[k]) form.elements[k].value = expense[k] ?? ''; });
      form.elements.plannedAmount.value = expense.plannedAmount ?? expense.amount ?? '';
      form.elements.actualAmount.value = expense.actualAmount ?? '';
      form.querySelectorAll('input[name="splitBetween"]').forEach(ch => ch.checked = !expense.splitBetween?.length || expense.splitBetween.includes(ch.value));
    }
    openDialog('expenseDialog');
  }
  function saveExpenseForm(e) {
    e.preventDefault(); if (!requireReady()) return;
    const trip = activeTrip(); const data = new FormData(e.currentTarget); const id = data.get('id') || U.uid('expense');
    const expense = { id, label: data.get('label') || 'Dépense', category: data.get('category') || 'autres', plannedAmount: Number(data.get('plannedAmount')) || 0, amount: Number(data.get('plannedAmount')) || 0, actualAmount: data.get('actualAmount') === '' ? '' : Number(data.get('actualAmount')) || 0, status: data.get('status') || 'prévue', paidBy: data.get('paidBy') || '', splitBetween: data.getAll('splitBetween'), date: data.get('date') || '', stepId: data.get('stepId') || '', note: data.get('note') || '' };
    const i = trip.expenses.findIndex(x => x.id === id); if (i >= 0) trip.expenses[i] = expense; else trip.expenses.push(expense);
    closeDialog('expenseDialog'); persist('Dépense enregistrée.');
  }
  async function deleteExpense(id) { const ok = await confirmAction('Supprimer cette dépense ?', 'Elle sera retirée du budget.'); if (!ok) return; activeTrip().expenses = activeTrip().expenses.filter(e => e.id !== id); persist('Dépense supprimée.'); }

  function renderSuggestions() { Suggestions.render(byId('scorePanel'), byId('suggestionsList'), activeTrip(), state.settings); }
  async function optimizeActiveTrip() { const trip = activeTrip(); if (!trip || trip.steps.length < 3) return showStatus('Ajoute au moins trois étapes.'); const ok = await confirmAction('Optimiser l’ordre ?', 'Le premier et le dernier lieu restent fixes.'); if (!ok) return; trip.steps = Suggestions.optimizeOrder(trip, state.settings); persist('Ordre optimisé.'); }

  function renderChecklists() {
    const el = byId('checklists'); if (!el) return; const trip = activeTrip();
    if (!trip) { el.innerHTML = '<div class="empty-state">Sélectionne un voyage.</div>'; return; }
    trip.checklists ||= U.createDefaultChecklists();
    el.innerHTML = Object.entries(trip.checklists).map(([name, items]) => `<article class="checklist"><div class="checklist__head"><input class="input checklist-title" data-checklist-title="${U.escapeHtml(name)}" value="${U.escapeHtml(name)}"><button class="button" data-add-check="${U.escapeHtml(name)}">+ tâche</button><button class="button button--danger" data-delete-checklist="${U.escapeHtml(name)}">Supprimer</button></div>${safeArray(items).map(item => `<label><input type="checkbox" data-check-id="${item.id}" data-check-category="${U.escapeHtml(name)}" ${item.done ? 'checked' : ''}><span contenteditable="true" data-check-text="${item.id}" data-check-category="${U.escapeHtml(name)}">${U.escapeHtml(item.text)}</span><button type="button" class="icon-button" data-delete-check="${item.id}" data-check-category="${U.escapeHtml(name)}">×</button></label>`).join('')}</article>`).join('');
    el.querySelectorAll('[data-check-id]').forEach(ch => ch.addEventListener('change', () => { const item = trip.checklists[ch.dataset.checkCategory].find(i => i.id === ch.dataset.checkId); if (item) item.done = ch.checked; persist(); }));
    el.querySelectorAll('[data-check-text]').forEach(span => span.addEventListener('blur', () => { const item = trip.checklists[span.dataset.checkCategory].find(i => i.id === span.dataset.checkText); if (item) item.text = span.textContent.trim() || item.text; persist(); }));
    el.querySelectorAll('[data-add-check]').forEach(b => b.addEventListener('click', () => { const text = prompt('Nouvelle tâche ?'); if (text) { trip.checklists[b.dataset.addCheck].push({ id: U.uid('todo'), text, done: false }); persist('Tâche ajoutée.'); } }));
    el.querySelectorAll('[data-delete-check]').forEach(b => b.addEventListener('click', () => { trip.checklists[b.dataset.checkCategory] = trip.checklists[b.dataset.checkCategory].filter(i => i.id !== b.dataset.deleteCheck); persist('Tâche supprimée.'); }));
    el.querySelectorAll('[data-delete-checklist]').forEach(b => b.addEventListener('click', () => { delete trip.checklists[b.dataset.deleteChecklist]; persist('Bloc supprimé.'); }));
    el.querySelectorAll('[data-checklist-title]').forEach(input => input.addEventListener('change', () => { const old = input.dataset.checklistTitle; const nw = input.value.trim(); if (nw && nw !== old) { trip.checklists[nw] = trip.checklists[old]; delete trip.checklists[old]; persist('Bloc renommé.'); } }));
  }
  function addChecklistBlock() { const trip = activeTrip(); if (!trip) return; const name = prompt('Nom du bloc ?', 'Nouvelle liste'); if (!name) return; trip.checklists ||= {}; trip.checklists[name] ||= []; persist('Bloc ajouté.'); }

  function renderJournal() {
    const el = byId('journalList'); if (!el) return; const trip = activeTrip();
    if (!trip || !trip.steps.length) { el.innerHTML = '<div class="empty-state">Ajoute des étapes pour créer un carnet.</div>'; return; }
    el.innerHTML = U.sortSteps(trip.steps).map(s => { s.journal ||= {}; return `<article class="journal-row"><span class="badge">${U.escapeHtml(s.type)}</span><h3>${U.escapeHtml(s.name)}</h3><div class="form-grid mt"><label>Notes<textarea class="input" rows="3" data-journal-field="notes" data-step-id="${s.id}">${U.escapeHtml(s.journal.notes || '')}</textarea></label><label>Photos / liens<textarea class="input" rows="3" data-journal-field="photoLinks" data-step-id="${s.id}">${U.escapeHtml(s.journal.photoLinks || '')}</textarea></label><label>Avis<input class="input" data-journal-field="rating" data-step-id="${s.id}" value="${U.escapeHtml(s.journal.rating || '')}"></label><label>Dépenses réelles<input class="input" type="number" data-journal-field="realExpenses" data-step-id="${s.id}" value="${U.escapeHtml(s.journal.realExpenses || '')}"></label><label>Météo<input class="input" data-journal-field="weather" data-step-id="${s.id}" value="${U.escapeHtml(s.journal.weather || '')}"></label><label class="wide">Commentaire<textarea class="input" rows="3" data-journal-field="afterthoughts" data-step-id="${s.id}">${U.escapeHtml(s.journal.afterthoughts || '')}</textarea></label></div></article>`; }).join('');
    el.querySelectorAll('[data-journal-field]').forEach(f => f.addEventListener('change', () => { const s = trip.steps.find(x => x.id === f.dataset.stepId); s.journal ||= {}; s.journal[f.dataset.journalField] = f.value; persist('Carnet mis à jour.'); }));
  }

  function renderSettings() {
    $$('#settingsPanel [data-setting]').forEach(input => {
      const path = input.dataset.setting.split('.');
      let value = state.settings;
      path.forEach(k => value = value?.[k]);
      input.value = value ?? '';
    });
  }
  function saveSettings() {
    $$('#settingsPanel [data-setting]').forEach(input => {
      const path = input.dataset.setting.split('.');
      if (path.length === 1) state.settings[path[0]] = Number(input.value) || 0;
      else { state.settings[path[0]] ||= {}; state.settings[path[0]][path[1]] = Number(input.value) || 0; }
    });
    persist('Paramètres enregistrés.'); setupPeriodicAutosave();
  }

  function renderMap() {
    const trip = activeTrip();
    MapView.renderFilters(byId('mapFilters'), trip, renderMap);
    MapView.renderRoutes(byId('mapRoutesList'), trip, state.settings, (stepId, value) => { const s = activeTrip()?.steps.find(x => x.id === stepId); if (s) { s.transportToNext = value; persist('Transport mis à jour.'); } });
    MapView.renderMapSteps(byId('mapStepsList'), trip);
    MapView.updateMap(trip, state.settings);
  }

  function renderCommunity() {
    const grid = byId('communityGrid'); const stats = byId('communityStats'); const admin = byId('communityAdminPanel'); if (!grid) return;
    const query = (byId('communitySearchInput')?.value || '').toLowerCase();
    const country = byId('communityCountryFilter')?.value || '';
    const category = byId('communityCategoryFilter')?.value || '';
    const sort = byId('communitySortFilter')?.value || 'trend';
    const countries = [...new Set(communityTrips.map(t => t.country).filter(Boolean))].sort();
    const countrySel = byId('communityCountryFilter'); if (countrySel) { const current = countrySel.value; countrySel.innerHTML = '<option value="">Tous les pays</option>' + countries.map(c => `<option value="${U.escapeHtml(c)}">${U.escapeHtml(c)}</option>`).join(''); countrySel.value = current; }
    let rows = communityTrips.filter(t => (!query || `${t.title} ${t.country} ${t.category} ${t.description}`.toLowerCase().includes(query)) && (!country || t.country === country) && (!category || t.category === category));
    rows.sort((a,b) => sort === 'recent' ? String(b.clientCreatedAt || '').localeCompare(a.clientCreatedAt || '') : sort === 'popular' ? (b.votesUp || 0) - (a.votesUp || 0) : ((b.votesUp || 0) - (b.votesDown || 0)) - ((a.votesUp || 0) - (a.votesDown || 0)));
    if (stats) stats.innerHTML = `<div class="stat-card"><strong>${communityTrips.length}</strong><span>voyages publics</span></div><div class="stat-card"><strong>${countries.length}</strong><span>pays</span></div><div class="stat-card"><strong>${rows.length}</strong><span>résultats</span></div>`;
    if (admin) { admin.hidden = !Cloud?.isAdmin?.(); admin.innerHTML = Cloud?.isAdmin?.() ? '<div class="panel"><strong>Mode admin Lucas S.</strong><span>Tu peux retirer une publication.</span></div>' : ''; }
    grid.innerHTML = rows.length ? rows.map(t => `<article class="community-card trip-card" ${t.coverImage ? `style="background-image:linear-gradient(120deg,rgba(4,16,36,.78),rgba(20,184,166,.34)),url('${U.escapeHtml(t.coverImage)}')"` : ''}><span class="badge">${U.escapeHtml(t.category || 'voyage')}</span><h3>${U.escapeHtml(t.title)}</h3><p>${U.escapeHtml(t.country || '')}</p><p>${U.escapeHtml(t.description || '')}</p><div class="trip-card__meta"><span>🔥 ${(t.votesUp || 0) - (t.votesDown || 0)} tendance</span><span>👤 ${U.escapeHtml(t.authorName || 'Utilisateur')}</span></div><div class="trip-card__actions"><button class="button" data-vote-up="${t.id}">+ Tendance</button><button class="button" data-vote-down="${t.id}">−</button>${t.allowCopy !== false ? `<button class="button button--primary" data-copy-community="${t.id}">Copier</button>` : ''}${(Cloud?.isAdmin?.() || t.ownerUid === Cloud?.getUser?.()?.uid) ? `<button class="button button--danger" data-delete-community="${t.id}">Retirer</button>` : ''}</div></article>`).join('') : '<div class="empty-state">Aucun voyage partagé pour le moment.</div>';
    grid.querySelectorAll('[data-vote-up]').forEach(b => b.addEventListener('click', () => voteCommunity(b.dataset.voteUp, 'up')));
    grid.querySelectorAll('[data-vote-down]').forEach(b => b.addEventListener('click', () => voteCommunity(b.dataset.voteDown, 'down')));
    grid.querySelectorAll('[data-copy-community]').forEach(b => b.addEventListener('click', () => copyCommunityTrip(b.dataset.copyCommunity)));
    grid.querySelectorAll('[data-delete-community]').forEach(b => b.addEventListener('click', () => deleteCommunity(b.dataset.deleteCommunity)));
  }
  async function loadCommunity() { try { if (!Cloud?.isConfigured?.()) return; communityTrips = await Cloud.listCommunityTrips(); renderCommunity(); } catch (e) { console.error(e); showStatus(e.message || 'Communauté indisponible.'); } }
  function openCommunityPublishDialog() { if (!requireReady()) return; const trip = activeTrip(); if (!trip) return showStatus('Sélectionne un voyage à publier.'); const form = byId('communityPublishForm'); form.reset(); form.elements.title.value = trip.name; form.elements.country.value = trip.area; form.elements.coverImage.value = trip.coverImage || ''; form.elements.description.value = trip.description || ''; openDialog('communityPublishDialog'); }
  async function publishCommunity(e) { e.preventDefault(); if (!requireReady()) return; const trip = activeTrip(); const data = new FormData(e.currentTarget); try { await Cloud.publishCommunityTrip(trip, { title: data.get('title'), country: data.get('country'), category: data.get('category'), coverImage: data.get('coverImage'), description: data.get('description'), hideBudget: data.get('hideBudget') === 'on', hideNotes: data.get('hideNotes') === 'on', allowCopy: data.get('allowCopy') === 'on' }); closeDialog('communityPublishDialog'); showStatus('Voyage publié dans la communauté.'); await loadCommunity(); switchView('community'); } catch (err) { console.error(err); showStatus(err.message || 'Publication impossible. Vérifie les règles Firestore.'); } }
  async function voteCommunity(id, dir) { try { await Cloud.voteCommunityTrip(id, dir); await loadCommunity(); } catch (e) { showStatus(e.message || 'Vote impossible.'); } }
  async function deleteCommunity(id) { const ok = await confirmAction('Retirer cette publication ?', 'Elle disparaîtra de la page Communauté.'); if (!ok) return; try { await Cloud.deleteCommunityTrip(id); await loadCommunity(); } catch (e) { showStatus(e.message || 'Suppression impossible.'); } }
  function copyCommunityTrip(id) { const item = communityTrips.find(t => t.id === id); if (!item?.trip) return; const trip = Storage.normalizeTrip({ ...item.trip, id: U.uid('trip'), name: `${item.trip.name || item.title} — copie`, communityId: id }); state = Storage.upsertTrip(state, trip); persist('Voyage copié dans ton espace.'); switchView('trip'); }

  async function createPublicShare() { const trip = activeTrip(); if (!trip) return; try { byId('shareLinkInput').value = await Cloud.createPublicShare(trip, shareOptions()); showStatus('Lien créé.'); } catch(e) { showStatus(e.message || 'Partage impossible.'); } }
  async function createPrivateShare() { const trip = activeTrip(); if (!trip) return; const emails = String(byId('shareCollaboratorsInput')?.value || '').split(','); try { byId('shareLinkInput').value = await Cloud.createPrivateShare(trip, emails, shareOptions()); showStatus('Collaboration créée.'); } catch(e) { showStatus(e.message || 'Collaboration impossible.'); } }
  function shareOptions() { return { hideBudget: byId('shareHideBudget')?.checked, hideNotes: byId('shareHideNotes')?.checked, hideJournal: byId('shareHideJournal')?.checked }; }

  function renderGlobalSearch() {
    const box = byId('globalSearchResults'); const input = byId('globalSearchInput'); if (!box || !input) return;
    const q = input.value.trim().toLowerCase(); if (q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
    const results = [];
    state.trips.forEach(trip => { if (`${trip.name} ${trip.area}`.toLowerCase().includes(q)) results.push({ label: trip.name, sub: 'voyage', action: () => { state.activeTripId = trip.id; persist(); switchView('trip'); } }); trip.steps.forEach(s => { if (`${s.name} ${s.address} ${s.notes}`.toLowerCase().includes(q)) results.push({ label: s.name, sub: `étape · ${trip.name}`, action: () => { state.activeTripId = trip.id; persist(); switchView('itinerary'); } }); }); trip.expenses.forEach(ex => { if (`${ex.label} ${ex.category} ${ex.note}`.toLowerCase().includes(q)) results.push({ label: ex.label, sub: `dépense · ${trip.name}`, action: () => { state.activeTripId = trip.id; persist(); switchView('budget'); } }); }); });
    box.innerHTML = results.slice(0, 8).map((r, i) => `<button type="button" data-search-result="${i}"><strong>${U.escapeHtml(r.label)}</strong><small>${U.escapeHtml(r.sub)}</small></button>`).join('') || '<div class="empty-state">Aucun résultat.</div>';
    box.hidden = false;
    box.querySelectorAll('[data-search-result]').forEach(b => b.addEventListener('click', () => { results[Number(b.dataset.searchResult)].action(); box.hidden = true; input.value = ''; }));
  }

  function bindGeocoder() {
    window.TravelGeocoder?.attachStepSearch?.({ input: byId('placeSearchInput'), button: byId('placeSearchBtn'), resultsContainer: byId('placeSearchResults'), statusElement: byId('placeSearchStatus'), onSelect: place => { const form = byId('stepForm'); form.elements.name.value = place.name; form.elements.type.value = place.type; form.elements.address.value = place.address || place.displayName; form.elements.lat.value = place.lat; form.elements.lng.value = place.lng; } });
  }

  function persist(message) {
    state = Storage.save(state);
    renderAll();
    scheduleSave();
    if (message) showStatus(message);
  }
  function scheduleSave(delay = 700) { if (!appReady || !hasUser()) return; clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => saveNow(true), delay); }
  async function saveNow(silent = true) { if (!appReady || !hasUser()) return; try { await Cloud.saveState(Storage.save(state)); lastSavedAt = new Date().toISOString(); updateCloudUi(); if (!silent) showStatus('Sauvegardé.'); } catch(e) { console.error(e); showStatus(e.message || 'Sauvegarde impossible.'); } }
  function setupPeriodicAutosave() { clearInterval(autosaveInterval); const minutes = Math.max(1, Number(state.settings.autosaveMinutes) || 3); autosaveInterval = setInterval(() => saveNow(true), minutes * 60000); }

  async function initCloud() {
    if (!Cloud) { cloudLoading = false; showStatus('Module Firebase introuvable.'); renderAll(); return; }
    Cloud.onAuthChange(payload => { updateCloudUi(payload); });
    try {
      await Cloud.init();
      await Cloud.waitForAuthState();
      const user = Cloud.getUser();
      if (user) await loadCloudState(); else { cloudLoading = false; appReady = false; renderAll(); updateCloudUi(); }
      loadCommunity();
    } catch(e) { cloudLoading = false; appReady = false; console.error(e); showStatus(e.message || 'Firebase indisponible.'); renderAll(); updateCloudUi({ status: e.message }); }
  }
  async function loadCloudState() {
    cloudLoading = true; renderAll();
    const backup = await Cloud.loadState();
    state = backup?.state ? Storage.save(backup.state) : Storage.createEmptyState();
    if (!backup?.state) await Cloud.saveState(state);
    lastSavedAt = backup?.clientUpdatedAt || new Date().toISOString();
    cloudLoading = false; appReady = true; applyTheme(state.settings.theme || 'light'); renderAll(); setupPeriodicAutosave(); showStatus('Voyages chargés.');
  }
  async function handleCloudButton() { if (hasUser()) switchView('settings'); else handleSignIn(); }
  async function handleSignIn() { try { cloudLoading = true; renderAll(); await Cloud.signIn(); await loadCloudState(); await loadCommunity(); } catch(e) { cloudLoading = false; console.error(e); showStatus(e.message || 'Connexion impossible.'); renderAll(); } }
  async function handleSignOut() { const ok = await confirmAction('Se déconnecter ?', 'Tes voyages restent sauvegardés dans Firebase.'); if (!ok) return; await saveNow(true); await Cloud.signOut(); state = Storage.createEmptyState(); appReady = false; cloudLoading = false; renderAll(); }
  async function deleteCloudData() { const ok = await confirmAction('Réinitialiser le compte ?', 'Tous les voyages de ce compte seront supprimés de Firebase.'); if (!ok) return; await Cloud.deleteState(); state = Storage.createEmptyState(); appReady = true; renderAll(); showStatus('Compte réinitialisé.'); }
  function updateCloudUi(payload = {}) {
    const user = payload.user ?? Cloud?.getUser?.();
    document.body.classList.toggle('is-cloud-locked', !user || !appReady);
    const top = byId('cloudAuthBtn');
    if (top) top.innerHTML = user ? `<span class="cloud-avatar-mini">${user.photoURL ? `<img src="${user.photoURL}" alt="">` : 'G'}</span><span class="auth-pill__text"><strong>Connecté</strong><small>${U.escapeHtml((user.displayName || user.email || '').split(' ')[0])}</small></span>` : `<span class="google-mark">G</span><span class="auth-pill__text"><strong>Connexion</strong><small>Google</small></span>`;
    if (byId('cloudStatus')) byId('cloudStatus').innerHTML = `<span class="cloud-status__dot"></span><span>${U.escapeHtml(payload.status || Cloud?.getStatus?.() || (user ? 'Connecté.' : 'Connexion requise.'))}</span>`;
    if (byId('cloudProfile')) byId('cloudProfile').hidden = !user;
    if (user) { if (byId('cloudAvatar')) byId('cloudAvatar').src = user.photoURL || ''; if (byId('cloudUserName')) byId('cloudUserName').textContent = user.displayName || 'Compte Google'; if (byId('cloudUserEmail')) byId('cloudUserEmail').textContent = user.email || ''; }
    if (byId('cloudSignInBtn')) byId('cloudSignInBtn').disabled = Boolean(user);
    if (byId('cloudSignOutBtn')) byId('cloudSignOutBtn').disabled = !user;
    if (byId('deleteCloudDataBtn')) byId('deleteCloudDataBtn').disabled = !user;
    if (byId('cloudSyncMeta')) byId('cloudSyncMeta').textContent = lastSavedAt ? `Dernière sauvegarde : ${new Date(lastSavedAt).toLocaleString('fr-FR')}` : (user ? 'Sauvegarde automatique active.' : 'Non connecté');
  }

  function confirmAction(title, message) {
    const dialog = byId('confirmDialog'); if (!dialog) return Promise.resolve(confirm(`${title}\n${message}`));
    byId('confirmTitle').textContent = title; byId('confirmMessage').textContent = message;
    return new Promise(resolve => { const done = () => { dialog.removeEventListener('close', done); resolve(dialog.returnValue === 'default'); }; dialog.addEventListener('close', done); dialog.showModal(); });
  }
  async function deleteTrip(id) { const ok = await confirmAction('Supprimer ce voyage ?', 'Cette action supprimera le voyage de ton compte.'); if (!ok) return; state = Storage.deleteTrip(state, id); persist('Voyage supprimé.'); }
  function toggleFab(force) { const menu = byId('fabMenu'); if (!menu) return; menu.hidden = typeof force === 'boolean' ? !force : !menu.hidden; }
  function copyText(text) { if (!text) return; navigator.clipboard?.writeText(text); showStatus('Copié.'); }

  document.addEventListener('DOMContentLoaded', init);
})();
