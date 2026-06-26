(function () {
  'use strict';

  const U = window.TravelUtils;
  const TILE_SIZE = 256;
  let mapState = { zoom: 5, centerLat: 46.6, centerLng: 2.4, activeTypes: new Set(), trip: null, settings: null };
  let dragging = false;
  let dragStart = null;

  function project(lat, lng, zoom) {
    const sin = Math.sin((lat * Math.PI) / 180);
    const scale = TILE_SIZE * Math.pow(2, zoom);
    return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
  }

  function unproject(x, y, zoom) {
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const lng = (x / scale) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / scale;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng };
  }

  function container() { return document.getElementById('travelMap'); }
  function initMap() { bindMapEvents(); renderTiles(); }
  function invalidate() { setTimeout(renderTiles, 50); }

  function validSteps(trip) {
    const all = U.sortSteps(trip?.steps || []).filter(U.isValidCoord);
    const types = mapState.activeTypes;
    return all.filter(step => !types.size || types.has(step.type));
  }

  function fitBounds() {
    const el = container();
    const steps = validSteps(mapState.trip);
    if (!el || !steps.length) return;
    const lats = steps.map(s => Number(s.lat));
    const lngs = steps.map(s => Number(s.lng));
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    mapState.centerLat = (minLat + maxLat) / 2;
    mapState.centerLng = (minLng + maxLng) / 2;
    const width = el.clientWidth || 800;
    const height = el.clientHeight || 520;
    for (let z = 13; z >= 2; z -= 1) {
      const a = project(maxLat, minLng, z);
      const b = project(minLat, maxLng, z);
      if (Math.abs(b.x - a.x) < width * .72 && Math.abs(b.y - a.y) < height * .72) { mapState.zoom = z; break; }
    }
    renderTiles();
  }

  function updateMap(trip, settings) {
    mapState.trip = trip || null;
    mapState.settings = settings || {};
    if (!trip || !U.sortSteps(trip.steps).some(U.isValidCoord)) {
      renderTiles();
      return;
    }
    const steps = validSteps(trip);
    if (steps.length) {
      const lats = steps.map(s => Number(s.lat));
      const lngs = steps.map(s => Number(s.lng));
      mapState.centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      mapState.centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    }
    fitBounds();
  }

  function renderTiles() {
    const el = container();
    if (!el) return;
    const width = el.clientWidth || 800;
    const height = el.clientHeight || 520;
    const zoom = Math.max(2, Math.min(17, Math.round(mapState.zoom || 5)));
    const center = project(mapState.centerLat, mapState.centerLng, zoom);
    const startX = Math.floor((center.x - width / 2) / TILE_SIZE);
    const endX = Math.floor((center.x + width / 2) / TILE_SIZE);
    const startY = Math.floor((center.y - height / 2) / TILE_SIZE);
    const endY = Math.floor((center.y + height / 2) / TILE_SIZE);
    const maxTile = Math.pow(2, zoom);
    const steps = validSteps(mapState.trip);
    const sorted = U.sortSteps(mapState.trip?.steps || []);

    let html = '<div class="osm-custom-map" data-map-ready="true">';
    for (let x = startX; x <= endX; x += 1) {
      for (let y = startY; y <= endY; y += 1) {
        if (y < 0 || y >= maxTile) continue;
        const wrappedX = ((x % maxTile) + maxTile) % maxTile;
        const left = x * TILE_SIZE - center.x + width / 2;
        const top = y * TILE_SIZE - center.y + height / 2;
        html += `<img class="osm-tile" alt="" draggable="false" src="https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png" style="left:${left}px;top:${top}px" />`;
      }
    }

    html += '<svg class="osm-route-layer" width="100%" height="100%" aria-hidden="true">';
    const routePoints = steps.map(step => {
      const p = project(Number(step.lat), Number(step.lng), zoom);
      return { x: p.x - center.x + width / 2, y: p.y - center.y + height / 2, step };
    });
    routePoints.slice(0, -1).forEach((point, index) => {
      const next = routePoints[index + 1];
      const originalIndex = sorted.findIndex(step => step.id === point.step.id);
      const mode = sorted[originalIndex]?.transportToNext || 'car';
      const dash = mode === 'plane' ? '10 9' : mode === 'walk' ? '4 7' : '';
      html += `<line x1="${point.x}" y1="${point.y}" x2="${next.x}" y2="${next.y}" class="osm-route osm-route--${mode}" ${dash ? `stroke-dasharray="${dash}"` : ''}></line>`;
    });
    html += '</svg>';

    routePoints.forEach((point, index) => {
      html += `<button class="osm-marker" data-map-step="${point.step.id}" style="left:${point.x}px;top:${point.y}px;background:${point.step.color || '#2563eb'}" title="${U.escapeHtml(point.step.name)}"><span>${index + 1}</span></button>`;
    });

    if (!steps.length) html += '<div class="map-empty-overlay"><strong>Carte prête</strong><span>Ajoute des étapes avec coordonnées pour afficher le trajet.</span></div>';
    html += '<div class="osm-controls"><button data-map-zoom="in">+</button><button data-map-zoom="out">−</button></div><a class="osm-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></div>';
    el.innerHTML = html;
    el.querySelectorAll('[data-map-zoom]').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      mapState.zoom += button.dataset.mapZoom === 'in' ? 1 : -1;
      mapState.zoom = Math.max(2, Math.min(17, mapState.zoom));
      renderTiles();
    }));
    el.querySelectorAll('[data-map-step]').forEach(button => button.addEventListener('click', () => {
      const step = sorted.find(s => s.id === button.dataset.mapStep);
      if (!step) return;
      mapState.centerLat = Number(step.lat);
      mapState.centerLng = Number(step.lng);
      mapState.zoom = Math.max(mapState.zoom, 12);
      renderTiles();
    }));
  }

  function bindMapEvents() {
    const el = container();
    if (!el || el.dataset.mapBound) return;
    el.dataset.mapBound = 'true';
    el.addEventListener('pointerdown', event => {
      if (event.target.closest('button,a')) return;
      dragging = true;
      dragStart = { x: event.clientX, y: event.clientY, center: project(mapState.centerLat, mapState.centerLng, mapState.zoom) };
      el.setPointerCapture?.(event.pointerId);
    });
    el.addEventListener('pointermove', event => {
      if (!dragging || !dragStart) return;
      const next = unproject(dragStart.center.x - (event.clientX - dragStart.x), dragStart.center.y - (event.clientY - dragStart.y), mapState.zoom);
      mapState.centerLat = Math.max(-85, Math.min(85, next.lat));
      mapState.centerLng = next.lng;
      renderTiles();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => el.addEventListener(type, () => { dragging = false; dragStart = null; }));
    el.addEventListener('wheel', event => {
      event.preventDefault();
      mapState.zoom += event.deltaY < 0 ? 1 : -1;
      mapState.zoom = Math.max(2, Math.min(17, mapState.zoom));
      renderTiles();
    }, { passive: false });
  }

  function renderFilters(filterContainer, trip, onToggle) {
    if (!filterContainer) return;
    const types = U.unique((trip?.steps || []).map(step => step.type));
    if (!types.length) { filterContainer.innerHTML = '<span class="chip">aucune catégorie</span>'; return; }
    if (!mapState.activeTypes.size) mapState.activeTypes = new Set(types);
    filterContainer.innerHTML = types.map(type => `<button class="chip ${mapState.activeTypes.has(type) ? '' : 'is-muted'}" data-map-type="${U.escapeHtml(type)}">${U.escapeHtml(type)}</button>`).join('');
    filterContainer.querySelectorAll('[data-map-type]').forEach(button => button.addEventListener('click', () => {
      const type = button.dataset.mapType;
      if (mapState.activeTypes.has(type)) mapState.activeTypes.delete(type); else mapState.activeTypes.add(type);
      if (!mapState.activeTypes.size) types.forEach(item => mapState.activeTypes.add(item));
      onToggle?.();
    }));
  }

  function renderMapSteps(containerEl, trip) {
    if (!containerEl) return;
    const steps = U.sortSteps(trip?.steps || []);
    if (!steps.length) { containerEl.innerHTML = '<div class="empty-state">Aucune étape.</div>'; return; }
    containerEl.innerHTML = steps.map((step, index) => `<button class="map-step" data-focus-step="${step.id}"><strong>${index + 1}. ${U.escapeHtml(step.name)}</strong><small>${U.escapeHtml(step.type)} · ${U.escapeHtml(step.address || (U.isValidCoord(step) ? `${step.lat}, ${step.lng}` : 'coordonnées manquantes'))}</small></button>`).join('');
    containerEl.querySelectorAll('[data-focus-step]').forEach(button => button.addEventListener('click', () => {
      const step = steps.find(item => item.id === button.dataset.focusStep);
      if (step && U.isValidCoord(step)) { mapState.centerLat = Number(step.lat); mapState.centerLng = Number(step.lng); mapState.zoom = 12; renderTiles(); }
    }));
  }

  function renderMapRoutes(containerEl, trip, settings, onChange) {
    if (!containerEl) return;
    const segments = window.TravelItinerary.buildSegments(trip, settings);
    if (!segments.length) { containerEl.innerHTML = '<div class="empty-state">Ajoute deux étapes pour créer un trajet.</div>'; return; }
    const options = Object.entries(U.transportModes).map(([key, val]) => `<option value="${key}">${val.icon} ${val.label}</option>`).join('');
    containerEl.innerHTML = segments.map(segment => `<article class="route-mini"><strong>${U.escapeHtml(segment.from.name)} → ${U.escapeHtml(segment.to.name)}</strong><small>${segment.hasCoordinates ? `${U.formatDistance(segment.distance)} · ${U.formatDuration(segment.duration)}` : 'coordonnées à compléter'}</small><select class="input" data-route-mode="${segment.from.id}">${options}</select></article>`).join('');
    containerEl.querySelectorAll('[data-route-mode]').forEach(select => {
      const step = (trip?.steps || []).find(item => item.id === select.dataset.routeMode);
      select.value = step?.transportToNext || 'car';
      select.addEventListener('change', () => onChange?.(select.dataset.routeMode, select.value));
    });
  }

  function resetFilters() { mapState.activeTypes = new Set(); }
  window.TravelMap = { initMap, updateMap, invalidate, fitBounds, renderFilters, renderMapSteps, renderMapRoutes, resetFilters };
})();
