export function createCompatActions({ state, request, render, refresh, syncConfig }) {
  function syncCompatStatus(result) {
    if (!result || typeof result !== 'object') return;
    state.compatStatus = result;
    if (state.status) {
      if (result.b4) state.status.b4 = result.b4;
    }
    if (result.adguardHome && state.lanDnsStatus) state.lanDnsStatus.adguardHome = result.adguardHome;
  }

  async function refreshCompatibility({ silent = false } = {}) {
    if (!silent) {
      state.busyAction = 'refreshCompatibility';
      render();
    }
    try {
      const [result, adguard] = await Promise.all([
        request('/api/compat/status'),
        request('/api/dns/adguard').catch((error) => ({
          ...state.adguardStatus, ok: false, error: error.message || 'Не удалось проверить AdGuard Home'
        }))
      ]);
      syncCompatStatus(result);
      state.adguardStatus = adguard;
      if (!silent) state.message = 'Статус совместимости обновлен';
      return result;
    } finally {
      if (!silent && state.busyAction === 'refreshCompatibility') {
        state.busyAction = '';
      }
      render();
    }
  }

  async function controlB4(action) {
    if (!action) return null;
    const busyAction = `controlB4:${action}`;
    state.busyAction = busyAction;
    render();
    try {
      const result = await request('/api/compat/b4', {
        method: 'POST',
        body: JSON.stringify({ action })
      });
      if (result?.status && state.status) state.status.b4 = result.status;
      await refreshCompatibility({ silent: true });
      state.message = result?.ok
        ? b4ActionMessage(action, result.status)
        : (result?.message || result?.stderr || 'Не удалось выполнить действие B4');
      if (typeof refresh === 'function') refresh({ silent: true }).catch(() => {});
      return result;
    } finally {
      if (state.busyAction === busyAction) state.busyAction = '';
      render();
    }
  }

  async function b4Connect(button) {
    const api = state.compatStatus?.b4?.api || {};
    try {
      const result = await request('/api/compat/b4/connect', { method: 'POST', body: JSON.stringify({
        url: state.b4ApiUrl ?? api.url ?? 'http://127.0.0.1:7000',
        username: state.b4ApiUsername ?? api.username ?? '', password: state.b4ApiPassword || '',
        clearCredentials: button?.dataset.b4ClearCredentials === '1'
      }) });
      if (!result.ok) throw new Error(result.message || 'Не удалось подключить API B4');
      state.b4ApiUrl = undefined;
      state.b4ApiUsername = undefined;
      await refreshCompatibility({ silent: true });
      state.message = result.message;
    } finally { state.b4ApiPassword = ''; render(); }
  }

  async function b4Api(button) {
    const action = button.dataset.b4ApiAction;
    const id = button.dataset.b4SetId;
    const result = await request('/api/compat/b4/api', { method: 'POST', body: JSON.stringify({
      action, id, revision: button.dataset.b4Revision, enabled: button.dataset.b4Enabled === '1',
      domain: action === 'check-domain' ? state.b4CheckDomain : state.b4Domains?.[id]
    }) });
    if (!result.ok) throw new Error(result.message || 'Не удалось обновить B4');
    if (action === 'check-domain') state.b4DomainResult = result;
    else {
      if (action === 'add-domain' && state.b4Domains) state.b4Domains[id] = '';
      await refreshCompatibility({ silent: true });
      state.message = result.message;
    }
    render();
  }

  function b4PrepareDirect() {
    if (typeof syncConfig !== 'function') throw new Error('Редактор конфигурации не готов');
    const next = structuredClone(state.config || {});
    next.outbounds ??= [];
    const existing = next.outbounds.find((item) => item.tag === 'direct-b4');
    if (existing && existing.protocol !== 'freedom') throw new Error('Тег direct-b4 уже занят другим выходом');
    if (!existing) next.outbounds.push({ tag: 'direct-b4', protocol: 'freedom', settings: {}, streamSettings: { sockopt: { mark: 0x80000 } } });
    else {
      existing.streamSettings ??= {};
      existing.streamSettings.sockopt ??= {};
      existing.streamSettings.sockopt.mark = (Number(existing.streamSettings.sockopt.mark) || 0) | 0x80000;
    }
    syncConfig(next);
    state.message = 'Выход direct-b4 подготовлен в черновике. Выберите его для нужных правил, примените конфигурацию Xray, затем включите direct → B4. Обычный direct сохранён.';
    render();
  }

  async function b4Direct(button) {
    const result = await request('/api/compat/b4/direct', { method: 'POST', body: JSON.stringify({ enabled: button.dataset.b4DirectEnabled === '1' }) });
    if (!result.ok) throw new Error(result.message || 'Не удалось настроить direct → B4');
    await refreshCompatibility({ silent: true });
    state.message = result.message;
    render();
  }

  return { refreshCompatibility, controlB4, b4Connect, b4Api, b4PrepareDirect, b4Direct };
}

function b4ActionMessage(action, status = {}) {
  const active = status?.active ? 'активен' : 'не активен';
  const enabled = status?.service?.enabled ? 'автозапуск включен' : 'автозапуск выключен';
  const labels = {
    start: `B4 запущен, ${active}`,
    stop: 'B4 остановлен',
    restart: `B4 перезапущен, ${active}`,
    enable: `B4: ${enabled}`,
    disable: `B4: ${enabled}`,
    clear: 'Таблицы B4 очищены',
    status: 'Статус B4 обновлен'
  };
  return labels[action] || 'Действие B4 выполнено';
}
