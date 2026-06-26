(function () {
  'use strict';

  const U = window.TravelUtils;
  const { defaultSettings, deepMerge, uid, createDefaultChecklists, clone } = U;

  const emptyState = {
    version: 12,
    activeTripId: null,
    settings: defaultSettings,
    trips: []
  };

  function createEmptyState() {
    return clone(emptyState);
  }

  function parseNames(value, count = 1) {
    if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
    const names = String(value || '').split(',').map(v => v.trim()).filter(Boolean);
    if (names.length) return names;
    return Array.from({ length: Math.max(1, Number(count) || 1) }, (_, i) => `Voyageur ${i + 1}`);
  }

  function normalizeStep(step = {}, index = 0) {
    const now = new Date().toISOString();
    let arrivalDate = step.arrivalDate || '';
    let departureDate = step.departureDate || '';
    if (!arrivalDate && departureDate) arrivalDate = departureDate;
    if (arrivalDate && departureDate && departureDate < arrivalDate) departureDate = arrivalDate;
    let arrivalTime = step.arrivalTime || '';
    let departureTime = step.departureTime || '';
    if (arrivalDate && departureDate && arrivalDate === departureDate && arrivalTime && departureTime && departureTime < arrivalTime) departureTime = arrivalTime;
    return {
      id: step.id || uid('step'),
      order: Number.isFinite(Number(step.order)) ? Number(step.order) : index,
      name: step.name || `Étape ${index + 1}`,
      type: step.type || 'ville',
      address: step.address || '',
      lat: step.lat === '' || step.lat == null ? '' : Number(step.lat),
      lng: step.lng === '' || step.lng == null ? '' : Number(step.lng),
      arrivalDate,
      arrivalTime,
      departureDate,
      departureTime,
      duration: step.duration || '',
      notes: step.notes || '',
      links: Array.isArray(step.links) ? step.links : U.linksToArray?.(step.links) || [],
      cost: Number(step.cost) || 0,
      priority: step.priority || 'optionnel',
      color: step.color || '#2563eb',
      transportToNext: step.transportToNext || 'car',
      segmentCost: Number(step.segmentCost) || 0,
      segmentNote: step.segmentNote || '',
      segmentReference: step.segmentReference || '',
      segmentDepartureTime: step.segmentDepartureTime || '',
      segmentArrivalTime: step.segmentArrivalTime || '',
      journal: step.journal || { notes: '', photoLinks: '', rating: '', realExpenses: '', weather: '', afterthoughts: '' },
      createdAt: step.createdAt || now,
      updatedAt: step.updatedAt || now
    };
  }

  function normalizeExpense(expense = {}) {
    return {
      id: expense.id || uid('expense'),
      label: expense.label || 'Dépense',
      category: expense.category || 'autres',
      amount: Number(expense.amount ?? expense.plannedAmount) || 0,
      plannedAmount: Number(expense.plannedAmount ?? expense.amount) || 0,
      actualAmount: expense.actualAmount === '' || expense.actualAmount == null ? '' : Number(expense.actualAmount) || 0,
      status: expense.status || 'prévue',
      paidBy: expense.paidBy || '',
      splitBetween: Array.isArray(expense.splitBetween) ? expense.splitBetween.filter(Boolean) : [],
      date: expense.date || '',
      stepId: expense.stepId || '',
      note: expense.note || ''
    };
  }

  function normalizeTrip(trip = {}) {
    const now = new Date().toISOString();
    const names = parseNames(trip.travellersNames, trip.travellers);
    const steps = Array.isArray(trip.steps) ? trip.steps.map(normalizeStep).sort((a, b) => a.order - b.order).map((s, i) => ({ ...s, order: i })) : [];
    return {
      id: trip.id || uid('trip'),
      name: trip.name || 'Nouveau voyage',
      description: trip.description || '',
      area: trip.area || '',
      coverImage: trip.coverImage || '',
      startDate: trip.startDate || '',
      endDate: trip.endDate || '',
      travellers: Math.max(1, Number(trip.travellers) || names.length || 1),
      travellersNames: names,
      maxBudget: Number(trip.maxBudget) || 0,
      currency: trip.currency || '€',
      status: trip.status || 'brouillon',
      style: trip.style || 'équilibré',
      pace: trip.pace || 'normal',
      interests: trip.interests || '',
      steps,
      expenses: Array.isArray(trip.expenses) ? trip.expenses.map(normalizeExpense) : [],
      checklists: trip.checklists || createDefaultChecklists(),
      communityId: trip.communityId || '',
      createdAt: trip.createdAt || now,
      updatedAt: trip.updatedAt || now
    };
  }

  function normalizeState(state = {}) {
    const cleaned = {
      version: 12,
      activeTripId: state.activeTripId || null,
      settings: deepMerge(defaultSettings, state.settings || {}),
      trips: Array.isArray(state.trips) ? state.trips.map(normalizeTrip) : []
    };
    if (!cleaned.activeTripId && cleaned.trips[0]) cleaned.activeTripId = cleaned.trips[0].id;
    if (cleaned.activeTripId && !cleaned.trips.some(trip => trip.id === cleaned.activeTripId)) cleaned.activeTripId = cleaned.trips[0]?.id || null;
    return cleaned;
  }

  function load() { return createEmptyState(); }
  function save(state) { return normalizeState(state); }
  function getTrip(state, id = state?.activeTripId) { return (state?.trips || []).find(trip => trip.id === id) || null; }

  function upsertTrip(state, trip) {
    const next = normalizeState(state);
    const normalized = normalizeTrip({ ...trip, updatedAt: new Date().toISOString() });
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
    const copy = normalizeTrip({ ...clone(original), id: uid('trip'), name: `${original.name} — copie`, status: 'brouillon', communityId: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    next.trips.unshift(copy);
    next.activeTripId = copy.id;
    return save(next);
  }

  window.TravelStorage = {
    load, save, getTrip, upsertTrip, deleteTrip, duplicateTrip, normalizeTrip, normalizeState, createEmptyState,
    reset: createEmptyState,
    parseNames
  };
})();
