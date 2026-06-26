(function(){
  const placeTypes=['ville','hôtel','activité','restaurant','gare','aéroport','point de vue','pause','autre'];
  const expenseCategories=['transport','logement','carburant','péages','nourriture','activités','courses','parking','billets','assurances','souvenirs','imprévus','autres'];
  const uid=()=> (crypto?.randomUUID ? crypto.randomUUID() : 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const dateLabel=d=>d?new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}):'Date à préciser';
  const shortDate=d=>d?new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}):'À dater';
  const money=(v,c='€')=>`${num(v).toLocaleString('fr-FR',{maximumFractionDigits:0})} ${esc(c)}`;
  const parsePeople=s=>String(s||'').split(',').map(x=>x.trim()).filter(Boolean);
  const daysBetween=(a,b)=>{ if(!a||!b)return 0; const d1=new Date(a+'T00:00:00'),d2=new Date(b+'T00:00:00'); return Math.max(1,Math.round((d2-d1)/86400000)+1); };
  const dt=(d,t)=> d ? new Date(`${d}T${t||'00:00'}`) : null;
  const haversine=(a,b)=>{ const R=6371; const la1=num(a.lat)*Math.PI/180, la2=num(b.lat)*Math.PI/180; const dLat=(num(b.lat)-num(a.lat))*Math.PI/180; const dLng=(num(b.lng)-num(a.lng))*Math.PI/180; const x=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2; return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); };
  window.TravelUtils={placeTypes,expenseCategories,uid,esc,num,dateLabel,shortDate,money,parsePeople,daysBetween,dt,haversine};
})();
