(function () {
  'use strict';

  const {
    sortSteps,
    isValidCoord,
    haversineKm,
    tripDuration,
    unique,
    estimateSegment,
    formatMoney,
    formatDuration,
    formatDate,
    escapeHtml,
    uid
  } = window.TravelUtils;

  const FIXES = {
    ADD_CORE_EXPENSES: 'ADD_CORE_EXPENSES',
    ADD_STYLE_CHECKLIST: 'ADD_STYLE_CHECKLIST',
    ADD_MISSING_COORDS_TASKS: 'ADD_MISSING_COORDS_TASKS',
    ADD_TIMING_TASKS: 'ADD_TIMING_TASKS',
    ADD_BUDGET_TASKS: 'ADD_BUDGET_TASKS',
    ADD_HOTEL_TASK: 'ADD_HOTEL_TASK',
    ADD_AIRPORT_TRANSFER_TASK: 'ADD_AIRPORT_TRANSFER_TASK',
    ADD_EMPTY_TRANSPORTS: 'ADD_EMPTY_TRANSPORTS',
    ADD_PREPARATION_TASKS: 'ADD_PREPARATION_TASKS'
  };

  function analyzeTrip(trip, settings) {
    const suggestions = [];
    if (!trip) return emptyAnalysis();

    const steps = sortSteps(trip.steps || []);
    const budget = window.TravelBudget.computeBudget(trip);
    const segments = window.TravelItinerary.buildSegments(trip, settings);
    const days = tripDuration(trip);
    const datedSteps = steps.filter(step => step.arrivalDate);
    const timingIssues = detectTimingIssues(steps, segments);
    const style = String(trip.style || 'équilibré').toLowerCase();
    const currency = trip.currency || '€';

    if (!trip.name || trip.name === 'Nouveau voyage') add(suggestions, {
      level: 'warning', category: 'Identité', title: 'Nom du voyage à préciser',
      message: 'Donne un nom reconnaissable au voyage pour le retrouver rapidement.', action: 'Ouvrir le voyage', view: 'trip'
    });
    if (!trip.startDate || !trip.endDate) add(suggestions, {
      level: 'warning', category: 'Dates', title: 'Dates incomplètes',
      message: 'Ajoute les dates de départ et de retour pour fiabiliser le planning et le budget par jour.', action: 'Compléter', view: 'trip'
    });
    if (!steps.length) add(suggestions, {
      level: 'danger', category: 'Itinéraire', title: 'Aucune étape',
      message: 'Commence par le point de départ et la destination finale.', action: 'Ajouter une étape', view: 'trip'
    });
    if (steps.length === 1) add(suggestions, {
      level: 'warning', category: 'Itinéraire', title: 'Trajets impossibles à générer',
      message: 'Ajoute au moins une deuxième étape pour générer les trajets point par point.', action: 'Ajouter une étape', view: 'trip'
    });

    const missingCoords = steps.filter(step => !isValidCoord(step));
    if (missingCoords.length) add(suggestions, {
      level: 'warning', category: 'Carte', title: 'Coordonnées manquantes',
      message: `${missingCoords.length} étape(s) n’ont pas encore de coordonnées GPS. Elles ne seront pas visibles correctement sur la carte.`,
      action: 'Créer tâches', view: 'trip', fix: FIXES.ADD_MISSING_COORDS_TASKS, webQuery: webQuery(trip, 'OpenStreetMap coordonnées lieux voyage')
    });

    timingIssues.forEach(issue => add(suggestions, {
      level: issue.level, category: 'Horaires', title: issue.title || 'Incohérence horaire',
      message: issue.message, action: issue.action, view: 'itinerary', fix: FIXES.ADD_TIMING_TASKS
    }));

    const missingTransportSegments = [];
    segments.forEach(segment => {
      if (!segment.hasCoordinates) return;
      if (segment.duration > 6 && segment.mode !== 'plane') add(suggestions, {
        level: 'warning', category: 'Trajet long', title: 'Trajet à alléger',
        message: `${segment.from.name} → ${segment.to.name} dure environ ${formatDuration(segment.duration)}. Prévois une pause ou une étape intermédiaire.`,
        action: 'Ajouter tâche', view: 'map', fix: FIXES.ADD_PREPARATION_TASKS, webQuery: webQuery(trip, `pause trajet ${segment.from.name} ${segment.to.name}`)
      });
      if (!segment.from.transportToNext) missingTransportSegments.push(segment);
    });
    if (missingTransportSegments.length) add(suggestions, {
      level: 'warning', category: 'Transport', title: 'Transport manquant',
      message: `${missingTransportSegments.length} trajet(s) n’ont pas de mode de transport renseigné.`,
      action: 'Remplir voiture', view: 'map', fix: FIXES.ADD_EMPTY_TRANSPORTS
    });

    for (let i = 0; i < steps.length; i += 1) {
      for (let j = i + 1; j < steps.length; j += 1) {
        if (isValidCoord(steps[i]) && isValidCoord(steps[j])) {
          const distance = haversineKm(steps[i], steps[j]);
          if (distance > 0 && distance < 2 && steps[i].arrivalDate === steps[j].arrivalDate) {
            add(suggestions, {
              level: 'success', category: 'Optimisation', title: 'Lieux proches',
              message: `${steps[i].name} et ${steps[j].name} sont très proches. Tu peux les regrouper dans la même zone de visite.`,
              action: 'Voir planning', view: 'itinerary'
            });
          }
        }
      }
    }

    if (budget.max && budget.total > budget.max) add(suggestions, {
      level: 'danger', category: 'Budget', title: 'Budget dépassé',
      message: `Le budget maximum est dépassé de ${formatMoney(budget.total - budget.max, currency)}.`,
      action: 'Créer tâches budget', view: 'budget', fix: FIXES.ADD_BUDGET_TASKS
    });
    if (budget.max && budget.percent >= 85 && budget.percent <= 100) add(suggestions, {
      level: 'warning', category: 'Budget', title: 'Budget presque consommé',
      message: `Tu as déjà planifié ${budget.percent}% du budget maximum.`,
      action: 'Voir budget', view: 'budget'
    });
    if (budget.actualTotal > 0 && budget.plannedTotal > 0 && budget.actualTotal > budget.plannedTotal * 1.1) add(suggestions, {
      level: 'danger', category: 'Budget réel', title: 'Réel supérieur au prévu',
      message: `Les dépenses réelles dépassent le prévu de ${formatMoney(budget.actualTotal - budget.plannedTotal, currency)}.`,
      action: 'Analyser', view: 'budget', fix: FIXES.ADD_BUDGET_TASKS
    });
    if (budget.max && budget.byCategory.logement > budget.max * 0.5) add(suggestions, {
      level: 'warning', category: 'Logement', title: 'Logement très dominant',
      message: 'Le logement représente plus de 50 % du budget maximum.',
      action: 'Comparer options', view: 'budget', webQuery: webQuery(trip, 'hébergements économiques logement')
    });
    if (!trip.expenses?.length && !steps.some(step => Number(step.cost) > 0)) add(suggestions, {
      level: 'warning', category: 'Budget', title: 'Budget vide',
      message: 'Ajoute les gros postes : transport, logement, nourriture et activités.',
      action: 'Ajouter postes', view: 'budget', fix: FIXES.ADD_CORE_EXPENSES
    });

    if (days > 1 && datedSteps.length) {
      const usedDates = unique(datedSteps.map(step => step.arrivalDate));
      if (usedDates.length < Math.min(days, steps.length)) add(suggestions, {
        level: 'warning', category: 'Journées', title: 'Journées peu planifiées',
        message: 'Certaines journées semblent vides ou non planifiées.', action: 'Voir planning', view: 'itinerary'
      });
    }

    if (trip.pace === 'tranquille' && steps.length / Math.max(1, days) > 3) add(suggestions, {
      level: 'warning', category: 'Rythme', title: 'Rythme trop dense',
      message: 'Le rythme demandé est tranquille, mais le nombre d’étapes par jour paraît élevé.', action: 'Alléger', view: 'itinerary'
    });
    if (trip.pace === 'intense' && steps.length / Math.max(1, days) < 1.2 && steps.length > 1) add(suggestions, {
      level: 'success', category: 'Rythme', title: 'Marge disponible',
      message: 'Le voyage semble assez léger pour un rythme intense. Tu peux ajouter quelques lieux bonus.', action: 'Chercher idées', webQuery: webQuery(trip, 'activités lieux bonus')
    });

    const categories = new Set((trip.expenses || []).map(expense => expense.category));
    ['transport', 'logement', 'nourriture'].forEach(category => {
      if (!categories.has(category)) add(suggestions, {
        level: 'warning', category: 'Budget', title: `Poste ${category} absent`,
        message: `Le poste “${category}” n’a pas encore de dépense prévue.`, action: 'Ajouter postes', view: 'budget', fix: FIXES.ADD_CORE_EXPENSES
      });
    });

    const stepTypes = new Set(steps.map(step => String(step.type || '').toLowerCase()));
    const hasAirport = [...stepTypes].some(type => type.includes('aéroport'));
    const hasHotel = [...stepTypes].some(type => type.includes('hôtel') || type.includes('hotel'));
    const hasRestaurant = [...stepTypes].some(type => type.includes('restaurant'));
    if (hasAirport && !segments.some(segment => segment.from.segmentReference || segment.from.segmentNote)) add(suggestions, {
      level: 'warning', category: 'Aéroport', title: 'Transfert aéroport à sécuriser',
      message: 'Ajoute un numéro de vol, une marge horaire ou une note de transfert.', action: 'Créer tâche', view: 'map', fix: FIXES.ADD_AIRPORT_TRANSFER_TASK
    });
    if (days > 1 && !hasHotel) add(suggestions, {
      level: 'warning', category: 'Logement', title: 'Hébergement absent',
      message: 'Aucun hôtel n’est identifié alors que le voyage dure plusieurs jours.', action: 'Créer tâche', view: 'trip', fix: FIXES.ADD_HOTEL_TASK, webQuery: webQuery(trip, 'hôtels quartiers où dormir')
    });
    if (days > 2 && !hasRestaurant && !style.includes('économique')) add(suggestions, {
      level: 'warning', category: 'Repas', title: 'Repas importants non planifiés',
      message: 'Aucun restaurant n’est prévu. Ajoute au moins quelques repas importants.', action: 'Chercher restaurants', webQuery: webQuery(trip, 'restaurants incontournables')
    });

    steps.forEach(step => {
      if (step.priority === 'indispensable' && !step.arrivalDate) add(suggestions, {
        level: 'warning', category: 'Planning', title: 'Date manquante',
        message: `L’étape indispensable “${step.name}” n’a pas encore de date.`, action: 'Voir étape', view: 'itinerary'
      });
      if (!step.links?.length && ['hôtel', 'aéroport', 'gare'].some(type => String(step.type || '').toLowerCase().includes(type))) add(suggestions, {
        level: 'warning', category: 'Réservation', title: 'Lien ou référence absent',
        message: `Ajoute un lien ou une référence pour “${step.name}”.`, action: 'Créer tâche', view: 'preparation', fix: FIXES.ADD_PREPARATION_TASKS
      });
      if ((step.arrivalDate || step.departureDate) && !step.arrivalTime && !step.departureTime) add(suggestions, {
        level: 'warning', category: 'Horaires', title: 'Horaire manquant',
        message: `“${step.name}” a une date mais aucun horaire.`, action: 'Créer tâche', view: 'itinerary', fix: FIXES.ADD_TIMING_TASKS
      });
    });

    addStyleSuggestions(suggestions, trip, budget, segments, steps, style, days);

    const preparationItems = Object.values(trip.checklists || {}).flat();
    const done = preparationItems.filter(item => item.done).length;
    if (preparationItems.length && done / preparationItems.length < 0.25) add(suggestions, {
      level: 'warning', category: 'Préparation', title: 'Checklists peu avancées',
      message: 'La préparation est encore peu avancée. Vérifie les documents, réservations et tâches importantes.', action: 'Voir checklists', view: 'preparation'
    });

    if (!suggestions.length) add(suggestions, {
      level: 'success', category: 'Cohérence', title: 'Voyage cohérent',
      message: 'Le voyage semble cohérent : étapes, budget, horaires et préparation sont bien renseignés.', action: 'Continuer', view: 'dashboard'
    });

    const scores = computeScores({ trip, steps, segments, budget, days, missingCoords, datedSteps, timingIssues, preparationItems, done });
    const globalScore = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.values(scores).length);
    const counts = {
      danger: suggestions.filter(item => item.level === 'danger').length,
      warning: suggestions.filter(item => item.level === 'warning').length,
      success: suggestions.filter(item => item.level === 'success').length
    };
    const quickActions = buildQuickActions(trip, suggestions);
    return { suggestions, scores, globalScore, counts, quickActions, timingIssues, webQueries: buildWebQueries(trip), aiPrompt: buildAiPrompt(trip, settings, suggestions, scores) };
  }

  function emptyAnalysis() {
    return { suggestions: [], scores: {}, globalScore: 0, counts: { danger: 0, warning: 0, success: 0 }, quickActions: [], timingIssues: [], webQueries: [], aiPrompt: '' };
  }

  function computeScores(ctx) {
    const { trip, steps, segments, budget, days, missingCoords, datedSteps, timingIssues, preparationItems, done } = ctx;
    const expenseCategories = new Set((trip.expenses || []).map(expense => expense.category));
    return {
      itinéraire: clamp(100 - missingCoords.length * 12 - Math.max(0, steps.length < 2 ? 30 : 0), 0, 100),
      budget: clamp(budget.max ? 100 - Math.max(0, budget.percent - 100) * 1.8 - (budget.total === 0 ? 35 : 0) : 65 - (budget.total === 0 ? 25 : 0), 0, 100),
      trajets: clamp(100 - segments.filter(s => s.duration > 6 && s.mode !== 'plane').length * 18 - segments.filter(s => !s.hasCoordinates).length * 12, 0, 100),
      horaires: clamp(100 - timingIssues.filter(i => i.level === 'danger').length * 28 - timingIssues.filter(i => i.level === 'warning').length * 12, 0, 100),
      journées: clamp(100 - (days && steps.length / days > 4 ? 20 : 0) - (datedSteps.length < Math.min(steps.length, days) ? 12 : 0), 0, 100),
      préparation: clamp(preparationItems.length ? 45 + (done / preparationItems.length) * 55 : 45, 0, 100),
      réservations: clamp(100 - steps.filter(step => ['hôtel', 'aéroport', 'gare'].some(type => String(step.type || '').toLowerCase().includes(type)) && !step.links?.length).length * 18, 0, 100),
      dépenses: clamp(40 + ['transport', 'logement', 'nourriture'].filter(category => expenseCategories.has(category)).length * 20, 0, 100)
    };
  }

  function addStyleSuggestions(list, trip, budget, segments, steps, style, days) {
    const currency = trip.currency || '€';
    if (style.includes('économique')) {
      if (budget.max && budget.byCategory.nourriture > budget.max * 0.25) add(list, {
        level: 'warning', category: 'Style économique', title: 'Repas à surveiller',
        message: 'Le budget nourriture paraît élevé pour un voyage économique. Prévois courses, pique-niques ou repas simples.',
        action: 'Chercher options', view: 'budget', webQuery: webQuery(trip, 'repas pas cher supermarché street food')
      });
      if (budget.byCategory.logement > 0 && budget.byCategory.logement / Math.max(1, budget.total) > 0.45) add(list, {
        level: 'warning', category: 'Style économique', title: 'Logement coûteux',
        message: `Le logement représente ${Math.round((budget.byCategory.logement / Math.max(1, budget.total)) * 100)}% du budget prévu.`,
        action: 'Comparer', view: 'budget', webQuery: webQuery(trip, 'hébergement économique')
      });
    }
    if (style.includes('confort')) {
      const looseTransfers = segments.filter(segment => ['plane', 'train'].includes(segment.mode) && !segment.from.segmentNote && !segment.from.segmentReference);
      if (looseTransfers.length) add(list, {
        level: 'warning', category: 'Style confort', title: 'Transferts à sécuriser',
        message: 'Renseigne les références, horaires et notes de transfert pour éviter les imprévus.',
        action: 'Créer tâche', view: 'map', fix: FIXES.ADD_AIRPORT_TRANSFER_TASK
      });
    }
    if (style.includes('aventure')) {
      const hasOutdoorChecklist = Object.keys(trip.checklists || {}).some(name => /randonn|sant|nature|météo|meteo|sécurité/i.test(name));
      if (!hasOutdoorChecklist) add(list, {
        level: 'warning', category: 'Style aventure', title: 'Checklist aventure absente',
        message: 'Ajoute une checklist randonnée, météo, santé ou sécurité.', action: 'Ajouter checklist', view: 'preparation', fix: FIXES.ADD_STYLE_CHECKLIST
      });
      if (!steps.some(step => /pause|point de vue|randonnée/i.test(step.type || step.name || ''))) add(list, {
        level: 'success', category: 'Style aventure', title: 'Idées nature à ajouter',
        message: 'Ajoute des pauses, points de vue ou randonnées pour enrichir le parcours.', action: 'Chercher idées', webQuery: webQuery(trip, 'randonnées points de vue nature')
      });
    }
    if (style.includes('équilibré')) {
      if (steps.length / Math.max(1, days) > 4) add(list, {
        level: 'warning', category: 'Style équilibré', title: 'Journées trop remplies',
        message: 'Un voyage équilibré gagne à garder du temps libre. Répartis mieux les activités entre les journées.', action: 'Voir planning', view: 'itinerary'
      });
      if (budget.max && budget.total > 0 && budget.total < budget.max * 0.55) add(list, {
        level: 'success', category: 'Style équilibré', title: 'Marge budgétaire',
        message: `Il reste une bonne marge par rapport au budget maximum : ${formatMoney(budget.max - budget.total, currency)}.`, action: 'Ajouter bonus', webQuery: webQuery(trip, 'activités incontournables')
      });
    }
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
        issues.push({ level: 'danger', title: 'Départ avant arrivée', message: `“${step.name}” a un départ avant son arrivée. Corrige les dates ou heures.`, action: 'Corriger horaire' });
      }
      if ((step.arrivalDate || step.departureDate) && !step.arrivalTime && !step.departureTime) {
        issues.push({ level: 'warning', title: 'Horaire manquant', message: `“${step.name}” est daté, mais aucune heure n’est renseignée.`, action: 'Ajouter heure' });
      }
    });
    segments.forEach(segment => {
      const departure = parseDateTime(segment.from.departureDate || segment.from.arrivalDate, segment.from.departureTime || segment.from.segmentDepartureTime);
      const arrival = parseDateTime(segment.to.arrivalDate || segment.to.departureDate, segment.to.arrivalTime || segment.from.segmentArrivalTime);
      if (!departure || !arrival) return;
      const availableHours = (arrival - departure) / 3600000;
      if (availableHours < 0) {
        issues.push({ level: 'danger', title: 'Segment impossible', message: `${segment.from.name} → ${segment.to.name} : l’arrivée est avant le départ.`, action: 'Corriger segment' });
      } else if (segment.hasCoordinates && segment.duration && availableHours + 0.15 < segment.duration) {
        issues.push({ level: 'danger', title: 'Temps insuffisant', message: `${segment.from.name} → ${segment.to.name} : ${formatDuration(availableHours)} disponible, mais le trajet estimé dure ${formatDuration(segment.duration)}.`, action: 'Ajouter marge' });
      } else if (segment.hasCoordinates && segment.duration && availableHours < segment.duration + 0.75 && segment.mode !== 'walk') {
        issues.push({ level: 'warning', title: 'Marge courte', message: `${segment.from.name} → ${segment.to.name} : marge courte entre départ et arrivée.`, action: 'Prévoir marge' });
      }
    });
    return issues;
  }

  function add(list, item) {
    const normalized = { id: uid('sug'), level: 'warning', action: 'Voir', ...item };
    if (!list.some(existing => existing.message === normalized.message)) list.push(normalized);
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, Math.round(value))); }

  function ensureBlock(trip, blockName) {
    trip.checklists ||= {};
    if (!Array.isArray(trip.checklists[blockName])) trip.checklists[blockName] = [];
    return trip.checklists[blockName];
  }

  function addTask(trip, blockName, text) {
    const block = ensureBlock(trip, blockName);
    if (!block.some(item => String(item.text || '').toLowerCase() === text.toLowerCase())) {
      block.push({ id: uid('todo'), text, done: false });
      return true;
    }
    return false;
  }

  function addExpenseIfMissing(trip, category, label) {
    trip.expenses ||= [];
    const exists = trip.expenses.some(expense => expense.category === category || String(expense.label || '').toLowerCase() === label.toLowerCase());
    if (exists) return false;
    trip.expenses.push({ id: uid('expense'), label, category, plannedAmount: 0, actualAmount: '', status: 'prévue', paidBy: '', splitBetween: [], date: '', stepId: '', note: 'Ajouté par l’assistant.' });
    return true;
  }

  function applyFix(trip, settings, fixId) {
    if (!trip || !fixId) return { changed: false, message: 'Aucune correction appliquée.' };
    const steps = sortSteps(trip.steps || []);
    let changed = 0;
    if (fixId === FIXES.ADD_CORE_EXPENSES) {
      changed += addExpenseIfMissing(trip, 'transport', 'Transport principal') ? 1 : 0;
      changed += addExpenseIfMissing(trip, 'logement', 'Logement') ? 1 : 0;
      changed += addExpenseIfMissing(trip, 'nourriture', 'Repas') ? 1 : 0;
      changed += addExpenseIfMissing(trip, 'activités', 'Activités') ? 1 : 0;
    }
    if (fixId === FIXES.ADD_STYLE_CHECKLIST) {
      ['Vérifier la météo', 'Prévoir une trousse de secours', 'Télécharger les cartes hors ligne', 'Prévoir chaussures adaptées', 'Informer un proche du parcours'].forEach(text => { changed += addTask(trip, 'Aventure / sécurité', text) ? 1 : 0; });
    }
    if (fixId === FIXES.ADD_MISSING_COORDS_TASKS) {
      steps.filter(step => !isValidCoord(step)).forEach(step => { changed += addTask(trip, 'À corriger', `Ajouter les coordonnées GPS de “${step.name}”`) ? 1 : 0; });
    }
    if (fixId === FIXES.ADD_TIMING_TASKS) {
      const analysis = analyzeTrip(trip, settings);
      analysis.timingIssues.forEach(issue => { changed += addTask(trip, 'Horaires à vérifier', issue.message) ? 1 : 0; });
    }
    if (fixId === FIXES.ADD_BUDGET_TASKS) {
      ['Vérifier les postes les plus chers', 'Renseigner les montants réels', 'Réduire ou déplacer les dépenses optionnelles', 'Contrôler les dépenses partagées'].forEach(text => { changed += addTask(trip, 'Budget à vérifier', text) ? 1 : 0; });
    }
    if (fixId === FIXES.ADD_HOTEL_TASK) changed += addTask(trip, 'Logement', 'Ajouter ou vérifier les hébergements pour chaque nuit') ? 1 : 0;
    if (fixId === FIXES.ADD_AIRPORT_TRANSFER_TASK) changed += addTask(trip, 'Transferts', 'Vérifier horaires, marge et réservation pour les transferts aéroport / gare') ? 1 : 0;
    if (fixId === FIXES.ADD_EMPTY_TRANSPORTS) {
      steps.slice(0, -1).forEach(step => {
        if (!step.transportToNext) { step.transportToNext = 'car'; changed += 1; }
      });
    }
    if (fixId === FIXES.ADD_PREPARATION_TASKS) {
      const analysis = analyzeTrip(trip, settings);
      analysis.suggestions.filter(item => item.level !== 'success').slice(0, 8).forEach(item => { changed += addTask(trip, 'À vérifier', item.message) ? 1 : 0; });
    }
    trip.updatedAt = new Date().toISOString();
    return { changed: changed > 0, count: changed, message: changed ? `${changed} correction(s) ou tâche(s) ajoutée(s).` : 'Rien à modifier : les corrections existent déjà.' };
  }

  function autoFixTrip(trip, settings) {
    const analysis = analyzeTrip(trip, settings);
    const fixes = unique(analysis.suggestions.map(item => item.fix).filter(Boolean));
    let total = 0;
    fixes.forEach(fixId => {
      const result = applyFix(trip, settings, fixId);
      total += result.count || 0;
    });
    return { changed: total > 0, count: total, message: total ? `${total} correction(s) ou tâche(s) ajoutée(s) automatiquement.` : 'Aucune correction automatique nécessaire.' };
  }

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

  function buildQuickActions(trip, suggestions) {
    const critical = suggestions.filter(item => item.level === 'danger').length;
    const warnings = suggestions.filter(item => item.level === 'warning').length;
    return [
      { label: 'Corriger automatiquement', id: 'auto', icon: '✨', disabled: !suggestions.some(item => item.fix) },
      { label: `${critical} critique(s)`, id: 'danger', icon: '🚨', disabled: critical === 0 },
      { label: `${warnings} à vérifier`, id: 'warning', icon: '🔎', disabled: warnings === 0 },
      { label: 'Prompt IA', id: 'ai', icon: '🤖', disabled: false },
      { label: 'Recherches web', id: 'web', icon: '🌍', disabled: false }
    ];
  }

  function buildWebQueries(trip) {
    if (!trip) return [];
    const area = trip.area || trip.name || 'voyage';
    const days = tripDuration(trip);
    const interests = trip.interests || '';
    const style = trip.style || '';
    return [
      { title: 'Idées d’itinéraire', query: `itinéraire ${area} ${days} jours ${interests}` },
      { title: 'Conseils pratiques', query: `conseils voyage ${area} ${style} budget transport logement` },
      { title: 'Activités et lieux', query: `meilleures activités ${area} ${interests}` },
      { title: 'Budget moyen', query: `budget moyen voyage ${area} ${days} jours` }
    ];
  }

  function webQuery(trip, suffix) {
    const area = trip?.area || trip?.name || 'voyage';
    return `${suffix} ${area}`.trim();
  }

  function searchUrl(query) {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  function buildAiPrompt(trip, settings, suggestions, scores) {
    if (!trip) return '';
    const steps = sortSteps(trip.steps || []).map((step, index) => `${index + 1}. ${step.name} (${step.type || 'lieu'}) arrivée ${step.arrivalDate || '?'} ${step.arrivalTime || ''}, départ ${step.departureDate || '?'} ${step.departureTime || ''}, coût ${step.cost || 0}`).join('\n');
    const expenseSummary = window.TravelBudget.computeBudget(trip);
    const priorityAlerts = suggestions.filter(item => item.level !== 'success').slice(0, 8).map(item => `- [${item.category}] ${item.message}`).join('\n');
    return `Tu es un assistant expert en planification de voyage. Analyse ce voyage et propose des améliorations concrètes, gratuites ou faciles à appliquer.\n\nVoyage : ${trip.name}\nZone : ${trip.area || 'non renseignée'}\nDates : ${trip.startDate || '?'} → ${trip.endDate || '?'}\nStyle : ${trip.style || 'équilibré'}\nRythme : ${trip.pace || 'normal'}\nCentres d'intérêt : ${trip.interests || 'non renseignés'}\nBudget maximum : ${trip.maxBudget || 0} ${trip.currency || '€'}\nBudget prévu : ${Math.round(expenseSummary.plannedTotal || 0)} ${trip.currency || '€'}\nBudget réel : ${Math.round(expenseSummary.actualTotal || 0)} ${trip.currency || '€'}\nScores : ${Object.entries(scores || {}).map(([key, value]) => `${key} ${value}/100`).join(', ')}\n\nÉtapes :\n${steps || 'Aucune étape'}\n\nAlertes détectées :\n${priorityAlerts || 'Aucune alerte'}\n\nRéponds avec :\n1. Les 5 problèmes les plus importants\n2. Les corrections prioritaires\n3. Un planning plus réaliste si nécessaire\n4. Des idées adaptées au style ${trip.style || 'équilibré'}\n5. Des conseils budget.`;
  }

  function render(containerScore, containerSuggestions, trip, settings) {
    const analysis = analyzeTrip(trip, settings);
    if (!trip) {
      containerScore.innerHTML = '';
      containerSuggestions.innerHTML = '<div class="empty-state">Connecte-toi puis sélectionne un voyage pour obtenir des suggestions.</div>';
      return;
    }
    const scoreRows = Object.entries(analysis.scores).map(([name, value]) => `
      <div class="smart-score-line">
        <div><strong>${escapeHtml(name)}</strong><span>${value}/100</span></div>
        <div class="bar"><span style="width:${value}%"></span></div>
      </div>
    `).join('');
    const nextFixes = analysis.suggestions.filter(item => item.fix && item.level !== 'success').slice(0, 3);
    containerScore.innerHTML = `
      <div class="suggestions-hero">
        <div class="score-orb" style="--score:${analysis.globalScore}"><strong>${analysis.globalScore}</strong><span>prêt</span></div>
        <div class="suggestions-hero__main">
          <p class="eyebrow">Centre d’alertes</p>
          <h2>${suggestionHeadline(analysis)}</h2>
          <p>${suggestionSubline(analysis, trip)}</p>
          <div class="suggestion-toolbar">
            <button class="button button--primary" id="autoFixSuggestionsBtn" ${nextFixes.length ? '' : 'disabled'}>✨ Corriger automatiquement</button>
            <button class="button" id="copyAiPromptBtn">🤖 Copier prompt IA</button>
            <button class="button" id="openWebSuggestionsBtn">🌍 Recherches web</button>
          </div>
        </div>
        <div class="smart-score-grid">${scoreRows}</div>
      </div>
      <div class="suggestion-kpis">
        <article data-level="danger"><strong>${analysis.counts.danger}</strong><span>critiques</span></article>
        <article data-level="warning"><strong>${analysis.counts.warning}</strong><span>à vérifier</span></article>
        <article data-level="success"><strong>${analysis.counts.success}</strong><span>bons points</span></article>
      </div>
      ${nextFixes.length ? `<div class="auto-fix-preview"><strong>Corrections proposées</strong>${nextFixes.map(item => `<span>${escapeHtml(item.title)}</span>`).join('')}</div>` : ''}
    `;

    const groups = [
      ['danger', 'Critique', 'À corriger en priorité'],
      ['warning', 'À vérifier', 'À sécuriser avant le départ'],
      ['success', 'Bon point', 'Ce qui est déjà cohérent']
    ];
    const cards = groups.map(([level, label, sub]) => {
      const items = analysis.suggestions.filter(item => item.level === level);
      if (!items.length) return '';
      return `
        <section class="suggestion-group suggestion-group--${level}">
          <div class="suggestion-group__head"><div><h3>${label}</h3><p>${sub}</p></div><span>${items.length}</span></div>
          <div class="suggestion-card-grid">
            ${items.map(item => renderSuggestionCard(item)).join('')}
          </div>
        </section>
      `;
    }).join('');

    containerSuggestions.innerHTML = `
      <div class="ai-web-panel" id="aiWebPanel" hidden>
        <div class="ai-web-panel__head">
          <div><p class="eyebrow">IA & Web</p><h3>Compléter les suggestions locales</h3></div>
          <button class="icon-button" type="button" data-close-aiweb>×</button>
        </div>
        <p>Le site ne dépend d’aucune API IA payante : tu peux copier un prompt prêt à l’emploi ou ouvrir des recherches web ciblées.</p>
        <textarea class="input ai-prompt-box" id="aiPromptBox" readonly>${escapeHtml(analysis.aiPrompt)}</textarea>
        <div class="web-query-grid">
          ${analysis.webQueries.map(query => `<a class="web-query-card" target="_blank" rel="noopener" href="${searchUrl(query.query)}"><strong>${escapeHtml(query.title)}</strong><span>${escapeHtml(query.query)}</span></a>`).join('')}
        </div>
      </div>
      ${cards || '<div class="empty-state">Aucune suggestion pour le moment.</div>'}
    `;
  }

  function renderSuggestionCard(item) {
    const search = item.webQuery ? `<a class="button button--small" target="_blank" rel="noopener" href="${searchUrl(item.webQuery)}">Web</a>` : '';
    const fix = item.fix ? `<button class="button button--small button--primary" type="button" data-suggestion-fix="${escapeHtml(item.fix)}">Corriger</button>` : '';
    const view = item.view ? `<button class="button button--small" type="button" data-suggestion-view="${escapeHtml(item.view)}">Voir</button>` : '';
    return `
      <article class="smart-suggestion-card" data-level="${escapeHtml(item.level)}">
        <div class="smart-suggestion-card__top">
          <span class="badge ${item.level === 'danger' ? 'badge--danger' : item.level === 'success' ? 'badge--success' : 'badge--warning'}">${escapeHtml(item.category)}</span>
          <small>${escapeHtml(item.action || '')}</small>
        </div>
        <h4>${escapeHtml(item.title || item.category)}</h4>
        <p>${escapeHtml(item.message)}</p>
        <div class="smart-suggestion-card__actions">${view}${fix}${search}</div>
      </article>
    `;
  }

  function suggestionHeadline(analysis) {
    if (analysis.counts.danger) return 'Des points importants doivent être corrigés';
    if (analysis.counts.warning) return 'Ton voyage est presque prêt';
    return 'Ton voyage semble bien préparé';
  }

  function suggestionSubline(analysis, trip) {
    const style = trip?.style || 'équilibré';
    if (analysis.counts.danger) return `Priorise les alertes critiques, puis vérifie les conseils adaptés au style ${style}.`;
    if (analysis.counts.warning) return `Quelques vérifications restent utiles, surtout pour un voyage ${style}.`;
    return `Les données principales sont cohérentes pour un voyage ${style}.`;
  }

  window.TravelSuggestions = {
    analyzeTrip,
    optimizeOrder,
    compareRouteDistance,
    render,
    detectTimingIssues,
    applyFix,
    autoFixTrip,
    buildAiPrompt,
    buildWebQueries,
    FIXES
  };
})();
