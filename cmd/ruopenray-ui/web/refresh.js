export function isAuthError(error) {
  return /Authentication|authorization|авторизац/i.test(String(error?.message || ''));
}

export async function loadAppSnapshot({ request, text, logsUrl }) {
  const [
    status,
    profiles,
    config,
    logs,
    leases,
    releases,
    appRelease,
    geo,
    domainMonitor,
    logging,
    serviceSettings,
    tcpFastOpen,
    lanDns,
    firewallStatus,
    subscriptions,
    disabledRoutes
  ] = await Promise.all([
    request('/api/status'),
    request('/api/profiles'),
    request('/api/config'),
    text(logsUrl()),
    request('/api/dhcp/leases').catch(() => ({ leases: [] })),
    request('/api/core/releases').catch(() => ({ releases: [], asset: '' })),
    request('/api/app/releases').catch(() => null),
    request('/api/geo/status').catch(() => null),
    request('/api/domain-monitor?limit=1200').catch(() => null),
    request('/api/settings/logging').catch(() => null),
    request('/api/settings/service').catch(() => null),
    request('/api/network/tcp-fast-open').catch(() => null),
    request('/api/dns/lan-upstream').catch(() => null),
    request('/api/firewall/status').catch(() => null),
    request('/api/subscriptions').catch(() => ({ pools: [] })),
    request('/api/routing/disabled').catch(() => null)
  ]);
  return {
    status,
    profiles,
    config,
    logs,
    leases,
    releases,
    appRelease,
    geo,
    domainMonitor,
    logging,
    serviceSettings,
    tcpFastOpen,
    lanDns,
    firewallStatus,
    subscriptions,
    disabledRoutes
  };
}

export function createRefreshTimers({
  state,
  request,
  refreshLogs,
  refreshDomainMonitor,
  recordStatus,
  backgroundRender,
  clearAuth,
  setMessage
}) {
  function configureLogTimer() {
    if (state.logTimer) {
      clearInterval(state.logTimer);
      state.logTimer = null;
    }
    const liveLogs = state.tab === 'diagnostics' && state.diagnosticsView === 'live';
    const liveDomainMonitor = state.tab === 'diagnostics' && ['domains', 'devices'].includes(state.diagnosticsView);
    if (!state.logLive || !state.token || (!liveLogs && !liveDomainMonitor)) return;
    const interval = Math.max(1, Number(state.logIntervalSec) || 2) * 1000;
    state.logTimer = setInterval(async () => {
      try {
        if (liveLogs) {
          await refreshLogs(true, true);
        }
        if (liveDomainMonitor) {
          await refreshDomainMonitor(false);
          backgroundRender();
        }
      } catch (error) {
        if (isAuthError(error)) {
          clearAuth();
          configureLogTimer();
        }
        setMessage(error.message);
        backgroundRender();
      }
    }, interval);
  }

  function configureStatusTimer() {
    if (state.statusTimer) {
      clearInterval(state.statusTimer);
      state.statusTimer = null;
    }
    if (!state.token) return;
    state.statusTimer = setInterval(async () => {
      if (state.tab !== 'dashboard' && state.tab !== 'servers' && !(state.tab === 'diagnostics' && state.diagnosticsView === 'traffic')) return;
      try {
        const status = await request('/api/status');
        recordStatus(status);
        backgroundRender();
      } catch (error) {
        if (isAuthError(error)) {
          clearAuth();
          configureLogTimer();
          configureStatusTimer();
        }
      }
    }, 5000);
  }

  return { configureLogTimer, configureStatusTimer };
}
