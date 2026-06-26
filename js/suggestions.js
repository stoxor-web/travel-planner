(function () {
  'use strict';

  const {
    sortSteps,
    isValidCoord,
    haversineKm,
    tripDuration,
    unique,
    estimateSegment,
    formatDistance,
    formatMoney,
    formatDuration,
    escapeHtml
  } = window.TravelUtils;

  function analyzeTrip(trip, settings) {
    const suggestions = [];
    if (!trip) return { suggestions, scores: {}, globalScore: 0, counts: { danger: 0, warning: 0, success: 0 } };

    const steps = sortSteps(trip.steps || []);
    const budget = window.TravelBudget.computeBudget(trip);
    const segments = window.TravelItinerary.buildSegments(trip, settings);
    const days = tripDuration(trip);
    const datedSteps = steps.filter(step => step.arrivalDate);
    const timingIssues = detectTimingIssues(steps, segments);

    if (!trip.name || trip.name === 'Nouveau voyage') add(suggestions, 'warning', 'Identité', 'Donne un nom précis au voyage pour le retrouver rapidement.', 'Renommer le voyage');
    if (!trip.startDate || !trip.endDate) add(suggestions, 'warning', 'Dates', 'Ajoute les dates de départ et de retour pour fiabiliser le planning et le budget par jour.', 'Compléter les dates');
    if (!steps.length) add(suggestions, 'danger', 'Itinéraire', 'Aucune étape n’est encore renseignée. Commence par le point de départ et la destination finale.', 'Ajouter une étape');
    if (steps.length === 1) add(suggestions, 'warning', 'Itinéraire', 'Ajoute au moins une deuxième étape pour générer les trajets point par point.', 'Ajouter une étape');

    const missingCoords = steps.filter(step => !isValidCoord(step));
    if (missingCoords.length) add(suggestions, 'warning', 'Carte', `${missingCoords.length} étape(s) n’ont pas encore de coordonnées GPS. Elles ne seront pas visibles correctement sur la carte.`, 'Rechercher les lieux');

    timingIssues.forEach(issue => add(suggestions, issue.level, 'Horaires', issue.message, issue.action));

    segments.forEach(segment => {
      if (!segment.hasCoordinates) return;
      if (segment.duration > 6 && segment.mode !== 'plane') add(suggestions, 'warning', 'Trajet long', `Le trajet ${segment.from.name} → ${segment.to.name} dure environ ${formatDuration(segment.duration)}. Prévois une pause ou une étape intermédiaire.`, 'Ajouter une pause');
      if (!segment.from.transportToNext) add(suggestions, 'warning', 'Transport', `Le transport entre ${segment.from.name} et ${segment.to.name} n’est pas renseigné.`, 'Choisir un transport');
    });

    for (let i = 0; i < steps.length; i += 1) {
      for (let j = i + 1; j < steps.length; j += 1) {
        if (isValidCoord(steps[i]) && isValidCoord(steps[j])) {
          const distance = haversineKm(steps[i], steps[j]);
          if (distance > 0 && distance < 2 && steps[i].arrivalDate === steps[j].arrivalDate) {
            add(suggestions, 'success', 'Optimisation', `${steps[i].name} et ${steps[j].name} sont très proches. Tu peux les regrouper dans la même zone de visite.`, 'Regrouper');
          }
        }
      }
    }

    if (budget.max && budget.total > budget.max) add(suggestions, 'danger', 'Budget', `Le budget maximum est dépassé de ${formatMoney(budget.total - budget.max, trip.currency)}.`, 'Réduire ou ajuster');
    if (budget.max && budget.byCategory.logement > budget.max * 0.5) add(suggestions, 'warning', 'Budget', 'Le logement représente plus de 50 % du budget maximum.', 'Vérifier logement');
    if (!trip.expenses?.length && !steps.some(step => Number(step.cost) > 0)) add(suggestions, 'warning', 'Budget', 'Le budget est vide. Ajoute les gros postes : transport, logement, nourriture et activités.', 'Ajouter une dépense');

    if (days > 1 && datedSteps.length) {
      const usedDates = unique(datedSteps.map(step => step.arrivalDate));
      if (usedDates.length < Math.min(days, steps.length)) add(suggestions, 'warning', 'Journées', 'Certaines journées semblent vides ou non planifiées.', 'Répartir les étapes');
    }

    if (trip.pace === 'tranquille' && steps.length / Math.max(1, days) > 3) add(suggestions, 'warning', 'Rythme', 'Le rythme demandé est tranquille, mais le nombre d’étapes par jour paraît élevé.', 'Alléger');
    if (trip.pace === 'intense' && steps.length / Math.max(1, days) < 1.2 && steps.length > 1) add(suggestions, 'success', 'Rythme', 'Le voyage semble assez léger pour un rythme intense. Tu peux ajouter quelques lieux bonus.', 'Ajouter bonus');

    const categories = new Set((trip.expenses || []).map(expense => expense.category));
    ['transport', 'logement', 'nourriture'].forEach(category => {
      if (!categories.has(category)) add(suggestions, 'warning', 'Budget', `Le poste “${category}” n’a pas encore de dépense prévue.`, 'Ajouter dépense');
    });

    const stepTypes = new Set(steps.map(step => String(step.type || '').toLowerCase()));
    const hasAirport = [...stepTypes].some(type => type.includes('aéroport'));
    const hasHotel = [...stepTypes].some(type => type.includes('hôtel') || type.includes('hotel'));
    const hasRestaurant = [...stepTypes].some(type => type.includes('restaurant'));
    if (hasAirport && !segments.some(segment => segment.from.segmentReference || segment.from.segmentNote)) add(suggestions, 'warning', 'Aéroport', 'Tu as un aéroport dans le voyage : ajoute un numéro de vol, une marge horaire ou une note de transfert.', 'Ajouter référence');
    if (days > 1 && !hasHotel) add(suggestions, 'warning', 'Logement', 'Aucun hôtel n’est identifié alors que le voyage dure plusieurs jours.', 'Ajouter hôtel');
    if (days > 2 && !hasRestaurant && trip.style !== 'économique') add(suggestions, 'warning', 'Repas', 'Aucun restaurant n’est prévu. Ajoute au moins quelques repas importants.', 'Ajouter restaurant');
    steps.forEach(step => {
      if (step.priority === 'indispensable' && !step.arrivalDate) add(suggestions, 'warning', 'Planning', `L’étape indispensable “${step.name}” n’a pas encore de date.`, 'Ajouter date');
      if (!step.links?.length && ['hôtel', 'aéroport', 'gare'].some(type => String(step.type || '').toLowerCase().includes(type))) add(suggestions, 'warning', 'Réservation', `Ajoute un lien ou une référence pour “${step.name}”.`, 'Ajouter lien');
      if ((step.arrivalDate || step.departureDate) && !step.arrivalTime && !step.departureTime) add(suggestions, 'warning', 'Horaires', `“${step.name}” a une date mais aucun horaire.`, 'Ajouter heure');
    });

    const style = String(trip.style || '').toLowerCase();
    if (style.includes('économique') && budget.max && budget.byCategory.nourriture > budget.max * 0.25) add(suggestions, 'warning', 'Style économique', 'Le budget nourriture paraît élevé. Prévois courses ou repas simples si besoin.', 'Réduire repas');
    if (style.includes('confort') && segments.some(segment => !segment.from.segmentDepartureTime && !segment.from.segmentNote)) add(suggestions, 'warning', 'Style confort', 'Renseigne les horaires ou notes de transfert pour éviter les imprévus.', 'Ajouter marge');
    if (style.includes('aventure') && !Object.keys(trip.checklists || {}).some(name => /randonn|sant|nature|météo/i.test(name))) add(suggestions, 'warning', 'Style aventure', 'Ajoute une checklist randonnée, santé ou météo.', 'Ajouter checklist');
    if (style.includes('équilibré') && steps.length / Math.max(1, days) > 4) add(suggestions, 'warning', 'Style équilibré', 'Certaines journées risquent d’être trop denses.', 'Rééquilibrer');

    const preparationItems = Object.values(trip.checklists || {}).flat();
    const done = preparationItems.filter(item => item.done).length;
    if (preparationItems.length && done / preparationItems.length < 0.25) add(suggestions, 'warning', 'Préparation', 'La préparation est encore peu avancée. Coche les documents et réservations importants avant le départ.', 'Voir checklists');

    if (!suggestions.length) add(suggestions, 'success', 'Cohérence', 'Le voyage semble cohérent : étapes, budget, horaires et préparation sont bien renseignés.', 'Continuer');

    const criticalCount = suggestions.filter(item => item.level === 'danger').length;
    const warningCount = suggestions.filter(item => item.level === 'warning').length;
    const scores = {
      itinéraire: clamp(100 - missingCoords.length * 12 - Math.max(0, steps.length < 2 ? 30 : 0), 0, 100),
      budget: clamp(budget.max ? 100 - Math.max(0, budget.percent - 100) * 1.8 - (budget.total === 0 ? 35 : 0) : 65 - (budget.total === 0 ? 25 : 0), 0, 100),
      trajets: clamp(100 - segments.filter(s => s.duration > 6 && s.mode !== 'plane').length * 18 - segments.filter(s => !s.hasCoordinates).length * 12, 0, 100),
      horaires: clamp(100 - timingIssues.filter(i => i.level === 'danger').length * 28 - timingIssues.filter(i => i.level === 'warning').length * 12, 0, 100),
      journées: clamp(100 - (days && steps.length / days > 4 ? 20 : 0) - (datedSteps.length < Math.min(steps.length, days) ? 12 : 0), 0, 100),
      préparation: clamp(preparationItems.length ? 45 + (done / preparationItems.length) * 55 : 45, 0, 100)
    };
    const globalScore = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.values(scores).length);
    return { suggestions, scores, globalScore, counts: { danger: criticalCount, warning: warningCount, success: suggestions.filter(item => item.level === 'success').length } };
  }

  function parseDateTime(date, time) {
    if (!date) return null;
    const value = new Date(`${date}T${time || '12:00'}:00`);
    return Number.isNaN(value.getTime()) ? null : value;
  }

  function detectTimingIssues(steps, segments) {
    const issues = [];
    steps.forEach(step => {
      const arrival = parseDateTime(step.arrivalDate, step.arrivalTime);
      const departure = parseDateTime(step.departureDate, step.departureTime);
      if (arrival && departure && departure < arrival) {
        issues.push({ level: 'danger', message: `“${step.name}” a un départ avant son arrivée. Corrige les dates ou heures.`, action: 'Corriger horaire' });
      }
    });
    segments.forEach(segment => {
      const departure = parseDateTime(segment.from.departureDate || segment.from.arrivalDate, segment.from.departureTime || segment.from.segmentDepartureTime);
      const arrival = parseDateTime(segment.to.arrivalDate || segment.to.departureDate, segment.to.arrivalTime || segment.from.segmentArrivalTime);
      if (!departure || !arrival) return;
      const availableHours = (arrival - departure) / 3600000;
      if (availableHours < 0) {
        issues.push({ level: 'danger', message: `${segment.from.name} → ${segment.to.name} : l’arrivée est avant le départ.`, action: 'Corriger segment' });
      } else if (segment.hasCoordinates && segment.duration && availableHours + 0.15 < segment.duration) {
        issues.push({ level: 'danger', message: `${segment.from.name} → ${segment.to.name} : ${formatDuration(availableHours)} disponible, mais le trajet estimé dure ${formatDuration(segment.duration)}.`, action: 'Ajouter marge' });
      } else if (segment.hasCoordinates && segment.duration && availableHours < segment.duration + 0.75 && segment.mode !== 'walk') {
        issues.push({ level: 'warning', message: `${segment.from.name} → ${segment.to.name} : marge courte entre départ et arrivée.`, action: 'Prévoir marge' });
      }
    });
    return issues;
  }

  function add(list, level, category, message, action = 'Voir') {
    if (!list.some(item => item.message === message)) list.push({ level, category, message, action });
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

  function render(containerScore, containerSuggestions, trip, settings) {
    const analysis = analyzeTrip(trip, settings);
    const scoreRows = Object.entries(analysis.scores).map(([name, value]) => `
      <div class="breakdown-row">
        <div class="breakdown-row__top"><strong>${escapeHtml(name)}</strong><span>${value}/100</span></div>
        <div class="bar"><span style="width:${value}%"></span></div>
      </div>
    `).join('');
    const groups = [
      ['danger', 'Critique'],
      ['warning', 'À vérifier'],
      ['success', 'Bon point']
    ];
    containerScore.innerHTML = `
      <div class="score-circle" style="--score:${analysis.globalScore}"><strong>${analysis.globalScore}</strong></div>
      <div class="score-grid">${scoreRows}</div>
    `;
    containerSuggestions.innerHTML = groups.map(([level, label]) => {
      const items = analysis.suggestions.filter(item => item.level === level);
      if (!items.length) return '';
      return `
        <section class="suggestion-group suggestion-group--${level}">
          <h3>${label} <span>${items.length}</span></h3>
          ${items.map(item => `
            <article class="suggestion-row suggestion-row--smart" data-level="${item.level}">
              <span class="badge ${item.level === 'danger' ? 'badge--danger' : item.level === 'success' ? 'badge--success' : 'badge--warning'}">${escapeHtml(item.category || label)}</span>
              <p>${escapeHtml(item.message)}</p>
              <small>${escapeHtml(item.action || 'À vérifier')}</small>
            </article>
          `).join('')}
        </section>
      `;
    }).join('') || '<div class="empty-state">Aucune suggestion pour le moment.</div>';
  }

  window.TravelSuggestions = { analyzeTrip, optimizeOrder, compareRouteDistance, render, detectTimingIssues };
})();
