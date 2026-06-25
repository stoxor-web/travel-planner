(function () {
  'use strict';

  const U = window.TravelUtils;
  const TILE_SIZE = 256;
  const MIN_ZOOM = 2;
  const MAX_ZOOM = 18;
  const COLORS = {
    car: '#2563eb',
    train: '#7c3aed',
    plane: '#0fbaa8',
    bus: '#f59e0b',
    bike: '#16a34a',
    walk: '#64748b',
    boat: '#0284c7',
    other: '#334155'
  };

  let mapEl;
  let tilesEl;
  let routesEl;
  let markersEl;
  let tooltipEl;
  let controlsEl;
  let attributionEl;
  let stepsCache = [];
  let settingsCache = null;
  let activeTypes = new Set();
  let selectedRouteIndex = null;
  let selectedStepId = null;
  let signature = '';
  let view = { lat: 46.6, lng: 2.4, zoom: 5 };
  let dragging = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lngLatToWorld(lng, lat, zoom) {
    const scale = TILE_SIZE * 2 ** zoom;
    const x = (Number(lng) + 180) / 360 * scale;
    const sinLat = Math.sin(Number(lat) * Math.PI / 180);
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
    return { x, y };
  }

  function worldToLngLat(x, y, zoom) {
    const scale = TILE_SIZE * 2 ** zoom;
    const lng = x / scale * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / scale;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng };
  }

  function currentCenterWorld() {
    return lngLatToWorld(view.lng, view.lat, view.zoom);
  }

  function worldToScreen(world) {
    const center = currentCenterWorld();
    const rect = mapRect();
    return {
      x: rect.width / 2 + world.x - center.x,
      y: rect.height / 2 + world.y - center.y
    };
  }

  function stepToScreen(step) {
    return worldToScreen(lngLatToWorld(Number(step.lng), Number(step.lat), view.zoom));
  }

  function mapRect() {
    if (!mapEl) return { width: 0, height: 0 };
    const rect = mapEl.getBoundingClientRect();
    return { width: Math.max(320, rect.width), height: Math.max(260, rect.height) };
  }

  function initMap() {
    mapEl = document.getElementById('travelMap');
    if (!mapEl || mapEl.classList.contains('osm-lite-map')) return;

    mapEl.className = 'osm-lite-map';
    mapEl.tabIndex = 0;
    mapEl.innerHTML = `
      <div class="osm-lite-tiles" aria-hidden="true"></div>
      <svg class="osm-lite-routes" aria-hidden="true"></svg>
      <div class="osm-lite-markers"></div>
      <div class="osm-lite-tooltip" hidden></div>
      <div class="osm-lite-controls" aria-label="Contrôles de la carte">
        <button type="button" data-map-zoom="in" aria-label="Zoomer">+</button>
        <button type="button" data-map-zoom="out" aria-label="Dézoomer">−</button>
        <button type="button" data-map-fit aria-label="Recentrer">⌖</button>
      </div>
      <div class="osm-lite-attribution">© OpenStreetMap</div>
    `;
    tilesEl = mapEl.querySelector('.osm-lite-tiles');
    routesEl = mapEl.querySelector('.osm-lite-routes');
    markersEl = mapEl.querySelector('.osm-lite-markers');
    tooltipEl = mapEl.querySelector('.osm-lite-tooltip');
    controlsEl = mapEl.querySelector('.osm-lite-controls');
    attributionEl = mapEl.querySelector('.osm-lite-attribution');

    bindMapEvents();
    draw();
  }

  function bindMapEvents() {
    controlsEl.querySelector('[data-map-zoom="in"]').addEventListener('click', () => zoomBy(1));
    controlsEl.querySelector('[data-map-zoom="out"]').addEventListener('click', () => zoomBy(-1));
    controlsEl.querySelector('[data-map-fit]').addEventListener('click', fitBounds);

    mapEl.addEventListener('wheel', event => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1 : -1, event.clientX, event.clientY);
    }, { passive: false });

    mapEl.addEventListener('pointerdown', event => {
      if (event.target.closest('.osm-lite-controls') || event.target.closest('.osm-marker')) return;
      mapEl.setPointerCapture(event.pointerId);
      mapEl.classList.add('is-dragging');
      dragging = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        center: currentCenterWorld()
      };
    });

    mapEl.addEventListener('pointermove', event => {
      if (!dragging || dragging.id !== event.pointerId) return;
      const dx = event.clientX - dragging.x;
      const dy = event.clientY - dragging.y;
      const next = worldToLngLat(dragging.center.x - dx, dragging.center.y - dy, view.zoom);
      view.lat = clamp(next.lat, -85, 85);
      view.lng = clamp(next.lng, -180, 180);
      draw();
    });

    const stopDrag = event => {
      if (!dragging || dragging.id !== event.pointerId) return;
      dragging = null;
      mapEl.classList.remove('is-dragging');
    };
    mapEl.addEventListener('pointerup', stopDrag);
    mapEl.addEventListener('pointercancel', stopDrag);

    mapEl.addEventListener('keydown', event => {
      const center = currentCenterWorld();
      const step = 80;
      if (event.key === '+') return zoomBy(1);
      if (event.key === '-') return zoomBy(-1);
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const next = worldToLngLat(
        center.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
        center.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
        view.zoom
      );
      view.lat = clamp(next.lat, -85, 85);
      view.lng = clamp(next.lng, -180, 180);
      draw();
    });
  }

  function zoomBy(delta, clientX, clientY) {
    const nextZoom = clamp(view.zoom + delta, MIN_ZOOM, MAX_ZOOM);
    if (nextZoom === view.zoom) return;

    if (clientX != null && clientY != null && mapEl) {
      const rect = mapEl.getBoundingClientRect();
      const beforeCenter = currentCenterWorld();
      const pointBefore = {
        x: beforeCenter.x + (clientX - rect.left - rect.width / 2),
        y: beforeCenter.y + (clientY - rect.top - rect.height / 2)
      };
      const latLng = worldToLngLat(pointBefore.x, pointBefore.y, view.zoom);
      view.zoom = nextZoom;
      const pointAfter = lngLatToWorld(latLng.lng, latLng.lat, view.zoom);
      const newCenter = {
        x: pointAfter.x - (clientX - rect.left - rect.width / 2),
        y: pointAfter.y - (clientY - rect.top - rect.height / 2)
      };
      const next = worldToLngLat(newCenter.x, newCenter.y, view.zoom);
      view.lat = clamp(next.lat, -85, 85);
      view.lng = clamp(next.lng, -180, 180);
    } else {
      view.zoom = nextZoom;
    }
    draw();
  }

  function updateMap(trip, settings) {
    initMap();
    settingsCache = settings;
    const steps = U.sortSteps(trip?.steps || []).filter(U.isValidCoord);
    const nextSignature = steps.map(step => `${step.id}:${step.lat}:${step.lng}`).join('|');
    stepsCache = steps;
    if (!mapEl) return;
    if (!steps.length) {
      signature = '';
      mapEl.classList.add('is-empty');
      drawEmpty('Ajoute au moins une étape avec une adresse ou des coordonnées pour afficher la carte.');
      return;
    }
    mapEl.classList.remove('is-empty');
    if (nextSignature !== signature) {
      signature = nextSignature;
      fitBounds(false);
    }
    draw();
  }

  function invalidate() {
    if (!mapEl) initMap();
    requestAnimationFrame(() => draw());
  }

  function fitBounds(animated = true) {
    initMap();
    const steps = selectedSteps();
    if (!mapEl || !steps.length) return;
    const rect = mapRect();
    if (steps.length === 1) {
      view.lat = Number(steps[0].lat);
      view.lng = Number(steps[0].lng);
      view.zoom = 12;
      draw();
      return;
    }
    const pointsAtMax = steps.map(step => lngLatToWorld(Number(step.lng), Number(step.lat), MAX_ZOOM));
    const minX = Math.min(...pointsAtMax.map(p => p.x));
    const maxX = Math.max(...pointsAtMax.map(p => p.x));
    const minY = Math.min(...pointsAtMax.map(p => p.y));
    const maxY = Math.max(...pointsAtMax.map(p => p.y));
    const padding = Math.min(110, Math.max(42, rect.width * 0.12));
    const zoomX = Math.log2((rect.width - padding * 2) / Math.max(1, maxX - minX)) + MAX_ZOOM;
    const zoomY = Math.log2((rect.height - padding * 2) / Math.max(1, maxY - minY)) + MAX_ZOOM;
    view.zoom = clamp(Math.floor(Math.min(zoomX, zoomY)), MIN_ZOOM, MAX_ZOOM);
    const centerMax = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const scale = 2 ** (view.zoom - MAX_ZOOM);
    const center = worldToLngLat(centerMax.x * scale, centerMax.y * scale, view.zoom);
    view.lat = clamp(center.lat, -85, 85);
    view.lng = clamp(center.lng, -180, 180);
    draw();
  }

  function selectedSteps() {
    return stepsCache.filter(step => !activeTypes.size || activeTypes.has(step.type));
  }

  function drawEmpty(message) {
    if (!mapEl) return;
    tilesEl.innerHTML = '';
    routesEl.innerHTML = '';
    markersEl.innerHTML = `<div class="map-empty-overlay"><strong>Carte prête</strong><span>${U.escapeHtml(message)}</span></div>`;
  }

  function draw() {
    if (!mapEl || !tilesEl || !routesEl || !markersEl) return;
    drawTiles();
    drawRoutes();
    drawMarkers();
  }

  function drawTiles() {
    const rect = mapRect();
    const z = Math.round(view.zoom);
    const center = currentCenterWorld();
    const startX = Math.floor((center.x - rect.width / 2) / TILE_SIZE) - 1;
    const endX = Math.floor((center.x + rect.width / 2) / TILE_SIZE) + 1;
    const startY = Math.floor((center.y - rect.height / 2) / TILE_SIZE) - 1;
    const endY = Math.floor((center.y + rect.height / 2) / TILE_SIZE) + 1;
    const maxTile = 2 ** z;
    const html = [];
    for (let x = startX; x <= endX; x += 1) {
      for (let y = startY; y <= endY; y += 1) {
        if (y < 0 || y >= maxTile) continue;
        const wrappedX = ((x % maxTile) + maxTile) % maxTile;
        const left = x * TILE_SIZE - center.x + rect.width / 2;
        const top = y * TILE_SIZE - center.y + rect.height / 2;
        html.push(`<img class="osm-lite-tile" draggable="false" alt="" src="https://tile.openstreetmap.org/${z}/${wrappedX}/${y}.png" style="transform:translate(${Math.round(left)}px,${Math.round(top)}px)" />`);
      }
    }
    tilesEl.innerHTML = html.join('');
  }

  function segmentPath(from, to, mode, index) {
    const a = stepToScreen(from);
    const b = stepToScreen(to);
    if (mode === 'plane') {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const curve = Math.min(170, Math.max(36, Math.hypot(dx, dy) * 0.22));
      const cx = mx - dy / Math.max(1, Math.hypot(dx, dy)) * curve;
      const cy = my + dx / Math.max(1, Math.hypot(dx, dy)) * curve;
      return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }

  function drawRoutes() {
    const rect = mapRect();
    const steps = selectedSteps();
    routesEl.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    routesEl.setAttribute('width', rect.width);
    routesEl.setAttribute('height', rect.height);
    if (steps.length < 2) {
      routesEl.innerHTML = '';
      return;
    }
    routesEl.innerHTML = steps.slice(0, -1).map((step, index) => {
      const next = steps[index + 1];
      const mode = step.transportToNext || 'car';
      const color = COLORS[mode] || COLORS.other;
      const dash = mode === 'plane' ? '10 10' : mode === 'walk' ? '4 8' : mode === 'boat' ? '12 6' : '';
      const path = segmentPath(step, next, mode, index);
      const active = selectedRouteIndex === index ? ' is-active' : '';
      return `
        <g class="osm-route${active}" data-route-index="${index}">
          <path d="${path}" stroke="rgba(15,23,42,.18)" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="${path}" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ''}></path>
        </g>`;
    }).join('');
  }

  function drawMarkers() {
    const rect = mapRect();
    const steps = selectedSteps();
    if (!steps.length) {
      markersEl.innerHTML = '<div class="map-empty-overlay"><strong>Aucun lieu visible</strong><span>Active une catégorie ou ajoute des coordonnées.</span></div>';
      return;
    }
    markersEl.innerHTML = steps.map((step, index) => {
      const pos = stepToScreen(step);
      const outside = pos.x < -80 || pos.y < -80 || pos.x > rect.width + 80 || pos.y > rect.height + 80;
      const selected = selectedStepId === step.id ? ' is-selected' : '';
      return `
        <button type="button" class="osm-marker${outside ? ' is-outside' : ''}${selected}" data-map-step="${step.id}" style="--marker-color:${step.color || '#2563eb'}; transform:translate(${pos.x.toFixed(1)}px,${pos.y.toFixed(1)}px) translate(-50%, -100%);">
          <span><i>${index + 1}</i></span>
          <strong>${U.escapeHtml(step.name)}</strong>
        </button>`;
    }).join('');
    markersEl.querySelectorAll('[data-map-step]').forEach(button => {
      const step = steps.find(item => item.id === button.dataset.mapStep);
      if (!step) return;
      button.addEventListener('click', event => {
        event.stopPropagation();
        selectedStepId = step.id;
        view.lat = Number(step.lat);
        view.lng = Number(step.lng);
        view.zoom = Math.max(view.zoom, 12);
        draw();
        showTooltip(step, button);
      });
    });
  }

  function showTooltip(step, button) {
    if (!tooltipEl) return;
    const pos = stepToScreen(step);
    tooltipEl.hidden = false;
    tooltipEl.innerHTML = `
      <strong>${U.escapeHtml(step.name)}</strong>
      <span>${U.escapeHtml(step.type || 'étape')}</span>
      ${step.address ? `<small>${U.escapeHtml(step.address)}</small>` : ''}
      ${step.arrivalDate ? `<small>${U.formatDate(step.arrivalDate)}</small>` : ''}
    `;
    tooltipEl.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y - 74)}px) translate(-50%, -100%)`;
    clearTimeout(showTooltip.timer);
    showTooltip.timer = setTimeout(() => { tooltipEl.hidden = true; }, 4200);
  }

  function focusStep(stepId) {
    const step = stepsCache.find(item => item.id === stepId);
    if (!step) return;
    selectedStepId = stepId;
    view.lat = Number(step.lat);
    view.lng = Number(step.lng);
    view.zoom = Math.max(view.zoom, 12);
    draw();
  }

  function focusRoute(index) {
    const steps = selectedSteps();
    const from = steps[index];
    const to = steps[index + 1];
    if (!from || !to) return;
    selectedRouteIndex = Number(index);
    const old = stepsCache;
    const temp = [from, to];
    const originalTypes = activeTypes;
    stepsCache = temp;
    activeTypes = new Set();
    fitBounds(false);
    stepsCache = old;
    activeTypes = originalTypes;
    draw();
  }

  function renderFilters(container, trip, onToggle) {
    if (!container) return;
    const types = U.unique((trip?.steps || []).map(step => step.type));
    if (!types.length) {
      container.innerHTML = '<span class="chip">aucune catégorie</span>';
      return;
    }
    const known = new Set(types);
    activeTypes = new Set([...activeTypes].filter(type => known.has(type)));
    if (!activeTypes.size) activeTypes = new Set(types);
    container.innerHTML = types.map(type => `<button class="chip ${activeTypes.has(type) ? '' : 'is-muted'}" data-map-type="${U.escapeHtml(type)}">${U.escapeHtml(type)}</button>`).join('');
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
    const steps = U.sortSteps(trip?.steps || []);
    if (!steps.length) {
      container.innerHTML = '<div class="empty-state">Aucune étape à afficher sur la carte.</div>';
      return;
    }
    container.innerHTML = steps.map((step, index) => `
      <button class="map-step" data-focus-step="${step.id}">
        <strong>${index + 1}. ${U.escapeHtml(step.name)}</strong>
        <small>${U.escapeHtml(step.type || 'étape')} · ${U.escapeHtml(step.address || (U.isValidCoord(step) ? `${Number(step.lat).toFixed(4)}, ${Number(step.lng).toFixed(4)}` : 'coordonnées manquantes'))}</small>
      </button>
    `).join('');
    container.querySelectorAll('[data-focus-step]').forEach(button => {
      button.addEventListener('click', () => focusStep(button.dataset.focusStep));
    });
  }

  function renderMapRoutes(container, trip, settings, onChangeSegment) {
    if (!container) return;
    const steps = U.sortSteps(trip?.steps || []);
    if (!trip || steps.length < 2) {
      container.innerHTML = '<div class="empty-state">Ajoute au moins deux étapes pour voir les trajets.</div>';
      return;
    }
    const modeOptions = Object.entries(U.transportModes).map(([value, mode]) => `<option value="${value}">${mode.icon} ${mode.label}</option>`).join('');
    container.innerHTML = `
      <div class="route-flow-head"><strong>${steps.length - 1} trajet(s)</strong><small>point par point</small></div>
      ${steps.slice(0, -1).map((step, index) => {
        const next = steps[index + 1];
        const mode = step.transportToNext || 'car';
        const estimate = U.estimateSegment(step, next, mode, settings);
        const cost = Number(step.segmentCost) || estimate.cost;
        return `
          <article class="map-route ${selectedRouteIndex === index ? 'is-active' : ''}" data-focus-route="${index}">
            <div class="map-route__index">${index + 1}</div>
            <div class="map-route__body">
              <strong>${U.escapeHtml(step.name)} → ${U.escapeHtml(next.name)}</strong>
              <div class="route-metrics">
                <span>${U.transportModes[mode]?.icon || '➜'} ${U.transportModes[mode]?.label || 'trajet'}</span>
                <span>${U.isValidCoord(step) && U.isValidCoord(next) ? U.formatDistance(estimate.distance) : 'coordonnées à compléter'}</span>
                <span>${U.isValidCoord(step) && U.isValidCoord(next) ? U.formatDuration(estimate.duration) : 'durée inconnue'}</span>
                <span>${U.formatMoney(cost, trip.currency)}</span>
              </div>
              <div class="route-editor">
                <label>Transport
                  <select class="input" data-segment-field="transportToNext" data-step-id="${step.id}">${modeOptions}</select>
                </label>
                <label>Coût
                  <input class="input" type="number" min="0" step="0.01" value="${Number(step.segmentCost) || ''}" data-segment-field="segmentCost" data-step-id="${step.id}" placeholder="${estimate.cost.toFixed(0)}" />
                </label>
              </div>
              <input class="input route-note" value="${U.escapeHtml(step.segmentNote || '')}" data-segment-field="segmentNote" data-step-id="${step.id}" placeholder="Note : billet, pause, numéro de vol..." />
              <div class="route-actions">
                <button class="button button--tiny" type="button" data-route-open="${index}">Ouvrir OSM</button>
              </div>
            </div>
          </article>`;
      }).join('')}
    `;
    container.querySelectorAll('[data-segment-field="transportToNext"]').forEach(select => {
      const step = steps.find(item => item.id === select.dataset.stepId);
      select.value = step?.transportToNext || 'car';
    });
    container.querySelectorAll('[data-segment-field]').forEach(field => {
      field.addEventListener('change', event => onChangeSegment?.(event.target.dataset.stepId, event.target.dataset.segmentField, event.target.value));
      field.addEventListener('click', event => event.stopPropagation());
    });
    container.querySelectorAll('[data-focus-route]').forEach(card => {
      card.addEventListener('click', () => focusRoute(Number(card.dataset.focusRoute)));
    });
    container.querySelectorAll('[data-route-open]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const index = Number(button.dataset.routeOpen);
        const from = steps[index];
        const to = steps[index + 1];
        if (!U.isValidCoord(from) || !U.isValidCoord(to)) return;
        const url = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from.lat}%2C${from.lng}%3B${to.lat}%2C${to.lng}`;
        window.open(url, '_blank', 'noopener');
      });
    });
  }

  function resetFilters() {
    activeTypes = new Set();
    selectedRouteIndex = null;
    selectedStepId = null;
    signature = '';
  }

  window.TravelMap = {
    initMap,
    updateMap,
    invalidate,
    fitBounds,
    renderFilters,
    renderMapSteps,
    renderMapRoutes,
    resetFilters,
    focusStep,
    focusRoute
  };
})();
