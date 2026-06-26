(function () {
  'use strict';

  const U = window.TravelUtils;
  let root;
  let viewport;
  let tileLayer;
  let markerLayer;
  let svgLayer;
  let messageLayer;
  let activeTypes = new Set();
  let activeTrip = null;
  let activeSettings = null;
  let mapState = { centerLat: 46.6, centerLng: 2.4, zoom: 5 };
  let drag = null;

  const TILE_SIZE = 256;
  const MIN_ZOOM = 2;
  const MAX_ZOOM = 18;
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lon2x(lon, zoom) {
    return ((Number(lon) + 180) / 360) * TILE_SIZE * 2 ** zoom;
  }

  function lat2y(lat, zoom) {
    const rad = clamp(Number(lat), -85.05112878, 85.05112878) * Math.PI / 180;
    return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * TILE_SIZE * 2 ** zoom;
  }

  function x2lon(x, zoom) {
    return x / (TILE_SIZE * 2 ** zoom) * 360 - 180;
  }

  function y2lat(y, zoom) {
    const n = Math.PI - 2 * Math.PI * y / (TILE_SIZE * 2 ** zoom);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function project(lat, lng, zoom = mapState.zoom) {
    return { x: lon2x(lng, zoom), y: lat2y(lat, zoom) };
  }

  function unproject(x, y, zoom = mapState.zoom) {
    return { lat: y2lat(y, zoom), lng: x2lon(x, zoom) };
  }

  function getSize() {
    const rect = viewport?.getBoundingClientRect?.();
    return {
      width: Math.max(320, Math.round(rect?.width || 900)),
      height: Math.max(280, Math.round(rect?.height || 600))
    };
  }

  function pointToScreen(lat, lng) {
    const size = getSize();
    const center = project(mapState.centerLat, mapState.centerLng);
    const point = project(lat, lng);
    return {
      x: point.x - center.x + size.width / 2,
      y: point.y - center.y + size.height / 2
    };
  }

  function setMessage(text) {
    if (!messageLayer) return;
    messageLayer.hidden = !text;
    messageLayer.textContent = text || '';
  }

  function initMap() {
    if (root) return;
    const container = document.getElementById('travelMap');
    if (!container) return;
    container.innerHTML = `
      <div class="osm-map" role="application" aria-label="Carte interactive OpenStreetMap">
        <div class="osm-toolbar" aria-label="Contrôles de carte">
          <button class="osm-control" type="button" data-map-action="zoom-in" title="Zoomer">+</button>
          <button class="osm-control" type="button" data-map-action="zoom-out" title="Dézoomer">−</button>
          <button class="osm-control" type="button" data-map-action="fit" title="Recentrer">⌖</button>
        </div>
        <div class="osm-attribution">© OpenStreetMap</div>
        <div class="osm-viewport">
          <div class="osm-tiles"></div>
          <svg class="osm-routes" aria-hidden="true"></svg>
          <div class="osm-markers"></div>
          <div class="osm-message" hidden></div>
        </div>
      </div>`;
    root = container.querySelector('.osm-map');
    viewport = container.querySelector('.osm-viewport');
    tileLayer = container.querySelector('.osm-tiles');
    markerLayer = container.querySelector('.osm-markers');
    svgLayer = container.querySelector('.osm-routes');
    messageLayer = container.querySelector('.osm-message');

    container.querySelector('[data-map-action="zoom-in"]')?.addEventListener('click', () => zoomBy(1));
    container.querySelector('[data-map-action="zoom-out"]')?.addEventListener('click', () => zoomBy(-1));
    container.querySelector('[data-map-action="fit"]')?.addEventListener('click', fitBounds);

    viewport.addEventListener('wheel', event => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1 : -1);
    }, { passive: false });

    viewport.addEventListener('pointerdown', event => {
      viewport.setPointerCapture?.(event.pointerId);
      const center = project(mapState.centerLat, mapState.centerLng);
      drag = { x: event.clientX, y: event.clientY, centerX: center.x, centerY: center.y };
      root.classList.add('is-dragging');
    });
    viewport.addEventListener('pointermove', event => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      const next = unproject(drag.centerX - dx, drag.centerY - dy);
      mapState.centerLat = clamp(next.lat, -84, 84);
      mapState.centerLng = next.lng;
      draw();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => viewport.addEventListener(type, () => {
      drag = null;
      root.classList.remove('is-dragging');
    }));

    window.addEventListener('resize', invalidate);
    draw();
  }

  function zoomBy(delta) {
    mapState.zoom = clamp(mapState.zoom + delta, MIN_ZOOM, MAX_ZOOM);
    draw();
  }

  function visibleSteps() {
    const steps = U.sortSteps(activeTrip?.steps || []).filter(step => U.isValidCoord(step));
    return steps.filter(step => !activeTypes.size || activeTypes.has(step.type));
  }

  function chooseZoomForSteps(steps) {
    if (!steps.length) return 5;
    if (steps.length === 1) return 11;
    const size = getSize();
    let best = MIN_ZOOM;
    for (let z = MAX_ZOOM; z >= MIN_ZOOM; z -= 1) {
      const points = steps.map(step => project(step.lat, step.lng, z));
      const minX = Math.min(...points.map(p => p.x));
      const maxX = Math.max(...points.map(p => p.x));
      const minY = Math.min(...points.map(p => p.y));
      const maxY = Math.max(...points.map(p => p.y));
      if ((maxX - minX) <= size.width * 0.78 && (maxY - minY) <= size.height * 0.72) {
        best = z;
        break;
      }
    }
    return clamp(best, MIN_ZOOM, MAX_ZOOM);
  }

  function fitBounds() {
    initMap();
    const steps = visibleSteps();
    if (!steps.length) {
      mapState = { centerLat: 46.6, centerLng: 2.4, zoom: 5 };
      draw();
      return;
    }
    const avgLat = steps.reduce((sum, step) => sum + Number(step.lat), 0) / steps.length;
    const avgLng = steps.reduce((sum, step) => sum + Number(step.lng), 0) / steps.length;
    mapState.centerLat = clamp(avgLat, -84, 84);
    mapState.centerLng = avgLng;
    mapState.zoom = chooseZoomForSteps(steps);
    draw();
  }

  function tileUrl(x, y, z) {
    const subdomains = ['a', 'b', 'c'];
    const s = subdomains[Math.abs(x + y) % subdomains.length];
    return TILE_URL.replace('{s}', s).replace('{z}', z).replace('{x}', x).replace('{y}', y);
  }

  function drawTiles() {
    if (!tileLayer) return;
    const { width, height } = getSize();
    const z = mapState.zoom;
    const worldTiles = 2 ** z;
    const center = project(mapState.centerLat, mapState.centerLng, z);
    const startX = Math.floor((center.x - width / 2) / TILE_SIZE) - 1;
    const endX = Math.floor((center.x + width / 2) / TILE_SIZE) + 1;
    const startY = Math.floor((center.y - height / 2) / TILE_SIZE) - 1;
    const endY = Math.floor((center.y + height / 2) / TILE_SIZE) + 1;
    const html = [];
    for (let x = startX; x <= endX; x += 1) {
      for (let y = startY; y <= endY; y += 1) {
        if (y < 0 || y >= worldTiles) continue;
        const wrappedX = ((x % worldTiles) + worldTiles) % worldTiles;
        const left = Math.round(x * TILE_SIZE - center.x + width / 2);
        const top = Math.round(y * TILE_SIZE - center.y + height / 2);
        html.push(`<img class="osm-tile" src="${tileUrl(wrappedX, y, z)}" alt="" draggable="false" style="left:${left}px;top:${top}px" loading="eager" referrerpolicy="no-referrer" />`);
      }
    }
    tileLayer.innerHTML = html.join('');
  }

  function modeClass(mode) {
    return `route-${mode || 'other'}`;
  }

  function drawRoutes(steps) {
    if (!svgLayer) return;
    const { width, height } = getSize();
    svgLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svgLayer.setAttribute('width', width);
    svgLayer.setAttribute('height', height);
    const segments = window.TravelItinerary?.buildSegments?.(activeTrip, activeSettings) || [];
    const visibleIds = new Set(steps.map(step => step.id));
    const paths = segments.filter(segment => visibleIds.has(segment.from.id) && visibleIds.has(segment.to.id) && segment.hasCoordinates).map(segment => {
      const a = pointToScreen(segment.from.lat, segment.from.lng);
      const b = pointToScreen(segment.to.lat, segment.to.lng);
      if (segment.mode === 'plane') {
        const mx = (a.x + b.x) / 2;
        const my = Math.min(a.y, b.y) - Math.max(60, Math.abs(a.x - b.x) * 0.12);
        return `<path class="osm-route ${modeClass(segment.mode)}" d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}" />`;
      }
      return `<path class="osm-route ${modeClass(segment.mode)}" d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}" />`;
    });
    svgLayer.innerHTML = paths.join('');
  }

  function drawMarkers(steps) {
    if (!markerLayer) return;
    markerLayer.innerHTML = steps.map((step, index) => {
      const point = pointToScreen(step.lat, step.lng);
      const time = [step.arrivalDate ? U.formatDate(step.arrivalDate) : '', step.arrivalTime || ''].filter(Boolean).join(' · ');
      return `<button class="osm-marker" type="button" data-step-id="${step.id}" style="left:${point.x}px;top:${point.y}px;--marker:${step.color || '#2563eb'}" title="${U.escapeHtml(step.name)}">
        <span>${index + 1}</span>
        <strong>${U.escapeHtml(step.name)}</strong>
        ${time ? `<em>${U.escapeHtml(time)}</em>` : ''}
      </button>`;
    }).join('');
    markerLayer.querySelectorAll('[data-step-id]').forEach(button => {
      button.addEventListener('click', () => {
        const step = steps.find(item => item.id === button.dataset.stepId);
        if (!step) return;
        mapState.centerLat = Number(step.lat);
        mapState.centerLng = Number(step.lng);
        mapState.zoom = Math.max(mapState.zoom, 12);
        draw();
      });
    });
  }

  function draw() {
    if (!root) return;
    drawTiles();
    const steps = visibleSteps();
    drawRoutes(steps);
    drawMarkers(steps);
    if (!activeTrip) setMessage('Sélectionne un voyage pour afficher la carte.');
    else if (!(activeTrip.steps || []).some(step => U.isValidCoord(step))) setMessage('Ajoute au moins une étape avec coordonnées ou via la recherche d’adresse.');
    else if (!steps.length) setMessage('Toutes les catégories sont masquées. Active un filtre pour voir les lieux.');
    else setMessage('');
  }

  function updateMap(trip, settings) {
    initMap();
    activeTrip = trip;
    activeSettings = settings || U.defaultSettings;
    const types = U.unique((trip?.steps || []).map(step => step.type));
    if (types.length && !activeTypes.size) activeTypes = new Set(types);
    fitBounds();
  }

  function invalidate() {
    if (!root) return;
    window.setTimeout(draw, 60);
  }

  function renderFilters(container, trip, onToggle) {
    if (!container) return;
    const types = U.unique((trip?.steps || []).map(step => step.type));
    if (!types.length) {
      container.innerHTML = '<span class="chip">aucune catégorie</span>';
      return;
    }
    if (!activeTypes.size) activeTypes = new Set(types);
    types.forEach(type => { if (!activeTypes.has(type) && !activeTypes.size) activeTypes.add(type); });
    container.innerHTML = types.map(type => `<button type="button" class="chip ${activeTypes.has(type) ? '' : 'is-muted'}" data-map-type="${U.escapeHtml(type)}">${U.escapeHtml(type)}</button>`).join('');
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

  function renderRoutes(container, trip, settings, onChangeSegment) {
    if (!container) return;
    const segments = window.TravelItinerary?.buildSegments?.(trip, settings) || [];
    if (!segments.length) {
      container.innerHTML = '<div class="empty-state">Ajoute deux étapes pour créer un trajet.</div>';
      return;
    }
    const modeOptions = Object.entries(U.transportModes).map(([value, mode]) => `<option value="${value}">${mode.icon} ${mode.label}</option>`).join('');
    container.innerHTML = segments.map((segment, index) => `
      <article class="map-route" data-focus-route="${segment.from.id}">
        <div class="map-route__head">
          <span>${segment.modeIcon}</span>
          <strong>${index + 1}. ${U.escapeHtml(segment.from.name)} → ${U.escapeHtml(segment.to.name)}</strong>
        </div>
        <small>${segment.hasCoordinates ? `${U.formatDistance(segment.distance)} · ${U.formatDuration(segment.duration)}` : 'coordonnées à compléter'} · ${U.formatMoney(segment.cost, trip.currency)}</small>
        <div class="map-route__controls">
          <select class="input" data-segment-field="transportToNext" data-step-id="${segment.from.id}">${modeOptions}</select>
          <input class="input" type="number" min="0" step="0.01" placeholder="Coût" value="${Number(segment.from.segmentCost) || ''}" data-segment-field="segmentCost" data-step-id="${segment.from.id}" />
        </div>
        <input class="input" value="${U.escapeHtml(segment.from.segmentNote || '')}" placeholder="Note du trajet" data-segment-field="segmentNote" data-step-id="${segment.from.id}" />
      </article>`).join('');
    container.querySelectorAll('[data-segment-field="transportToNext"]').forEach(select => {
      const step = (trip.steps || []).find(item => item.id === select.dataset.stepId);
      select.value = step?.transportToNext || 'car';
    });
    container.querySelectorAll('[data-segment-field]').forEach(field => field.addEventListener('change', event => onChangeSegment?.(event.target.dataset.stepId, event.target.dataset.segmentField, event.target.value)));
    container.querySelectorAll('[data-focus-route]').forEach(card => card.addEventListener('click', event => {
      if (event.target.matches('input, select, button')) return;
      const step = (trip.steps || []).find(item => item.id === card.dataset.focusRoute);
      if (step && U.isValidCoord(step)) {
        mapState.centerLat = Number(step.lat);
        mapState.centerLng = Number(step.lng);
        mapState.zoom = Math.max(mapState.zoom, 10);
        draw();
      }
    }));
  }

  function renderMapSteps(container, trip) {
    if (!container) return;
    const steps = U.sortSteps(trip?.steps || []);
    if (!steps.length) {
      container.innerHTML = '<div class="empty-state">Aucune étape à afficher.</div>';
      return;
    }
    container.innerHTML = steps.map((step, index) => `
      <button class="map-step" type="button" data-focus-step="${step.id}">
        <strong>${index + 1}. ${U.escapeHtml(step.name)}</strong>
        <small>${U.escapeHtml(step.type)} · ${U.escapeHtml(step.address || (U.isValidCoord(step) ? `${step.lat}, ${step.lng}` : 'coordonnées manquantes'))}</small>
      </button>`).join('');
    container.querySelectorAll('[data-focus-step]').forEach(button => button.addEventListener('click', () => {
      const step = steps.find(item => item.id === button.dataset.focusStep);
      if (step && U.isValidCoord(step)) {
        mapState.centerLat = Number(step.lat);
        mapState.centerLng = Number(step.lng);
        mapState.zoom = Math.max(mapState.zoom, 12);
        draw();
      }
    }));
  }

  function resetFilters() {
    activeTypes = new Set();
  }

  window.TravelMap = { initMap, updateMap, invalidate, fitBounds, renderFilters, renderRoutes, renderMapSteps, resetFilters };
})();
