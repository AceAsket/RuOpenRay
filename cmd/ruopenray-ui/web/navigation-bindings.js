export function bindNavigationControls({ state, render, configureLogTimer }) {
  function finishNavigation() {
    render();
    if (typeof configureLogTimer === 'function') configureLogTimer();
  }

  function closeDialogsForNavigation() {
    state.coreDialogOpen = false;
    state.installWizardOpen = false;
    state.setupWizardOpen = false;
    state.importDialog = '';
    state.amneziaImportDialog = false;
    state.routeRuleDialog = false;
    state.routeBalancerDialog = false;
    state.routePresetDialog = false;
    state.firewallPreflightPrompt = null;
  }

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      state.mobileNavOpen = false;
      finishNavigation();
    });
  });
  document.querySelectorAll('[data-tab-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tabJump;
      if (button.dataset.routingViewJump) state.routingView = button.dataset.routingViewJump;
      if (button.dataset.diagnosticsJump) state.diagnosticsView = button.dataset.diagnosticsJump;
      state.mobileNavOpen = false;
      closeDialogsForNavigation();
      finishNavigation();
    });
  });
  document.querySelectorAll('[data-diagnostics-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.diagnosticsView = button.dataset.diagnosticsView;
      finishNavigation();
    });
  });
  document.querySelectorAll('[data-amnezia-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.amneziaView = button.dataset.amneziaView || 'profiles';
      state.message = '';
      render();
    });
  });
  document.querySelectorAll('[data-import-dialog]').forEach((button) => {
    button.addEventListener('click', () => {
      state.importDialog = button.dataset.importDialog;
      state.message = '';
      render();
    });
  });
  document.querySelectorAll('[data-settings-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.settingsView = button.dataset.settingsView;
      state.message = '';
      render();
    });
  });
  document.querySelectorAll('[data-routing-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.routingView = button.dataset.routingView;
      state.message = '';
      render();
    });
  });
  document.querySelectorAll('[data-dns-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.dnsView = button.dataset.dnsView;
      state.message = '';
      render();
    });
  });
  document.querySelectorAll('[data-servers-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.serversView = button.dataset.serversView;
      state.message = '';
      render();
    });
  });
  document.querySelectorAll('[data-setup-dns-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.setupLanDnsMode = button.dataset.setupDnsMode;
      if (state.setupLanDnsMode === 'upstream' && !state.setupLanDnsUpstream) {
        state.setupLanDnsUpstream = state.lanDnsUpstream || state.lanDnsStatus?.servers?.[0] || '';
      }
      render();
    });
  });
  document.querySelectorAll('[data-setup-step]').forEach((button) => {
    button.addEventListener('click', () => {
      state.setupStep = button.dataset.setupStep || state.setupStep || 'connection';
      render();
    });
  });
  document.querySelector('[data-settings-view-select]')?.addEventListener('change', (event) => {
    const nextView = event.target.value;
    if (!nextView) return;
    state.settingsView = nextView;
    state.message = '';
    render();
  });
  const setupScenarioSearch = document.querySelector('#setupScenarioSearch');
  setupScenarioSearch?.addEventListener('input', (event) => {
    const query = String(event.target.value || '').trim().toLowerCase();
    state.setupScenarioSearch = event.target.value || '';
    document.querySelectorAll('[data-setup-scenario-row]').forEach((row) => {
      row.hidden = Boolean(query && !String(row.dataset.scenarioSearch || '').includes(query));
    });
  });
  document.querySelector('#setupScenarioTarget')?.addEventListener('change', (event) => {
    state.setupScenarioTarget = event.target.value || '';
    const detail = event.target.selectedOptions?.[0]?.dataset?.detail || '';
    const detailNode = document.querySelector('[data-setup-scenario-target-detail]');
    if (detailNode) detailNode.textContent = detail;
  });
}

export function bindModalControls() {
  document.querySelectorAll('.modal-backdrop[data-action]').forEach((backdrop) => {
    backdrop.addEventListener('pointerdown', (event) => {
      backdrop.dataset.pointerStartedInModal = event.target.closest('[data-modal]') ? '1' : '0';
    }, true);
  });
  document.querySelectorAll('[data-modal]').forEach((modal) => {
    modal.addEventListener('click', (event) => event.stopPropagation());
  });
}
