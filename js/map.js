(function () {
  'use strict';

  let lastTrip = null;
  let lastSettings = null;

  function initMap() {
    const el = document.getElementById('mapCanvas');
    if (el && !el.dataset.ready) {
      el.dataset.ready = '1';
      el.addEventListener('click', event => {
        const marker = event.target.closest('[data-map-step]');
        if (!marker || !lastTrip) return;
        const step = (lastTrip.steps || []).find(s => s.id === marker.dataset.mapStep);
        if (step && window.TravelUtils.isValidCoord(step)) {
          window.open(`https://www.openstreetmap.org/?mlat=${step.lat}&mlon=${step.lng}#map=13/${step.lat}/${step.lng}`, '_blank', 'noopener');
        }
      });
    }
  }

  function project(step, bounds, width, height) {
    const lat = Number(step.lat);
    const lng = Number(step.lng);
    const lngSpan = Math.max(0.01, bounds.maxLng - bounds.minLng);
    const latSpan = Math.max(0.01, bounds.maxLat - bounds.minLat);
    const x = 48 + ((lng - bounds.minLng) / lngSpan) * (width - 96);
    const y = 48 + ((bounds.maxLat - lat) / latSpan) * (height - 96);
    return { x, y };
  }

  function boundsFor(steps) {
    const lats = steps.map(s => Number(s.lat));
    const lngs = steps.map(s => Number(s.lng));
    let minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    if (minLat === maxLat) { minLat -= .05; maxLat += .05; }
    if (minLng === maxLng) { minLng -= .05; maxLng += .05; }
    const padLat = (maxLat - minLat) * .18;
    const padLng = (maxLng - minLng) * .18;
    return { minLat: minLat - padLat, maxLat: maxLat + padLat, minLng: minLng - padLng, maxLng: maxLng + padLng };
  }

  function segmentColor(mode) {
    return { plane: '#f97316', train: '#2563eb', car: '#0f766e', bus: '#7c3aed', walk: '#16a34a', bike: '#0891b2', boat: '#0ea5e9', other: '#64748b' }[mode] || '#0f766e';
  }

  function updateMap(trip, settings) {
    initMap();
    lastTrip = trip;
    lastSettings = settings;
    const canvas = document.getElementById('mapCanvas');
    if (!canvas) return;
    const steps = window.TravelUtils.sortSteps(trip?.steps || []).filter(window.TravelUtils.isValidCoord);
    if (!steps.length) {
      canvas.innerHTML = `<div class="map-empty"><strong>Carte prête</strong><span>Ajoute des coordonnées ou recherche une adresse pour placer tes étapes.</span></div>`;
      return;
    }

    const w = Math.max(760, canvas.clientWidth || 900);
    const h = Math.max(460, canvas.clientHeight || 520);
    const bounds = boundsFor(steps);
    const pts = steps.map(s => ({ step: s, ...project(s, bounds, w, h) }));
    const grid = Array.from({ length: 7 }, (_, i) => `<line x1="${(i + 1) * w / 8}" y1="0" x2="${(i + 1) * w / 8}" y2="${h}" class="map-grid"/><line x1="0" y1="${(i + 1) * h / 8}" x2="${w}" y2="${(i + 1) * h / 8}" class="map-grid"/>`).join('');
    const segments = pts.slice(0, -1).map((p, i) => {
      const q = pts[i + 1];
      const mode = p.step.transportToNext || 'car';
      const dash = mode === 'plane' ? '10 9' : mode === 'walk' ? '4 8' : '';
      const midX = (p.x + q.x) / 2;
      const midY = (p.y + q.y) / 2;
      const dist = window.TravelUtils.estimateSegment(p.step, q.step, mode, settings).distance;
      return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${segmentColor(mode)}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${dash}" class="route-line"/><text x="${midX}" y="${midY - 8}" class="map-label">${window.TravelUtils.formatDistance(dist)}</text>`;
    }).join('');
    const markers = pts.map((p, i) => `
      <g class="map-marker" data-map-step="${p.step.id}" tabindex="0" role="button">
        <circle cx="${p.x}" cy="${p.y}" r="18" fill="${p.step.color || '#0f766e'}"/>
        <circle cx="${p.x}" cy="${p.y}" r="23" class="marker-halo"/>
        <text x="${p.x}" y="${p.y + 5}" text-anchor="middle" class="marker-number">${i + 1}</text>
        <text x="${p.x}" y="${p.y + 38}" text-anchor="middle" class="marker-caption">${window.TravelUtils.escapeHtml(p.step.name).slice(0, 22)}</text>
      </g>`).join('');

    canvas.innerHTML = `<svg class="travel-svg-map" viewBox="0 0 ${w} ${h}" aria-label="Carte du voyage"><defs><radialGradient id="mapBg" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#effaf7"/><stop offset="55%" stop-color="#e8f2fb"/><stop offset="100%" stop-color="#dbeafe"/></radialGradient></defs><rect width="${w}" height="${h}" rx="22" fill="url(#mapBg)"/>${grid}${segments}${markers}</svg>`;
  }

  function fitBounds() { updateMap(lastTrip, lastSettings); }
  function invalidate() { setTimeout(() => updateMap(lastTrip, lastSettings), 80); }
  function resetFilters() {}

  window.TravelMap = { initMap, updateMap, fitBounds, invalidate, resetFilters };
})();
