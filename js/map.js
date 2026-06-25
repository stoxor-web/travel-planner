(function () {
  'use strict';

  let map;
  let markersLayer;
  let routeLayer;
  let activeTypes = new Set();
  let activeTripId = null;
  const markerByStepId = new Map();

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

  function isMapVisible() {
    const element = getMapElement();
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function showMapMessage(message) {
    const element = getMapElement();
    if (!element) return;
    element.innerHTML = `<div class="map-message">${window.TravelUtils.escapeHtml(message)}</div>`;
  }

  function clearMapMessage() {
    const element = getMapElement();
    if (!element) return;
    const message = element.querySelector('.map-message');
    if (message) message.remove();
  }

  function initMap() {
    const element = getMapElement();
    if (map) return true;
    if (!element) return false;
    if (!window.L) {
      showMapMessage('Carte indisponible. Vérifie ta connexion internet puis recharge la page.');
      return false;
    }
    if (!isMapVisible()) return false;

    clearMapMessage();
    map = L.map(element, {
      zoomControl: true,
      scrollWheelZoom: true,
      preferCanvas: true
    }).setView([46.6, 2.4], 5);

    const baseLayers = {};
    Object.entries(tileLayers).forEach(([name, config]) => {
      baseLayers[name] = L.tileLayer(config.url, config.options);
    });
    baseLayers.classique.addTo(map);
    L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    invalidate(120);
    return true;
  }

  function invalidate(delay = 80) {
    if (!map) return;
    setTimeout(() => {
      map.invalidateSize({ pan: false });
    }, delay);
  }

  function syncActiveTypes(trip) {
    const tripId = trip?.id || null;
    const types = window.TravelUtils.unique((trip?.steps || []).map(step => step.type));

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

  function updateMap(trip, settings) {
    syncActiveTypes(trip);
    if (!initMap()) return;
    if (!markersLayer || !routeLayer) return;

    markersLayer.clearLayers();
    routeLayer.clearLayers();
    markerByStepId.clear();

    const steps = window.TravelUtils.sortSteps(trip?.steps || []).filter(step => window.TravelUtils.isValidCoord(step));
    if (!steps.length) {
      map.setView([46.6, 2.4], 5);
      invalidate();
      return;
    }

    const selected = steps.filter(step => !activeTypes.size || activeTypes.has(step.type));
    const coordinates = selected.map(step => [Number(step.lat), Number(step.lng)]);

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
        <strong>${window.TravelUtils.escapeHtml(step.name)}</strong><br>
        ${window.TravelUtils.escapeHtml(step.type || 'étape')} · ${window.TravelUtils.escapeHtml(step.priority || '')}<br>
        ${step.arrivalDate ? window.TravelUtils.formatDate(step.arrivalDate) : ''}
        ${step.address ? `<p>${window.TravelUtils.escapeHtml(step.address)}</p>` : ''}
        ${step.notes ? `<p>${window.TravelUtils.escapeHtml(step.notes)}</p>` : ''}
      `);
      marker.addTo(markersLayer);
      markerByStepId.set(step.id, marker);
    });

    if (coordinates.length >= 2) {
      L.polyline(coordinates, { weight: 4, opacity: .8, dashArray: '8 8' }).addTo(routeLayer);
    }

    fitBounds();
    invalidate();
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
    if (!initMap()) return;
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
    container.innerHTML = types.map(type => `<button class="chip ${activeTypes.has(type) ? '' : 'is-muted'}" data-map-type="${window.TravelUtils.escapeHtml(type)}">${window.TravelUtils.escapeHtml(type)}</button>`).join('');
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
      <button class="map-step" data-focus-step="${step.id}">
        <strong>${index + 1}. ${window.TravelUtils.escapeHtml(step.name)}</strong>
        <small>${window.TravelUtils.escapeHtml(step.type)} · ${window.TravelUtils.escapeHtml(step.address || (window.TravelUtils.isValidCoord(step) ? `${step.lat}, ${step.lng}` : 'coordonnées manquantes'))}</small>
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
