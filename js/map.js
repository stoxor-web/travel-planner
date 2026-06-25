(function () {
  'use strict';

  const DEFAULT_CENTER = [46.603354, 1.888334];
  const DEFAULT_ZOOM = 5;
  const LEAFLET_CSS_URLS = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
  ];
  const LEAFLET_JS_URLS = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
  ];

  let map = null;
  let markersLayer = null;
  let routeLayer = null;
  let tileLayer = null;
  let activeTypes = new Set();
  let knownTypesSignature = '';
  let pendingTrip = null;
  let pendingSettings = null;
  let loadingPromise = null;
  let lastError = '';

  const tileLayers = {
    classique: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }
    },
    clair: {
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      options: {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }
    },
    terrain: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      options: {
        maxZoom: 17,
        attribution: '&copy; OpenStreetMap contributors &copy; OpenTopoMap'
      }
    }
  };

  function getUtils() {
    return window.TravelUtils || {};
  }

  function getMapElement() {
    return document.getElementById('travelMap');
  }

  function getMapCard() {
    const element = getMapElement();
    return element?.closest('.map-card') || element?.parentElement || null;
  }

  function ensureMapStatus() {
    const card = getMapCard();
    if (!card) return null;
    let status = card.querySelector('#mapStatus');
    if (!status) {
      status = document.createElement('div');
      status.id = 'mapStatus';
      status.className = 'map-status';
      status.hidden = true;
      card.appendChild(status);
    }
    return status;
  }

  function setMapStatus(message, type = 'info') {
    const status = ensureMapStatus();
    if (!status) return;
    if (!message) {
      status.hidden = true;
      status.innerHTML = '';
      status.className = 'map-status';
      return;
    }
    status.hidden = false;
    status.className = `map-status map-status--${type}`;
    status.innerHTML = message;
  }

  function loadCssOnce(url) {
    if ([...document.styleSheets].some(sheet => sheet.href === url) || document.querySelector(`link[href="${url}"]`)) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
  }

  function loadScript(url) {
    if (window.L) return Promise.resolve();
    if (document.querySelector(`script[src="${url}"]`)) {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (window.L) {
            clearInterval(timer);
            resolve();
          } else if (Date.now() - start > 6000) {
            clearInterval(timer);
            reject(new Error('Leaflet ne répond pas.'));
          }
        }, 120);
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = () => window.L ? resolve() : reject(new Error('Leaflet chargé mais indisponible.'));
      script.onerror = () => reject(new Error(`Chargement impossible : ${url}`));
      document.head.appendChild(script);
    });
  }

  async function ensureLeaflet() {
    if (window.L) return;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      setMapStatus('Chargement de la carte…', 'loading');
      await Promise.all(LEAFLET_CSS_URLS.map(loadCssOnce));

      let lastLoadError = null;
      for (const url of LEAFLET_JS_URLS) {
        try {
          await loadScript(url);
          if (window.L) return;
        } catch (error) {
          lastLoadError = error;
        }
      }
      throw lastLoadError || new Error('Leaflet ne s’est pas chargé.');
    })();

    return loadingPromise;
  }

  function isMapVisible() {
    const element = getMapElement();
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  async function initMap() {
    const element = getMapElement();
    if (!element) return null;
    if (map) {
      invalidate();
      return map;
    }

    try {
      await ensureLeaflet();
      if (!window.L) throw new Error('La bibliothèque de carte est indisponible.');

      map = L.map(element, {
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true
      }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

      const baseLayers = {};
      Object.entries(tileLayers).forEach(([name, config]) => {
        baseLayers[name] = L.tileLayer(config.url, config.options);
      });

      tileLayer = baseLayers.classique.addTo(map);
      tileLayer.on('tileerror', () => {
        setMapStatus('Certaines tuiles de carte ne se chargent pas. La connexion ou le fournisseur de tuiles peut être temporairement indisponible.', 'warning');
      });

      L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);
      markersLayer = L.layerGroup().addTo(map);
      routeLayer = L.layerGroup().addTo(map);
      setMapStatus('', 'info');
      invalidate();
      return map;
    } catch (error) {
      lastError = error.message || 'Carte indisponible.';
      console.error('[TravelMap]', error);
      renderFallback(pendingTrip, lastError);
      return null;
    }
  }

  function invalidate() {
    if (!map) return;
    window.requestAnimationFrame(() => {
      try {
        map.invalidateSize(true);
        setTimeout(() => map.invalidateSize(true), 200);
      } catch (error) {
        console.warn('[TravelMap] invalidateSize impossible', error);
      }
    });
  }

  function getValidSteps(trip) {
    const U = getUtils();
    const sortSteps = U.sortSteps || (steps => steps || []);
    const isValidCoord = U.isValidCoord || (step => Number.isFinite(Number(step?.lat)) && Number.isFinite(Number(step?.lng)));
    return sortSteps(trip?.steps || []).filter(step => isValidCoord(step));
  }

  function syncActiveTypes(trip) {
    const U = getUtils();
    const unique = U.unique || (values => [...new Set(values.filter(Boolean))]);
    const types = unique((trip?.steps || []).map(step => step.type || 'étape'));
    const signature = types.join('|');
    if (!types.length) {
      activeTypes = new Set();
      knownTypesSignature = '';
      return types;
    }
    if (!knownTypesSignature || knownTypesSignature !== signature) {
      activeTypes = new Set(types);
      knownTypesSignature = signature;
      return types;
    }
    types.forEach(type => {
      if (!activeTypes.has(type) && !knownTypesSignature.includes(type)) activeTypes.add(type);
    });
    return types;
  }

  async function updateMap(trip, settings) {
    pendingTrip = trip || null;
    pendingSettings = settings || null;
    syncActiveTypes(trip);

    const mapInstance = await initMap();
    if (!mapInstance) return;
    drawTrip(trip);
  }

  function drawTrip(trip) {
    if (!map || !markersLayer || !routeLayer) return;
    const U = getUtils();
    const escapeHtml = U.escapeHtml || (value => String(value ?? ''));
    const formatDate = U.formatDate || (value => value || '');
    const isValidCoord = U.isValidCoord || (step => Number.isFinite(Number(step?.lat)) && Number.isFinite(Number(step?.lng)));

    markersLayer.clearLayers();
    routeLayer.clearLayers();

    const steps = getValidSteps(trip);
    if (!steps.length) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      setMapStatus('Ajoute au moins une étape avec une adresse ou des coordonnées pour afficher la carte du voyage.', 'empty');
      return;
    }

    const selected = steps.filter(step => !activeTypes.size || activeTypes.has(step.type || 'étape'));
    if (!selected.length) {
      setMapStatus('Toutes les catégories sont masquées. Active au moins un filtre pour afficher les marqueurs.', 'empty');
      return;
    }

    setMapStatus('', 'info');

    const coordinates = selected.map(step => [Number(step.lat), Number(step.lng)]);
    selected.forEach((step, index) => {
      if (!isValidCoord(step)) return;
      const marker = L.marker([Number(step.lat), Number(step.lng)], {
        icon: L.divIcon({
          className: 'custom-marker-wrap',
          html: `<div class="custom-marker" style="background:${escapeHtml(step.color || '#2563eb')}"><span>${index + 1}</span></div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 34],
          popupAnchor: [0, -30]
        })
      });
      marker.bindPopup(`
        <strong>${escapeHtml(step.name || 'Étape')}</strong><br>
        ${escapeHtml(step.type || 'étape')} ${step.priority ? `· ${escapeHtml(step.priority)}` : ''}<br>
        ${step.arrivalDate ? formatDate(step.arrivalDate) : ''}
        ${step.address ? `<p>${escapeHtml(step.address)}</p>` : ''}
        ${step.notes ? `<p>${escapeHtml(step.notes)}</p>` : ''}
      `);
      marker.addTo(markersLayer);
    });

    if (coordinates.length >= 2) {
      L.polyline(coordinates, {
        weight: 4,
        opacity: 0.85,
        dashArray: '8 8',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(routeLayer);
    }

    fitBounds();
    invalidate();
  }

  function fitBounds() {
    if (!map || !markersLayer) return;
    const layers = markersLayer.getLayers();
    if (!layers.length) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    if (layers.length === 1) {
      const latLng = layers[0].getLatLng();
      map.setView(latLng, 12, { animate: true });
      return;
    }
    const group = L.featureGroup(layers);
    map.fitBounds(group.getBounds().pad(0.25), { animate: true, maxZoom: 12 });
  }

  function renderFallback(trip, reason) {
    const steps = getValidSteps(trip);
    const U = getUtils();
    const escapeHtml = U.escapeHtml || (value => String(value ?? ''));
    const status = ensureMapStatus();
    if (!status) return;
    status.hidden = false;
    status.className = 'map-status map-status--error map-status--fallback';

    const links = steps.map((step, index) => {
      const url = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(step.lat)}&mlon=${encodeURIComponent(step.lng)}#map=13/${encodeURIComponent(step.lat)}/${encodeURIComponent(step.lng)}`;
      return `<a href="${url}" target="_blank" rel="noopener">${index + 1}. ${escapeHtml(step.name || 'Étape')}</a>`;
    }).join('');

    status.innerHTML = `
      <strong>Carte indisponible</strong>
      <p>${escapeHtml(reason || 'Le module Leaflet ou les tuiles OpenStreetMap ne se chargent pas.')}</p>
      ${steps.length ? `<div class="map-fallback-links">${links}</div>` : '<p>Ajoute une étape avec coordonnées pour générer les liens carte.</p>'}
    `;
  }

  function renderFilters(container, trip, onToggle) {
    if (!container) return;
    const U = getUtils();
    const escapeHtml = U.escapeHtml || (value => String(value ?? ''));
    const types = syncActiveTypes(trip);

    if (!types.length) {
      container.innerHTML = '<span class="chip">aucune catégorie</span>';
      return;
    }

    container.innerHTML = types.map(type => `<button type="button" class="chip ${activeTypes.has(type) ? '' : 'is-muted'}" data-map-type="${escapeHtml(type)}">${escapeHtml(type)}</button>`).join('');
    container.querySelectorAll('[data-map-type]').forEach(button => {
      button.addEventListener('click', () => {
        const type = button.dataset.mapType;
        if (activeTypes.has(type)) activeTypes.delete(type);
        else activeTypes.add(type);
        if (!activeTypes.size) types.forEach(item => activeTypes.add(item));
        if (typeof onToggle === 'function') onToggle();
      });
    });
  }

  function renderMapSteps(container, trip) {
    if (!container) return;
    const U = getUtils();
    const sortSteps = U.sortSteps || (steps => steps || []);
    const isValidCoord = U.isValidCoord || (step => Number.isFinite(Number(step?.lat)) && Number.isFinite(Number(step?.lng)));
    const escapeHtml = U.escapeHtml || (value => String(value ?? ''));
    const steps = sortSteps(trip?.steps || []);

    if (!steps.length) {
      container.innerHTML = '<div class="empty-state">Aucune étape à afficher sur la carte.</div>';
      return;
    }

    container.innerHTML = steps.map((step, index) => `
      <button type="button" class="map-step" data-focus-step="${escapeHtml(step.id)}">
        <strong>${index + 1}. ${escapeHtml(step.name || 'Étape')}</strong>
        <small>${escapeHtml(step.type || 'étape')} · ${escapeHtml(step.address || (isValidCoord(step) ? `${step.lat}, ${step.lng}` : 'coordonnées manquantes'))}</small>
      </button>
    `).join('');

    container.querySelectorAll('[data-focus-step]').forEach(button => {
      button.addEventListener('click', async () => {
        const step = steps.find(item => item.id === button.dataset.focusStep);
        if (!step || !isValidCoord(step)) return;
        await initMap();
        if (map) {
          map.setView([Number(step.lat), Number(step.lng)], 13, { animate: true });
        } else {
          const url = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(step.lat)}&mlon=${encodeURIComponent(step.lng)}#map=13/${encodeURIComponent(step.lat)}/${encodeURIComponent(step.lng)}`;
          window.open(url, '_blank', 'noopener');
        }
      });
    });
  }

  function activate() {
    initMap().then(() => {
      invalidate();
      if (pendingTrip) drawTrip(pendingTrip);
    });
  }

  function resetFilters() {
    activeTypes = new Set();
    knownTypesSignature = '';
  }

  function getDiagnostics() {
    const element = getMapElement();
    const rect = element?.getBoundingClientRect();
    return {
      leafletLoaded: Boolean(window.L),
      mapCreated: Boolean(map),
      containerFound: Boolean(element),
      containerWidth: rect ? Math.round(rect.width) : 0,
      containerHeight: rect ? Math.round(rect.height) : 0,
      visible: isMapVisible(),
      lastError
    };
  }

  window.TravelMap = {
    initMap,
    activate,
    updateMap,
    invalidate,
    fitBounds,
    renderFilters,
    renderMapSteps,
    resetFilters,
    getDiagnostics
  };
})();
