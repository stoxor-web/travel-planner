(function () {
  'use strict';

  const { sortSteps, estimateSegment, formatDistance, formatDuration, formatMoney, formatDate, isValidCoord, tripDuration } = window.TravelUtils;

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

  function renderSummary(container, trip, settings) {
    const result = totals(trip, settings);
    container.innerHTML = `
      <div class="stat-card"><strong>${result.segments.length}</strong><span>trajet(s)</span></div>
      <div class="stat-card"><strong>${formatDistance(result.distance)}</strong><span>distance estimée</span></div>
      <div class="stat-card"><strong>${formatDuration(result.duration)}</strong><span>temps total</span></div>
      <div class="stat-card"><strong>${formatMoney(result.transportCost, trip?.currency)}</strong><span>transport estimé</span></div>
    `;
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
      <article class="timeline-row">
        <p class="eyebrow">${segment.dayLabel}</p>
        <h3>${window.TravelUtils.escapeHtml(segment.from.name)} → ${window.TravelUtils.escapeHtml(segment.to.name)}</h3>
        <p>${segment.modeIcon} ${segment.modeLabel} · ${segment.hasCoordinates ? `${formatDistance(segment.distance)} · ${formatDuration(segment.duration)}` : 'coordonnées à compléter'} · ${formatMoney(segment.cost, trip.currency)}</p>
        ${segment.note ? `<p><strong>Note :</strong> ${window.TravelUtils.escapeHtml(segment.note)}</p>` : ''}
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
            <input class="input" value="${window.TravelUtils.escapeHtml(segment.from.segmentNote || '')}" data-segment-field="segmentNote" data-step-id="${segment.from.id}" placeholder="Pause, billet, péage, marge aéroport..." />
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

  window.TravelItinerary = { buildSegments, groupByDay, totals, renderSummary, renderItinerary };
})();
