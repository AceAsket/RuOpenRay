export function createSettingsActions({
  state,
  request,
  render,
  refresh,
  refreshLogs,
  configureLogTimer,
  configureStatusTimer,
  syncLoggingSettings,
  syncServiceSettings,
  savedPasswordStorageKey
}) {
  async function login(event) {
    event.preventDefault();
    const passwordInput = document.querySelector('#password');
    const rememberInput = document.querySelector('#rememberPassword');
    state.password = passwordInput?.value || state.password;
    state.rememberPassword = Boolean(rememberInput?.checked);
    try {
      const result = await request('/api/login', {
        method: 'POST',
        body: JSON.stringify({ password: state.password })
      });
      state.token = result.token;
      localStorage.setItem('openray_token', result.token);
      if (state.rememberPassword) localStorage.setItem(savedPasswordStorageKey, state.password);
      else localStorage.removeItem(savedPasswordStorageKey);
      state.message = '';
      configureLogTimer();
      configureStatusTimer();
      await refresh();
    } catch (error) {
      state.message = error.message;
      render();
    }
  }

  function logout() {
    state.token = '';
    localStorage.removeItem('openray_token');
    state.message = '';
    state.tab = 'dashboard';
    render();
  }

  async function changePanelPassword() {
    if (!state.settingsNewPassword || state.settingsNewPassword.length < 8) {
      state.message = 'Новый пароль должен быть не короче 8 символов';
      render();
      return;
    }
    if (state.settingsNewPassword !== state.settingsConfirmPassword) {
      state.message = 'Пароли не совпадают';
      render();
      return;
    }
    state.settingsPasswordSaving = true;
    state.message = 'Сохраняю пароль панели...';
    render();
    try {
      const result = await request('/api/settings/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: state.settingsCurrentPassword,
          newPassword: state.settingsNewPassword,
          confirmPassword: state.settingsConfirmPassword
        })
      });
      if (!result.ok) {
        state.message = result.stderr || 'Не удалось изменить пароль';
      } else {
        state.token = '';
        localStorage.removeItem('openray_token');
        state.password = '';
        state.settingsCurrentPassword = '';
        state.settingsNewPassword = '';
        state.settingsConfirmPassword = '';
        state.message = 'Пароль изменён. Войдите заново.';
      }
    } finally {
      state.settingsPasswordSaving = false;
    }
    render();
  }

  async function saveLoggingSettings() {
    state.loggingSaving = true;
    state.message = 'Сохраняю настройки логирования...';
    render();
    try {
      const result = await request('/api/settings/logging', {
        method: 'POST',
        body: JSON.stringify({
          level: state.loggingLevel,
          accessLog: state.loggingAccessLog,
          accessPath: state.loggingAccessPath,
          errorLog: state.loggingErrorLog,
          errorPath: state.loggingErrorPath,
          dnsLog: state.loggingDnsLog,
          maxSizeMb: Number(state.loggingMaxSizeMb) || 2,
          rotateCopies: Number(state.loggingRotateCopies) || 0,
          clearOnRestart: state.loggingClearOnRestart,
          restart: state.loggingRestart
        })
      });
      syncLoggingSettings(result.settings);
      state.message = result.stdout || result.restart?.stdout || 'Настройки логирования сохранены';
      await refreshLogs(true, true).catch(() => {});
    } finally {
      state.loggingSaving = false;
    }
    render();
  }

  async function clearLoggingFiles() {
    state.loggingSaving = true;
    state.message = 'Очищаю файлы логов...';
    render();
    try {
      const result = await request('/api/settings/logging/clear', { method: 'POST', body: '{}' });
      syncLoggingSettings(result.settings);
      state.logs = '';
      state.message = result.stdout || 'Логи очищены';
    } finally {
      state.loggingSaving = false;
    }
    render();
  }

  async function refreshDhcpLeases() {
    const result = await request('/api/dhcp/leases');
    state.leases = result.leases || [];
    state.leasesSource = result.source || '';
    state.message = state.leases.length
      ? `DHCP leases обновлены: ${state.leases.length}`
      : 'DHCP leases пока не найдены';
    render();
  }

  async function saveServiceSettings() {
    state.serviceSettingsSaving = true;
    state.message = 'Сохраняю настройки сервиса...';
    render();
    try {
      const result = await request('/api/settings/service', {
        method: 'POST',
        body: JSON.stringify({
          startupDelaySec: Number(state.serviceStartupDelaySec) || 0,
          applyDelaySec: Number(state.serviceApplyDelaySec) || 0,
          goMemLimit: state.serviceGoMemLimit,
          goGC: Number(state.serviceGoGC) || 60,
          downloadMirror: state.serviceDownloadMirror,
          mirrorPrefix: state.serviceMirrorPrefix
        })
      });
      syncServiceSettings(result.settings);
      state.message = result.stdout || 'Настройки сервиса сохранены';
    } finally {
      state.serviceSettingsSaving = false;
    }
    render();
  }

  async function setSystemTcpFastOpen(enabled) {
    state.tcpFastOpenSaving = true;
    state.message = enabled ? 'Включаю TCP Fast Open в системе...' : 'Выключаю TCP Fast Open в системе...';
    render();
    try {
      const result = await request('/api/network/tcp-fast-open', {
        method: 'POST',
        body: JSON.stringify({ enabled })
      });
      state.tcpFastOpen = result.status || result;
      state.message = result.stdout || (enabled ? 'TCP Fast Open включен в системе' : 'TCP Fast Open выключен в системе');
    } finally {
      state.tcpFastOpenSaving = false;
    }
    render();
  }

  async function service(action) {
    const result = await request('/api/service', { method: 'POST', body: JSON.stringify({ action }) });
    const actionLabels = { start: 'запущен', stop: 'остановлен', restart: 'перезапущен' };
    state.message = result.stdout || result.stderr || `Сервис ${actionLabels[action] || action}`;
    await refresh();
  }

  return {
    login,
    logout,
    changePanelPassword,
    saveLoggingSettings,
    clearLoggingFiles,
    refreshDhcpLeases,
    saveServiceSettings,
    setSystemTcpFastOpen,
    service
  };
}
