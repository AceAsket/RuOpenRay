export function bindSettingsControls({
  state,
  render,
  setUiTheme,
  installPasswordStorageKey,
  githubInstallCommand,
}) {
  for (const [kind, prefix] of [['socks', 'Socks'], ['http', 'Http']]) {
    for (const [suffix, key] of Object.entries({ Enabled: 'enabled', Listen: 'listen', Port: 'port', Auth: 'auth', User: 'user', Pass: 'pass' })) {
      const checkbox = suffix === 'Enabled' || suffix === 'Auth';
      document.querySelector(`#localProxy${prefix}${suffix}`)?.addEventListener(checkbox ? 'change' : 'input', (event) => {
        state.localProxyForm = state.localProxyForm || {};
        state.localProxyForm[kind] = { ...state.localProxyForm[kind], [key]: checkbox ? event.target.checked : event.target.value };
        if (checkbox) render();
      });
    }
  }
  document.querySelector('#fullBackupPath')?.addEventListener('input', (event) => {
    state.fullBackupPath = event.target.value;
    state.fullBackupResult = null;
  });
  document.querySelector('#fullBackupPath')?.addEventListener('change', () => render());
  document.querySelectorAll('[data-logging-level]').forEach((button) => {
    button.addEventListener('click', () => {
      state.loggingSettingsEdits = (state.loggingSettingsEdits || 0) + 1;
      state.loggingLevel = button.dataset.loggingLevel;
      render();
    });
  });

  document.querySelector('#profileName')?.addEventListener('input', (event) => {
    state.profileName = event.target.value;
  });
  document.querySelector('#coreBackup')?.addEventListener('change', (event) => {
    state.coreBackup = event.target.checked;
  });
  document.querySelector('#appChannel')?.addEventListener('change', (event) => {
    state.appChannel = event.target.value === 'test' ? 'test' : 'stable';
    localStorage.setItem('ruopenray.appChannel', state.appChannel);
    state.appRelease = null;
    render();
  });
  document.querySelector('#appBackup')?.addEventListener('change', (event) => {
    state.appBackup = event.target.checked;
    render();
  });
  document.querySelector('#settingsCurrentPassword')?.addEventListener('input', (event) => {
    state.settingsCurrentPassword = event.target.value;
  });
  document.querySelector('#settingsNewPassword')?.addEventListener('input', (event) => {
    state.settingsNewPassword = event.target.value;
  });
  document.querySelector('#settingsConfirmPassword')?.addEventListener('input', (event) => {
    state.settingsConfirmPassword = event.target.value;
  });
  document.querySelectorAll('[data-ui-theme]').forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof setUiTheme === 'function') {
        setUiTheme(button.dataset.uiTheme);
        return;
      }
      state.uiTheme = button.dataset.uiTheme === 'light' ? 'light' : 'dark';
      render();
    });
  });
  document.querySelector('#installPassword')?.addEventListener('input', (event) => {
    state.installPassword = event.target.value;
    globalThis.sessionStorage?.setItem(installPasswordStorageKey, state.installPassword);
    globalThis.localStorage?.removeItem(installPasswordStorageKey);
    const basic = document.querySelector('#installCommandBasic');
    const withXray = document.querySelector('#installCommandWithXray');
    if (basic) basic.textContent = githubInstallCommand(false);
    if (withXray) withXray.textContent = githubInstallCommand(true);
  });
  const loggingToggles = ['loggingAccessLog', 'loggingErrorLog', 'loggingDnsLog', 'loggingClearOnRestart', 'loggingRestart'];
  const loggingInputs = ['loggingAccessPath', 'loggingErrorPath', 'loggingMaxSizeMb', 'loggingRotateCopies'];
  for (const field of [...loggingToggles, ...loggingInputs]) {
    const toggle = loggingToggles.includes(field);
    document.querySelector(`#${field}`)?.addEventListener(toggle ? 'change' : 'input', (event) => {
      state.loggingSettingsEdits = (state.loggingSettingsEdits || 0) + 1;
      state[field] = toggle ? event.target.checked : event.target.value;
      if (toggle) render();
    });
  }
  const serviceInputs = ['serviceStartupDelaySec', 'serviceApplyDelaySec', 'serviceGoMemLimit', 'serviceGoGC', 'serviceMirrorPrefix', 'serviceDownloadMirror'];
  for (const field of serviceInputs) {
    const select = field === 'serviceDownloadMirror';
    document.querySelector(`#${field}`)?.addEventListener(select ? 'change' : 'input', (event) => {
      state.serviceSettingsEdits = (state.serviceSettingsEdits || 0) + 1;
      state[field] = event.target.value;
      if (select) render();
    });
  }
}
