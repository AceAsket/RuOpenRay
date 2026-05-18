export function bindDiagnosticsControls({
  state,
  render,
  domainMonitorFilterStorageKey,
  activeProxyTag,
  probeMonitoredDomain,
  focusSniResult,
  refreshLogs,
  configureLogTimer,
  scrollLogsToBottom,
}) {
  document.querySelectorAll('[data-domain-to-route]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.domainToRoute || '';
      const ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(value);
      state.routeKind = ip ? 'ip' : 'domain';
      state.routeValue = ip ? value : `domain:${value}`;
      state.routeName = ip ? `IP ${value}` : value;
      state.routeTargetType = 'outbound';
      state.routeOutbound = activeProxyTag() || 'proxy';
      state.routeRuleEditingIndex = -1;
      state.routeRuleMode = 'single';
      state.routeRuleDialog = true;
      render();
    });
  });
  document.querySelectorAll('[data-domain-probe]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (state.domainProbeChecking) return;
      await probeMonitoredDomain(button.dataset.domainProbe || '');
    });
  });

  document.querySelectorAll('[data-sni-map]').forEach((button) => {
    button.addEventListener('click', () => focusSniResult(button.dataset.sniMap));
  });
  document.querySelectorAll('[data-domain-sort]').forEach((button) => {
    button.addEventListener('click', () => {
      state.domainMonitorSort = button.dataset.domainSort;
      render();
    });
  });
  document.querySelectorAll('[data-domain-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.domainMonitorMode = button.dataset.domainMode;
      render();
    });
  });
  document.querySelectorAll('[data-domain-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.domainMonitorFilter = button.dataset.domainFilter;
      localStorage.setItem(domainMonitorFilterStorageKey, state.domainMonitorFilter);
      render();
    });
  });

  document.querySelector('#diagnosticsTestUrl')?.addEventListener('input', (event) => {
    state.diagnosticsTestUrl = event.target.value;
  });
  document.querySelector('#clientTrafficUrl')?.addEventListener('input', (event) => {
    state.clientTrafficUrl = event.target.value;
  });

  document.querySelector('#logKind')?.addEventListener('change', async (event) => {
    state.logKind = event.target.value;
    await refreshLogs();
  });
  document.querySelector('#logLevel')?.addEventListener('change', async (event) => {
    state.logLevel = event.target.value;
    await refreshLogs();
  });
  document.querySelector('#logSort')?.addEventListener('change', async (event) => {
    state.logSort = event.target.value;
    if (state.logSort === 'desc') state.logFollow = false;
    await refreshLogs();
  });
  document.querySelector('#logLines')?.addEventListener('input', (event) => {
    state.logLines = event.target.value;
  });
  document.querySelector('#logIntervalSec')?.addEventListener('input', (event) => {
    state.logIntervalSec = event.target.value;
    configureLogTimer();
  });
  document.querySelector('#logLive')?.addEventListener('change', (event) => {
    state.logLive = event.target.checked;
    configureLogTimer();
    render();
  });
  document.querySelector('.dashboard-log-details')?.addEventListener('toggle', (event) => {
    state.dashboardLogsOpen = event.currentTarget.open;
  });
  document.querySelector('#logFollow')?.addEventListener('change', (event) => {
    state.logFollow = event.target.checked;
    scrollLogsToBottom();
  });
  document.querySelector('#logQuery')?.addEventListener('input', (event) => {
    state.logQuery = event.target.value;
  });
  document.querySelector('#logQuery')?.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      state.logQuery = event.target.value;
      await refreshLogs();
    }
  });
  document.querySelector('#domainMonitorQuery')?.addEventListener('input', (event) => {
    state.domainMonitorQuery = event.target.value;
  });
  document.querySelector('#domainMonitorQuery')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') render();
  });

  document.querySelector('#sniTarget')?.addEventListener('input', (event) => {
    state.sniTarget = event.target.value;
  });
  document.querySelector('#sniCidr')?.addEventListener('change', (event) => {
    state.sniCidr = event.target.value;
  });
  document.querySelector('#sniTimeout')?.addEventListener('input', (event) => {
    state.sniTimeout = event.target.value;
  });
  document.querySelector('#sniThreads')?.addEventListener('input', (event) => {
    state.sniThreads = event.target.value;
  });
  document.querySelector('#sniLimit')?.addEventListener('input', (event) => {
    state.sniLimit = event.target.value;
  });
}
