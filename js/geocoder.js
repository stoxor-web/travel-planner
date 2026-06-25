(function () {
  'use strict';

  const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
  const MIN_DELAY_MS = 1150;
  const cache = new Map();
  let lastRequestAt = 0;
  let pending = Promise.resolve();

  const categoryHints = {
    ville: 'ville city town',
    hôtel: 'hotel hébergement',
    restaurant: 'restaurant',
    gare: 'gare train station railway station',
    aéroport: 'airport aéroport',
    activité: 'attraction museum monument activity'
  };

  function normalizeQuery(query) {
    return String(query || '').trim().replace(/\s+/g, ' ');
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function runThrottled(task) {
    pending = pending.then(async () => {
      const now = Date.now();
      const elapsed = now - lastRequestAt;
      if (elapsed < MIN_DELAY_MS) await wait(MIN_DELAY_MS - elapsed);
      lastRequestAt = Date.now();
      return task();
    });
    return pending;
  }

  function parseCoordinates(query) {
    const match = String(query || '').trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)$/);
    if (!match) return null;
    const lat = Number(match[1].replace(',', '.'));
    const lng = Number(match[2].replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return {
      id: `${lat},${lng}`,
      name: `Point GPS ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      displayName: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      lat,
      lng,
      type: 'autre',
      importance: 1
    };
  }

  function compactAddress(result) {
    const address = result?.address || {};
    return [
      [address.house_number, address.road].filter(Boolean).join(' '),
      address.neighbourhood || address.suburb,
      address.city || address.town || address.village || address.municipality,
      address.state,
      address.country
    ].filter(Boolean).join(', ');
  }

  function guessType(result) {
    const type = String(result?.type || result?.class || '').toLowerCase();
    const display = String(result?.display_name || '').toLowerCase();
    if (type.includes('hotel') || display.includes('hotel') || display.includes('hôtel')) return 'hôtel';
    if (type.includes('restaurant') || display.includes('restaurant')) return 'restaurant';
    if (type.includes('station') || display.includes('gare') || display.includes('railway')) return 'gare';
    if (type.includes('airport') || display.includes('aéroport')) return 'aéroport';
    if (type.includes('parking') || display.includes('parking')) return 'parking';
    if (type.includes('beach') || display.includes('plage')) return 'plage';
    if (type.includes('viewpoint') || display.includes('point de vue')) return 'point de vue';
    if (['city', 'town', 'village', 'municipality'].some(item => type.includes(item))) return 'ville';
    if (['attraction', 'museum', 'monument', 'tourism', 'artwork'].some(item => type.includes(item) || display.includes(item))) return 'activité';
    return 'autre';
  }

  function simplify(result) {
    const name = result?.name || result?.namedetails?.name || result?.display_name?.split(',')?.[0] || 'Lieu';
    return {
      id: result?.place_id || `${result?.lat},${result?.lon}`,
      name,
      address: compactAddress(result) || result?.display_name || '',
      displayName: result?.display_name || name,
      lat: Number(result?.lat),
      lng: Number(result?.lon),
      type: guessType(result),
      importance: Number(result?.importance) || 0
    };
  }

  function enrichQuery(query, category, trip) {
    let output = normalizeQuery(query);
    if (category && categoryHints[category]) output = `${output} ${categoryHints[category]}`;
    const area = normalizeQuery(trip?.area || '');
    if (area && !output.toLowerCase().includes(area.toLowerCase())) output = `${output}, ${area}`;
    return output;
  }

  function dedupePlaces(results) {
    const seen = new Set();
    return results.filter(item => {
      const key = `${item.name.toLowerCase()}|${item.lat.toFixed(3)}|${item.lng.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function search(query, options = {}) {
    const cleanQuery = normalizeQuery(query);
    if (cleanQuery.length < 3) return [];

    const coordinates = parseCoordinates(cleanQuery);
    if (coordinates) return [coordinates];

    const enriched = enrichQuery(cleanQuery, options.category || '', options.trip || null);
    const cacheKey = `${enriched.toLowerCase()}|${options.limit || 7}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const results = await runThrottled(async () => {
      const url = new URL(ENDPOINT);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('q', enriched);
      url.searchParams.set('limit', String(options.limit || 7));
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('namedetails', '1');
      url.searchParams.set('extratags', '1');
      url.searchParams.set('dedupe', '1');
      url.searchParams.set('accept-language', 'fr');

      const response = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error('Recherche indisponible pour le moment.');
      const data = await response.json();
      return dedupePlaces((Array.isArray(data) ? data : [])
        .map(simplify)
        .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)))
        .sort((a, b) => b.importance - a.importance);
    });

    cache.set(cacheKey, results);
    return results;
  }

  function attachStepSearch({ input, button, resultsContainer, statusElement, onSelect, getCategory, getContext }) {
    if (!input || !resultsContainer || !statusElement) return;
    let currentToken = 0;

    function setStatus(message) {
      statusElement.textContent = message || '';
    }

    function clearResults() {
      resultsContainer.innerHTML = '';
      resultsContainer.hidden = true;
    }

    function renderResults(results) {
      if (!results.length) {
        resultsContainer.innerHTML = '<div class="place-result-empty">Aucun résultat trouvé. Essaie avec “nom, ville, pays” ou colle des coordonnées GPS.</div>';
        resultsContainer.hidden = false;
        return;
      }
      resultsContainer.innerHTML = results.map(item => `
        <button type="button" class="place-result" data-place-id="${String(item.id).replaceAll('"', '&quot;')}">
          <strong>${window.TravelUtils.escapeHtml(item.name)}</strong>
          <small>${window.TravelUtils.escapeHtml(item.address || item.displayName)}</small>
          <span>${window.TravelUtils.escapeHtml(item.type)} · ${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}</span>
        </button>
      `).join('');
      resultsContainer.hidden = false;
      resultsContainer.querySelectorAll('[data-place-id]').forEach(buttonEl => {
        buttonEl.addEventListener('click', () => {
          const selected = results.find(item => String(item.id) === buttonEl.dataset.placeId);
          if (!selected) return;
          onSelect?.(selected);
          input.value = selected.displayName;
          clearResults();
          setStatus('Lieu ajouté au formulaire.');
        });
      });
    }

    async function performSearch() {
      const query = normalizeQuery(input.value);
      const token = ++currentToken;
      if (query.length < 3) {
        clearResults();
        setStatus('');
        return;
      }
      setStatus('Recherche…');
      try {
        const results = await search(query, { limit: 7, category: getCategory?.() || '', trip: getContext?.() || null });
        if (token !== currentToken) return;
        renderResults(results);
        setStatus(results.length ? 'Choisis le bon résultat.' : 'Aucun lieu trouvé.');
      } catch (error) {
        if (token !== currentToken) return;
        clearResults();
        setStatus(error.message || 'Recherche impossible.');
      }
    }

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        performSearch();
      }
      if (event.key === 'Escape') clearResults();
    });
    button?.addEventListener('click', performSearch);
  }

  window.TravelGeocoder = { search, attachStepSearch };
})();
