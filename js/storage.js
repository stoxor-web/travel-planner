(function () {
  'use strict';

  const LEGACY_KEY = 'travelPlanner:v1';
  const { defaultSettings, deepMerge, uid, createDefaultChecklists, clone } = window.TravelUtils;

  const emptyState = {
    version: 2,
    activeTripId: null,
    settings: defaultSettings,
    trips: []
  };

  function createEmptyState() {
    return clone(emptyState);
  }

  function splitNames(value, travellers = 1) {
    if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
    const names = String(value || '').split(',').map(v => v.trim()).filter(Boolean);
    if (names.length) return names;
    const count = Math.max(1, Number(travellers) || 1);
    return Array.from({ length: count }, (_, index) => `Voyageur ${index + 1}`);
  }

  function normalizeJournal(journal = {}) {
    return {
      notes: journal.notes || '',
      photoLinks: journal.photoLinks || '',
      rating: journal.rating || '',
      realExpenses: journal.realExpenses || '',
      weather: journal.weather || '',
      afterthoughts: journal.afterthoughts || ''
    };
  }

  function normalizeStep(step = {}, index = 0) {
    return {
      id: step.id || uid('step'),
      order: Number.isFinite(Number(step.order)) ? Number(step.order) : index,
      name: step.name || `Étape ${index + 1}`,
      type: step.type || 'ville',
      address: step.address || '',
      lat: step.lat === '' || step.lat == null ? '' : Number(step.lat),
      lng: step.lng === '' || step.lng == null ? '' : Number(step.lng),
      arrivalDate: step.arrivalDate || '',
      arrivalTime: step.arrivalTime || '',
      departureDate: step.departureDate || step.arrivalDate || '',
      departureTime: step.departureTime || '',
      duration: step.duration || '',
      notes: step.notes || '',
      links: Array.isArray(step.links) ? step.links : window.TravelUtils.linksToArray(step.links),
      cost: Number(step.cost) || 0,
      priority: step.priority || 'optionnel',
      color: step.color || '#2563eb',
      transportToNext: step.transportToNext || 'car',
      segmentCost: Number(step.segmentCost) || 0,
      segmentNote: step.segmentNote || '',
      segmentReference: step.segmentReference || '',
      journal: normalizeJournal(step.journal || {})
    };
  }

  function normalizeExpense(expense = {}) {
    const planned = expense.plannedAmount ?? expense.amount ?? '';
    return {
      id: expense.id || uid('expense'),
      label: expense.label || 'Dépense',
      category: expense.category || 'autres',
      amount: Number(planned) || 0,
      plannedAmount: planned === '' || planned == null ? '' : Number(planned) || 0,
      actualAmount: expense.actualAmount === '' || expense.actualAmount == null ? '' : Number(expense.actualAmount) || 0,
      status: expense.status || 'prévue',
      paidBy: expense.paidBy || '',
      splitBetween: Array.isArray(expense.splitBetween) ? expense.splitBetween.filter(Boolean) : [],
      date: expense.date || '',
      stepId: expense.stepId || '',
      note: expense.note || ''
    };
  }

  function normalizeChecklists(checklists) {
    const defaults = createDefaultChecklists();
    const source = checklists && typeof checklists === 'object' ? checklists : defaults;
    return Object.fromEntries(Object.entries(source).map(([category, items]) => [
      category,
      Array.isArray(items) ? items.map(item => ({ id: item.id || uid('todo'), text: item.text || String(item || ''), done: Boolean(item.done) })) : []
    ]));
  }

  function normalizeTrip(trip = {}) {
    const now = new Date().toISOString();
    const travellers = Math.max(1, Number(trip.travellers) || splitNames(trip.travellersNames).length || 1);
    const travellersNames = splitNames(trip.travellersNames, travellers);
    return {
      id: trip.id || uid('trip'),
      name: trip.name || 'Nouveau voyage',
      description: trip.description || '',
      area: trip.area || trip.country || '',
      coverImage: trip.coverImage || '',
      startDate: trip.startDate || '',
      endDate: trip.endDate || '',
      travellers,
      travellersNames,
      maxBudget: Number(trip.maxBudget) || 0,
      currency: trip.currency || '€',
      status: trip.status || 'brouillon',
      style: trip.style || 'équilibré',
      pace: trip.pace || 'normal',
      interests: trip.interests || '',
      steps: Array.isArray(trip.steps) ? trip.steps.map(normalizeStep).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [],
      expenses: Array.isArray(trip.expenses) ? trip.expenses.map(normalizeExpense) : [],
      checklists: normalizeChecklists(trip.checklists),
      createdAt: trip.createdAt || now,
      updatedAt: trip.updatedAt || now
    };
  }

  function normalizeState(state = {}) {
    const cleaned = {
      version: 2,
      activeTripId: state?.activeTripId || null,
      settings: deepMerge(defaultSettings, state?.settings || {}),
      trips: Array.isArray(state?.trips) ? state.trips.map(normalizeTrip) : []
    };
    if (!cleaned.activeTripId && cleaned.trips[0]) cleaned.activeTripId = cleaned.trips[0].id;
    if (cleaned.activeTripId && !cleaned.trips.some(trip => trip.id === cleaned.activeTripId)) cleaned.activeTripId = cleaned.trips[0]?.id || null;
    return cleaned;
  }

  function load() { return createEmptyState(); }
  function save(state) { return normalizeState(state); }
  function getTrip(state, id = state?.activeTripId) { return (state?.trips || []).find(trip => trip.id === id) || null; }

  function upsertTrip(state, trip) {
    const normalized = normalizeTrip({ ...trip, updatedAt: new Date().toISOString() });
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

  function reset() { return createEmptyState(); }
  function clearLegacyLocalBackup() { try { localStorage.removeItem(LEGACY_KEY); } catch (_) {} }

  window.TravelStorage = { KEY: LEGACY_KEY, load, save, getTrip, upsertTrip, deleteTrip, duplicateTrip, reset, normalizeTrip, normalizeState, createEmptyState, clearLegacyLocalBackup };
})();
