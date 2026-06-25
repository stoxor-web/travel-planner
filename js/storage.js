(function () {
  'use strict';

  const KEY = 'travelPlanner:v1';
  const { defaultSettings, deepMerge, uid, createDefaultChecklists, clone } = window.TravelUtils;

  const emptyState = {
    version: 1,
    activeTripId: null,
    settings: defaultSettings,
    trips: []
  };

  function normalizeTrip(trip = {}) {
    const now = new Date().toISOString();
    return {
      id: trip.id || uid('trip'),
      name: trip.name || 'Nouveau voyage',
      description: trip.description || '',
      area: trip.area || '',
      startDate: trip.startDate || '',
      endDate: trip.endDate || '',
      travellers: Math.max(1, Number(trip.travellers) || 1),
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
        segmentCost: Number(step.segmentCost) || 0,
        segmentNote: step.segmentNote || '',
        journal: step.journal || { notes: '', photoLinks: '', rating: '', realExpenses: '', weather: '', afterthoughts: '' }
      })) : [],
      expenses: Array.isArray(trip.expenses) ? trip.expenses.map(expense => ({
        id: expense.id || uid('expense'),
        label: expense.label || 'Dépense',
        category: expense.category || 'autres',
        amount: Number(expense.amount) || 0,
        status: expense.status || 'prévue',
        date: expense.date || '',
        stepId: expense.stepId || '',
        note: expense.note || ''
      })) : [],
      checklists: trip.checklists || createDefaultChecklists(),
      createdAt: trip.createdAt || now,
      updatedAt: now
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(emptyState);
      const parsed = JSON.parse(raw);
      const state = {
        version: 1,
        activeTripId: parsed.activeTripId || null,
        settings: deepMerge(defaultSettings, parsed.settings || {}),
        trips: Array.isArray(parsed.trips) ? parsed.trips.map(normalizeTrip) : []
      };
      if (!state.activeTripId && state.trips[0]) state.activeTripId = state.trips[0].id;
      return state;
    } catch (error) {
      console.error(error);
      return clone(emptyState);
    }
  }

  function save(state) {
    const cleaned = {
      version: 1,
      activeTripId: state.activeTripId || state.trips?.[0]?.id || null,
      settings: deepMerge(defaultSettings, state.settings || {}),
      trips: (state.trips || []).map(normalizeTrip)
    };
    localStorage.setItem(KEY, JSON.stringify(cleaned));
    return cleaned;
  }

  function getTrip(state, id = state.activeTripId) {
    return (state.trips || []).find(trip => trip.id === id) || null;
  }

  function upsertTrip(state, trip) {
    const normalized = normalizeTrip(trip);
    const index = state.trips.findIndex(item => item.id === normalized.id);
    if (index >= 0) state.trips[index] = normalized;
    else state.trips.unshift(normalized);
    state.activeTripId = normalized.id;
    return save(state);
  }

  function deleteTrip(state, id) {
    state.trips = state.trips.filter(trip => trip.id !== id);
    if (state.activeTripId === id) state.activeTripId = state.trips[0]?.id || null;
    return save(state);
  }

  function duplicateTrip(state, id) {
    const original = getTrip(state, id);
    if (!original) return state;
    const copy = normalizeTrip({ ...clone(original), id: uid('trip'), name: `${original.name} — copie`, status: 'brouillon', createdAt: new Date().toISOString() });
    state.trips.unshift(copy);
    state.activeTripId = copy.id;
    return save(state);
  }

  function importData(state, payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Format de sauvegarde non reconnu.');
    const incomingTrips = Array.isArray(payload.trips) ? payload.trips : (payload.id ? [payload] : []);
    if (!incomingTrips.length) throw new Error('Aucun voyage trouvé dans ce fichier.');
    const existingById = new Map(state.trips.map(trip => [trip.id, trip]));
    incomingTrips.forEach(trip => {
      const normalized = normalizeTrip(trip);
      if (existingById.has(normalized.id)) normalized.id = uid('trip');
      state.trips.unshift(normalized);
      state.activeTripId = normalized.id;
    });
    if (payload.settings) state.settings = deepMerge(state.settings, payload.settings);
    return save(state);
  }

  function reset() {
    localStorage.removeItem(KEY);
    return clone(emptyState);
  }

  window.TravelStorage = {
    KEY,
    load,
    save,
    getTrip,
    upsertTrip,
    deleteTrip,
    duplicateTrip,
    importData,
    reset,
    normalizeTrip
  };
})();
