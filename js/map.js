(function () {
  'use strict';

  let map;
  let markersLayer;
  let routeLayer;
  let activeTypes = new Set();
  let activeTripId = null;
  let leafletLoading = false;
  let leafletLoadTried = false;
  let resizeObserver;
  let lastTrip = null;
  let lastSettings = null;
  const markerByStepId = new Map();

  const leafletFallback = {
    css: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
    js: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'
  };

  const tileLayers = {
    classique: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }
    },
    clair: {
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      options: { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }
    },
    terrain: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      options: { maxZoom: 17, attribution: '&copy; OpenStreetMap contributors &copy; OpenTopoMap' }
    }
  };

  function getMapElement() {
    return document.getElementById('travelMap');
  }

  function escapeHtml(value) {
    return window.TravelUtils?.escapeHtml ? window.TravelUtils.escapeHtml(value) : String(value ?? '');
  }

  function isMapVisible() {
    const element = getMapElement();
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 20 && rect.height > 20 && window.getComputedStyle(element).display !== 'none';
  }

  function showMapMessage(message, tone = '') {
    const element = getMapElement();
    if (!element) return;
    let messageBox = element.querySelector('.map-message');
    if (!messageBox) {
      messageBox = document.createElement('div');
      messageBox.className = 'map-message';
      element.appendChild(messageBox);
    }
    messageBox.className = `map-message ${tone}`.trim();
    messageBox.innerHTML = `<span>${escapeHtml(message)}</span>`;
  }

  function clearMapMessage() {
    const element = getMapElement();
    if (!element) return;
    element.querySelectorAll('.map-message').forEach(message => message.remove());
  }

  function injectLeafletCssFallback() {
    const existing = [...document.styleSheets].some(sheet => String(sheet.href || '').includes('leaflet'));
    if (existing || document.querySelector('link[data-leaflet-fallback]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = leafletFallback.css;
    link.dataset.leafletFallback = 'true';
    document.head.appendChild(link);
  }

  function loadLeafletFallback() {
    if (window.L) return Promise.resolve(true);
    if (leafletLoading) return Promise.resolve(false);
    leafletLoading = true;
    leafletLoadTried = true;
    injectLeafletCssFallback();
    showMapMessage('Chargement de la carte…');

    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = leafletFallback.js;
      script.async = true;
      script.dataset.leafletFallback = 'true';
      script.onload = () => {
        leafletLoading = false;
        if (window.L) {
          clearMapMessage();
          requestAnimationFrame(() => {
            updateMap(lastTrip, lastSettings);
            invalidate(180);
          });
          resolve(true);
        } else {
          showMapMessage('La carte ne peut pas se charger pour le moment.', 'is-error');
          resolve(false);
        }
      };
      script.onerror = () => {
        leafletLoading = false;
        showMapMessage('Carte indisponible. Vérifie la connexion internet puis recharge la page.', 'is-error');
        renderStaticFallback(lastTrip);
        resolve(false);
      };
      document.body.appendChild(script);
    });
  }

  function observeResize() {
    const element = getMapElement();
    if (!element || resizeObserver) return;
    resizeObserver = new ResizeObserver(() => invalidate(80));
    resizeObserver.observe(element);
  }

  function initMap() {
    const element = getMapElement();
    if (map) {
      invalidate(80);
      return true;
    }
    if (!element) return false;

    if (!window.L) {
      if (!leafletLoadTried || !leafletLoading) loadLeafletFallback();
      return false;
    }

    if (!isMapVisible()) {
      setTimeout(() => {
        if (!map && isMapVisible()) updateMap(lastTrip, lastSettings);
      }, 120);
      return false;
    }

    clearMapMessage();
    element.innerHTML = '';
    element.classList.add('is-map-ready');

    map = L.map(element, {
      zoomControl: true,
      scrollWheelZoom: true,
      preferCanvas: true,
      worldCopyJump: true
    }).setView([46.6, 2.4], 5);

    const baseLayers = {};
    Object.entries(tileLayers).forEach(([name, config]) => {
      baseLayers[name] = L.tileLayer(config.url, config.options);
    });
    baseLayers.classique.addTo(map);
    L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    observeResize();
    invalidate(120);
    return true;
  }

  function invalidate(delay = 80) {
    if (!map) return;
    setTimeout(() => {
      if (!map) return;
      map.invalidateSize({ pan: false });
    }, delay);
  }

  function syncActiveTypes(trip) {
    const tripId = trip?.id || null;
    const types = window.TravelUtils.unique((trip?.steps || []).map(step => step.type || 'autre'));

    if (!types.length) {
      activeTypes = new Set();
      activeTripId = tripId;
      return types;
    }

    if (activeTripId !== tripId || !activeTypes.size) {
      activeTypes = new Set(types);
      activeTripId = tripId;
      return types;
    }

    const currentTypes = new Set(types);
    activeTypes = new Set([...activeTypes].filter(type => currentTypes.has(type)));
    types.forEach(type => activeTypes.add(type));
    if (!activeTypes.size) activeTypes = new Set(types);
    return types;
  }

  function getSortedValidSteps(trip) {
    return window.TravelUtils
      .sortSteps(trip?.steps || [])
      .filter(step => window.TravelUtils.isValidCoord(step));
  }

  function updateMap(trip, settings) {
    lastTrip = trip || null;
    lastSettings = settings || null;
    syncActiveTypes(trip);

    if (!trip) {
      renderStaticFallback(null, 'Sélectionne ou crée un voyage pour afficher la carte.');
      return;
    }

    const allValidSteps = getSortedValidSteps(trip);
    if (!allValidSteps.length) {
      renderStaticFallback(trip, 'Ajoute au moins une étape avec une adresse ou des coordonnées GPS.');
      return;
    }

    if (!initMap()) {
      renderStaticFallback(trip, leafletLoading ? 'Chargement de la carte…' : 'Carte en attente de chargement.');
      return;
    }
    if (!markersLayer || !routeLayer) return;

    clearMapMessage();
    markersLayer.clearLayers();
    routeLayer.clearLayers();
    markerByStepId.clear();

    const selected = allValidSteps.filter(step => !activeTypes.size || activeTypes.has(step.type || 'autre'));
    const coordinates = selected.map(step => [Number(step.lat), Number(step.lng)]);

    if (!selected.length) {
      showMapMessage('Toutes les catégories sont masquées.', 'is-muted');
      return;
    }

    selected.forEach((step, index) => {
      const marker = L.marker([Number(step.lat), Number(step.lng)], {
        icon: L.divIcon({
          className: '',
          html: `<div class="custom-marker" style="background:${step.color || '#2563eb'}"><span>${index + 1}</span></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30],
          popupAnchor: [0, -28]
        })
      });
      marker.bindPopup(`
        <strong>${escapeHtml(step.name)}</strong><br>
        ${escapeHtml(step.type || 'étape')} · ${escapeHtml(step.priority || '')}<br>
        ${step.arrivalDate ? window.TravelUtils.formatDate(step.arrivalDate) : ''}
        ${step.address ? `<p>${escapeHtml(step.address)}</p>` : ''}
        ${step.notes ? `<p>${escapeHtml(step.notes)}</p>` : ''}
      `);
      marker.addTo(markersLayer);
      markerByStepId.set(step.id, marker);
    });

    if (coordinates.length >= 2) {
      L.polyline(coordinates, { weight: 4, opacity: 0.85, dashArray: '8 8' }).addTo(routeLayer);
    }

    fitBounds();
    invalidate(180);
  }

  function renderStaticFallback(trip, message = '') {
    const element = getMapElement();
    if (!element || map) return;
    const steps = getSortedValidSteps(trip);
    const stepList = steps.length
      ? `<div class="static-map-list">${steps.map((step, index) => `
          <button type="button" data-static-focus-step="${escapeHtml(step.id)}">
            <strong>${index + 1}. ${escapeHtml(step.name)}</strong>
            <small>${escapeHtml(step.address || `${Number(step.lat).toFixed(5)}, ${Number(step.lng).toFixed(5)}`)}</small>
          </button>
        `).join('')}</div>`
      : '';
    element.innerHTML = `
      <div class="static-map-fallback">
        <div class="static-map-fallback__route"></div>
        <div class="static-map-fallback__content">
          <div class="map-message ${message.includes('indisponible') ? 'is-error' : ''}">${escapeHtml(message || 'Carte en cours de préparation.')}</div>
          ${stepList}
        </div>
      </div>
    `;
    element.querySelectorAll('[data-static-focus-step]').forEach(button => {
      button.addEventListener('click', () => {
        const step = steps.find(item => item.id === button.dataset.staticFocusStep);
        if (step) focusStep(step);
      });
    });
  }

  function fitBounds() {
    if (!map || !markersLayer) return;
    const layers = markersLayer.getLayers();
    if (!layers.length) return;
    const group = L.featureGroup(layers);
    const bounds = group.getBounds();
    if (!bounds.isValid()) return;
    if (layers.length === 1) {
      const latLng = layers[0].getLatLng();
      map.setView(latLng, 12, { animate: true });
      return;
    }
    map.fitBounds(bounds.pad(0.25), { animate: true, maxZoom: 13 });
  }

  function focusStep(step) {
    if (!step || !window.TravelUtils.isValidCoord(step)) return;
    if (!initMap()) {
      lastTrip = lastTrip || null;
      return;
    }
    const latLng = [Number(step.lat), Number(step.lng)];
    map.setView(latLng, 13, { animate: true });
    setTimeout(() => markerByStepId.get(step.id)?.openPopup(), 150);
  }

  function renderFilters(container, trip, onToggle) {
    if (!container) return;
    const types = syncActiveTypes(trip);
    if (!types.length) {
      container.innerHTML = '<span class="chip">aucune catégorie</span>';
      return;
    }
    container.innerHTML = types.map(type => `<button class="chip ${activeTypes.has(type) ? '' : 'is-muted'}" data-map-type="${escapeHtml(type)}">${escapeHtml(type)}</button>`).join('');
    container.querySelectorAll('[data-map-type]').forEach(button => {
      button.addEventListener('click', () => {
        const type = button.dataset.mapType;
        if (activeTypes.has(type)) activeTypes.delete(type);
        else activeTypes.add(type);
        if (!activeTypes.size) types.forEach(item => activeTypes.add(item));
        onToggle?.();
      });
    });
  }

  function renderMapSteps(container, trip) {
    if (!container) return;
    const steps = window.TravelUtils.sortSteps(trip?.steps || []);
    if (!steps.length) {
      container.innerHTML = '<div class="empty-state">Aucune étape à afficher sur la carte.</div>';
      return;
    }
    container.innerHTML = steps.map((step, index) => `
      <button class="map-step" data-focus-step="${escapeHtml(step.id)}">
        <strong>${index + 1}. ${escapeHtml(step.name)}</strong>
        <small>${escapeHtml(step.type || 'étape')} · ${escapeHtml(step.address || (window.TravelUtils.isValidCoord(step) ? `${step.lat}, ${step.lng}` : 'coordonnées manquantes'))}</small>
      </button>
    `).join('');
    container.querySelectorAll('[data-focus-step]').forEach(button => {
      button.addEventListener('click', () => {
        const step = steps.find(item => item.id === button.dataset.focusStep);
        focusStep(step);
      });
    });
  }

  function resetFilters() {
    activeTypes = new Set();
    activeTripId = null;
  }

  window.TravelMap = {
    initMap,
    updateMap,
    invalidate,
    fitBounds,
    focusStep,
    renderFilters,
    renderMapSteps,
    resetFilters
  };
})();
