(function () {
  'use strict';

  const { sortSteps, isValidCoord, haversineKm, tripDuration, unique, estimateSegment, formatDistance, formatMoney, escapeHtml, formatDate } = window.TravelUtils;

  function analyzeTrip(trip, settings) {
    const suggestions = [];
    if (!trip) return { suggestions, scores: {}, globalScore: 0, groups: {} };

    const steps = sortSteps(trip.steps || []);
    const budget = window.TravelBudget.computeBudget(trip);
    const segments = window.TravelItinerary.buildSegments(trip, settings);
    const days = tripDuration(trip);
    const datedSteps = steps.filter(step => step.arrivalDate);
    const missingCoords = steps.filter(step => !isValidCoord(step));
    const style = String(trip.style || '').toLowerCase();
    const pace = String(trip.pace || '').toLowerCase();

    if (!trip.name || trip.name === 'Nouveau voyage') add(suggestions, 'warning', 'Identité', 'Donne un nom précis au voyage pour mieux t’y retrouver.', 'prep-task');
    if (!trip.startDate || !trip.endDate) add(suggestions, 'warning', 'Dates', 'Ajoute les dates de départ et de retour pour calculer une feuille de route fiable.', 'time-check');
    if (!steps.length) add(suggestions, 'danger', 'Itinéraire', 'Aucune étape n’est renseignée. Commence par le point de départ et la destination finale.', 'prep-task');
    if (steps.length === 1) add(suggestions, 'warning', 'Itinéraire', 'Ajoute au moins une deuxième étape pour générer la carte et les trajets.', 'prep-task');

    if (missingCoords.length) add(suggestions, 'warning', 'Carte', `${missingCoords.length} étape(s) n’ont pas de coordonnées GPS. Elles seront incomplètes sur la carte.`, 'prep-task');

    steps.forEach(step => {
      const hasArrival = Boolean(step.arrivalDate);
      const hasDeparture = Boolean(step.departureDate);
      if (step.priority === 'indispensable' && !hasArrival) add(suggestions, 'warning', 'Planning', `L’étape indispensable “${step.name}” n’a pas encore de date d’arrivée.`, 'time-check');
      if (hasArrival && hasDeparture && step.departureDate < step.arrivalDate) add(suggestions, 'danger', 'Horaires', `“${step.name}” a un départ avant son arrivée.`, 'time-check');
      if (hasArrival && hasDeparture && step.departureDate === step.arrivalDate && step.arrivalTime && step.departureTime && step.departureTime < step.arrivalTime) add(suggestions, 'danger', 'Horaires', `“${step.name}” part avant son heure d’arrivée.`, 'time-check');
      if (hasArrival && !step.arrivalTime) add(suggestions, 'warning', 'Horaires', `Ajoute une heure d’arrivée pour “${step.name}”.`, 'time-check');
      if (hasDeparture && !step.departureTime && ['aéroport', 'gare', 'activité', 'restaurant'].some(type => String(step.type || '').toLowerCase().includes(type))) add(suggestions, 'warning', 'Horaires', `Ajoute une heure de départ ou de fin pour “${step.name}”.`, 'time-check');
      if (!step.links?.length && ['hôtel', 'hotel', 'aéroport', 'gare'].some(type => String(step.type || '').toLowerCase().includes(type))) add(suggestions, 'warning', 'Réservations', `Ajoute un lien, une référence ou une note utile pour “${step.name}”.`, 'prep-task');
    });

    segments.forEach(segment => {
      if (!segment.hasCoordinates) return;
      if (segment.duration > 6 && segment.mode !== 'plane') add(suggestions, 'warning', 'Trajets', `Le trajet ${segment.from.name} → ${segment.to.name} dépasse 6 heures estimées. Ajoute une pause ou une étape intermédiaire.`, 'time-check');
      if (!segment.from.transportToNext) add(suggestions, 'warning', 'Transports', `Le transport entre ${segment.from.name} et ${segment.to.name} n’est pas renseigné.`, 'prep-task');
      const fromDeparture = dateTime(segment.from.departureDate || segment.from.arrivalDate, segment.from.departureTime);
      const toArrival = dateTime(segment.to.arrivalDate, segment.to.arrivalTime);
      if (fromDeparture && toArrival) {
        const availableHours = (toArrival - fromDeparture) / 36e5;
        if (availableHours < 0) add(suggestions, 'danger', 'Horaires', `${segment.to.name} est prévu avant le départ de ${segment.from.name}.`, 'time-check');
        else if (segment.duration && availableHours < segment.duration) add(suggestions, 'danger', 'Horaires', `Le créneau ${segment.from.name} → ${segment.to.name} est trop court : ${availableHours.toFixed(1)} h disponibles pour ${segment.duration.toFixed(1)} h estimées.`, 'time-check');
        else if (availableHours - segment.duration < 0.5 && segment.mode !== 'walk') add(suggestions, 'warning', 'Horaires', `Marge très courte entre ${segment.from.name} et ${segment.to.name}. Prévois un peu de sécurité.`, 'time-check');
      }
      if (segment.mode === 'plane' && !segment.from.segmentReference && !segment.from.segmentNote) add(suggestions, 'warning', 'Vols', `Ajoute le numéro de vol ou une note pour ${segment.from.name} → ${segment.to.name}.`, 'airport-task');
    });

    for (let i = 0; i < steps.length; i += 1) {
      for (let j = i + 1; j < steps.length; j += 1) {
        if (isValidCoord(steps[i]) && isValidCoord(steps[j])) {
          const distance = haversineKm(steps[i], steps[j]);
          if (distance > 0 && distance < 2 && steps[i].arrivalDate === steps[j].arrivalDate) {
            add(suggestions, 'success', 'Optimisation', `${steps[i].name} et ${steps[j].name} sont très proches. Tu peux les regrouper dans la même zone de visite.`);
          }
        }
      }
    }

    if (budget.max && budget.total > budget.max) add(suggestions, 'danger', 'Budget', `Le budget maximum est dépassé de ${formatMoney(budget.total - budget.max, trip.currency)}.`, 'budget-basics');
    if (budget.max && budget.actualTotal > budget.max) add(suggestions, 'danger', 'Budget réel', `Les dépenses réelles dépassent déjà le budget maximum de ${formatMoney(budget.actualTotal - budget.max, trip.currency)}.`, 'budget-basics');
    if (budget.actualTotal > budget.plannedTotal && budget.plannedTotal > 0) add(suggestions, 'warning', 'Budget réel', `Le réel dépasse le prévu de ${formatMoney(budget.actualTotal - budget.plannedTotal, trip.currency)}.`, 'budget-basics');
    if (budget.max && budget.byCategory.logement > budget.max * 0.5) add(suggestions, 'warning', 'Budget logement', 'Le logement représente plus de 50 % du budget maximum. Vérifie que cela correspond bien au style du voyage.', 'budget-basics');
    if (!trip.expenses?.length && !steps.some(step => Number(step.cost) > 0)) add(suggestions, 'warning', 'Budget', 'Le budget est vide. Ajoute au moins les gros postes : transport, logement, nourriture et activités.', 'budget-basics');
    const unbalanced = budget.names.filter(name => Math.abs(budget.balances?.[name]?.balance || 0) > 1);
    if (unbalanced.length > 1) add(suggestions, 'warning', 'Répartition voyageurs', 'Certaines personnes doivent équilibrer les paiements. Consulte le module type TriCount dans Budget.', 'budget-basics');

    if (days > 1 && datedSteps.length) {
      const usedDates = unique(datedSteps.map(step => step.arrivalDate));
      if (usedDates.length < Math.min(days, steps.length)) add(suggestions, 'warning', 'Journées', 'Certaines journées semblent vides ou non planifiées. Répartis les étapes par date.', 'time-check');
    }

    if (pace === 'tranquille' && steps.length / Math.max(1, days) > 3) add(suggestions, 'warning', 'Rythme', 'Le rythme demandé est tranquille, mais le nombre d’étapes par jour paraît élevé.', 'time-check');
    if (pace === 'intense' && steps.length / Math.max(1, days) < 1.2 && steps.length > 1) add(suggestions, 'success', 'Rythme', 'Le voyage semble assez léger pour un rythme intense. Tu peux ajouter quelques lieux bonus si tu veux.');

    const categories = new Set((trip.expenses || []).map(expense => expense.category));
    ['transport', 'logement', 'nourriture'].forEach(category => {
      if (!categories.has(category)) add(suggestions, 'warning', 'Budget', `Le poste “${category}” n’a pas encore de dépense prévue.`, 'budget-basics');
    });

    const stepTypes = new Set(steps.map(step => String(step.type || '').toLowerCase()));
    const hasAirport = [...stepTypes].some(type => type.includes('aéroport'));
    const hasHotel = [...stepTypes].some(type => type.includes('hôtel') || type.includes('hotel'));
    const hasRestaurant = [...stepTypes].some(type => type.includes('restaurant'));
    if (hasAirport && !segments.some(segment => segment.from.segmentReference || segment.from.segmentNote)) add(suggestions, 'warning', 'Aéroport', 'Tu as un aéroport dans le voyage : ajoute numéro de vol, marge horaire ou note de transfert.', 'airport-task');
    if (days > 1 && !hasHotel) add(suggestions, 'warning', 'Logement', 'Aucun hôtel n’est identifié alors que le voyage dure plusieurs jours.', 'hotel-task');
    if (days > 2 && !hasRestaurant && !style.includes('économique')) add(suggestions, 'warning', 'Repas', 'Aucun restaurant n’est prévu. Ajoute quelques repas importants pour mieux anticiper le budget.', 'budget-basics');

    if (style.includes('économique') && budget.max && budget.byCategory.nourriture > budget.max * 0.25) add(suggestions, 'warning', 'Style économique', 'Le budget nourriture paraît élevé. Prévois courses, marchés ou repas simples si besoin.', 'budget-basics');
    if (style.includes('confort') && segments.some(segment => !segment.from.segmentDepartureTime && !segment.from.segmentNote)) add(suggestions, 'warning', 'Style confort', 'Renseigne les horaires ou notes de transfert pour éviter les imprévus.', 'comfort-transfer');
    if (style.includes('aventure') && !Object.keys(trip.checklists || {}).some(name => /randonn|sant|nature|météo/i.test(name))) add(suggestions, 'warning', 'Style aventure', 'Ajoute une checklist randonnée, santé ou météo.', 'prep-task');
    if (style.includes('équilibré') && steps.length / Math.max(1, days) > 4) add(suggestions, 'warning', 'Style équilibré', 'Certaines journées risquent d’être trop denses.', 'time-check');

    const preparationItems = Object.values(trip.checklists || {}).flat();
    const done = preparationItems.filter(item => item.done).length;
    if (preparationItems.length && done / preparationItems.length < 0.25) add(suggestions, 'warning', 'Préparation', 'La préparation est encore peu avancée. Coche les documents, réservations et éléments importants avant le départ.', 'prep-task');

    if (!suggestions.length) add(suggestions, 'success', 'Voyage cohérent', 'Le voyage semble cohérent : étapes, budget et préparation sont bien renseignés.');

    const scores = {
      itinéraire: clamp(100 - missingCoords.length * 12 - Math.max(0, steps.length < 2 ? 30 : 0), 0, 100),
      budget: clamp(budget.max ? 100 - Math.max(0, budget.percent - 100) * 1.8 - (budget.total === 0 ? 35 : 0) : 65 - (budget.total === 0 ? 25 : 0), 0, 100),
      trajets: clamp(100 - segments.filter(s => s.duration > 6 && s.mode !== 'plane').length * 18 - segments.filter(s => !s.hasCoordinates).length * 12, 0, 100),
      horaires: clamp(100 - suggestions.filter(item => item.title === 'Horaires' && item.level === 'danger').length * 25 - suggestions.filter(item => item.title === 'Horaires').length * 8, 0, 100),
      préparation: clamp(preparationItems.length ? 45 + (done / preparationItems.length) * 55 : 45, 0, 100)
    };
    const globalScore = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.values(scores).length);
    const groups = groupSuggestions(suggestions);
    return { suggestions, scores, globalScore, groups };
  }

  function add(list, level, title, message, action = '') {
    if (!list.some(item => item.message === message)) list.push({ level, title, message, action });
  }

  function dateTime(date, time) {
    if (!date) return null;
    const parsed = new Date(`${date}T${time || '00:00'}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function groupSuggestions(list) {
    return {
      critiques: list.filter(item => item.level === 'danger'),
      verifier: list.filter(item => item.level === 'warning'),
      bons: list.filter(item => item.level === 'success')
    };
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, Math.round(value))); }

  function optimizeOrder(trip, settings) {
    const steps = sortSteps(trip?.steps || []);
    if (steps.length < 3) return steps;

    const fixedStart = steps[0];
    const fixedEnd = steps[steps.length - 1];
    const middle = steps.slice(1, -1);
    const result = [fixedStart];
    let current = fixedStart;
    const remaining = [...middle];

    while (remaining.length) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      remaining.forEach((candidate, index) => {
        const penalty = candidate.priority === 'indispensable' ? 0 : candidate.priority === 'optionnel' ? 5 : 12;
        const distance = isValidCoord(current) && isValidCoord(candidate) ? haversineKm(current, candidate) + penalty : Infinity;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      const [next] = remaining.splice(bestIndex, 1);
      result.push(next);
      current = next;
    }
    result.push(fixedEnd);

    return result.map((step, index) => ({ ...step, order: index }));
  }

  function compareRouteDistance(steps, settings) {
    return sortSteps(steps).slice(0, -1).reduce((sum, step, index) => {
      const next = sortSteps(steps)[index + 1];
      return sum + estimateSegment(step, next, step.transportToNext || 'car', settings).distance;
    }, 0);
  }

  function evaluate(trip, settings) {
    const analysis = analyzeTrip(trip, settings);
    return { score: analysis.globalScore, items: analysis.suggestions, scores: analysis.scores };
  }

  function render(containerScore, containerSuggestions, trip, settings, options = {}) {
    const analysis = analyzeTrip(trip, settings);
    const scoreRows = Object.entries(analysis.scores).map(([name, value]) => `
      <div class="breakdown-row">
        <div class="breakdown-row__top"><strong>${name}</strong><span>${value}/100</span></div>
        <div class="bar"><span style="width:${value}%"></span></div>
      </div>
    `).join('');
    containerScore.innerHTML = `
      <div class="score-circle" style="--score:${analysis.globalScore}"><strong>${analysis.globalScore}</strong><small>prêt</small></div>
      <div class="score-grid">${scoreRows}</div>
    `;
    const sections = [
      ['Critique', analysis.groups.critiques, 'danger'],
      ['À vérifier', analysis.groups.verifier, 'warning'],
      ['Bon points', analysis.groups.bons, 'success']
    ];
    containerSuggestions.innerHTML = sections.map(([label, items, level]) => `
      <section class="suggestion-group suggestion-group--${level}">
        <div class="suggestion-group__head"><strong>${label}</strong><span>${items.length}</span></div>
        ${items.length ? items.map(item => renderSuggestion(item)).join('') : `<div class="suggestion-empty">Rien à signaler.</div>`}
      </section>
    `).join('');
    containerSuggestions.querySelectorAll('[data-suggestion-action]').forEach(button => {
      button.addEventListener('click', () => options.onFix?.(button.dataset.suggestionAction));
    });
  }

  function renderSuggestion(item) {
    const badge = item.level === 'danger' ? 'badge--danger' : item.level === 'success' ? 'badge--success' : 'badge--warning';
    return `
      <article class="suggestion-row suggestion-row--smart" data-level="${item.level}">
        <span class="badge ${badge}">${escapeHtml(item.title || item.level)}</span>
        <p>${escapeHtml(item.message)}</p>
        <div class="suggestion-actions">
          <small>${item.level === 'success' ? 'Aucune action nécessaire.' : 'Assistant local sans API payante.'}</small>
          ${item.action ? `<button type="button" class="button button--small" data-suggestion-action="${escapeHtml(item.action)}">Corriger automatiquement</button>` : ''}
        </div>
      </article>`;
  }

  window.TravelSuggestions = { analyzeTrip, evaluate, optimizeOrder, compareRouteDistance, render };
})();
