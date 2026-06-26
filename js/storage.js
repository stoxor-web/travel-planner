(function () {
  'use strict';

  const U = window.TravelUtils;

  const emptyState = {
    version: 5,
    activeTripId: null,
    settings: U.defaultSettings,
    trips: []
  };

  function empty() {
    return U.clone(emptyState);
  }

  function normalizeTravellerNames(value, count = 1) {
    if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
    const names = String(value || '').split(',').map(v => v.trim()).filter(Boolean);
    if (names.length) return names;
    return Array.from({ length: Math.max(1, Number(count) || 1) }, (_, i) => `Voyageur ${i + 1}`);
  }

  function normalizeStep(step = {}, index = 0) {
    return {
      id: step.id || U.uid('step'),
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
      links: U.linksToArray(step.links),
      cost: Number(step.cost) || 0,
      priority: step.priority || 'optionnel',
      color: step.color || '#0f766e',
      transportToNext: step.transportToNext || 'car',
      segmentCost: Number(step.segmentCost) || 0,
      segmentNote: step.segmentNote || '',
      segmentRef: step.segmentRef || '',
      journal: {
        notes: step.journal?.notes || '',
        photoLinks: step.journal?.photoLinks || '',
        rating: step.journal?.rating || '',
        realExpenses: step.journal?.realExpenses || '',
        weather: step.journal?.weather || '',
        afterthoughts: step.journal?.afterthoughts || ''
      }
    };
  }

  function normalizeExpense(expense = {}) {
    const amount = expense.amount ?? expense.plannedAmount ?? expense.planned ?? 0;
    const actual = expense.actualAmount ?? expense.actual ?? '';
    return {
      id: expense.id || U.uid('expense'),
      label: expense.label || 'Dépense',
      category: expense.category || 'autres',
      amount: Number(amount) || 0,
      plannedAmount: Number(amount) || 0,
      actualAmount: actual === '' || actual == null ? '' : Number(actual) || 0,
      status: expense.status || 'prévue',
      paidBy: expense.paidBy || '',
      splitBetween: Array.isArray(expense.splitBetween) ? expense.splitBetween : U.linksToArray(expense.sharedWith || expense.splitBetween),
      date: expense.date || '',
      stepId: expense.stepId || '',
      note: expense.note || ''
    };
  }

  function normalizeChecklists(checklists) {
    if (!checklists || typeof checklists !== 'object') return U.createDefaultChecklists();
    const out = {};
    Object.entries(checklists).forEach(([name, items]) => {
      out[name || 'Liste'] = Array.isArray(items) ? items.map(item => ({
        id: item.id || U.uid('todo'),
        text: item.text || String(item || ''),
        done: Boolean(item.done)
      })).filter(item => item.text.trim()) : [];
    });
    return Object.keys(out).length ? out : U.createDefaultChecklists();
  }

  function normalizeTrip(trip = {}) {
    const now = new Date().toISOString();
    const travellers = Math.max(1, Number(trip.travellers) || 1);
    const names = normalizeTravellerNames(trip.travellersNames, travellers);
    const steps = Array.isArray(trip.steps) ? trip.steps.map(normalizeStep).sort((a, b) => a.order - b.order) : [];
    return {
      id: trip.id || U.uid('trip'),
      name: trip.name || 'Nouveau voyage',
      description: trip.description || '',
      area: trip.area || '',
      coverImage: trip.coverImage || '',
      startDate: trip.startDate || '',
      endDate: trip.endDate || '',
      travellers: names.length || travellers,
      travellersNames: names,
      maxBudget: Number(trip.maxBudget) || 0,
      currency: trip.currency || '€',
      status: trip.status || 'brouillon',
      style: trip.style || 'équilibré',
      pace: trip.pace || 'normal',
      interests: trip.interests || '',
      steps: steps.map((s, i) => ({ ...s, order: i })),
      expenses: Array.isArray(trip.expenses) ? trip.expenses.map(normalizeExpense) : [],
      checklists: normalizeChecklists(trip.checklists),
      createdAt: trip.createdAt || now,
      updatedAt: now
    };
  }

  function normalizeState(state = {}) {
    const trips = Array.isArray(state.trips) ? state.trips.map(normalizeTrip) : [];
    let activeTripId = state.activeTripId || trips[0]?.id || null;
    if (activeTripId && !trips.some(t => t.id === activeTripId)) activeTripId = trips[0]?.id || null;
    return {
      version: 5,
      activeTripId,
      settings: U.deepMerge(U.defaultSettings, state.settings || {}),
      trips
    };
  }

  function load() { return empty(); }
  function save(state) { return normalizeState(state); }
  function getTrip(state, id = state.activeTripId) { return (state.trips || []).find(t => t.id === id) || null; }
  function upsertTrip(state, trip) {
    const next = normalizeState(state);
    const clean = normalizeTrip(trip);
    const idx = next.trips.findIndex(t => t.id === clean.id);
    if (idx >= 0) next.trips[idx] = clean;
    else next.trips.unshift(clean);
    next.activeTripId = clean.id;
    return normalizeState(next);
  }
  function deleteTrip(state, id) {
    const next = normalizeState(state);
    next.trips = next.trips.filter(t => t.id !== id);
    if (next.activeTripId === id) next.activeTripId = next.trips[0]?.id || null;
    return normalizeState(next);
  }
  function duplicateTrip(state, id) {
    const next = normalizeState(state);
    const original = getTrip(next, id);
    if (!original) return next;
    const copy = normalizeTrip({ ...U.clone(original), id: U.uid('trip'), name: `${original.name} — copie`, status: 'brouillon' });
    next.trips.unshift(copy);
    next.activeTripId = copy.id;
    return normalizeState(next);
  }
  function reset() { return empty(); }

  window.TravelStorage = { load, save, getTrip, upsertTrip, deleteTrip, duplicateTrip, reset, normalizeTrip, normalizeState, createEmptyState: empty };
})();
