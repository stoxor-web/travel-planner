(function () {
  'use strict';

  const DEFAULT_CENTER = { lat: 46.603354, lng: 1.888334 };
  const DEFAULT_ZOOM = 5;
  const MIN_ZOOM = 2;
  const MAX_ZOOM = 13;
  const TILE_SIZE = 256;
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATTRIBUTION = '© OpenStreetMap contributors';

  const routeStyles = {
    car: { color: '#2563eb', dashArray: '', width: 4 },
    train: { color: '#16a34a', dashArray: '12 9', width: 4 },
    plane: { color: '#7c3aed', dashArray: '3 10', width: 4 },
    bus: { color: '#f59e0b', dashArray: '10 8', width: 4 },
    bike: { color: '#14b8a6', dashArray: '6 7', width: 4 },
    walk: { color: '#64748b', dashArray: '2 8', width: 4 },
    boat: { color: '#0284c7', dashArray: '14 8', width: 4 },
    other: { color: '#0f172a', dashArray: '7 8', width: 4 }
  };

  let activeTypes = new Set();
  let knownTypesSignature = '';
  let pendingTrip = null;
  let pendingSettings = null;
  let selectedSegmentIndex = null;
  let mapReady = false;
  let currentView = { zoom: DEFAULT_ZOOM, center: { ...DEFAULT_CENTER } };
  let dragState = null;
  let lastError = '';

  function getUtils() {
    return window.TravelUtils || {};
  }

  function getItinerary() {
    return window.TravelItinerary || {};
  }

  function getMapElement() {
    return document.getElementById('travelMap');
  }

  function getMapCard() {
    const element = getMapElement();
    return element?.closest('.map-card') || null;
  }

  function escape(value) {
    return (getUtils().escapeHtml || (item => String(item ?? '')))(value);
  }

  function normalizeLng(lng) {
    let value = Number(lng);
    while (value < -180) value += 360;
    while (value > 180) value -= 360;
    return value;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function worldSize(zoom) {
    return TILE_SIZE * (2 ** zoom);
  }

  function project(lat, lng, zoom) {
    const size = worldSize(zoom);
    const sin = Math.sin(clamp(Number(lat), -85.05112878, 85.05112878) * Math.PI / 180);
    return {
      x: (normalizeLng(lng) + 180) / 360 * size,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size
    };
  }

  function unproject(x, y, zoom) {
    const size = worldSize(zoom);
    const lng = x / size * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / size;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng: normalizeLng(lng) };
  }

  function stepPoint(step) {
    return { lat: Number(step.lat), lng: Number(step.lng) };
  }

  function getValidSteps(trip) {
    const U = getUtils();
    const sortSteps = U.sortSteps || (steps => steps || []);
    const isValidCoord = U.isValidCoord || (step => Number.isFinite(Number(step?.lat)) && Number.isFinite(Number(step?.lng)));
    return sortSteps(trip?.steps || []).filter(step => isValidCoord(step));
  }

  function getVisibleSteps(trip) {
    return getValidSteps(trip).filter(step => !activeTypes.size || activeTypes.has(step.type || 'étape'));
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
    types.forEach(type => activeTypes.add(type));
    return types;
  }

  function getSegments(trip, settings) {
    const itinerary = getItinerary();
    if (typeof itinerary.buildSegments === 'function') return itinerary.buildSegments(trip, settings);
    const U = getUtils();
    const sortSteps = U.sortSteps || (steps => steps || []);
    const estimateSegment = U.estimateSegment || (() => ({}));
    const steps = sortSteps(trip?.steps || []);
    return steps.slice(0, -1).map((from, index) => {
      const to = steps[index + 1];
      const mode = from.transportToNext || 'car';
      return { from, to, index, mode, ...estimateSegment(from, to, mode, settings) };
    });
  }

  function segmentLatLngs(segment) {
    const U = getUtils();
    const isValidCoord = U.isValidCoord || (() => false);
    if (!isValidCoord(segment?.from) || !isValidCoord(segment?.to)) return [];
    return [stepPoint(segment.from), stepPoint(segment.to)];
  }

  function selectedSegments(trip, settings) {
    return getSegments(trip, settings).filter(segment => {
      const fromType = segment.from?.type || 'étape';
      const toType = segment.to?.type || 'étape';
      return (!activeTypes.size || (activeTypes.has(fromType) && activeTypes.has(toType))) && segmentLatLngs(segment).length === 2;
    });
  }

  function computeViewForPoints(points, width, height, preferredZoom = MAX_ZOOM) {
    if (!points.length) return { zoom: DEFAULT_ZOOM, center: { ...DEFAULT_CENTER } };
    if (points.length === 1) return { zoom: 11, center: { ...points[0] } };

    const padding = 88;
    const usableWidth = Math.max(280, width - padding * 2);
    const usableHeight = Math.max(220, height - padding * 2);

    for (let zoom = Math.min(preferredZoom, MAX_ZOOM); zoom >= MIN_ZOOM; zoom -= 1) {
      const projected = points.map(point => project(point.lat, point.lng, zoom));
      const xs = projected.map(point => point.x);
      const ys = projected.map(point => point.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      if ((maxX - minX) <= usableWidth && (maxY - minY) <= usableHeight) {
        const centerPixel = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
        return { zoom, center: unproject(centerPixel.x, centerPixel.y, zoom) };
      }
    }

    const projected = points.map(point => project(point.lat, point.lng, MIN_ZOOM));
    const centerPixel = {
      x: (Math.min(...projected.map(point => point.x)) + Math.max(...projected.map(point => point.x))) / 2,
      y: (Math.min(...projected.map(point => point.y)) + Math.max(...projected.map(point => point.y))) / 2
    };
    return { zoom: MIN_ZOOM, center: unproject(centerPixel.x, centerPixel.y, MIN_ZOOM) };
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

  function tileUrl(z, x, y) {
    return TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  }

  function openOsmTrip() {
    const steps = getVisibleSteps(pendingTrip);
    if (!steps.length) return;
    const view = computeViewForPoints(steps.map(stepPoint), 1000, 650, currentView.zoom);
    const url = `https://www.openstreetmap.org/#map=${view.zoom}/${encodeURIComponent(view.center.lat.toFixed(5))}/${encodeURIComponent(view.center.lng.toFixed(5))}`;
    window.open(url, '_blank', 'noopener');
  }

  function openOsmDirections(segment) {
    const points = segmentLatLngs(segment);
    if (points.length !== 2) return;
    const engines = {
      car: 'fossgis_osrm_car',
      bike: 'fossgis_osrm_bike',
      walk: 'fossgis_osrm_foot'
    };
    const engine = engines[segment.mode] || 'fossgis_osrm_car';
    const route = `${points[0].lat},${points[0].lng};${points[1].lat},${points[1].lng}`;
    const url = `https://www.openstreetmap.org/directions?engine=${engine}&route=${encodeURIComponent(route)}`;
    window.open(url, '_blank', 'noopener');
  }

  function ensureMapShell() {
    const element = getMapElement();
    if (!element) return null;
    if (!element.classList.contains('osm-lite-map')) {
      element.className = 'osm-lite-map';
      element.innerHTML = `
        <div class="osm-lite-tiles" data-osm-tiles></div>
        <svg class="osm-lite-routes" data-osm-routes aria-hidden="true"></svg>
        <div class="osm-lite-markers" data-osm-markers></div>
        <div class="osm-lite-controls" aria-label="Contrôles de la carte">
          <button type="button" data-osm-zoom="in" title="Zoomer">+</button>
          <button type="button" data-osm-zoom="out" title="Dézoomer">−</button>
          <button type="button" data-osm-action="fit" title="Afficher tout le voyage">⤢</button>
          <button type="button" data-osm-action="open" title="Ouvrir dans OpenStreetMap">↗</button>
        </div>
        <div class="osm-lite-attribution">${ATTRIBUTION}</div>
      `;
      element.querySelector('[data-osm-zoom="in"]')?.addEventListener('click', () => zoomBy(1));
      element.querySelector('[data-osm-zoom="out"]')?.addEventListener('click', () => zoomBy(-1));
      element.querySelector('[data-osm-action="fit"]')?.addEventListener('click', () => fitBounds());
      element.querySelector('[data-osm-action="open"]')?.addEventListener('click', openOsmTrip);
      bindMapDrag(element);
      mapReady = true;
    }
    return element;
  }

  function bindMapDrag(element) {
    element.addEventListener('pointerdown', event => {
      if (event.target.closest('button, a, select, input, textarea')) return;
      element.setPointerCapture?.(event.pointerId);
      dragState = {
        startX: event.clientX,
        startY: event.clientY,
        centerPixel: project(currentView.center.lat, currentView.center.lng, currentView.zoom)
      };
      element.classList.add('is-dragging');
    });
    element.addEventListener('pointermove', event => {
      if (!dragState) return;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      const newPixel = { x: dragState.centerPixel.x - dx, y: dragState.centerPixel.y - dy };
      currentView.center = unproject(newPixel.x, newPixel.y, currentView.zoom);
      renderCustomMap(false);
    });
    const endDrag = () => {
      dragState = null;
      element.classList.remove('is-dragging');
    };
    element.addEventListener('pointerup', endDrag);
    element.addEventListener('pointercancel', endDrag);
    element.addEventListener('wheel', event => {
      if (!event.ctrlKey && Math.abs(event.deltaY) < 40) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1 : -1);
    }, { passive: false });
  }

  function zoomBy(delta) {
    currentView.zoom = clamp(currentView.zoom + delta, MIN_ZOOM, MAX_ZOOM);
    renderCustomMap(false);
  }

  function screenPoint(point, width, height) {
    const centerPixel = project(currentView.center.lat, currentView.center.lng, currentView.zoom);
    const pixel = project(point.lat, point.lng, currentView.zoom);
    return {
      x: pixel.x - centerPixel.x + width / 2,
      y: pixel.y - centerPixel.y + height / 2
    };
  }

  function renderTiles(element, width, height) {
    const tileContainer = element.querySelector('[data-osm-tiles]');
    const centerPixel = project(currentView.center.lat, currentView.center.lng, currentView.zoom);
    const topLeft = { x: centerPixel.x - width / 2, y: centerPixel.y - height / 2 };
    const tilesPerAxis = 2 ** currentView.zoom;
    const minTileX = Math.floor(topLeft.x / TILE_SIZE) - 1;
    const maxTileX = Math.floor((topLeft.x + width) / TILE_SIZE) + 1;
    const minTileY = Math.max(0, Math.floor(topLeft.y / TILE_SIZE) - 1);
    const maxTileY = Math.min(tilesPerAxis - 1, Math.floor((topLeft.y + height) / TILE_SIZE) + 1);
    let html = '';

    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        const wrappedX = ((tileX % tilesPerAxis) + tilesPerAxis) % tilesPerAxis;
        const left = Math.round(tileX * TILE_SIZE - topLeft.x);
        const top = Math.round(tileY * TILE_SIZE - topLeft.y);
        html += `<img class="osm-lite-tile" alt="" draggable="false" src="${tileUrl(currentView.zoom, wrappedX, tileY)}" style="left:${left}px;top:${top}px;">`;
      }
    }
    tileContainer.innerHTML = html;
  }

  function renderRoutes(element, width, height) {
    const svg = element.querySelector('[data-osm-routes]');
    const segments = selectedSegments(pendingTrip, pendingSettings);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.innerHTML = segments.map(segment => {
      const points = segmentLatLngs(segment);
      const a = screenPoint(points[0], width, height);
      const b = screenPoint(points[1], width, height);
      const style = routeStyles[segment.mode] || routeStyles.other;
      const active = selectedSegmentIndex === segment.index;
      const isPlane = segment.mode === 'plane';
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const curve = Math.min(120, Math.max(30, Math.hypot(dx, dy) * 0.18));
      const control = { x: mx - dy / Math.hypot(dx || 1, dy || 1) * curve, y: my + dx / Math.hypot(dx || 1, dy || 1) * curve };
      const path = isPlane ? `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}` : `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      return `
        <g class="osm-route ${active ? 'is-active' : ''}">
          <path d="${path}" stroke="rgba(255,255,255,.96)" stroke-width="${style.width + 5}" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="${path}" stroke="${style.color}" stroke-width="${active ? style.width + 1.5 : style.width}" stroke-dasharray="${style.dashArray}" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
        </g>
      `;
    }).join('');
  }

  function renderMarkers(element, width, height) {
    const markerContainer = element.querySelector('[data-osm-markers]');
    const steps = getVisibleSteps(pendingTrip);
    markerContainer.innerHTML = steps.map((step, index) => {
      const point = screenPoint(stepPoint(step), width, height);
      const outside = point.x < -80 || point.x > width + 80 || point.y < -80 || point.y > height + 80;
      return `
        <button type="button" class="osm-marker ${outside ? 'is-outside' : ''}" data-osm-step="${escape(step.id)}" style="left:${point.x}px;top:${point.y}px;--marker-color:${escape(step.color || '#2563eb')};">
          <span><i>${index + 1}</i></span>
          <strong>${escape(step.name || 'Étape')}</strong>
        </button>
      `;
    }).join('');

    markerContainer.querySelectorAll('[data-osm-step]').forEach(button => {
      button.addEventListener('click', () => {
        const step = steps.find(item => item.id === button.dataset.osmStep);
        if (!step) return;
        currentView.center = stepPoint(step);
        currentView.zoom = Math.max(currentView.zoom, 10);
        renderCustomMap(false);
      });
    });
  }

  function renderCustomMap(autoFit = false) {
    const element = ensureMapShell();
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width || element.clientWidth || 900));
    const height = Math.max(320, Math.round(rect.height || element.clientHeight || 620));
    const steps = getVisibleSteps(pendingTrip);

    if (autoFit && steps.length) {
      currentView = computeViewForPoints(steps.map(stepPoint), width, height, MAX_ZOOM);
    }

    if (!steps.length) {
      currentView = currentView || { zoom: DEFAULT_ZOOM, center: { ...DEFAULT_CENTER } };
      renderTiles(element, width, height);
      element.querySelector('[data-osm-routes]').innerHTML = '';
      element.querySelector('[data-osm-markers]').innerHTML = '';
      setMapStatus('Ajoute une étape avec une adresse ou des coordonnées pour afficher ton itinéraire.', 'empty');
      return;
    }

    setMapStatus('', 'info');
    renderTiles(element, width, height);
    renderRoutes(element, width, height);
    renderMarkers(element, width, height);
  }

  function initMap() {
    try {
      ensureMapShell();
      renderCustomMap(false);
      return Promise.resolve({ type: 'osm-lite' });
    } catch (error) {
      lastError = error.message || 'Carte indisponible.';
      console.error('[TravelMap]', error);
      setMapStatus('La carte ne peut pas être affichée. Les trajets restent disponibles dans la liste.', 'error');
      return Promise.resolve(null);
    }
  }

  function updateMap(trip, settings) {
    pendingTrip = trip || null;
    pendingSettings = settings || null;
    syncActiveTypes(trip);
    ensureMapShell();
    renderCustomMap(true);
    return Promise.resolve();
  }

  function activate() {
    ensureMapShell();
    window.setTimeout(() => renderCustomMap(true), 40);
    window.setTimeout(() => renderCustomMap(false), 260);
  }

  function invalidate() {
    renderCustomMap(false);
  }

  function fitBounds() {
    renderCustomMap(true);
  }

  function renderFilters(container, trip, onToggle) {
    if (!container) return;
    const types = syncActiveTypes(trip);

    if (!types.length) {
      container.innerHTML = '<span class="chip">aucune catégorie</span>';
      return;
    }

    container.innerHTML = types.map(type => `<button type="button" class="chip ${activeTypes.has(type) ? '' : 'is-muted'}" data-map-type="${escape(type)}">${escape(type)}</button>`).join('');
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
    const steps = sortSteps(trip?.steps || []);

    if (!steps.length) {
      container.innerHTML = '<div class="empty-state">Aucune étape à afficher sur la carte.</div>';
      return;
    }

    container.innerHTML = steps.map((step, index) => `
      <button type="button" class="map-step" data-focus-step="${escape(step.id)}">
        <strong>${index + 1}. ${escape(step.name || 'Étape')}</strong>
        <small>${escape(step.type || 'étape')} · ${escape(step.address || (isValidCoord(step) ? `${step.lat}, ${step.lng}` : 'coordonnées manquantes'))}</small>
      </button>
    `).join('');

    container.querySelectorAll('[data-focus-step]').forEach(button => {
      button.addEventListener('click', () => {
        const step = steps.find(item => item.id === button.dataset.focusStep);
        if (!step || !isValidCoord(step)) return;
        currentView.center = stepPoint(step);
        currentView.zoom = Math.max(currentView.zoom, 10);
        renderCustomMap(false);
      });
    });
  }

  function renderMapRoutes(container, trip, settings, onChangeSegment) {
    if (!container) return;
    const U = getUtils();
    const formatDistance = U.formatDistance || (value => `${value} km`);
    const formatDuration = U.formatDuration || (value => `${value} h`);
    const formatMoney = U.formatMoney || (value => String(value));
    const transportModes = U.transportModes || {};
    const segments = getSegments(trip, settings);

    if (!trip || !segments.length) {
      container.innerHTML = '<div class="empty-state">Ajoute au moins deux étapes pour créer un trajet.</div>';
      return;
    }

    const modeOptions = Object.entries(transportModes)
      .map(([value, mode]) => `<option value="${value}">${mode.icon} ${mode.label}</option>`).join('');

    container.innerHTML = `
      <div class="route-flow-head">
        <strong>${segments.length} trajet(s)</strong>
        <small>Chaque liaison peut avoir son propre transport.</small>
      </div>
      ${segments.map(segment => {
        const hasCoords = segmentLatLngs(segment).length === 2;
        const distance = hasCoords ? formatDistance(segment.distance) : 'coordonnées manquantes';
        const duration = hasCoords ? formatDuration(segment.duration) : 'durée inconnue';
        const cost = hasCoords ? formatMoney(segment.cost, trip.currency) : 'coût inconnu';
        return `
          <article class="map-route ${selectedSegmentIndex === segment.index ? 'is-active' : ''}" data-map-route="${segment.index}">
            <span class="map-route__index">${segment.index + 1}</span>
            <div class="map-route__body">
              <strong>${escape(segment.from.name || 'Départ')} <span>→</span> ${escape(segment.to.name || 'Arrivée')}</strong>
              <div class="route-metrics">
                <span>${escape(segment.modeIcon || '➜')} ${escape(segment.modeLabel || 'trajet')}</span>
                <span>${distance}</span>
                <span>${duration}</span>
                <span>${cost}</span>
              </div>
              <div class="route-detail-tags">
                ${segment.departureTime ? `<span>Départ ${escape(segment.departureTime)}</span>` : ''}
                ${segment.arrivalTime ? `<span>Arrivée ${escape(segment.arrivalTime)}</span>` : ''}
                ${segment.reference ? `<span>Réf. ${escape(segment.reference)}</span>` : ''}
              </div>
              <div class="route-editor route-editor--wide">
                <label>Transport
                  <select class="input" data-map-route-mode="${escape(segment.from.id)}" aria-label="Mode de transport">
                    ${modeOptions}
                  </select>
                </label>
                <label>Coût
                  <input class="input" type="number" min="0" step="0.01" value="${Number(segment.from.segmentCost) || ''}" data-map-route-cost="${escape(segment.from.id)}" placeholder="auto">
                </label>
                <label>Départ
                  <input class="input" type="time" value="${escape(segment.from.segmentDepartureTime || '')}" data-map-route-departure="${escape(segment.from.id)}">
                </label>
                <label>Arrivée
                  <input class="input" type="time" value="${escape(segment.from.segmentArrivalTime || '')}" data-map-route-arrival="${escape(segment.from.id)}">
                </label>
              </div>
              <input class="input route-note" value="${escape(segment.from.segmentReference || '')}" data-map-route-reference="${escape(segment.from.id)}" placeholder="Vol, train, réservation…">
              <input class="input route-note" value="${escape(segment.from.segmentNote || '')}" data-map-route-note="${escape(segment.from.id)}" placeholder="Note du trajet : terminal, parking, billet, location voiture…">
              <div class="route-actions">
                <button type="button" class="button button--tiny" data-map-route-focus="${segment.index}">Voir sur la carte</button>
                ${hasCoords ? `<button type="button" class="button button--tiny" data-map-route-open="${segment.index}">Ouvrir OSM</button>` : ''}
              </div>
            </div>
          </article>
        `;
      }).join('')}
    `;

    container.querySelectorAll('[data-map-route-mode]').forEach(select => {
      const segment = segments.find(item => item.from.id === select.dataset.mapRouteMode);
      select.value = segment?.mode || 'car';
      select.addEventListener('change', event => onChangeSegment?.(event.target.dataset.mapRouteMode, 'transportToNext', event.target.value));
    });

    container.querySelectorAll('[data-map-route-cost]').forEach(input => {
      input.addEventListener('change', event => onChangeSegment?.(event.target.dataset.mapRouteCost, 'segmentCost', event.target.value));
    });

    container.querySelectorAll('[data-map-route-departure]').forEach(input => {
      input.addEventListener('change', event => onChangeSegment?.(event.target.dataset.mapRouteDeparture, 'segmentDepartureTime', event.target.value));
    });
    container.querySelectorAll('[data-map-route-arrival]').forEach(input => {
      input.addEventListener('change', event => onChangeSegment?.(event.target.dataset.mapRouteArrival, 'segmentArrivalTime', event.target.value));
    });
    container.querySelectorAll('[data-map-route-reference]').forEach(input => {
      input.addEventListener('change', event => onChangeSegment?.(event.target.dataset.mapRouteReference, 'segmentReference', event.target.value));
    });
    container.querySelectorAll('[data-map-route-note]').forEach(input => {
      input.addEventListener('change', event => onChangeSegment?.(event.target.dataset.mapRouteNote, 'segmentNote', event.target.value));
    });

    container.querySelectorAll('[data-map-route-focus]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        selectedSegmentIndex = Number(button.dataset.mapRouteFocus);
        const segment = segments[selectedSegmentIndex];
        const points = segmentLatLngs(segment);
        if (points.length === 2) {
          const element = getMapElement();
          const rect = element?.getBoundingClientRect();
          currentView = computeViewForPoints(points, Math.round(rect?.width || 900), Math.round(rect?.height || 620), 10);
        }
        renderCustomMap(false);
        renderMapRoutes(container, trip, settings, onChangeSegment);
      });
    });

    container.querySelectorAll('[data-map-route-open]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const segment = segments[Number(button.dataset.mapRouteOpen)];
        openOsmDirections(segment);
      });
    });

    container.querySelectorAll('[data-map-route]').forEach(card => {
      card.addEventListener('click', event => {
        if (event.target.closest('select, input, button')) return;
        selectedSegmentIndex = Number(card.dataset.mapRoute);
        const segment = segments[selectedSegmentIndex];
        const points = segmentLatLngs(segment);
        if (points.length === 2) {
          const element = getMapElement();
          const rect = element?.getBoundingClientRect();
          currentView = computeViewForPoints(points, Math.round(rect?.width || 900), Math.round(rect?.height || 620), 10);
        }
        renderCustomMap(false);
        renderMapRoutes(container, trip, settings, onChangeSegment);
      });
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
      leafletLoaded: false,
      leafletCssOk: true,
      mapCreated: Boolean(mapReady),
      containerFound: Boolean(element),
      containerWidth: rect ? Math.round(rect.width) : 0,
      containerHeight: rect ? Math.round(rect.height) : 0,
      visible: Boolean(rect && rect.width > 0 && rect.height > 0),
      stepsWithCoordinates: getValidSteps(pendingTrip).length,
      lastError: lastError || 'Carte OSM intégrée sans Leaflet.'
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
    renderMapRoutes,
    resetFilters,
    getDiagnostics
  };
})();
