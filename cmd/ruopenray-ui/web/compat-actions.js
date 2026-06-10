export function createCompatActions({ state, request, render, refresh }) {
  function syncCompatStatus(result) {
    if (!result || typeof result !== 'object') return;
    state.compatStatus = result;
    if (state.status) {
      if (result.podkop) state.status.podkop = result.podkop;
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
      const result = await request('/api/compat/status');
      syncCompatStatus(result);
      if (!silent) state.message = 'Статус совместимости обновлен';
      return result;
    } finally {
      if (!silent && state.busyAction === 'refreshCompatibility') {
        state.busyAction = '';
        render();
      }
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

  return { refreshCompatibility, controlB4 };
}

function b4ActionMessage(action, status = {}) {
  const active = status?.active ? 'активен' : 'не активен';
  const enabled = status?.service?.enabled ? 'автозапуск включен' : 'автозапуск выключен';
  const labels = {
    start: `B4 запущен, ${active}`,
    stop: 'B4 остановлен, таблицы очищены',
    restart: `B4 перезапущен, ${active}`,
    enable: `B4: ${enabled}`,
    disable: `B4: ${enabled}`,
    clear: 'Таблицы B4 очищены',
    status: 'Статус B4 обновлен'
  };
  return labels[action] || 'Действие B4 выполнено';
}
