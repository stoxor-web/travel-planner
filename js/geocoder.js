(function () {
  'use strict';

  const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
  const MIN_DELAY_MS = 1100;
  const cache = new Map();
  let lastRequestAt = 0;
  let pending = Promise.resolve();

  const CATEGORY_KEYWORDS = {
    'ville': '',
    'hôtel': 'hotel',
    'restaurant': 'restaurant',
    'gare': 'gare',
    'aéroport': 'airport',
    'parking': 'parking',
    'plage': 'plage',
    'point de vue': 'viewpoint',
    'activité': 'attraction',
    'randonnée': 'trail'
  };

  const COUNTRY_CODES = {
    france: 'fr', italie: 'it', espagne: 'es', portugal: 'pt', allemagne: 'de', belgique: 'be', suisse: 'ch',
    luxembourg: 'lu', autriche: 'at', croatie: 'hr', slovenie: 'si', slovénie: 'si', grece: 'gr', grèce: 'gr',
    royaumeuni: 'gb', 'royaume uni': 'gb', angleterre: 'gb', ecosse: 'gb', écosse: 'gb', irlande: 'ie',
    paysbas: 'nl', 'pays bas': 'nl', norvege: 'no', norvège: 'no', suede: 'se', suède: 'se', danemark: 'dk',
    finlande: 'fi', pologne: 'pl', tchequie: 'cz', tchèque: 'cz', republiquetcheque: 'cz', hongrie: 'hu',
    maroc: 'ma', tunisie: 'tn', algerie: 'dz', algérie: 'dz', egypte: 'eg', égypte: 'eg', turquie: 'tr',
    canada: 'ca', etatsunis: 'us', 'etats unis': 'us', étatsunis: 'us', 'états unis': 'us', usa: 'us',
    japon: 'jp', chine: 'cn', thailande: 'th', thaïlande: 'th', vietnam: 'vn', indonesie: 'id', indonésie: 'id'
  };

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function normalizeQuery(query) {
    return String(query || '').trim().replace(/\s+/g, ' ');
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function runThrottled(task) {
    pending = pending.then(async () => {
      const elapsed = Date.now() - lastRequestAt;
      if (elapsed < MIN_DELAY_MS) await wait(MIN_DELAY_MS - elapsed);
      lastRequestAt = Date.now();
      return task();
    }).catch(error => {
      console.warn('Recherche de lieu interrompue.', error);
      throw error;
    });
    return pending;
  }

  function parseCoordinates(query) {
    const match = normalizeQuery(query).match(/^(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)$/);
    if (!match) return null;
    const lat = Number(match[1].replace(',', '.'));
    const lng = Number(match[2].replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return {
      id: `coords_${lat}_${lng}`,
      name: 'Coordonnées GPS',
      address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      displayName: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      lat,
      lng,
      type: 'autre',
      category: 'Position GPS',
      importance: 1,
      score: 999,
      distanceFromTripKm: null
    };
  }

  function compactAddress(result) {
    const address = result?.address || {};
    const street = [address.house_number, address.road || address.pedestrian || address.footway].filter(Boolean).join(' ');
    const city = address.city || address.town || address.village || address.municipality || address.hamlet;
    return [
      result?.name && result.name !== city ? result.name : '',
      street,
      address.postcode && city ? `${address.postcode} ${city}` : city,
      address.state,
      address.country
    ].filter(Boolean).join(', ');
  }

  function resultName(result) {
    const namedetails = result?.namedetails || {};
    return namedetails['name:fr'] || namedetails.name || result?.name || result?.display_name?.split(',')?.[0] || 'Lieu';
  }

  function classify(result) {
    const klass = String(result?.class || '').toLowerCase();
    const type = String(result?.type || '').toLowerCase();
    const display = normalizeText(result?.display_name || '');
    const combined = `${klass} ${type} ${display}`;

    if (/hotel|hostel|guest_house|motel|chalet|hôtel/.test(combined)) return { type: 'hôtel', label: 'Hébergement' };
    if (/restaurant|cafe|bar|fast_food|food_court/.test(combined)) return { type: 'restaurant', label: 'Restaurant' };
    if (/railway|station|train|gare/.test(combined)) return { type: 'gare', label: 'Gare' };
    if (/aerodrome|airport|aeroport|aéroport/.test(combined)) return { type: 'aéroport', label: 'Aéroport' };
    if (/parking/.test(combined)) return { type: 'parking', label: 'Parking' };
    if (/beach|plage/.test(combined)) return { type: 'plage', label: 'Plage' };
    if (/viewpoint|belvedere|panorama|point de vue/.test(combined)) return { type: 'point de vue', label: 'Point de vue' };
    if (/hiking|trail|path|randonnée/.test(combined)) return { type: 'randonnée', label: 'Randonnée' };
    if (/museum|attraction|monument|artwork|theme_park|zoo|aquarium|tourism|historic|chateau|castle/.test(combined)) {
      return { type: 'activité', label: 'À visiter' };
    }
    if (/city|town|village|municipality|administrative|place/.test(combined)) return { type: 'ville', label: 'Ville' };
    return { type: 'autre', label: 'Lieu' };
  }

  function inferCountryCodesFromText(text) {
    const normalized = normalizeText(text).replace(/[^a-z0-9]+/g, ' ').trim();
    const compact = normalized.replace(/\s+/g, '');
    const codes = new Set();
    Object.entries(COUNTRY_CODES).forEach(([name, code]) => {
      const key = normalizeText(name).replace(/[^a-z0-9]+/g, ' ').trim();
      const compactKey = key.replace(/\s+/g, '');
      if ((key && normalized.includes(key)) || (compactKey && compact.includes(compactKey))) codes.add(code);
    });
    return [...codes].slice(0, 5);
  }

  function getTripCenter(context = {}) {
    const points = (context.steps || []).filter(step => {
      const lat = Number(step.lat);
      const lng = Number(step.lng);
      return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    });
    if (!points.length) return null;
    return {
      lat: points.reduce((sum, point) => sum + Number(point.lat), 0) / points.length,
      lng: points.reduce((sum, point) => sum + Number(point.lng), 0) / points.length,
      points
    };
  }

  function buildViewbox(context = {}) {
    const center = getTripCenter(context);
    if (!center) return '';
    const points = center.points;
    const lats = points.map(point => Number(point.lat));
    const lngs = points.map(point => Number(point.lng));
    const spreadLat = Math.max(1.2, Math.max(...lats) - Math.min(...lats));
    const spreadLng = Math.max(1.2, Math.max(...lngs) - Math.min(...lngs));
    const padLat = Math.min(8, spreadLat * 0.8);
    const padLng = Math.min(8, spreadLng * 0.8);
    const west = Math.max(-180, Math.min(...lngs) - padLng);
    const east = Math.min(180, Math.max(...lngs) + padLng);
    const south = Math.max(-90, Math.min(...lats) - padLat);
    const north = Math.min(90, Math.max(...lats) + padLat);
    return `${west},${north},${east},${south}`;
  }

  function categoryQuery(query, category) {
    const cleanQuery = normalizeQuery(query);
    const keyword = CATEGORY_KEYWORDS[category] || '';
    if (!keyword || normalizeText(cleanQuery).includes(normalizeText(keyword))) return cleanQuery;
    return `${keyword} ${cleanQuery}`;
  }

  function contextQuery(query, context = {}) {
    const cleanQuery = normalizeQuery(query);
    const area = normalizeQuery(context.area || '');
    if (!area || normalizeText(cleanQuery).includes(normalizeText(area)) || area.length > 80) return '';
    const countryCodes = inferCountryCodesFromText(area);
    if (countryCodes.length && area.split(/[·,;|/-]+/).length <= countryCodes.length + 1) return '';
    return `${cleanQuery}, ${area}`;
  }

  function buildRequests(query, options = {}) {
    const context = options.context || {};
    const category = options.category || '';
    const countryCodes = [...new Set([...(options.countryCodes || []), ...inferCountryCodesFromText(context.area || '')])];
    const viewbox = buildViewbox(context);
    const base = categoryQuery(query, category);
    const contextual = contextQuery(base, context);
    const variants = [contextual, base].filter(Boolean);
    const uniqueVariants = [...new Set(variants.map(normalizeQuery))];

    return uniqueVariants.slice(0, 2).map(q => ({
      q,
      countryCodes,
      viewbox,
      bounded: false
    }));
  }

  async function fetchNominatim(request, limit) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', request.q);
    url.searchParams.set('limit', String(Math.min(12, Math.max(1, limit || 8))));
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('extratags', '1');
    url.searchParams.set('namedetails', '1');
    url.searchParams.set('dedupe', '1');
    url.searchParams.set('accept-language', 'fr,en');
    if (request.countryCodes?.length) url.searchParams.set('countrycodes', request.countryCodes.join(','));
    if (request.viewbox) {
      url.searchParams.set('viewbox', request.viewbox);
      url.searchParams.set('bounded', request.bounded ? '1' : '0');
    }

    const response = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error('Recherche indisponible. Réessaie dans quelques secondes.');
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  function distanceKm(a, b) {
    if (!a || !b) return null;
    const R = 6371;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(Number(b.lat) - Number(a.lat));
    const dLng = toRad(Number(b.lng) - Number(a.lng));
    const lat1 = toRad(Number(a.lat));
    const lat2 = toRad(Number(b.lat));
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function simplify(result, query, context = {}) {
    const lat = Number(result?.lat);
    const lng = Number(result?.lon);
    const classification = classify(result);
    const center = getTripCenter(context);
    const distanceFromTripKm = center ? distanceKm({ lat, lng }, center) : null;
    const name = resultName(result);
    const displayName = result?.display_name || name;
    const normalizedName = normalizeText(name);
    const normalizedQuery = normalizeText(query);
    const exactBonus = normalizedName === normalizedQuery ? 2 : normalizedName.startsWith(normalizedQuery) ? 1 : 0;
    const distanceBonus = distanceFromTripKm == null ? 0 : Math.max(0, 1.2 - Math.min(distanceFromTripKm, 1200) / 1000);
    const classBonus = classification.type === 'ville' ? 0.4 : classification.type === 'autre' ? -0.15 : 0.25;
    const importance = Number(result?.importance) || 0;

    return {
      id: result?.place_id || `${lat},${lng}`,
      name,
      address: compactAddress(result) || displayName,
      displayName,
      lat,
      lng,
      type: classification.type,
      category: classification.label,
      osmClass: result?.class || '',
      osmType: result?.type || '',
      countryCode: result?.address?.country_code || '',
      importance,
      distanceFromTripKm,
      score: importance + exactBonus + distanceBonus + classBonus
    };
  }

  function dedupeResults(results) {
    const seen = new Set();
    return results.filter(item => {
      const key = [normalizeText(item.name), normalizeText(item.address).slice(0, 80), item.lat.toFixed(3), item.lng.toFixed(3)].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function search(query, options = {}) {
    const cleanQuery = normalizeQuery(query);
    if (cleanQuery.length < 2) return [];

    const coordinates = parseCoordinates(cleanQuery);
    if (coordinates) return [coordinates];

    const requests = buildRequests(cleanQuery, options);
    const cacheKey = JSON.stringify({
      q: cleanQuery.toLowerCase(),
      category: options.category || '',
      limit: options.limit || 8,
      area: options.context?.area || '',
      steps: (options.context?.steps || []).map(step => [Number(step.lat).toFixed(2), Number(step.lng).toFixed(2)]).join(';')
    });
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const collected = [];
    for (const request of requests) {
      const rawResults = await runThrottled(() => fetchNominatim(request, options.limit || 8));
      collected.push(...rawResults.map(result => simplify(result, cleanQuery, options.context || {})));
      if (collected.length >= (options.limit || 8)) break;
    }

    const results = dedupeResults(collected)
      .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit || 8);

    cache.set(cacheKey, results);
    return results;
  }

  function formatDistanceFromTrip(km) {
    if (km == null || !Number.isFinite(km)) return '';
    if (km < 1) return 'près du trajet';
    if (km < 50) return `${Math.round(km)} km du trajet`;
    return `${Math.round(km / 10) * 10} km du trajet`;
  }

  function attachStepSearch({ input, button, resultsContainer, statusElement, onSelect, getContext }) {
    if (!input || !resultsContainer || !statusElement) return;
    let currentToken = 0;
    let selectedCategory = '';

    const categoryButtons = [...document.querySelectorAll('[data-place-category]')];

    function setStatus(message) {
      statusElement.textContent = message || '';
    }

    function clearResults() {
      resultsContainer.innerHTML = '';
      resultsContainer.hidden = true;
    }

    function setCategory(category) {
      selectedCategory = category || '';
      categoryButtons.forEach(item => item.classList.toggle('is-active', item.dataset.placeCategory === selectedCategory));
    }

    function renderResults(results) {
      if (!results.length) {
        resultsContainer.innerHTML = `
          <div class="place-result-empty">
            Aucun résultat. Essaie avec une forme plus précise : <strong>nom, ville, pays</strong>.
          </div>
        `;
        resultsContainer.hidden = false;
        return;
      }
      resultsContainer.innerHTML = results.map(item => {
        const meta = [item.category, formatDistanceFromTrip(item.distanceFromTripKm), `${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}`].filter(Boolean).join(' · ');
        return `
          <button type="button" class="place-result" data-place-id="${String(item.id).replaceAll('"', '&quot;')}">
            <strong>${window.TravelUtils.escapeHtml(item.name)}</strong>
            <small>${window.TravelUtils.escapeHtml(item.address || item.displayName)}</small>
            <span>${window.TravelUtils.escapeHtml(meta)}</span>
          </button>
        `;
      }).join('');
      resultsContainer.hidden = false;
      resultsContainer.querySelectorAll('[data-place-id]').forEach(buttonEl => {
        buttonEl.addEventListener('click', () => {
          const selected = results.find(item => String(item.id) === buttonEl.dataset.placeId);
          if (!selected) return;
          onSelect?.(selected);
          input.value = selected.displayName;
          clearResults();
          setStatus('Lieu sélectionné. Tu peux enregistrer l’étape.');
        });
      });
    }

    async function performSearch() {
      const query = normalizeQuery(input.value);
      const token = ++currentToken;
      if (query.length < 2) {
        clearResults();
        setStatus('Saisis au moins 2 caractères.');
        return;
      }
      clearResults();
      const categoryLabel = selectedCategory ? ` · ${selectedCategory}` : '';
      setStatus(`Recherche${categoryLabel}…`);
      try {
        const results = await search(query, {
          limit: 8,
          category: selectedCategory,
          context: getContext?.() || {}
        });
        if (token !== currentToken) return;
        renderResults(results);
        setStatus(results.length ? `${results.length} résultat${results.length > 1 ? 's' : ''}.` : 'Aucun lieu trouvé.');
      } catch (error) {
        if (token !== currentToken) return;
        clearResults();
        setStatus(error.message || 'Recherche impossible.');
      }
    }

    input.addEventListener('input', () => {
      clearResults();
      setStatus('Appuie sur Entrée ou sur Rechercher.');
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        performSearch();
      }
      if (event.key === 'Escape') clearResults();
    });
    button?.addEventListener('click', performSearch);
    categoryButtons.forEach(item => {
      item.addEventListener('click', () => {
        setCategory(item.dataset.placeCategory || '');
        if (normalizeQuery(input.value).length >= 2) performSearch();
      });
    });
    setCategory('');
  }

  window.TravelGeocoder = { search, attachStepSearch, inferCountryCodesFromText };
})();
