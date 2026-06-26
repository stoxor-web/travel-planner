(function(){
  'use strict';
  const U = window.TravelUtils;
  let lastTrip = null;
  let lastSettings = null;
  function fitBounds(){ updateMap(lastTrip,lastSettings); }
  function project(step,bounds,w,h){
    const lat=Number(step.lat), lng=Number(step.lng);
    const x = bounds.maxLng===bounds.minLng ? w/2 : ((lng-bounds.minLng)/(bounds.maxLng-bounds.minLng))*w;
    const y = bounds.maxLat===bounds.minLat ? h/2 : ((bounds.maxLat-lat)/(bounds.maxLat-bounds.minLat))*h;
    return {x: Math.max(34,Math.min(w-34,x)), y: Math.max(34,Math.min(h-34,y))};
  }
  function boundsFor(steps){
    const coords=steps.filter(U.isValidCoord);
    if(!coords.length) return {minLat:43,maxLat:51,minLng:-3,maxLng:8};
    let minLat=Math.min(...coords.map(s=>Number(s.lat))), maxLat=Math.max(...coords.map(s=>Number(s.lat))), minLng=Math.min(...coords.map(s=>Number(s.lng))), maxLng=Math.max(...coords.map(s=>Number(s.lng)));
    const latPad=Math.max(.25,(maxLat-minLat)*.25), lngPad=Math.max(.25,(maxLng-minLng)*.25);
    return {minLat:minLat-latPad,maxLat:maxLat+latPad,minLng:minLng-lngPad,maxLng:maxLng+lngPad};
  }
  function updateMap(trip,settings){
    lastTrip=trip; lastSettings=settings;
    const canvas=document.getElementById('mapCanvas'); if(!canvas) return;
    const steps=U.sortSteps(trip?.steps||[]).filter(U.isValidCoord); const w=900,h=560;
    if(!trip || !steps.length){ canvas.innerHTML='<div class="empty-state">Ajoute des étapes avec latitude et longitude pour afficher la carte.</div>'; updateOsmLink(trip); return; }
    const b=boundsFor(steps); const pts=steps.map((s,i)=>({...project(s,b,w,h),step:s,index:i}));
    const grid = Array.from({length:8},(_,i)=>`<line class="map-grid" x1="${i*w/7}" y1="0" x2="${i*w/7}" y2="${h}"/><line class="map-grid" x1="0" y1="${i*h/7}" x2="${w}" y2="${i*h/7}"/>`).join('');
    const lines = pts.slice(0,-1).map((p,i)=>{ const q=pts[i+1]; const mode=p.step.transportToNext||'car'; const cls=mode==='plane'?'route-line plane':'route-line'; return `<path class="${cls}" d="M${p.x},${p.y} C${(p.x+q.x)/2},${Math.min(p.y,q.y)-60} ${(p.x+q.x)/2},${Math.max(p.y,q.y)+60} ${q.x},${q.y}"/>`; }).join('');
    const markers = pts.map(p=>`<g class="map-point"><circle cx="${p.x}" cy="${p.y}" r="17" fill="${p.step.color||'#1769e8'}" stroke="#fff" stroke-width="3"/><text x="${p.x}" y="${p.y+4}" text-anchor="middle">${p.index+1}</text><text class="map-label" x="${p.x+22}" y="${p.y-18}">${U.escapeHtml(p.step.name).slice(0,24)}</text></g>`).join('');
    canvas.innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Carte schématique du voyage"><defs><linearGradient id="sea" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#dff2ff"/><stop offset="1" stop-color="#f8fffd"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#sea)"/>${grid}${lines}${markers}</svg>`;
    updateOsmLink(trip);
  }
  function updateOsmLink(trip){
    const link=document.getElementById('openOsmBtn'); if(!link) return;
    const steps=U.sortSteps(trip?.steps||[]).filter(U.isValidCoord);
    if(!steps.length){ link.href='https://www.openstreetmap.org'; return; }
    const center=steps[Math.floor(steps.length/2)]; link.href=`https://www.openstreetmap.org/?mlat=${center.lat}&mlon=${center.lng}#map=7/${center.lat}/${center.lng}`;
  }
  function renderSegments(container,trip,settings,onChange){
    if(!container) return; const steps=U.sortSteps(trip?.steps||[]);
    if(!trip || steps.length<2){ container.innerHTML='<div class="empty-state">Ajoute au moins deux étapes pour voir les trajets.</div>'; return; }
    container.innerHTML=steps.slice(0,-1).map((step,i)=>{ const next=steps[i+1]; const mode=step.transportToNext||'car'; const est=U.estimateSegment(step,next,mode,settings); return `<article class="segment-card"><span class="badge">${est.modeIcon} ${est.modeLabel}</span><h3>${U.escapeHtml(step.name)} → ${U.escapeHtml(next.name)}</h3><p>${U.formatDistance(est.distance)} · ${U.formatDuration(est.duration)} · ${U.formatMoney(step.segmentCost || est.cost, trip.currency)}</p><label>Transport<select class="input" data-segment-mode="${step.id}">${Object.entries(U.transportModes).map(([k,v])=>`<option value="${k}" ${k===mode?'selected':''}>${v.icon} ${v.label}</option>`).join('')}</select></label><label>Coût réel / estimé<input class="input" type="number" min="0" step="0.01" value="${step.segmentCost||''}" data-segment-cost="${step.id}" /></label><label>Référence<input class="input" value="${U.escapeHtml(step.segmentReference||'')}" data-segment-reference="${step.id}" placeholder="Vol, train, réservation…" /></label></article>`; }).join('');
    container.querySelectorAll('[data-segment-mode],[data-segment-cost],[data-segment-reference]').forEach(el=>el.addEventListener('change',()=>{ const id=el.dataset.segmentMode||el.dataset.segmentCost||el.dataset.segmentReference; const field=el.dataset.segmentMode?'transportToNext':el.dataset.segmentCost?'segmentCost':'segmentReference'; onChange?.(id,field,el.value); }));
  }
  window.TravelMap = { updateMap, fitBounds, renderSegments };
})();
