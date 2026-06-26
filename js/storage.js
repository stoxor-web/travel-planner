(function(){
  'use strict';
  const U = window.TravelUtils;
  const emptyState = { version: 415, activeTripId: null, settings: U.defaultSettings, trips: [] };
  function createEmptyState(){ return U.clone(emptyState); }
  function normalizeExpense(expense={}){
    return {
      id: expense.id || U.uid('expense'), label: expense.label || expense.title || 'Dépense', category: expense.category || 'autres', planned: U.toNumber(expense.planned ?? expense.amount,0), actual: U.toNumber(expense.actual ?? expense.amount,0), status: expense.status || 'prévue', paidBy: expense.paidBy || '', sharedWith: U.normalizeNameList(expense.sharedWith || expense.participants), date: expense.date || '', stepId: expense.stepId || '', note: expense.note || ''
    };
  }
  function normalizeStep(step={}, order=0){
    return {
      id: step.id || U.uid('step'), order: Number.isFinite(Number(step.order)) ? Number(step.order) : order,
      name: step.name || 'Étape', type: step.type || 'ville', address: step.address || '', lat: step.lat ?? '', lng: step.lng ?? '', arrivalDate: step.arrivalDate || step.date || '', arrivalTime: step.arrivalTime || '', departureDate: step.departureDate || step.arrivalDate || '', departureTime: step.departureTime || '', duration: step.duration || '', cost: U.toNumber(step.cost,0), priority: step.priority || 'optionnel', color: step.color || '#2563eb', links: Array.isArray(step.links)?step.links:U.normalizeNameList(step.links), notes: step.notes || '', transportToNext: step.transportToNext || 'car', segmentCost: U.toNumber(step.segmentCost,0), segmentNote: step.segmentNote || '', segmentReference: step.segmentReference || '', journal: { notes:'', photoLinks:'', rating:'', realExpenses:'', weather:'', afterthoughts:'', ...(step.journal||{}) }
    };
  }
  function normalizeTrip(trip={}){
    const now = new Date().toISOString();
    const normalized = {
      id: trip.id || U.uid('trip'), name: trip.name || 'Nouveau voyage', description: trip.description || '', area: trip.area || '', coverImage: trip.coverImage || '', startDate: trip.startDate || '', endDate: trip.endDate || '', travellers: Math.max(1,U.toNumber(trip.travellers,1)), travellersNames: U.normalizeNameList(trip.travellersNames || trip.people || ''), maxBudget: U.toNumber(trip.maxBudget,0), currency: trip.currency || '€', status: trip.status || 'brouillon', style: trip.style || 'équilibré', pace: trip.pace || 'normal', interests: trip.interests || '', steps: Array.isArray(trip.steps)?trip.steps.map(normalizeStep):[], expenses: Array.isArray(trip.expenses)?trip.expenses.map(normalizeExpense):[], checklists: Array.isArray(trip.checklists)?trip.checklists:U.createDefaultChecklists(), createdAt: trip.createdAt || now, updatedAt: now
    };
    if(!normalized.travellersNames.length) normalized.travellersNames = Array.from({length: normalized.travellers},(_,i)=>`Voyageur ${i+1}`);
    normalized.travellers = Math.max(normalized.travellers, normalized.travellersNames.length || 1);
    normalized.steps = U.sortSteps(normalized.steps).map((s,i)=>({...s,order:i}));
    return normalized;
  }
  function normalizeState(state={}){
    const merged = U.deepMerge(createEmptyState(), state || {});
    merged.trips = Array.isArray(merged.trips) ? merged.trips.map(normalizeTrip) : [];
    merged.settings = U.deepMerge(U.defaultSettings, merged.settings || {});
    if(!merged.activeTripId || !merged.trips.some(t=>t.id===merged.activeTripId)) merged.activeTripId = merged.trips[0]?.id || null;
    merged.version = 415;
    return merged;
  }
  function load(){ return createEmptyState(); }
  function save(state){ return normalizeState(state); }
  function getTrip(state,id=state?.activeTripId){ const normalized = normalizeState(state); return normalized.trips.find(t=>t.id===id) || null; }
  function upsertTrip(state,trip){ const next=normalizeState(state); const normalized=normalizeTrip(trip); const i=next.trips.findIndex(t=>t.id===normalized.id); if(i>=0) next.trips[i]=normalized; else next.trips.unshift(normalized); next.activeTripId=normalized.id; return save(next); }
  function deleteTrip(state,id){ const next=normalizeState(state); next.trips=next.trips.filter(t=>t.id!==id); if(next.activeTripId===id) next.activeTripId=next.trips[0]?.id||null; return save(next); }
  function duplicateTrip(state,id){ const original=getTrip(state,id); if(!original) return normalizeState(state); const copy=normalizeTrip({...U.clone(original),id:U.uid('trip'),name:`${original.name} — copie`,status:'brouillon'}); return upsertTrip(state,copy); }
  window.TravelStorage = { load, save, getTrip, upsertTrip, deleteTrip, duplicateTrip, normalizeTrip, normalizeState, normalizeStep, normalizeExpense, createEmptyState };
})();
