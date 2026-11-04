const stageTitles = {
  'check-xray': 'Проверка Xray',
  'apply-xray': 'Перезапуск Xray',
  'apply-firewall': 'Firewall',
  refresh: 'Обновление статуса'
};

export function applyStageProgressVisible(state) {
  const steps = Array.isArray(state.applySteps) ? state.applySteps : [];
  if (!steps.length) return false;
  if (state.busyAction === 'apply') return true;
  return !state.busyAction && !state.configApplying && !state.firewallSaving
    && steps.some((step) => step?.status === 'error');
}

export function applyStageProgressView(steps, escapeHtml, { live = true } = {}) {
  if (!Array.isArray(steps) || !steps.length) return '';
  const stages = steps.map((step, index) => ({
    title: stageTitles[step?.id] || String(step?.label || `Этап ${index + 1}`),
    label: String(step?.label || stageTitles[step?.id] || `Этап ${index + 1}`),
    status: ['pending', 'running', 'done', 'error'].includes(step?.status) ? step.status : 'pending'
  }));
  const completed = stages.filter((step) => step.status === 'done').length;
  const errorIndex = stages.findIndex((step) => step.status === 'error');
  const runningIndex = stages.findIndex((step) => step.status === 'running');
  const currentIndex = errorIndex >= 0 ? errorIndex : runningIndex;
  const complete = completed === stages.length;
  const phase = errorIndex >= 0 ? 'error' : complete ? 'complete' : runningIndex >= 0 ? 'running' : 'pending';
  const count = currentIndex >= 0
    ? `Шаг ${currentIndex + 1} из ${stages.length}`
    : `Выполнено ${completed} из ${stages.length}`;
  const current = errorIndex >= 0 ? `Применение остановлено: ${stages[errorIndex].label}`
    : complete ? 'Этапы применения завершены'
      : runningIndex >= 0 ? stages[runningIndex].label : 'Подготовка применения изменений';
  const statuses = { pending: 'Ожидает', running: 'Выполняется', done: 'Завершён', error: 'Ошибка' };
  const classes = { pending: 'is-pending', running: 'is-current', done: 'is-complete', error: 'is-error' };
  const liveAttrs = live ? ' role="status" aria-live="polite" aria-atomic="true"' : '';
  return `<div class="apply-stage-progress" data-apply-phase="${phase}" style="--apply-stage-count:${stages.length}">
    <div class="apply-stage-heading"${liveAttrs}>
      <span class="apply-stage-count">${escapeHtml(count)}</span>
      <strong class="apply-stage-current">${escapeHtml(current)}</strong>
    </div>
    <ol class="apply-stage-list" aria-label="Этапы применения">
      ${stages.map((step, index) => `<li class="apply-stage ${classes[step.status]}"${step.status === 'running' ? ' aria-current="step"' : ''} aria-label="${escapeHtml(`${step.title}: ${statuses[step.status]}`)}" title="${escapeHtml(step.label)}">
        <span class="apply-stage-marker" aria-hidden="true">${step.status === 'done' ? '✓' : step.status === 'error' ? '!' : step.status === 'running' ? '' : index + 1}</span>
        <div class="apply-stage-copy"><strong class="apply-stage-label">${escapeHtml(step.title)}</strong></div>
      </li>`).join('')}
    </ol>
  </div>`;
}

export function applyOperationProgressView(label, escapeHtml) {
  return `<div class="apply-stage-progress apply-stage-fallback" data-apply-phase="running">
    <span class="apply-stage-marker" aria-hidden="true"></span>
    <div class="apply-stage-heading" role="status" aria-live="polite" aria-atomic="true">
      <span class="apply-stage-count">Применение</span>
      <strong class="apply-stage-current">${escapeHtml(label)}</strong>
    </div>
  </div>`;
}
