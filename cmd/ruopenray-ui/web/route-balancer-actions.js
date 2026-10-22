import { balancerMonitorForm, balancerNeedsMonitor, buildBalancerDraft, isFailoverBalancer } from './balancer-policy.js';

export function createRouteBalancerActions({
  state,
  render,
  routeBalancers,
  routeRules,
  splitRouteValues,
  setRouteBalancersDraft,
  syncConfig,
  balancerTargetOptions = () => []
}) {
  function resetRouteBalancerForm() {
    state.routeBalancerEditingIndex = -1;
    state.routeBalancerTag = '';
    state.routeBalancerStrategy = 'random';
    state.routeBalancerSelectors = '';
    state.routeBalancerFallback = '';
    state.routeBalancerMode = 'failover';
    state.routeBalancerPrimary = '';
    state.routeBalancerHealthCheck = true;
    state.routeBalancerExpected = '1';
    Object.assign(state, balancerMonitorForm(state.config));
  }

  function openRouteBalancerDialog(index = -1) {
    const balancer = routeBalancers()[index];
    if (balancer) {
      state.routeBalancerEditingIndex = index;
      state.routeBalancerTag = balancer.tag || '';
      state.routeBalancerStrategy = balancer.strategy?.type || 'random';
      state.routeBalancerSelectors = Array.isArray(balancer.selector) ? balancer.selector.join('\n') : '';
      state.routeBalancerFallback = balancer.fallbackTag || '';
      state.routeBalancerMode = isFailoverBalancer(balancer, state.config) ? 'failover' : 'balance';
      state.routeBalancerPrimary = balancer.selector?.[0] || '';
      state.routeBalancerHealthCheck = balancerNeedsMonitor(balancer);
      state.routeBalancerExpected = String(balancer.strategy?.settings?.expected ?? 1);
      Object.assign(state, balancerMonitorForm(state.config));
    } else {
      resetRouteBalancerForm();
    }
    state.routeBalancerDialog = true;
    state.message = '';
    render();
  }

  function closeRouteBalancerDialog() {
    state.routeBalancerDialog = false;
    resetRouteBalancerForm();
    render();
  }

  function setRouteBalancerSelector(tag, enabled) {
    const selectors = splitRouteValues(state.routeBalancerSelectors);
    const next = enabled
      ? [...selectors, tag]
      : selectors.filter((item) => item !== tag);
    state.routeBalancerSelectors = [...new Set(next)].join('\n');
  }

  function moveRouteBalancerSelector(tag, direction) {
    const selectors = splitRouteValues(state.routeBalancerSelectors);
    const index = selectors.indexOf(tag);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= selectors.length) return;
    [selectors[index], selectors[nextIndex]] = [selectors[nextIndex], selectors[index]];
    state.routeBalancerSelectors = selectors.join('\n');
  }

  function saveRouteBalancer() {
    const tag = String(state.routeBalancerTag || '').trim();
    try {
      syncConfig(buildBalancerDraft(state.config, state, balancerTargetOptions()));
    } catch (error) {
      state.message = error.message;
      render();
      return;
    }
    state.routeBalancer = tag;
    state.routeTargetType = 'balancer';
    state.routeBalancerDialog = false;
    resetRouteBalancerForm();
    state.message = `Группа серверов ${tag} сохранена в черновик. Выберите её в нужных правилах, проверьте конфигурацию и примените изменения.`;
    render();
  }

  function removeRouteBalancer(index) {
    const balancer = routeBalancers()[index];
    if (!balancer) return;
    const used = routeRules().some((rule) => rule.balancerTag === balancer.tag);
    if (used) {
      state.message = `Балансировщик ${balancer.tag} используется в правилах. Сначала переназначьте эти правила.`;
      render();
      return;
    }
    setRouteBalancersDraft(routeBalancers().filter((_, itemIndex) => itemIndex !== index));
    if (state.routeBalancer === balancer.tag) state.routeBalancer = '';
    state.message = `Балансировщик ${balancer.tag} удален из черновика`;
    render();
  }

  return {
    resetRouteBalancerForm,
    openRouteBalancerDialog,
    closeRouteBalancerDialog,
    setRouteBalancerSelector,
    moveRouteBalancerSelector,
    saveRouteBalancer,
    removeRouteBalancer
  };
}
