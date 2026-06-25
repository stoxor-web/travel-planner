(function () {
  'use strict';

  const {
    sortSteps,
    estimateSegment,
    formatDistance,
    formatDuration,
    formatMoney,
    formatDate,
    isValidCoord,
    tripDuration,
    escapeHtml
  } = window.TravelUtils;

  function buildSegments(trip, settings) {
    const steps = sortSteps(trip?.steps || []);
    return steps.slice(0, -1).map((from, index) => {
      const to = steps[index + 1];
      const mode = from.transportToNext || 'car';
      const estimation = estimateSegment(from, to, mode, settings);
      return {
        id: `${from.id}_${to.id}`,
        index,
        from,
        to,
        mode,
        ...estimation,
        cost: Number(from.segmentCost) || estimation.cost,
        note: from.segmentNote || '',
        departureTime: from.segmentDepartureTime || '',
        arrivalTime: from.segmentArrivalTime || '',
        reference: from.segmentReference || '',
        hasCoordinates: isValidCoord(from) && isValidCoord(to)
      };
    });
  }

  function groupByDay(trip, segments) {
    const start = trip?.startDate ? new Date(`${trip.startDate}T12:00:00`) : null;
    return segments.map((segment, index) => {
      let dayLabel = `Jour ${index + 1}`;
      if (segment.from.arrivalDate || segment.to.arrivalDate) {
        dayLabel = formatDate(segment.from.arrivalDate || segment.to.arrivalDate);
      } else if (start && !Number.isNaN(start.getTime())) {
        const day = new Date(start);
        day.setDate(day.getDate() + index);
        dayLabel = `Jour ${index + 1} — ${formatDate(day.toISOString().slice(0, 10))}`;
      }
      return { ...segment, dayLabel };
    });
  }

  function totals(trip, settings) {
    const segments = buildSegments(trip, settings);
    return {
      segments,
      distance: segments.reduce((sum, segment) => sum + segment.distance, 0),
      duration: segments.reduce((sum, segment) => sum + segment.duration, 0),
      transportCost: segments.reduce((sum, segment) => sum + segment.cost, 0),
      days: tripDuration(trip)
    };
  }

  function dateRange(startDate, endDate) {
    if (!startDate || !endDate) return [];
    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
    const days = [];
    const cursor = new Date(start);
    while (cursor <= end && days.length < 45) {
      days.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  function buildPlannerDays(trip, settings) {
    const steps = sortSteps(trip?.steps || []);
    const segments = buildSegments(trip, settings);
    if (!trip) return [];

    const datedSteps = steps.filter(step => step.arrivalDate);
    const explicitDates = [...new Set(datedSteps.map(step => step.arrivalDate).filter(Boolean))].sort();
    let dates = dateRange(trip.startDate, trip.endDate);
    if (!dates.length) dates = explicitDates;

    if (dates.length) {
      return dates.map((date, index) => {
        const daySteps = steps.filter(step => step.arrivalDate === date || (!step.arrivalDate && index === 0));
        const stepIds = new Set(daySteps.map(step => step.id));
        const daySegments = segments.filter(segment => stepIds.has(segment.from.id));
        return {
          id: date,
          date,
          title: `Jour ${index + 1}`,
          subtitle: formatDate(date),
          steps: daySteps,
          segments: daySegments,
          totalDistance: daySegments.reduce((sum, segment) => sum + segment.distance, 0),
          totalDuration: daySegments.reduce((sum, segment) => sum + segment.duration, 0),
          totalCost: daySteps.reduce((sum, step) => sum + (Number(step.cost) || 0), 0) + daySegments.reduce((sum, segment) => sum + segment.cost, 0)
        };
      });
    }

    if (!steps.length) return [];
    return steps.map((step, index) => {
      const segment = segments.find(item => item.from.id === step.id);
      return {
        id: step.id,
        date: '',
        title: `Jour ${index + 1}`,
        subtitle: step.name,
        steps: [step],
        segments: segment ? [segment] : [],
        totalDistance: segment?.distance || 0,
        totalDuration: segment?.duration || 0,
        totalCost: (Number(step.cost) || 0) + (segment?.cost || 0)
      };
    });
  }

  function iconForType(type = '') {
    const value = String(type).toLowerCase();
    if (value.includes('hôtel') || value.includes('hotel')) return '🏨';
    if (value.includes('restaurant')) return '🍽️';
    if (value.includes('gare')) return '🚆';
    if (value.includes('aéroport')) return '✈️';
    if (value.includes('plage')) return '🏖️';
    if (value.includes('randonnée')) return '🥾';
    if (value.includes('parking')) return '🅿️';
    if (value.includes('activité')) return '🎟️';
    if (value.includes('pause')) return '☕';
    return '📍';
  }

  function renderSummary(container, trip, settings) {
    const result = totals(trip, settings);
    container.innerHTML = `
      <div class="stat-card"><strong>${result.days}</strong><span>jour(s)</span></div>
      <div class="stat-card"><strong>${result.segments.length}</strong><span>trajet(s)</span></div>
      <div class="stat-card"><strong>${formatDistance(result.distance)}</strong><span>distance estimée</span></div>
      <div class="stat-card"><strong>${formatMoney(result.transportCost, trip?.currency)}</strong><span>transport estimé</span></div>
    `;
  }

  function renderDayPlanner(container, trip, settings, actions = {}) {
    if (!container) return;
    const days = buildPlannerDays(trip, settings);
    if (!trip) {
      container.innerHTML = '<div class="empty-state">Sélectionne un voyage pour afficher le planning.</div>';
      return;
    }
    if (!days.length) {
      container.innerHTML = `
        <section class="planner-empty">
          <h3>Planning jour par jour</h3>
          <p>Ajoute tes premières étapes pour voir ton voyage sous forme de colonnes.</p>
        </section>
      `;
      return;
    }

    container.innerHTML = `
      <div class="planner-head">
        <div>
          <p class="eyebrow">Planning</p>
          <h2>Vue jour par jour</h2>
        </div>
        <span>${days.length} jour(s)</span>
      </div>
      <div class="planner-columns" role="list" aria-label="Planning jour par jour">
        ${days.map(day => `
          <article class="planner-day" role="listitem">
            <div class="planner-day__head">
              <div>
                <strong>${escapeHtml(day.title)}</strong>
                <span>${escapeHtml(day.subtitle)}</span>
              </div>
              ${day.date ? `<button class="icon-button" title="Ajouter une étape ce jour" data-planner-add="${day.date}">+</button>` : ''}
            </div>
            <div class="planner-quick-actions">
              ${day.date ? ['ville','hôtel','restaurant','activité','gare','aéroport'].map(type => `<button type="button" data-planner-quick="${day.date}|${type}">+ ${type}</button>`).join('') : ''}
            </div>
            <div class="planner-day__body">
              ${day.steps.length ? day.steps.map((step, index) => `
                <button class="planner-step" type="button" data-planner-edit="${step.id}">
                  <span class="planner-step__dot" style="background:${step.color || '#2563eb'}">${iconForType(step.type)}</span>
                  <span>
                    <strong>${escapeHtml(step.name)}</strong>
                    <small>${escapeHtml(step.type || 'étape')}${step.duration ? ` · ${escapeHtml(step.duration)}` : ''}${step.cost ? ` · ${formatMoney(step.cost, trip.currency)}` : ''}</small>
                  </span>
                </button>
                ${day.segments[index] ? `
                  <div class="planner-segment">
                    <span>${day.segments[index].modeIcon}</span>
                    <span>${day.segments[index].hasCoordinates ? `${formatDistance(day.segments[index].distance)} · ${formatDuration(day.segments[index].duration)}` : 'coordonnées à compléter'}</span>
                  </div>
                ` : ''}
              `).join('') : '<div class="planner-placeholder">Journée libre</div>'}
            </div>
            <div class="planner-day__foot">
              <span>${formatDistance(day.totalDistance)}</span>
              <span>${formatMoney(day.totalCost, trip.currency)}</span>
            </div>
          </article>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('[data-planner-edit]').forEach(button => {
      button.addEventListener('click', () => actions.editStep?.(button.dataset.plannerEdit));
    });
    container.querySelectorAll('[data-planner-add]').forEach(button => {
      button.addEventListener('click', () => actions.addStep?.(button.dataset.plannerAdd));
    });
    container.querySelectorAll('[data-planner-quick]').forEach(button => {
      button.addEventListener('click', () => {
        const [date, type] = button.dataset.plannerQuick.split('|');
        actions.addStep?.(date, type);
      });
    });
  }

  function renderItinerary(container, trip, settings, onChangeSegment) {
    const segments = groupByDay(trip, buildSegments(trip, settings));
    if (!trip || !segments.length) {
      container.innerHTML = '<div class="empty-state">Ajoute au moins deux étapes pour générer une feuille de route.</div>';
      return;
    }

    const modeOptions = Object.entries(window.TravelUtils.transportModes)
      .map(([value, mode]) => `<option value="${value}">${mode.icon} ${mode.label}</option>`).join('');

    container.innerHTML = segments.map(segment => `
      <article class="timeline-row timeline-row--route">
        <p class="eyebrow">${segment.dayLabel}</p>
        <h3>${escapeHtml(segment.from.name)} → ${escapeHtml(segment.to.name)}</h3>
        <p>${segment.modeIcon} ${segment.modeLabel} · ${segment.hasCoordinates ? `${formatDistance(segment.distance)} · ${formatDuration(segment.duration)}` : 'coordonnées à compléter'} · ${formatMoney(segment.cost, trip.currency)}</p>
        <div class="route-detail-tags">
          ${segment.departureTime ? `<span>Départ ${escapeHtml(segment.departureTime)}</span>` : ''}
          ${segment.arrivalTime ? `<span>Arrivée ${escapeHtml(segment.arrivalTime)}</span>` : ''}
          ${segment.reference ? `<span>Réf. ${escapeHtml(segment.reference)}</span>` : ''}
        </div>
        ${segment.note ? `<p><strong>Note :</strong> ${escapeHtml(segment.note)}</p>` : ''}
        <div class="form-grid mt">
          <label>Transport
            <select class="input" data-segment-field="transportToNext" data-step-id="${segment.from.id}">
              ${modeOptions}
            </select>
          </label>
          <label>Coût personnalisé
            <input class="input" type="number" min="0" step="0.01" value="${Number(segment.from.segmentCost) || ''}" data-segment-field="segmentCost" data-step-id="${segment.from.id}" placeholder="${segment.cost.toFixed(2)}" />
          </label>
          <label>Heure départ
            <input class="input" type="time" value="${escapeHtml(segment.from.segmentDepartureTime || '')}" data-segment-field="segmentDepartureTime" data-step-id="${segment.from.id}" />
          </label>
          <label>Heure arrivée
            <input class="input" type="time" value="${escapeHtml(segment.from.segmentArrivalTime || '')}" data-segment-field="segmentArrivalTime" data-step-id="${segment.from.id}" />
          </label>
          <label>Réservation / vol / train
            <input class="input" value="${escapeHtml(segment.from.segmentReference || '')}" data-segment-field="segmentReference" data-step-id="${segment.from.id}" placeholder="AF123, TGV 6120..." />
          </label>
          <label class="wide">Note de segment
            <input class="input" value="${escapeHtml(segment.from.segmentNote || '')}" data-segment-field="segmentNote" data-step-id="${segment.from.id}" placeholder="Pause, billet, péage, marge aéroport..." />
          </label>
        </div>
      </article>
    `).join('');

    container.querySelectorAll('[data-segment-field="transportToNext"]').forEach(select => {
      const step = trip.steps.find(item => item.id === select.dataset.stepId);
      select.value = step?.transportToNext || 'car';
    });

    container.querySelectorAll('[data-segment-field]').forEach(field => {
      field.addEventListener('change', event => onChangeSegment?.(event.target.dataset.stepId, event.target.dataset.segmentField, event.target.value));
    });
  }

  window.TravelItinerary = { buildSegments, groupByDay, totals, buildPlannerDays, renderSummary, renderDayPlanner, renderItinerary };
})();
