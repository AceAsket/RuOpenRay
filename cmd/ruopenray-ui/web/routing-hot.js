const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
};
export function routingRulesOnly(before, after) {
  if (!before || !after) return false;
  const withoutRules = (config) => {
    const routing = { ...(config.routing || {}) }; delete routing.rules;
    if (routing.balancers == null || Array.isArray(routing.balancers) && !routing.balancers.length) delete routing.balancers;
    return { ...config, routing };
  };
  const same = (a,b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  return same(withoutRules(before), withoutRules(after)) && !same(before.routing?.rules, after.routing?.rules);
}
export function routingAPIEnabled(config) {
  return config?.api?.services?.includes('RoutingService') === true;
}
export function hotRoutingChangeLabel(before, after) {
  const routing = before?.routing || {};
  if (routingRulesOnly(before,after) && routingAPIEnabled(before) && !routing.balancers?.length && !routing.script) {
    return 'Xray: проверка и горячая замена правил; если локальный API недоступен — обычный перезапуск';
  }
  return 'Xray: будет проверена конфигурация и выполнен перезапуск сервиса';
}
export function hotRoutingPanel(state, escapeHtml) {
  let active, draft;
  try { active = JSON.parse(state.appliedConfigText || '{}'); draft = JSON.parse(state.jsonDraft || '{}'); } catch { return ''; }
  const ready = routingAPIEnabled(active), prepared = routingAPIEnabled(draft);
  const balancers = Boolean(active.routing?.balancers?.length || active.routing?.script);
  const message = ready
    ? balancers ? 'Локальный API включён. Этот профиль использует балансировщики или routing script: изменения требуют обычного применения.'
      : 'Изменения только списка правил применяются без перезапуска, когда локальный API и процесс Xray подтверждены. Уже открытые соединения сохраняют прежний маршрут.'
    : prepared ? 'Локальный API подготовлен в черновике. Примените изменения один раз с перезапуском Xray.'
      : 'Подготовьте локальный API и один раз примените изменения с перезапуском. Затем изменения только списка правил смогут применяться без перезапуска. Нужен Xray 26.10.21 или новее; профили с балансировщиками используют обычное применение.';
  return `<div class="routing-hot-status"><strong>Горячее применение правил</strong><span>${escapeHtml(message)}</span>${!prepared ? `<button type="button" class="btn secondary compact" data-action="enableHotRouting" ${state.configApplying || state.configTesting ? 'disabled' : ''}>Подготовить локальный API</button>` : ''}</div>`;
}
