(function () {
  'use strict';

  const { expenseCategories, formatMoney, tripDuration, toNumber } = window.TravelUtils;

  function computeBudget(trip) {
    const expenses = trip?.expenses || [];
    const totalExpenses = expenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
    const stepsCost = (trip?.steps || []).reduce((sum, step) => sum + toNumber(step.cost), 0);
    const total = totalExpenses + stepsCost;
    const max = toNumber(trip?.maxBudget);
    const days = tripDuration(trip);
    const travellers = Math.max(1, toNumber(trip?.travellers, 1));
    const byCategory = Object.fromEntries(expenseCategories.map(category => [category, 0]));
    expenses.forEach(expense => {
      const category = expense.category || 'autres';
      byCategory[category] = (byCategory[category] || 0) + toNumber(expense.amount);
    });
    if (stepsCost) byCategory.activités = (byCategory.activités || 0) + stepsCost;
    return {
      total,
      totalExpenses,
      stepsCost,
      max,
      remaining: max ? max - total : 0,
      percent: max ? Math.round((total / max) * 100) : 0,
      perDay: total / Math.max(1, days),
      perPerson: total / travellers,
      byCategory,
      days,
      travellers
    };
  }

  function renderStats(container, trip) {
    const budget = computeBudget(trip);
    const currency = trip?.currency || '€';
    container.innerHTML = `
      <div class="stat-card"><strong>${formatMoney(budget.total, currency)}</strong><span>budget total</span></div>
      <div class="stat-card"><strong>${formatMoney(budget.perDay, currency)}</strong><span>par jour</span></div>
      <div class="stat-card"><strong>${formatMoney(budget.perPerson, currency)}</strong><span>par personne</span></div>
      <div class="stat-card"><strong>${budget.max ? `${budget.percent}%` : '—'}</strong><span>${budget.max ? (budget.remaining >= 0 ? `reste ${formatMoney(budget.remaining, currency)}` : `dépassement ${formatMoney(Math.abs(budget.remaining), currency)}`) : 'aucun plafond'}</span></div>
    `;
  }

  function renderBreakdown(container, trip) {
    const budget = computeBudget(trip);
    const currency = trip?.currency || '€';
    const rows = Object.entries(budget.byCategory)
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1]);
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state">Aucune dépense catégorisée pour le moment.</div>';
      return;
    }
    container.innerHTML = rows.map(([category, amount]) => {
      const percent = budget.total ? Math.round((amount / budget.total) * 100) : 0;
      return `
        <div class="breakdown-row">
          <div class="breakdown-row__top"><strong>${category}</strong><span>${formatMoney(amount, currency)} · ${percent}%</span></div>
          <div class="bar"><span style="width:${Math.min(100, percent)}%"></span></div>
        </div>
      `;
    }).join('');
  }

  function drawChart(canvas, trip) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 700;
    const cssHeight = 320;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const budget = computeBudget(trip);
    const rows = Object.entries(budget.byCategory).filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    ctx.font = '14px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textBaseline = 'middle';
    const muted = getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#687386';
    const primary = getComputedStyle(document.body).getPropertyValue('--primary').trim() || '#2563eb';
    const surface2 = getComputedStyle(document.body).getPropertyValue('--surface-2').trim() || '#eef3ff';
    const text = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#132033';

    if (!rows.length) {
      ctx.fillStyle = muted;
      ctx.fillText('Ajoute des dépenses pour afficher un graphique.', 24, 44);
      return;
    }

    const max = Math.max(...rows.map(([, amount]) => amount), 1);
    rows.forEach(([category, amount], index) => {
      const y = 30 + index * 34;
      const barWidth = Math.max(6, (amount / max) * (cssWidth - 220));
      ctx.fillStyle = surface2;
      roundRect(ctx, 130, y - 9, cssWidth - 190, 18, 9);
      ctx.fill();
      ctx.fillStyle = primary;
      roundRect(ctx, 130, y - 9, barWidth, 18, 9);
      ctx.fill();
      ctx.fillStyle = text;
      ctx.fillText(category, 12, y);
      ctx.fillStyle = muted;
      ctx.fillText(formatMoney(amount, trip?.currency || '€'), cssWidth - 52, y);
    });
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  function renderExpenses(container, trip, handlers) {
    const expenses = trip?.expenses || [];
    if (!expenses.length) {
      container.innerHTML = '<div class="empty-state">Ajoute tes dépenses prévues, payées, partagées ou à rembourser.</div>';
      return;
    }
    const stepsById = new Map((trip.steps || []).map(step => [step.id, step.name]));
    container.innerHTML = expenses.map(expense => `
      <article class="expense-row">
        <div class="trip-card__top">
          <div>
            <span class="badge">${window.TravelUtils.escapeHtml(expense.category)}</span>
            <h3>${window.TravelUtils.escapeHtml(expense.label)}</h3>
            <p>${formatMoney(expense.amount, trip.currency)} · ${window.TravelUtils.escapeHtml(expense.status)}${expense.date ? ` · ${window.TravelUtils.formatDate(expense.date)}` : ''}${expense.stepId ? ` · ${window.TravelUtils.escapeHtml(stepsById.get(expense.stepId) || 'étape')}` : ''}</p>
            ${expense.note ? `<p>${window.TravelUtils.escapeHtml(expense.note)}</p>` : ''}
          </div>
          <div class="row-actions">
            <button class="button" data-edit-expense="${expense.id}">Modifier</button>
            <button class="button" data-delete-expense="${expense.id}">Supprimer</button>
          </div>
        </div>
      </article>
    `).join('');
    container.querySelectorAll('[data-edit-expense]').forEach(btn => btn.addEventListener('click', () => handlers?.edit?.(btn.dataset.editExpense)));
    container.querySelectorAll('[data-delete-expense]').forEach(btn => btn.addEventListener('click', () => handlers?.delete?.(btn.dataset.deleteExpense)));
  }

  window.TravelBudget = { computeBudget, renderStats, renderBreakdown, drawChart, renderExpenses };
})();
