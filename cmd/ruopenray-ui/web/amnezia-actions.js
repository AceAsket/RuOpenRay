export function createAmneziaActions({ state, request, render, syncConfig }) {
  function syncAmneziaStatus(result) {
    if (!result || typeof result !== 'object') return;
    state.amneziaStatus = result;
    if (state.status) state.status.amnezia = result;
    if (result.clientConfig?.preflight) state.amneziaPreflight = result.clientConfig.preflight;
    const profiles = result.clientConfig?.profiles || {};
    if (Array.isArray(profiles.selectedIds)) {
      state.amneziaSelectedProfileIds = profiles.selectedIds.filter(Boolean);
    } else if (Array.isArray(profiles.items)) {
      state.amneziaSelectedProfileIds = profiles.items.filter((item) => item.selected || item.active).map((item) => item.id).filter(Boolean);
    }
    if (profiles.strategy) state.amneziaPoolStrategy = profiles.strategy;
    if (profiles.mode) state.amneziaIntegrationMode = profiles.mode;
    state.amneziaPolicyRules = Array.isArray(profiles.policyRules) ? profiles.policyRules : [];
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
      const activeProfile = result?.profiles?.items?.find((item) => item.active);
      state.amneziaProfileId = activeProfile?.id || '';
      state.amneziaProfileName = activeProfile?.name || state.amneziaProfileName || 'AmneziaWG';
      if (Array.isArray(result?.profiles?.selectedIds)) state.amneziaSelectedProfileIds = result.profiles.selectedIds.filter(Boolean);
      if (result?.profiles?.strategy) state.amneziaPoolStrategy = result.profiles.strategy;
      if (result?.profiles?.mode) state.amneziaIntegrationMode = result.profiles.mode;
      state.amneziaPreflight = result?.preflight || result?.clientConfig?.preflight || null;
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
      body: JSON.stringify({ id: state.amneziaProfileId || '', config: state.amneziaConfigText || '', name: state.amneziaProfileName || 'AmneziaWG' })
    });
    if (!result?.ok) throw new Error(result?.error || 'Не удалось сохранить конфиг AmneziaWG');
    syncAmneziaStatus(result.status);
    const activeProfile = result.status?.clientConfig?.profiles?.items?.find((item) => item.active);
    state.amneziaProfileId = activeProfile?.id || state.amneziaProfileId || '';
    state.amneziaProfileName = activeProfile?.name || state.amneziaProfileName || 'AmneziaWG';
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

  async function loadAmneziaProfile(button) {
    const id = button?.dataset?.amneziaProfile || '';
    const result = await request('/api/amnezia/profile/load', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    if (!result?.ok) throw new Error(result?.error || 'Не удалось загрузить профиль AmneziaWG');
    state.amneziaConfigText = result.config || '';
    const profile = result.profiles?.items?.find((item) => item.id === id);
    state.amneziaProfileId = id;
    state.amneziaProfileName = profile?.name || state.amneziaProfileName || 'AmneziaWG';
    state.amneziaPreflight = result.preflight || null;
    state.message = 'Профиль AmneziaWG загружен в редактор.';
    render();
  }

  async function activateAmneziaProfile(button) {
    const id = button?.dataset?.amneziaProfile || '';
    const result = await request('/api/amnezia/profile/activate', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    if (!result?.ok) throw new Error(result?.error || 'Не удалось активировать профиль AmneziaWG');
    syncAmneziaStatus(result.status);
    state.amneziaProfileId = id;
    if (!state.amneziaSelectedProfileIds.includes(id)) state.amneziaSelectedProfileIds = [...state.amneziaSelectedProfileIds, id].filter(Boolean);
    state.message = 'Профиль AmneziaWG выбран активным. Туннель не запускался.';
    render();
  }

  async function saveAmneziaProfilePool() {
    const result = await request('/api/amnezia/profile/pool', {
      method: 'POST',
      body: JSON.stringify({
        selectedIds: Array.isArray(state.amneziaSelectedProfileIds) ? state.amneziaSelectedProfileIds : [],
        strategy: state.amneziaPoolStrategy || 'single',
        mode: state.amneziaIntegrationMode || 'standby'
      })
    });
    if (!result?.ok) throw new Error(result?.error || 'Не удалось сохранить пул AmneziaWG');
    syncAmneziaStatus(result.status);
    state.message = 'Пул профилей AmneziaWG сохранен.';
    render();
  }

  async function saveAmneziaPolicyRules(rules) {
    const result = await request('/api/amnezia/policy', {
      method: 'POST',
      body: JSON.stringify({ rules: Array.isArray(rules) ? rules : [] })
    });
    if (!result?.ok) throw new Error(result?.error || 'Не удалось сохранить правила AmneziaWG');
    syncAmneziaStatus(result.status);
    render();
    return result;
  }

  async function deleteAmneziaPolicyRule(button) {
    const id = button?.dataset?.amneziaPolicyDelete || '';
    if (!id) return;
    const rules = (Array.isArray(state.amneziaPolicyRules) ? state.amneziaPolicyRules : []).filter((rule) => rule?.id !== id);
    await saveAmneziaPolicyRules(rules);
    state.message = 'Правило AmneziaWG удалено.';
    render();
  }

  async function deleteAmneziaProfile(button) {
    const id = button?.dataset?.amneziaProfile || '';
    const result = await request('/api/amnezia/profile/delete', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    if (!result?.ok) throw new Error(result?.error || 'Не удалось удалить профиль AmneziaWG');
    syncAmneziaStatus(result.status);
    if (state.amneziaProfileId === id) {
      state.amneziaProfileId = '';
      state.amneziaConfigText = '';
    }
    state.message = 'Профиль AmneziaWG удален.';
    render();
  }

  async function checkAmneziaPreflight() {
    const result = await request('/api/amnezia/preflight', {
      method: 'POST',
      body: JSON.stringify({ config: state.amneziaConfigText || '' })
    });
    if (!result?.ok) throw new Error(result?.error || 'Не удалось проверить AmneziaWG');
    state.amneziaPreflight = result.preflight || null;
    state.message = result.preflight?.ok ? 'Preflight AmneziaWG пройден.' : 'Preflight AmneziaWG нашел блокеры.';
    render();
  }

  async function prepareAmnezia() {
    const result = await request('/api/amnezia/prepare', {
      method: 'POST',
      body: JSON.stringify({ config: state.amneziaConfigText || '' })
    });
    if (!result?.ok) throw new Error(result?.error || 'Не удалось подготовить AmneziaWG');
    state.amneziaPreflight = result.preflight || null;
    state.message = result.message || 'Подготовка AmneziaWG проверена.';
    render();
  }

  function activeAmneziaProfileSummary() {
    const profiles = state.amneziaStatus?.clientConfig?.profiles || {};
    const items = Array.isArray(profiles.items) ? profiles.items : [];
    const selected = Array.isArray(state.amneziaSelectedProfileIds) ? state.amneziaSelectedProfileIds : [];
    return items.find((item) => item.active) || items.find((item) => selected.includes(item.id)) || items[0] || null;
  }

  function amneziaXrayOutboundDraft() {
    return {
      tag: 'out-amnezia',
      protocol: 'freedom',
      settings: {
        domainStrategy: 'UseIP'
      },
      streamSettings: {
        sockopt: {
          mark: 20992
        }
      }
    };
  }

  async function prepareAmneziaXrayOutboundDraft() {
    if (typeof syncConfig !== 'function') throw new Error('Редактор конфигурации не готов.');
    const profile = activeAmneziaProfileSummary();
    if (!profile) throw new Error('Сначала сохраните или выберите профиль AmneziaWG.');
    const next = JSON.parse(JSON.stringify(state.config || {}));
    next.outbounds = Array.isArray(next.outbounds) ? next.outbounds : [];
    const outbound = amneziaXrayOutboundDraft();
    const index = next.outbounds.findIndex((item) => item?.tag === outbound.tag);
    const existed = index >= 0;
    if (index >= 0) next.outbounds[index] = { ...next.outbounds[index], ...outbound };
    else next.outbounds.push(outbound);
    syncConfig(next);
    state.message = existed
      ? 'out-amnezia обновлен в черновике Xray. Его можно выбрать в маршрутизации.'
      : 'out-amnezia добавлен в черновик Xray. Его можно выбрать в маршрутизации.';
    render();
  }

  return {
    refreshAmnezia,
    syncAmneziaStatus,
    loadAmneziaConfig,
    saveAmneziaConfig,
    deleteAmneziaConfig,
    loadAmneziaProfile,
    activateAmneziaProfile,
    saveAmneziaProfilePool,
    saveAmneziaPolicyRules,
    deleteAmneziaPolicyRule,
    deleteAmneziaProfile,
    checkAmneziaPreflight,
    prepareAmnezia,
    prepareAmneziaXrayOutboundDraft
  };
}
