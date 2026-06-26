(function(){
  'use strict';
  const placeTypes = ['ville','hôtel','activité','restaurant','gare','aéroport','point de vue','pause','parking','plage','randonnée','autre'];
  const transportModes = {
    car:{label:'voiture',icon:'🚗',speedKey:'car'}, train:{label:'train',icon:'🚆',speedKey:'train'}, plane:{label:'avion',icon:'✈️',speedKey:'plane'}, bus:{label:'bus',icon:'🚌',speedKey:'bus'}, bike:{label:'vélo',icon:'🚲',speedKey:'bike'}, walk:{label:'marche',icon:'🚶',speedKey:'walk'}, boat:{label:'bateau',icon:'⛴️',speedKey:'boat'}, other:{label:'autre',icon:'➜',speedKey:'other'}
  };
  const expenseCategories = ['transport','logement','carburant','péages','nourriture','activités','courses','parking','billets','assurances','souvenirs','imprévus','autres'];
  const defaultSettings = { theme:'light', autosaveMinutes:3, speeds:{car:90,train:120,plane:720,bus:65,bike:18,walk:4.5,boat:35,other:50}, costPerKm:{car:.22,train:.14,plane:.11,bus:.08,bike:0,walk:0,boat:.12,other:0}, fixedHours:{plane:3,train:.25,boat:.4,other:0} };
  const checklistTemplates = {
    documents:['Passeport / carte d’identité','Permis de conduire','Assurance voyage','Billets','Réservations accessibles hors ligne'],
    vêtements:['Tenues par météo','Chaussures confortables','Veste de pluie','Tenue plus habillée','Sac linge sale'],
    santé:['Trousse de secours','Médicaments personnels','Crème solaire','Ordonnances','Gel hydroalcoolique'],
    électronique:['Chargeurs','Batterie externe','Adaptateur secteur','Écouteurs','Sauvegarde photos'],
    avion:['Check-in en ligne','Bagage cabine','Liquides conformes','Heure limite aéroport','Étiquette bagage'],
    réservations:['Hôtels','Transports','Activités','Restaurants','Locations'],
    'avant départ':['Arroser plantes','Sortir poubelles','Télécharger cartes','Vérifier météo','Prévenir un proche']
  };
  const uid = (prefix='id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const escapeHtml = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const toNumber = (value, fallback=0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
  const clone = value => JSON.parse(JSON.stringify(value ?? null));
  const deepMerge = (target={}, source={}) => { const out = Array.isArray(target) ? [...target] : {...target}; Object.entries(source||{}).forEach(([k,v])=>{ out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k]||{}, v) : v; }); return out; };
  const sortSteps = (steps=[]) => [...(Array.isArray(steps)?steps:[])].sort((a,b)=>(a.order??0)-(b.order??0));
  const normalizeNameList = value => Array.isArray(value) ? value.map(String).map(s=>s.trim()).filter(Boolean) : String(value||'').split(',').map(s=>s.trim()).filter(Boolean);
  const unique = arr => [...new Set((arr||[]).filter(Boolean))];
  const isValidCoord = step => { const lat=Number(step?.lat), lng=Number(step?.lng); return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat)<=90 && Math.abs(lng)<=180; };
  const dateTimeValue = (date,time='00:00') => date ? new Date(`${date}T${time || '00:00'}`) : null;
  function formatDate(dateString){ if(!dateString) return 'date non renseignée'; const d=new Date(`${dateString}T12:00:00`); return Number.isNaN(d.getTime()) ? dateString : new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',year:'numeric'}).format(d); }
  function formatDateTime(date,time){ if(!date) return 'horaire non renseigné'; return `${formatDate(date)}${time ? ` · ${time}` : ''}`; }
  function dateDiffDays(start,end){ if(!start||!end) return 0; const a=new Date(`${start}T12:00:00`), b=new Date(`${end}T12:00:00`); if(Number.isNaN(a)||Number.isNaN(b)) return 0; return Math.max(0,Math.round((b-a)/86400000)+1); }
  function formatMoney(amount,currency='€'){ const value=toNumber(amount); return `${value.toLocaleString('fr-FR',{maximumFractionDigits:2})} ${currency||'€'}`; }
  function formatDistance(km){ const v=toNumber(km); return v < 1 ? `${Math.round(v*1000)} m` : `${v.toLocaleString('fr-FR',{maximumFractionDigits:v>100?0:1})} km`; }
  function formatDuration(hours){ const m=Math.max(0,Math.round(toNumber(hours)*60)); const h=Math.floor(m/60), r=m%60; return h ? `${h} h${r?` ${String(r).padStart(2,'0')}`:''}` : `${r} min`; }
  function haversineKm(a,b){ if(!isValidCoord(a)||!isValidCoord(b)) return 0; const R=6371, rad=x=>x*Math.PI/180; const dLat=rad(Number(b.lat)-Number(a.lat)); const dLng=rad(Number(b.lng)-Number(a.lng)); const lat1=rad(Number(a.lat)); const lat2=rad(Number(b.lat)); const q=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(q)); }
  function estimateSegment(from,to,mode='car',settings=defaultSettings){ const d=haversineKm(from,to); const def=transportModes[mode]||transportModes.other; const speed=Math.max(1,toNumber(settings?.speeds?.[def.speedKey],defaultSettings.speeds[def.speedKey]||50)); const fixed=toNumber(settings?.fixedHours?.[def.speedKey],defaultSettings.fixedHours[def.speedKey]||0); const costKm=toNumber(settings?.costPerKm?.[def.speedKey],defaultSettings.costPerKm[def.speedKey]||0); return {mode,modeLabel:def.label,modeIcon:def.icon,distance:d,duration:d/speed+fixed,cost:d*costKm}; }
  function tripDuration(trip){ const days=dateDiffDays(trip?.startDate,trip?.endDate); if(days) return days; const dates=(trip?.steps||[]).map(s=>s.arrivalDate).filter(Boolean).sort(); return dates.length ? (dateDiffDays(dates[0],dates.at(-1))||dates.length) : Math.max(1,(trip?.steps||[]).length||1); }
  function slug(value){ return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'voyage'; }
  function createDefaultChecklists(){ return Object.entries(checklistTemplates).map(([title,items])=>({id:uid('list'),title,items:items.map(text=>({id:uid('todo'),text,done:false}))})); }
  window.TravelUtils = { placeTypes, transportModes, expenseCategories, defaultSettings, checklistTemplates, uid, escapeHtml, toNumber, clone, deepMerge, sortSteps, normalizeNameList, unique, isValidCoord, dateTimeValue, formatDate, formatDateTime, dateDiffDays, formatMoney, formatDistance, formatDuration, haversineKm, estimateSegment, tripDuration, slug, createDefaultChecklists };
})();
