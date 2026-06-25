(function () {
  'use strict';

  // Depuis la version Firebase-only, ce module ne persiste plus les voyages dans localStorage.
  // Il sert uniquement à normaliser l'état en mémoire avant lecture/écriture Firestore.
  const LEGACY_KEY = 'travelPlanner:v1';
  const { defaultSettings, deepMerge, uid, createDefaultChecklists, clone } = window.TravelUtils;

  const emptyState = {
    version: 1,
    activeTripId: null,
    settings: defaultSettings,
    trips: []
  };

  function createEmptyState() {
    return clone(emptyState);
  }

  function normalizeTrip(trip = {}) {
    const now = new Date().toISOString();
    return {
      id: trip.id || uid('trip'),
      shareId: trip.shareId || '',
      name: trip.name || 'Nouveau voyage',
      description: trip.description || '',
      area: trip.area || '',
      startDate: trip.startDate || '',
      endDate: trip.endDate || '',
      travellersNames: Array.isArray(trip.travellersNames)
        ? trip.travellersNames.map(name => String(name || '').trim()).filter(Boolean)
        : String(trip.travellersNames || '').split(',').map(name => name.trim()).filter(Boolean),
      travellers: Math.max(1, Array.isArray(trip.travellersNames) && trip.travellersNames.length ? trip.travellersNames.length : Number(trip.travellers) || 1),
      maxBudget: Number(trip.maxBudget) || 0,
      currency: trip.currency || '€',
      status: trip.status || 'brouillon',
      style: trip.style || 'équilibré',
      pace: trip.pace || 'normal',
      interests: trip.interests || '',
      steps: Array.isArray(trip.steps) ? trip.steps.map((step, index) => ({
        id: step.id || uid('step'),
        order: Number.isFinite(Number(step.order)) ? Number(step.order) : index,
        name: step.name || `Étape ${index + 1}`,
        type: step.type || 'ville',
        lat: step.lat === '' || step.lat == null ? '' : Number(step.lat),
        lng: step.lng === '' || step.lng == null ? '' : Number(step.lng),
        arrivalDate: step.arrivalDate || '',
        departureDate: step.departureDate || '',
        duration: step.duration || '',
        notes: step.notes || '',
        links: Array.isArray(step.links) ? step.links : [],
        cost: Number(step.cost) || 0,
        priority: step.priority || 'optionnel',
        color: step.color || '#2563eb',
        transportToNext: step.transportToNext || 'car',
        segmentDepartureTime: step.segmentDepartureTime || '',
        segmentArrivalTime: step.segmentArrivalTime || '',
        segmentReference: step.segmentReference || '',
        segmentCost: Number(step.segmentCost) || 0,
        segmentNote: step.segmentNote || '',
        journal: step.journal || { notes: '', photoLinks: '', rating: '', realExpenses: '', weather: '', afterthoughts: '' }
      })) : [],
      expenses: Array.isArray(trip.expenses) ? trip.expenses.map(expense => ({
        id: expense.id || uid('expense'),
        label: expense.label || 'Dépense',
        category: expense.category || 'autres',
        amount: Number(expense.amount ?? expense.plannedAmount ?? expense.actualAmount) || 0,
        plannedAmount: Number(expense.plannedAmount ?? expense.amount) || 0,
        actualAmount: expense.actualAmount === '' || expense.actualAmount == null ? '' : Number(expense.actualAmount) || 0,
        status: expense.status || 'prévue',
        paidBy: expense.paidBy || '',
        splitBetween: Array.isArray(expense.splitBetween) ? expense.splitBetween : [],
        date: expense.date || '',
        stepId: expense.stepId || '',
        note: expense.note || ''
      })) : [],
      checklists: trip.checklists || createDefaultChecklists(),
      createdAt: trip.createdAt || now,
      updatedAt: trip.updatedAt || now
    };
  }

  function normalizeState(state = {}) {
    const cleaned = {
      version: 1,
      activeTripId: state.activeTripId || null,
      settings: deepMerge(defaultSettings, state.settings || {}),
      trips: Array.isArray(state.trips) ? state.trips.map(normalizeTrip) : []
    };
    if (!cleaned.activeTripId && cleaned.trips[0]) cleaned.activeTripId = cleaned.trips[0].id;
    if (cleaned.activeTripId && !cleaned.trips.some(trip => trip.id === cleaned.activeTripId)) {
      cleaned.activeTripId = cleaned.trips[0]?.id || null;
    }
    return cleaned;
  }

  function load() {
    return createEmptyState();
  }

  function save(state) {
    return normalizeState(state);
  }

  function getTrip(state, id = state.activeTripId) {
    return (state.trips || []).find(trip => trip.id === id) || null;
  }

  function upsertTrip(state, trip) {
    const normalized = normalizeTrip(trip);
    const next = normalizeState(state);
    const index = next.trips.findIndex(item => item.id === normalized.id);
    if (index >= 0) next.trips[index] = normalized;
    else next.trips.unshift(normalized);
    next.activeTripId = normalized.id;
    return save(next);
  }

  function deleteTrip(state, id) {
    const next = normalizeState(state);
    next.trips = next.trips.filter(trip => trip.id !== id);
    if (next.activeTripId === id) next.activeTripId = next.trips[0]?.id || null;
    return save(next);
  }

  function duplicateTrip(state, id) {
    const next = normalizeState(state);
    const original = getTrip(next, id);
    if (!original) return next;
    const copy = normalizeTrip({ ...clone(original), id: uid('trip'), name: `${original.name} — copie`, status: 'brouillon', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    next.trips.unshift(copy);
    next.activeTripId = copy.id;
    return save(next);
  }

  function importData(state, payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Format de sauvegarde non reconnu.');
    const incomingTrips = Array.isArray(payload.trips) ? payload.trips : (payload.id ? [payload] : []);
    if (!incomingTrips.length) throw new Error('Aucun voyage trouvé dans ce fichier.');
    const next = normalizeState(state);
    const existingById = new Map(next.trips.map(trip => [trip.id, trip]));
    incomingTrips.forEach(trip => {
      const normalized = normalizeTrip(trip);
      if (existingById.has(normalized.id)) normalized.id = uid('trip');
      next.trips.unshift(normalized);
      next.activeTripId = normalized.id;
    });
    if (payload.settings) next.settings = deepMerge(next.settings, payload.settings);
    return save(next);
  }

  function reset() {
    return createEmptyState();
  }

  function clearLegacyLocalBackup() {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch (error) {
      console.warn('Impossible de nettoyer l’ancienne sauvegarde locale.', error);
    }
  }

  window.TravelStorage = {
    KEY: LEGACY_KEY,
    load,
    save,
    getTrip,
    upsertTrip,
    deleteTrip,
    duplicateTrip,
    importData,
    reset,
    normalizeTrip,
    normalizeState,
    createEmptyState,
    clearLegacyLocalBackup
  };
})();
