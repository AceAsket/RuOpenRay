export function createConfigActions({
  state,
  request,
  render,
  refresh,
  keepOperationVisible,
  recordXrayStatsSample,
  xrayStatsResetAtStorageKey
}) {
  async function testConfig() {
    const startedAt = Date.now();
    state.configTesting = true;
    state.message = 'Проверяю конфигурацию Xray...';
    render();
    const config = JSON.parse(state.jsonDraft);
    const [result, analysis] = await Promise.all([
      request('/api/config/test', { method: 'POST', body: JSON.stringify({ config }) }),
      request('/api/config/analyze', { method: 'POST', body: JSON.stringify({ config }) })
    ]);
    state.configAnalysis = analysis;
    await keepOperationVisible(startedAt);
    state.configTesting = false;
    state.message = result.stdout || result.stderr || (result.ok ? 'Конфигурация корректна' : 'Проверка конфигурации не прошла');
    render();
  }

  async function applyConfig(options = {}) {
    const startedAt = Date.now();
    state.configApplying = true;
    state.message = options.progressMessage || state.message || 'Применяю конфигурацию: проверка, запись config.json и перезапуск Xray...';
    render();
    try {
      const parsed = JSON.parse(state.jsonDraft);
      const result = await request('/api/config/apply', { method: 'POST', body: JSON.stringify({ config: parsed }) });
      state.configAnalysis = result.analysis || null;
      state.lastApplyBackup = result.backup || state.lastApplyBackup;
      state.message = options.successMessage || result.restart?.stdout || result.test?.stdout || 'Конфигурация применена';
      await refresh({ renderAfter: false });
      await keepOperationVisible(startedAt, 900);
    } finally {
      state.configApplying = false;
      render();
    }
  }

  async function setXrayStats(enabled) {
    const result = await request('/api/xray/stats/settings', {
      method: 'POST',
      body: JSON.stringify({ enabled })
    });
    state.lastApplyBackup = result.backup || state.lastApplyBackup;
    state.configAnalysis = result.analysis || state.configAnalysis;
    state.xrayTrafficHistory = [];
    state.message = enabled
      ? 'Статистика Xray включена, сервис перезапущен'
      : 'Статистика Xray выключена, сервис перезапущен';
    await refresh();
  }

  async function resetXrayStats() {
    if (!confirm('Сбросить счетчики Xray? Это обнулит только статистику трафика в панели и не перезапустит Xray.')) return;
    const result = await request('/api/xray/stats/reset', { method: 'POST', body: JSON.stringify({}) });
    state.xrayTrafficHistory = [];
    state.xrayStatsResetAt = new Date().toISOString();
    localStorage.setItem(xrayStatsResetAtStorageKey, state.xrayStatsResetAt);
    state.status = { ...(state.status || {}), xrayStats: result };
    recordXrayStatsSample(state.status);
    state.message = result.ok ? 'Счетчики Xray сброшены' : (result.stderr || 'Не удалось сбросить счетчики Xray');
    render();
  }

  async function analyzeConfig() {
    const parsed = JSON.parse(state.jsonDraft);
    state.configAnalysis = await request('/api/config/analyze', { method: 'POST', body: JSON.stringify({ config: parsed }) });
    const errors = state.configAnalysis.errors?.length || 0;
    const warnings = state.configAnalysis.warnings?.length || 0;
    state.message = `Проверка правил: ошибок ${errors}, предупреждений ${warnings}`;
    render();
  }

  async function restoreLatestBackup() {
    const result = await request('/api/backup/restore', { method: 'POST', body: JSON.stringify({ path: state.lastApplyBackup || '' }) });
    state.configAnalysis = result.analysis || null;
    state.message = result.ok ? `Откат выполнен: ${result.path}` : result.stderr || 'Откат не удался';
    await refresh();
  }


  return {
    testConfig,
    applyConfig,
    setXrayStats,
    resetXrayStats,
    analyzeConfig,
    restoreLatestBackup
  };
}
