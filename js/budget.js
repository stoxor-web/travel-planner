(function () {
  'use strict';

  const { expenseCategories, formatMoney, tripDuration, toNumber, escapeHtml, formatDate } = window.TravelUtils;

  function travellerNames(trip) {
    const names = Array.isArray(trip?.travellersNames) ? trip.travellersNames.filter(Boolean) : [];
    if (names.length) return names;
    const count = Math.max(1, toNumber(trip?.travellers, 1));
    return Array.from({ length: count }, (_, index) => `Voyageur ${index + 1}`);
  }

  function expensePlanned(expense) {
    return toNumber(expense?.plannedAmount ?? expense?.amount);
  }

  function expenseActual(expense) {
    if (expense?.actualAmount === '' || expense?.actualAmount == null) return 0;
    return toNumber(expense.actualAmount);
  }

  function expenseEffective(expense) {
    const actual = expenseActual(expense);
    return actual > 0 ? actual : expensePlanned(expense);
  }

  function dayKeyForExpense(expense, stepsById) {
    if (expense.date) return expense.date;
    const step = stepsById.get(expense.stepId || '');
    return step?.arrivalDate || 'non daté';
  }

  function computeBudget(trip) {
    const expenses = trip?.expenses || [];
    const steps = trip?.steps || [];
    const stepsCost = steps.reduce((sum, step) => sum + toNumber(step.cost), 0);
    const plannedExpenses = expenses.reduce((sum, expense) => sum + expensePlanned(expense), 0);
    const actualExpenses = expenses.reduce((sum, expense) => sum + expenseActual(expense), 0);
    const total = plannedExpenses + stepsCost;
    const actualTotal = actualExpenses + steps.reduce((sum, step) => sum + toNumber(step.journal?.realExpenses), 0);
    const max = toNumber(trip?.maxBudget);
    const days = tripDuration(trip);
    const names = travellerNames(trip);
    const travellers = Math.max(1, names.length);
    const byCategory = Object.fromEntries(expenseCategories.map(category => [category, 0]));
    const byStatus = {};
    const stepsById = new Map(steps.map(step => [step.id, step]));
    const byDay = {};
    expenses.forEach(expense => {
      const category = expense.category || 'autres';
      const value = expenseEffective(expense);
      byCategory[category] = (byCategory[category] || 0) + value;
      byStatus[expense.status || 'prévue'] = (byStatus[expense.status || 'prévue'] || 0) + value;
      const key = dayKeyForExpense(expense, stepsById);
      byDay[key] = (byDay[key] || 0) + value;
    });
    steps.forEach(step => {
      const key = step.arrivalDate || 'non daté';
      byDay[key] = (byDay[key] || 0) + toNumber(step.cost);
    });
    if (stepsCost) byCategory.activités = (byCategory.activités || 0) + stepsCost;

    const balances = Object.fromEntries(names.map(name => [name, { paid: 0, share: 0, balance: 0 }]));
    expenses.forEach(expense => {
      const amount = expenseEffective(expense);
      const participants = Array.isArray(expense.splitBetween) && expense.splitBetween.length ? expense.splitBetween : names;
      const validParticipants = participants.filter(name => balances[name]);
      const share = validParticipants.length ? amount / validParticipants.length : amount / travellers;
      validParticipants.forEach(name => { balances[name].share += share; });
      if (balances[expense.paidBy]) balances[expense.paidBy].paid += amount;
    });
    Object.values(balances).forEach(row => { row.balance = row.paid - row.share; });

    return {
      total,
      plannedTotal: total,
      actualTotal,
      totalExpenses: plannedExpenses,
      stepsCost,
      max,
      remaining: max ? max - total : 0,
      percent: max ? Math.round((total / max) * 100) : 0,
      perDay: total / Math.max(1, days),
      actualPerDay: actualTotal / Math.max(1, days),
      perPerson: total / travellers,
      actualPerPerson: actualTotal / travellers,
      byCategory,
      byStatus,
      byDay,
      balances,
      names,
      days,
      travellers
    };
  }

  function renderStats(container, trip) {
    const budget = computeBudget(trip);
    const currency = trip?.currency || '€';
    container.innerHTML = `
      <div class="stat-card"><strong>${formatMoney(budget.plannedTotal, currency)}</strong><span>prévu</span></div>
      <div class="stat-card"><strong>${formatMoney(budget.actualTotal, currency)}</strong><span>réel renseigné</span></div>
      <div class="stat-card"><strong>${formatMoney(budget.perDay, currency)}</strong><span>prévu par jour</span></div>
      <div class="stat-card"><strong>${formatMoney(budget.perPerson, currency)}</strong><span>prévu par personne</span></div>
      <div class="stat-card"><strong>${budget.max ? `${budget.percent}%` : '—'}</strong><span>${budget.max ? (budget.remaining >= 0 ? `reste ${formatMoney(budget.remaining, currency)}` : `dépassement ${formatMoney(Math.abs(budget.remaining), currency)}`) : 'aucun plafond'}</span></div>
    `;
  }

  function renderDaily(container, trip) {
    if (!container) return;
    const budget = computeBudget(trip);
    const currency = trip?.currency || '€';
    const rows = Object.entries(budget.byDay).filter(([, amount]) => amount > 0).sort(([a], [b]) => a.localeCompare(b)).slice(0, 14);
    if (!rows.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `
      <div class="mini-panel">
        <div class="mini-panel__head"><strong>Budget par jour</strong><span>${formatMoney(budget.perDay, currency)} / jour</span></div>
        <div class="daily-budget-list">
          ${rows.map(([day, amount]) => `<div><span>${day === 'non daté' ? 'Non daté' : formatDate(day)}</span><strong>${formatMoney(amount, currency)}</strong></div>`).join('')}
        </div>
      </div>
    `;
  }

  function renderPeople(container, trip) {
    if (!container) return;
    const budget = computeBudget(trip);
    const currency = trip?.currency || '€';
    container.innerHTML = `
      <div class="mini-panel">
        <div class="mini-panel__head"><strong>Répartition voyageurs</strong><span>${budget.names.length} personne(s)</span></div>
        <div class="people-budget-grid">
          ${budget.names.map(name => {
            const row = budget.balances[name] || { paid: 0, share: budget.perPerson, balance: 0 };
            return `<article>
              <strong>${escapeHtml(name)}</strong>
              <span>Part estimée : ${formatMoney(row.share || budget.perPerson, currency)}</span>
              <span>Payé : ${formatMoney(row.paid || 0, currency)}</span>
              <em class="${row.balance >= 0 ? 'positive' : 'negative'}">${row.balance >= 0 ? 'À recevoir' : 'À verser'} : ${formatMoney(Math.abs(row.balance || 0), currency)}</em>
            </article>`;
          }).join('')}
        </div>
      </div>
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
      container.innerHTML = '<div class="empty-state">Ajoute tes dépenses prévues, réelles, partagées ou à rembourser.</div>';
      return;
    }
    const stepsById = new Map((trip.steps || []).map(step => [step.id, step.name]));
    const currency = trip.currency || '€';
    container.innerHTML = expenses.map(expense => {
      const planned = expensePlanned(expense);
      const actual = expenseActual(expense);
      return `
        <article class="expense-row">
          <div class="trip-card__top">
            <div>
              <span class="badge">${escapeHtml(expense.category)}</span>
              <h3>${escapeHtml(expense.label)}</h3>
              <p>Prévu : ${formatMoney(planned, currency)} · Réel : ${actual ? formatMoney(actual, currency) : '—'} · ${escapeHtml(expense.status)}${expense.date ? ` · ${formatDate(expense.date)}` : ''}${expense.stepId ? ` · ${escapeHtml(stepsById.get(expense.stepId) || 'étape')}` : ''}</p>
              ${expense.paidBy ? `<p>Payé par ${escapeHtml(expense.paidBy)}${expense.splitBetween?.length ? ` · partagé avec ${expense.splitBetween.map(escapeHtml).join(', ')}` : ''}</p>` : ''}
              ${expense.note ? `<p>${escapeHtml(expense.note)}</p>` : ''}
            </div>
            <div class="row-actions">
              <button class="button" data-edit-expense="${expense.id}">Modifier</button>
              <button class="button" data-delete-expense="${expense.id}">Supprimer</button>
            </div>
          </div>
        </article>
      `;
    }).join('');
    container.querySelectorAll('[data-edit-expense]').forEach(btn => btn.addEventListener('click', () => handlers?.edit?.(btn.dataset.editExpense)));
    container.querySelectorAll('[data-delete-expense]').forEach(btn => btn.addEventListener('click', () => handlers?.delete?.(btn.dataset.deleteExpense)));
  }

  window.TravelBudget = { computeBudget, renderStats, renderDaily, renderPeople, renderBreakdown, drawChart, renderExpenses, travellerNames };
})();
