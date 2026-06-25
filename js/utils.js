(function () {
  'use strict';

  const placeTypes = [
    'ville', 'hôtel', 'activité', 'restaurant', 'gare', 'aéroport', 'point de vue', 'pause', 'parking', 'plage', 'randonnée', 'autre'
  ];

  const transportModes = {
    car: { label: 'voiture', speedKey: 'car', icon: '🚗' },
    train: { label: 'train', speedKey: 'train', icon: '🚆' },
    plane: { label: 'avion', speedKey: 'plane', icon: '✈️' },
    bus: { label: 'bus', speedKey: 'bus', icon: '🚌' },
    bike: { label: 'vélo', speedKey: 'bike', icon: '🚲' },
    walk: { label: 'marche', speedKey: 'walk', icon: '🚶' },
    boat: { label: 'bateau', speedKey: 'boat', icon: '⛴️' },
    other: { label: 'autre', speedKey: 'other', icon: '➜' }
  };

  const expenseCategories = [
    'transport', 'logement', 'carburant', 'péages', 'nourriture', 'activités', 'courses', 'parking', 'billets', 'assurances', 'souvenirs', 'imprévus', 'autres'
  ];

  const defaultSettings = {
    speeds: { car: 90, train: 120, plane: 720, bus: 65, bike: 18, walk: 4.5, boat: 35, other: 50 },
    costPerKm: { car: 0.22, train: 0.14, plane: 0.11, bus: 0.08, bike: 0, walk: 0, boat: 0.12, other: 0 },
    fixedHours: { plane: 3, train: 0.25, boat: 0.4, other: 0 },
    theme: 'light'
  };

  const checklistTemplates = {
    documents: ['Passeport / carte d’identité', 'Permis de conduire', 'Assurance voyage', 'Billets', 'Réservations imprimées ou hors ligne'],
    vêtements: ['Tenues par météo', 'Chaussures confortables', 'Veste de pluie', 'Tenue plus habillée', 'Sac linge sale'],
    santé: ['Trousse de secours', 'Médicaments personnels', 'Crème solaire', 'Ordonnances', 'Gel hydroalcoolique'],
    électronique: ['Chargeurs', 'Batterie externe', 'Adaptateur secteur', 'Écouteurs', 'Sauvegarde photos'],
    voiture: ['Papiers du véhicule', 'Contrôle pneus', 'Gilet / triangle', 'Péages / badge', 'Playlist ou podcasts'],
    randonnée: ['Sac journée', 'Gourde', 'Carte hors ligne', 'Lampe frontale', 'Coupe-vent'],
    avion: ['Bagage cabine', 'Liquides conformes', 'Check-in en ligne', 'Heure limite aéroport', 'Étiquette bagage'],
    logement: ['Adresse', 'Horaire arrivée', 'Code / clé', 'Contact hôte', 'Taxe de séjour'],
    réservations: ['Hôtels', 'Transports', 'Activités', 'Restaurants', 'Locations'],
    'avant départ': ['Arroser plantes', 'Sortir poubelles', 'Prévenir proche', 'Télécharger cartes', 'Vérifier météo']
  };

  function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function isValidCoord(step) {
    const lat = Number(step?.lat);
    const lng = Number(step?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  }

  function formatDate(dateString) {
    if (!dateString) return 'date non renseignée';
    const date = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }

  function dateDiffDays(start, end) {
    if (!start || !end) return 0;
    const a = new Date(`${start}T12:00:00`);
    const b = new Date(`${end}T12:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    return Math.max(0, Math.round((b - a) / 86400000) + 1);
  }

  function formatMoney(amount, currency = '€') {
    const value = toNumber(amount);
    if (currency?.length === 1) return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${currency}`;
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${currency || ''}`.trim();
  }

  function formatDistance(km) {
    const value = toNumber(km);
    if (value < 1) return `${Math.round(value * 1000)} m`;
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: value > 100 ? 0 : 1 })} km`;
  }

  function formatDuration(hours) {
    const totalMinutes = Math.max(0, Math.round(toNumber(hours) * 60));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${String(m).padStart(2, '0')}`;
  }

  function haversineKm(a, b) {
    if (!isValidCoord(a) || !isValidCoord(b)) return 0;
    const R = 6371;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(Number(b.lat) - Number(a.lat));
    const dLng = toRad(Number(b.lng) - Number(a.lng));
    const lat1 = toRad(Number(a.lat));
    const lat2 = toRad(Number(b.lat));
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function estimateSegment(from, to, mode = 'car', settings = defaultSettings) {
    const distance = haversineKm(from, to);
    const modeDef = transportModes[mode] || transportModes.other;
    const speed = Math.max(1, toNumber(settings?.speeds?.[modeDef.speedKey], defaultSettings.speeds[modeDef.speedKey] || 50));
    const fixed = toNumber(settings?.fixedHours?.[modeDef.speedKey], defaultSettings.fixedHours[modeDef.speedKey] || 0);
    const costPerKm = toNumber(settings?.costPerKm?.[modeDef.speedKey], defaultSettings.costPerKm[modeDef.speedKey] || 0);
    return {
      mode,
      modeLabel: modeDef.label,
      modeIcon: modeDef.icon,
      distance,
      duration: distance / speed + fixed,
      cost: distance * costPerKm
    };
  }

  function slug(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'voyage';
  }

  function deepMerge(target, source) {
    const output = Array.isArray(target) ? [...target] : { ...target };
    Object.entries(source || {}).forEach(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) output[key] = deepMerge(output[key] || {}, value);
      else output[key] = value;
    });
    return output;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sortSteps(steps = []) {
    return [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function linksToArray(value) {
    if (Array.isArray(value)) return value;
    return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  }

  function unique(array) {
    return [...new Set(array.filter(Boolean))];
  }

  function createDefaultChecklists() {
    return Object.fromEntries(Object.entries(checklistTemplates).map(([category, items]) => [
      category,
      items.map(text => ({ id: uid('todo'), text, done: false }))
    ]));
  }

  function tripDuration(trip) {
    const days = dateDiffDays(trip?.startDate, trip?.endDate);
    if (days) return days;
    const datedSteps = (trip?.steps || []).map(s => s.arrivalDate).filter(Boolean).sort();
    if (datedSteps.length) return dateDiffDays(datedSteps[0], datedSteps[datedSteps.length - 1]) || datedSteps.length;
    return Math.max(1, (trip?.steps || []).length || 1);
  }

  window.TravelUtils = {
    placeTypes,
    transportModes,
    expenseCategories,
    defaultSettings,
    checklistTemplates,
    uid,
    escapeHtml,
    toNumber,
    isValidCoord,
    formatDate,
    formatMoney,
    formatDistance,
    formatDuration,
    haversineKm,
    estimateSegment,
    slug,
    deepMerge,
    clone,
    sortSteps,
    linksToArray,
    unique,
    createDefaultChecklists,
    tripDuration
  };
})();
