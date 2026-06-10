export function createAmneziaActions({ state, request, render }) {
  function syncAmneziaStatus(result) {
    if (!result || typeof result !== 'object') return;
    state.amneziaStatus = result;
    if (state.status) state.status.amnezia = result;
  }

  async function refreshAmnezia({ silent = false } = {}) {
    if (!silent) {
      state.busyAction = 'refreshAmnezia';
      render();
    }
    try {
      const result = await request('/api/amnezia/status');
      syncAmneziaStatus(result);
      if (!silent) state.message = 'Статус AmneziaWG обновлен';
      return result;
    } finally {
      if (!silent && state.busyAction === 'refreshAmnezia') {
        state.busyAction = '';
        render();
      }
    }
  }

  async function loadAmneziaConfig() {
    state.busyAction = 'loadAmneziaConfig';
    render();
    try {
      const result = await request('/api/amnezia/config');
      state.amneziaConfigText = result?.config || '';
      state.amneziaConfigLoaded = true;
      state.message = result?.exists ? 'Конфиг AmneziaWG загружен в форму.' : 'Сохраненного конфига AmneziaWG пока нет.';
      render();
      return result;
    } finally {
      if (state.busyAction === 'loadAmneziaConfig') {
        state.busyAction = '';
        render();
      }
    }
  }

  async function saveAmneziaConfig() {
    const result = await request('/api/amnezia/config', {
      method: 'POST',
      body: JSON.stringify({ config: state.amneziaConfigText || '' })
    });
    if (!result?.ok) throw new Error(result?.error || 'Не удалось сохранить конфиг AmneziaWG');
    syncAmneziaStatus(result.status);
    state.amneziaConfigLoaded = true;
    state.message = 'Конфиг AmneziaWG сохранен. Запуск станет доступен после установки совместимого kmod-amneziawg.';
    render();
  }

  async function deleteAmneziaConfig() {
    const result = await request('/api/amnezia/config/delete', { method: 'POST' });
    if (!result?.ok) throw new Error(result?.error || 'Не удалось удалить конфиг AmneziaWG');
    syncAmneziaStatus(result.status);
    state.amneziaConfigText = '';
    state.amneziaConfigLoaded = false;
    state.message = 'Конфиг AmneziaWG удален.';
    render();
  }

  return {
    refreshAmnezia,
    syncAmneziaStatus,
    loadAmneziaConfig,
    saveAmneziaConfig,
    deleteAmneziaConfig
  };
}
