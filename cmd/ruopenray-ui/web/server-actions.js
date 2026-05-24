import { parseServerEditJson, patchServerEditField, stringifyServerEditOutbound } from './server-edit-model.js';

export function createServerActions({
  state,
  request,
  render,
  refresh,
  syncConfig,
  keepOperationVisible,
  configOutbounds,
  proxyOutbounds,
  proxyRuleStrategyStats,
  setActiveProxyDraft,
  setActiveServerTag,
  applyConfig
}) {
  async function persistServerMeta(items = state.serverMeta) {
    const result = await request('/api/server-meta', {
      method: 'POST',
      body: JSON.stringify({ items: items || {} })
    });
    if (result?.items && typeof result.items === 'object') state.serverMeta = result.items;
    return result;
  }

  function openServerEditor(index) {
    const outbound = configOutbounds()[index];
    if (!outbound) return;
    state.serverEditDialog = true;
    state.serverEditIndex = index;
    state.serverEditJson = JSON.stringify(outbound, null, 2);
    state.serverEditCountry = state.serverMeta?.[outbound.tag]?.country || '';
    state.serverEditCountrySearch = '';
    state.serverEditError = '';
    render();
  }

  function closeServerEditor() {
    state.serverEditDialog = false;
    state.serverEditIndex = -1;
    state.serverEditJson = '';
    state.serverEditCountry = '';
    state.serverEditCountrySearch = '';
    state.serverEditError = '';
    render();
  }

  function setServerEditCountry(country) {
    state.serverEditCountry = String(country || '').trim().toUpperCase();
    state.serverEditCountrySearch = '';
    render();
  }

  function updateServerEditField(field, value, { rerender = false } = {}) {
    const parsed = parseServerEditJson(state.serverEditJson || '{}');
    if (parsed.error) {
      state.serverEditError = parsed.error;
      if (rerender) render();
      return;
    }
    const outbound = patchServerEditField(parsed.outbound, field, value);
    state.serverEditJson = stringifyServerEditOutbound(outbound);
    state.serverEditError = '';
    if (rerender) render();
  }

  function replaceRouteTargetReferences(config, oldTag, newTag) {
    if (!oldTag || !newTag || oldTag === newTag) return config;
    const routing = config.routing && typeof config.routing === 'object' ? config.routing : {};
    if (Array.isArray(routing.rules)) {
      routing.rules = routing.rules.map((rule) => {
        if (!rule || typeof rule !== 'object') return rule;
        const next = { ...rule };
        if (next.outboundTag === oldTag) next.outboundTag = newTag;
        return next;
      });
    }
    if (Array.isArray(routing.balancers)) {
      routing.balancers = routing.balancers.map((balancer) => {
        if (!balancer || typeof balancer !== 'object') return balancer;
        const next = { ...balancer };
        if (next.fallbackTag === oldTag) next.fallbackTag = newTag;
        if (Array.isArray(next.selector)) {
          next.selector = next.selector.map((selector) => selector === oldTag ? newTag : selector);
        }
        return next;
      });
    }
    config.routing = routing;
    return config;
  }

  async function saveServerEdit() {
    const index = Number(state.serverEditIndex);
    const current = configOutbounds()[index];
    if (!current) return;
    let outbound = null;
    const parsed = parseServerEditJson(state.serverEditJson || '{}');
    if (parsed.error) {
      state.serverEditError = parsed.error;
      render();
      return;
    }
    outbound = parsed.outbound;
    const oldTag = String(current.tag || '').trim();
    const newTag = String(outbound.tag || '').trim();
    if (!newTag) {
      state.serverEditError = 'У сервера должен быть outbound tag';
      render();
      return;
    }
    const duplicate = configOutbounds().some((item, itemIndex) => itemIndex !== index && item?.tag === newTag);
    if (duplicate) {
      state.serverEditError = `Тег ${newTag} уже используется другим направлением`;
      render();
      return;
    }
    const next = JSON.parse(JSON.stringify(state.config || {}));
    if (!Array.isArray(next.outbounds)) next.outbounds = [];
    next.outbounds[index] = outbound;
    replaceRouteTargetReferences(next, oldTag, newTag);
    const nextMeta = { ...(state.serverMeta || {}) };
    if (oldTag && oldTag !== newTag) delete nextMeta[oldTag];
    const country = String(state.serverEditCountry || '').trim().toUpperCase();
    if (country) nextMeta[newTag] = { ...(nextMeta[newTag] || {}), country };
    else delete nextMeta[newTag];
    state.serverMeta = nextMeta;
    syncConfig(next);
    if (state.activeServerTag === oldTag && oldTag !== newTag && typeof setActiveServerTag === 'function') setActiveServerTag(newTag);
    await persistServerMeta(nextMeta);
    state.message = oldTag === newTag
      ? `Сервер ${newTag} обновлен в черновике`
      : `Сервер ${oldTag} переименован в ${newTag}, ссылки в правилах обновлены`;
    closeServerEditor();
  }

  function removeOutbound(index) {
    const outbound = configOutbounds()[index];
    const tag = outbound?.tag || '';
    if (['direct', 'block', 'dns-out'].includes(tag)) {
      state.message = 'Служебные направления direct, block и dns-out лучше не удалять';
      render();
      return;
    }
    const next = JSON.parse(JSON.stringify(state.config || {}));
    next.outbounds = configOutbounds().filter((_, itemIndex) => itemIndex !== index);
    if (tag && state.serverMeta?.[tag]) {
      const nextMeta = { ...(state.serverMeta || {}) };
      delete nextMeta[tag];
      state.serverMeta = nextMeta;
      persistServerMeta(nextMeta).catch(() => {});
    }
    syncConfig(next);
    state.message = `Сервер ${tag || index + 1} удален из черновика`;
    render();
  }

  async function routeAllToOutbound(tag, { apply = true } = {}) {
    if (state.configApplying) return;
    const before = proxyRuleStrategyStats();
    state.pendingServerTag = tag;
    state.message = `Подключаю ${tag}: меняю основное proxy-направление...`;
    render();
    setActiveProxyDraft(tag);
    const after = proxyRuleStrategyStats(tag);
    const switched = Math.max(before.primary, after.primary);
    const pinned = after.pinned ? `, закрепленных на других серверах не тронуто: ${after.pinned}` : '';
    if (!apply) {
      state.pendingServerTag = '';
      state.message = `Основное proxy-направление теперь ведет в ${tag}. Переключено правил: ${switched}${pinned}`;
      render();
      return;
    }
    state.message = `Подключаю ${tag}: меняю proxy-направление, записываю config.json и перезапускаю Xray...`;
    render();
    try {
      await applyConfig({
        successMessage: `Подключен ${tag}. Переключено правил: ${switched}${pinned}`
      });
    } finally {
      state.pendingServerTag = '';
      render();
    }
  }

  async function checkServers(tags = [], options = {}) {
    const startedAt = Date.now();
    const renderAfter = options.renderAfter !== false;
    const requestedTags = tags.length
      ? tags
      : proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean);
    state.serverChecking = true;
    state.serverCheckingTags = requestedTags;
    state.message = requestedTags.length === 1 ? 'Проверяю выбранный прокси...' : 'Проверяю все прокси...';
    if (renderAfter) render();
    const result = await request('/api/outbounds/check', {
      method: 'POST',
      body: JSON.stringify({
        tags: requestedTags,
        timeoutMs: Number(state.serverCheckTimeout) || 2500,
        attempts: Number(state.serverCheckAttempts) || 1,
        mode: state.serverCheckMode,
        url: state.serverCheckUrl
      })
    });
    for (const item of result.results || []) {
      if (item.tag) state.serverChecks[item.tag] = item;
    }
    const alive = (result.results || []).filter((item) => item.ok).length;
    state.serverCheckHistory = [
      {
        at: new Date().toISOString(),
        total: result.results?.length || 0,
        alive,
        results: result.results || []
      },
      ...state.serverCheckHistory
    ].slice(0, 12);
    state.message = requestedTags.length === 1
      ? `Проверка сервера: ${alive ? 'доступен' : 'нет ответа'}`
      : `Проверено серверов: ${result.results?.length || 0}, доступны: ${alive}`;
    await keepOperationVisible(startedAt);
    state.serverChecking = false;
    state.serverCheckingTags = [];
    if (renderAfter) render();
  }

  async function fallbackSubscriptionPool(tag) {
    const result = await request('/api/subscriptions/fallback', {
      method: 'POST',
      body: JSON.stringify({
        tag,
        mode: state.serverCheckMode,
        url: state.serverCheckUrl,
        timeoutMs: Number(state.serverCheckTimeout) || 2500,
        attempts: Number(state.serverCheckAttempts) || 1,
        restart: true
      })
    });
    state.message = result.ok
      ? `Подписка ${tag}: выбран ${result.selected?.tag || result.selected?.address || 'новый сервер'}`
      : `Подписка ${tag}: ${result.error || 'доступный сервер не найден'}`;
    await refresh();
  }

  async function deleteSubscriptionPool(tag) {
    if (!tag) return;
    if (!confirm(`Удалить подписку ${tag}? Сервер в профиле и правила маршрутизации останутся на месте.`)) return;
    const result = await request('/api/subscriptions/delete', {
      method: 'POST',
      body: JSON.stringify({ tag })
    });
    state.message = result.ok
      ? `Подписка ${tag} удалена из списка. Сервер в профиле не удалялся.`
      : `Не удалось удалить подписку ${tag}`;
    await refresh();
  }

  return {
    removeOutbound,
    openServerEditor,
    closeServerEditor,
    setServerEditCountry,
    updateServerEditField,
    saveServerEdit,
    persistServerMeta,
    routeAllToOutbound,
    checkServers,
    fallbackSubscriptionPool,
    deleteSubscriptionPool
  };
}
