(function () {
  'use strict';

  let map;
  let markersLayer;
  let routeLayer;
  let activeTypes = new Set();

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

  function initMap() {
    if (map || !document.getElementById('travelMap') || !window.L) return;
    map = L.map('travelMap', { zoomControl: true, scrollWheelZoom: true }).setView([46.6, 2.4], 5);
    const baseLayers = {};
    Object.entries(tileLayers).forEach(([name, config]) => { baseLayers[name] = L.tileLayer(config.url, config.options); });
    baseLayers.classique.addTo(map);
    L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
  }

  function invalidate() {
    if (map) setTimeout(() => map.invalidateSize(), 80);
  }

  function updateMap(trip, settings) {
    initMap();
    if (!map) return;
    markersLayer.clearLayers();
    routeLayer.clearLayers();

    const steps = window.TravelUtils.sortSteps(trip?.steps || []).filter(step => window.TravelUtils.isValidCoord(step));
    if (!steps.length) {
      map.setView([46.6, 2.4], 5);
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
        ${step.notes ? `<p>${window.TravelUtils.escapeHtml(step.notes)}</p>` : ''}
      `);
      marker.addTo(markersLayer);
    });

    if (coordinates.length >= 2) {
      L.polyline(coordinates, { weight: 4, opacity: .8, dashArray: '8 8' }).addTo(routeLayer);
    }
    fitBounds();
  }

  function fitBounds() {
    if (!map || !markersLayer) return;
    const layers = markersLayer.getLayers();
    if (!layers.length) return;
    const group = L.featureGroup(layers);
    map.fitBounds(group.getBounds().pad(0.25), { animate: true });
  }

  function renderFilters(container, trip, onToggle) {
    const types = window.TravelUtils.unique((trip?.steps || []).map(step => step.type));
    if (!types.length) {
      container.innerHTML = '<span class="chip">aucune catégorie</span>';
      return;
    }
    if (!activeTypes.size) activeTypes = new Set(types);
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
    const steps = window.TravelUtils.sortSteps(trip?.steps || []);
    if (!steps.length) {
      container.innerHTML = '<div class="empty-state">Aucune étape à afficher sur la carte.</div>';
      return;
    }
    container.innerHTML = steps.map((step, index) => `
      <button class="map-step" data-focus-step="${step.id}">
        <strong>${index + 1}. ${window.TravelUtils.escapeHtml(step.name)}</strong>
        <small>${window.TravelUtils.escapeHtml(step.type)} · ${window.TravelUtils.isValidCoord(step) ? `${step.lat}, ${step.lng}` : 'coordonnées manquantes'}</small>
      </button>
    `).join('');
    container.querySelectorAll('[data-focus-step]').forEach(button => {
      button.addEventListener('click', () => {
        const step = steps.find(item => item.id === button.dataset.focusStep);
        if (step && window.TravelUtils.isValidCoord(step) && map) map.setView([Number(step.lat), Number(step.lng)], 12, { animate: true });
      });
    });
  }

  function resetFilters() { activeTypes = new Set(); }

  window.TravelMap = { initMap, updateMap, invalidate, fitBounds, renderFilters, renderMapSteps, resetFilters };
})();
