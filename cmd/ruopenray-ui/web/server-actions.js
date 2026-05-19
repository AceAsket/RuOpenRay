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
  applyConfig
}) {
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
    syncConfig(next);
    state.message = `Сервер ${tag || index + 1} удален из черновика`;
    render();
  }

  async function routeAllToOutbound(tag, { apply = true } = {}) {
    if (state.configApplying) return;
    const before = proxyRuleStrategyStats();
    setActiveProxyDraft(tag);
    const after = proxyRuleStrategyStats(tag);
    state.pendingServerTag = '';
    const switched = Math.max(before.primary, after.primary);
    const pinned = after.pinned ? `, закрепленных на других серверах не тронуто: ${after.pinned}` : '';
    if (!apply) {
      state.message = `Основное proxy-направление теперь ведет в ${tag}. Переключено правил: ${switched}${pinned}`;
      render();
      return;
    }
    state.message = `Подключаю ${tag}: меняю proxy-направление, записываю config.json и перезапускаю Xray...`;
    render();
    await applyConfig({
      successMessage: `Подключен ${tag}. Переключено правил: ${switched}${pinned}`
    });
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

  return {
    removeOutbound,
    routeAllToOutbound,
    checkServers,
    fallbackSubscriptionPool
  };
}
