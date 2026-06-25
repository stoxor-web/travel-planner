(function () {
  'use strict';

  const { sortSteps, isValidCoord, haversineKm, tripDuration, unique, estimateSegment, formatDistance, formatMoney } = window.TravelUtils;

  function analyzeTrip(trip, settings) {
    const suggestions = [];
    if (!trip) return { suggestions, scores: {}, globalScore: 0 };

    const steps = sortSteps(trip.steps || []);
    const budget = window.TravelBudget.computeBudget(trip);
    const segments = window.TravelItinerary.buildSegments(trip, settings);
    const days = tripDuration(trip);
    const datedSteps = steps.filter(step => step.arrivalDate);

    if (!trip.name || trip.name === 'Nouveau voyage') add(suggestions, 'warning', 'Donne un nom précis au voyage pour mieux t’y retrouver dans le tableau de bord.');
    if (!trip.startDate || !trip.endDate) add(suggestions, 'warning', 'Ajoute les dates de départ et de retour pour calculer un budget par jour plus réaliste.');
    if (!steps.length) add(suggestions, 'danger', 'Aucune étape n’est encore renseignée. Commence par le point de départ et la destination finale.');
    if (steps.length === 1) add(suggestions, 'warning', 'Ajoute au moins une deuxième étape pour générer la feuille de route.');

    const missingCoords = steps.filter(step => !isValidCoord(step));
    if (missingCoords.length) add(suggestions, 'warning', `${missingCoords.length} étape(s) n’ont pas encore de coordonnées GPS. Elles ne seront pas correctement visibles sur la carte.`);

    segments.forEach(segment => {
      if (!segment.hasCoordinates) return;
      if (segment.duration > 6 && segment.mode !== 'plane') add(suggestions, 'warning', `Le trajet ${segment.from.name} → ${segment.to.name} dépasse 6 heures estimées. Ajoute une pause ou une étape intermédiaire.`);
      if (!segment.from.transportToNext) add(suggestions, 'warning', `Le transport entre ${segment.from.name} et ${segment.to.name} n’est pas renseigné.`);
    });

    for (let i = 0; i < steps.length; i += 1) {
      for (let j = i + 1; j < steps.length; j += 1) {
        if (isValidCoord(steps[i]) && isValidCoord(steps[j])) {
          const distance = haversineKm(steps[i], steps[j]);
          if (distance > 0 && distance < 2 && steps[i].arrivalDate === steps[j].arrivalDate) {
            add(suggestions, 'success', `${steps[i].name} et ${steps[j].name} sont très proches. Tu peux les regrouper dans la même zone de visite.`);
          }
        }
      }
    }

    if (budget.max && budget.total > budget.max) add(suggestions, 'danger', `Le budget maximum est dépassé de ${formatMoney(budget.total - budget.max, trip.currency)}.`);
    if (budget.max && budget.byCategory.logement > budget.max * 0.5) add(suggestions, 'warning', 'Le logement représente plus de 50 % du budget maximum. Vérifie que cela correspond bien à ton style de voyage.');
    if (!trip.expenses?.length && !steps.some(step => Number(step.cost) > 0)) add(suggestions, 'warning', 'Le budget est vide. Ajoute au moins les gros postes : transport, logement, nourriture et activités.');

    if (days > 1 && datedSteps.length) {
      const usedDates = unique(datedSteps.map(step => step.arrivalDate));
      if (usedDates.length < Math.min(days, steps.length)) add(suggestions, 'warning', 'Certaines journées semblent vides ou non planifiées. Répartis les étapes par date pour obtenir une feuille de route plus lisible.');
    }

    if (trip.pace === 'tranquille' && steps.length / Math.max(1, days) > 3) add(suggestions, 'warning', 'Le rythme demandé est tranquille, mais le nombre d’étapes par jour paraît élevé.');
    if (trip.pace === 'intense' && steps.length / Math.max(1, days) < 1.2 && steps.length > 1) add(suggestions, 'success', 'Le voyage semble assez léger pour un rythme intense. Tu peux ajouter quelques lieux bonus si tu veux.');

    const categories = new Set((trip.expenses || []).map(expense => expense.category));
    ['transport', 'logement', 'nourriture'].forEach(category => {
      if (!categories.has(category)) add(suggestions, 'warning', `Le poste “${category}” n’a pas encore de dépense prévue.`);
    });

    const preparationItems = Object.values(trip.checklists || {}).flat();
    const done = preparationItems.filter(item => item.done).length;
    if (preparationItems.length && done / preparationItems.length < 0.25) add(suggestions, 'warning', 'La préparation est encore peu avancée. Coche les documents, réservations et éléments importants avant le départ.');

    if (!suggestions.length) add(suggestions, 'success', 'Le voyage semble cohérent : étapes, budget et préparation sont bien renseignés.');

    const scores = {
      itinéraire: clamp(100 - missingCoords.length * 12 - Math.max(0, steps.length < 2 ? 30 : 0), 0, 100),
      budget: clamp(budget.max ? 100 - Math.max(0, budget.percent - 100) * 1.8 - (budget.total === 0 ? 35 : 0) : 65 - (budget.total === 0 ? 25 : 0), 0, 100),
      trajets: clamp(100 - segments.filter(s => s.duration > 6 && s.mode !== 'plane').length * 18 - segments.filter(s => !s.hasCoordinates).length * 12, 0, 100),
      journées: clamp(100 - (days && steps.length / days > 4 ? 20 : 0) - (datedSteps.length < Math.min(steps.length, days) ? 12 : 0), 0, 100),
      préparation: clamp(preparationItems.length ? 45 + (done / preparationItems.length) * 55 : 45, 0, 100)
    };
    const globalScore = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.values(scores).length);
    return { suggestions, scores, globalScore };
  }

  function add(list, level, message) {
    if (!list.some(item => item.message === message)) list.push({ level, message });
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
    return sortSteps(steps).slice(0, -1).reduce((sum, step, index, arr) => {
      const next = sortSteps(steps)[index + 1];
      return sum + estimateSegment(step, next, step.transportToNext || 'car', settings).distance;
    }, 0);
  }

  function render(containerScore, containerSuggestions, trip, settings) {
    const analysis = analyzeTrip(trip, settings);
    const scoreRows = Object.entries(analysis.scores).map(([name, value]) => `
      <div class="breakdown-row">
        <div class="breakdown-row__top"><strong>${name}</strong><span>${value}/100</span></div>
        <div class="bar"><span style="width:${value}%"></span></div>
      </div>
    `).join('');
    containerScore.innerHTML = `
      <div class="score-circle" style="--score:${analysis.globalScore}"><strong>${analysis.globalScore}</strong></div>
      <div class="score-grid">${scoreRows}</div>
    `;
    containerSuggestions.innerHTML = analysis.suggestions.map(item => `
      <article class="suggestion-row" data-level="${item.level}">
        <span class="badge ${item.level === 'danger' ? 'badge--danger' : item.level === 'success' ? 'badge--success' : 'badge--warning'}">${item.level === 'danger' ? 'À corriger' : item.level === 'success' ? 'Bon point' : 'À surveiller'}</span>
        <p>${window.TravelUtils.escapeHtml(item.message)}</p>
      </article>
    `).join('');
  }

  window.TravelSuggestions = { analyzeTrip, optimizeOrder, compareRouteDistance, render };
})();
