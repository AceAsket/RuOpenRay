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

  return { refreshAmnezia, syncAmneziaStatus };
}
