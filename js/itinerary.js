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
          <h3>Planning timeline</h3>
          <p>Ajoute tes premières étapes pour voir ton voyage sous forme de journées glissables.</p>
        </section>
      `;
      return;
    }

    container.innerHTML = `
      <div class="planner-head planner-head--timeline">
        <div>
          <p class="eyebrow">Planning central</p>
          <h2>Timeline jour par jour</h2>
          <p>Glisse une étape vers une autre journée ou ajoute rapidement un bloc.</p>
        </div>
        <span>${days.length} jour(s)</span>
      </div>
      <div class="planner-columns planner-columns--timeline" role="list" aria-label="Planning timeline jour par jour">
        ${days.map(day => `
          <article class="planner-day planner-day--timeline" role="listitem" data-drop-day="${escapeHtml(day.date || '')}">
            <div class="planner-day__head">
              <div>
                <strong>${escapeHtml(day.title)}</strong>
                <small>${escapeHtml(day.subtitle)}</small>
              </div>
              ${day.date ? `<button class="icon-button" title="Ajouter une étape ce jour" data-planner-add="${day.date}">+</button>` : ''}
            </div>
            <div class="planner-quick-actions">
              ${day.date ? ['activité','restaurant','hôtel','pause','gare','aéroport'].map(type => `<button type="button" data-planner-add-type="${type}" data-planner-add="${day.date}">+ ${type}</button>`).join('') : ''}
            </div>
            <div class="planner-day__body" data-drop-body="${escapeHtml(day.date || '')}">
              ${day.steps.length ? day.steps.map((step, index) => `
                <button class="planner-step planner-step--drag" type="button" draggable="true" data-planner-edit="${step.id}" data-drag-step="${step.id}">
                  <span class="planner-step__dot" style="background:${step.color || '#2563eb'}">${iconForType(step.type)}</span>
                  <span>
                    <strong>${escapeHtml(step.name)}</strong>
                    <small>${escapeHtml(step.type || 'étape')}${step.duration ? ` · ${escapeHtml(step.duration)}` : ''}${step.cost ? ` · ${formatMoney(step.cost, trip.currency)}` : ''}</small>
                  </span>
                </button>
                ${day.segments[index] ? `
                  <div class="planner-segment planner-segment--timeline">
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
      button.addEventListener('dragstart', event => {
        event.dataTransfer.setData('text/plain', button.dataset.dragStep || button.dataset.plannerEdit);
        event.dataTransfer.effectAllowed = 'move';
        button.classList.add('is-dragging');
      });
      button.addEventListener('dragend', () => button.classList.remove('is-dragging'));
    });
    container.querySelectorAll('[data-planner-add]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        actions.addStep?.(button.dataset.plannerAdd, button.dataset.plannerAddType || 'activité');
      });
    });
    container.querySelectorAll('[data-drop-day], [data-drop-body]').forEach(zone => {
      zone.addEventListener('dragover', event => {
        if (!zone.dataset.dropDay && !zone.dataset.dropBody) return;
        event.preventDefault();
        zone.classList.add('is-drop-target');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-drop-target'));
      zone.addEventListener('drop', event => {
        event.preventDefault();
        zone.classList.remove('is-drop-target');
        const stepId = event.dataTransfer.getData('text/plain');
        const date = zone.dataset.dropDay || zone.dataset.dropBody;
        if (stepId && date) actions.moveStep?.(stepId, date);
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
