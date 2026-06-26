(function () {
  'use strict';

  let container;
  let mapState = { center: { lat: 46.6, lng: 2.4 }, zoom: 5, drag: null };
  let currentTrip = null;
  let currentSettings = null;
  let activeTypes = new Set();

  const tileUrl = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const TILE = 256;

  function project(lat, lng, zoom) {
    const sin = Math.sin(lat * Math.PI / 180);
    const scale = TILE * 2 ** zoom;
    return {
      x: (lng + 180) / 360 * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
    };
  }
  function unproject(x, y, zoom) {
    const scale = TILE * 2 ** zoom;
    const lng = x / scale * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / scale;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng };
  }

  function initMap() {
    container = document.getElementById('travelMap');
    if (!container) return;
    container.classList.add('osm-map');
    if (!container.dataset.bound) {
      container.dataset.bound = '1';
      container.addEventListener('wheel', onWheel, { passive: false });
      container.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }
    renderCanvas();
  }

  function onWheel(e) {
    e.preventDefault();
    mapState.zoom = clamp(mapState.zoom + (e.deltaY < 0 ? 1 : -1), 2, 16);
    renderCanvas();
  }
  function onPointerDown(e) {
    if (!container) return;
    container.setPointerCapture?.(e.pointerId);
    const c = project(mapState.center.lat, mapState.center.lng, mapState.zoom);
    mapState.drag = { x: e.clientX, y: e.clientY, centerX: c.x, centerY: c.y };
  }
  function onPointerMove(e) {
    if (!mapState.drag) return;
    const dx = e.clientX - mapState.drag.x;
    const dy = e.clientY - mapState.drag.y;
    mapState.center = unproject(mapState.drag.centerX - dx, mapState.drag.centerY - dy, mapState.zoom);
    renderCanvas();
  }
  function onPointerUp() { mapState.drag = null; }

  function validSteps(trip = currentTrip) {
    return window.TravelUtils.sortSteps(trip?.steps || []).filter(step => window.TravelUtils.isValidCoord(step));
  }

  function fitBounds() {
    const steps = validSteps();
    if (!steps.length) { mapState.center = { lat: 46.6, lng: 2.4 }; mapState.zoom = 5; renderCanvas(); return; }
    const lats = steps.map(s => Number(s.lat));
    const lngs = steps.map(s => Number(s.lng));
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    mapState.center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
    const latRange = Math.max(0.01, maxLat - minLat);
    const lngRange = Math.max(0.01, maxLng - minLng);
    const rect = container?.getBoundingClientRect() || { width: 800, height: 500 };
    for (let z = 14; z >= 2; z--) {
      const a = project(minLat, minLng, z), b = project(maxLat, maxLng, z);
      if (Math.abs(b.x - a.x) < rect.width * 0.7 && Math.abs(b.y - a.y) < rect.height * 0.7) { mapState.zoom = z; break; }
    }
    renderCanvas();
  }

  function updateMap(trip, settings) {
    currentTrip = trip;
    currentSettings = settings;
    initMap();
    const steps = validSteps(trip);
    if (steps.length) fitBounds(); else renderCanvas();
  }

  function renderCanvas() {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const width = Math.max(320, rect.width || 800);
    const height = Math.max(320, rect.height || 520);
    const centerPx = project(mapState.center.lat, mapState.center.lng, mapState.zoom);
    const topLeft = { x: centerPx.x - width / 2, y: centerPx.y - height / 2 };
    const z = mapState.zoom;
    const minX = Math.floor(topLeft.x / TILE) - 1;
    const maxX = Math.floor((topLeft.x + width) / TILE) + 1;
    const minY = Math.floor(topLeft.y / TILE) - 1;
    const maxY = Math.floor((topLeft.y + height) / TILE) + 1;
    const tileCount = 2 ** z;
    const tiles = [];
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      if (y < 0 || y >= tileCount) continue;
      const wrappedX = ((x % tileCount) + tileCount) % tileCount;
      tiles.push(`<img class="osm-tile" alt="" draggable="false" src="${tileUrl(z, wrappedX, y)}" style="left:${Math.round(x * TILE - topLeft.x)}px;top:${Math.round(y * TILE - topLeft.y)}px">`);
    }

    const steps = validSteps().filter(step => !activeTypes.size || activeTypes.has(step.type));
    const points = steps.map((step, idx) => {
      const p = project(Number(step.lat), Number(step.lng), z);
      return { step, idx, x: p.x - topLeft.x, y: p.y - topLeft.y };
    });
    const polylines = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const mode = a.step.transportToNext || 'car';
      const dash = mode === 'plane' ? '8 10' : mode === 'walk' ? '4 8' : '';
      polylines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${modeColor(mode)}" stroke-width="4" stroke-linecap="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`);
    }
    const markers = points.map(p => `<button class="osm-marker" title="${escapeAttr(p.step.name)}" style="left:${p.x}px;top:${p.y}px;background:${p.step.color || '#2563eb'}" data-map-marker="${p.step.id}">${p.idx + 1}</button>`).join('');
    container.innerHTML = `
      <div class="osm-tiles">${tiles.join('')}</div>
      <svg class="osm-routes" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${polylines.join('')}</svg>
      <div class="osm-markers">${markers}</div>
      <div class="osm-controls"><button type="button" data-osm-zoom="in">+</button><button type="button" data-osm-zoom="out">−</button></div>
      <div class="osm-credit">© OpenStreetMap</div>
      ${!points.length ? '<div class="osm-empty">Ajoute des coordonnées aux étapes pour afficher le voyage.</div>' : ''}
    `;
    container.querySelector('[data-osm-zoom="in"]')?.addEventListener('click', () => { mapState.zoom = clamp(mapState.zoom + 1, 2, 16); renderCanvas(); });
    container.querySelector('[data-osm-zoom="out"]')?.addEventListener('click', () => { mapState.zoom = clamp(mapState.zoom - 1, 2, 16); renderCanvas(); });
    container.querySelectorAll('[data-map-marker]').forEach(btn => btn.addEventListener('click', () => {
      const step = steps.find(s => s.id === btn.dataset.mapMarker);
      if (step) showPopup(step, btn);
    }));
  }

  function showPopup(step, anchor) {
    container.querySelector('.osm-popup')?.remove();
    const popup = document.createElement('div');
    popup.className = 'osm-popup';
    popup.innerHTML = `<strong>${window.TravelUtils.escapeHtml(step.name)}</strong><small>${window.TravelUtils.escapeHtml(step.type || 'étape')}</small><p>${window.TravelUtils.escapeHtml(step.address || '')}</p><p>${window.TravelUtils.formatDate(step.arrivalDate)}${step.arrivalTime ? ` · ${step.arrivalTime}` : ''}</p>`;
    const left = parseFloat(anchor.style.left) || 0;
    const top = parseFloat(anchor.style.top) || 0;
    popup.style.left = `${left + 18}px`;
    popup.style.top = `${top - 10}px`;
    container.appendChild(popup);
  }

  function escapeAttr(v) { return String(v || '').replaceAll('&', '&amp;').replaceAll('"', '&quot;'); }
  function modeColor(mode) { return { plane: '#fb7185', car: '#2563eb', train: '#14b8a6', bus: '#f59e0b', walk: '#16a34a', bike: '#22c55e', boat: '#06b6d4' }[mode] || '#64748b'; }
  function invalidate() { setTimeout(renderCanvas, 80); }

  function renderFilters(el, trip, onToggle) {
    if (!el) return;
    const types = window.TravelUtils.unique((trip?.steps || []).map(s => s.type).filter(Boolean));
    if (!types.length) { el.innerHTML = '<span class="chip">aucune catégorie</span>'; return; }
    if (!activeTypes.size) activeTypes = new Set(types);
    el.innerHTML = types.map(t => `<button class="chip ${activeTypes.has(t) ? '' : 'is-muted'}" type="button" data-map-type="${escapeAttr(t)}">${window.TravelUtils.escapeHtml(t)}</button>`).join('');
    el.querySelectorAll('[data-map-type]').forEach(btn => btn.addEventListener('click', () => {
      const t = btn.dataset.mapType;
      if (activeTypes.has(t)) activeTypes.delete(t); else activeTypes.add(t);
      if (!activeTypes.size) types.forEach(x => activeTypes.add(x));
      onToggle?.();
    }));
  }

  function renderMapSteps(el, trip) {
    if (!el) return;
    const steps = window.TravelUtils.sortSteps(trip?.steps || []);
    if (!steps.length) { el.innerHTML = '<div class="empty-state">Aucune étape.</div>'; return; }
    el.innerHTML = steps.map((s, i) => `<button class="map-step" type="button" data-focus-step="${s.id}"><strong>${i + 1}. ${window.TravelUtils.escapeHtml(s.name)}</strong><small>${window.TravelUtils.escapeHtml(s.type || '')} · ${window.TravelUtils.escapeHtml(s.address || (window.TravelUtils.isValidCoord(s) ? `${s.lat}, ${s.lng}` : 'coordonnées manquantes'))}</small></button>`).join('');
    el.querySelectorAll('[data-focus-step]').forEach(btn => btn.addEventListener('click', () => {
      const s = steps.find(x => x.id === btn.dataset.focusStep);
      if (s && window.TravelUtils.isValidCoord(s)) { mapState.center = { lat: Number(s.lat), lng: Number(s.lng) }; mapState.zoom = 12; renderCanvas(); }
    }));
  }

  function renderRoutes(el, trip, settings, onChange) {
    if (!el) return;
    const segments = window.TravelItinerary.buildSegments(trip, settings);
    if (!segments.length) { el.innerHTML = '<div class="empty-state">Ajoute deux étapes pour voir les trajets.</div>'; return; }
    const options = Object.entries(window.TravelUtils.transportModes).map(([v, m]) => `<option value="${v}">${m.icon} ${m.label}</option>`).join('');
    el.innerHTML = segments.map(seg => `<article class="route-card"><strong>${window.TravelUtils.escapeHtml(seg.from.name)} → ${window.TravelUtils.escapeHtml(seg.to.name)}</strong><small>${seg.hasCoordinates ? `${window.TravelUtils.formatDistance(seg.distance)} · ${window.TravelUtils.formatDuration(seg.duration)}` : 'coordonnées à compléter'} · ${window.TravelUtils.formatMoney(seg.cost, trip?.currency)}</small><select class="input" data-route-mode="${seg.from.id}">${options}</select></article>`).join('');
    el.querySelectorAll('[data-route-mode]').forEach(sel => {
      const step = (trip?.steps || []).find(s => s.id === sel.dataset.routeMode);
      sel.value = step?.transportToNext || 'car';
      sel.addEventListener('change', () => onChange?.(sel.dataset.routeMode, sel.value));
    });
  }

  function resetFilters() { activeTypes = new Set(); }

  window.TravelMap = { initMap, updateMap, invalidate, fitBounds, renderFilters, renderMapSteps, renderRoutes, resetFilters };
})();
