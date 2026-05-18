import { createRefreshTimers, isAuthError, loadAppSnapshot } from './refresh.js';

export function createRuntimeController({
  state,
  api,
  request,
  render,
  numberValue,
  activeProxyTag,
  syncConfig,
  proxyOutbounds,
  setActiveServerTag,
  inferredActiveProxyTag,
  syncLanDnsStatus,
  disabledRouteRulesStorageKey,
  syncLoggingSettings,
  syncServiceSettings,
  clearAuth
}) {
  function logsUrl() {
    const params = new URLSearchParams({
      kind: state.logKind,
      level: state.logLevel,
      q: state.logQuery,
      sort: 'desc',
      lines: state.logLines
    });
    return `/api/logs?${params.toString()}`;
  }
  
  function displayLogText(text) {
    if (state.logSort !== 'asc') return text;
    const lines = String(text || '').split('\n');
    if (lines.length <= 1) return text;
    return lines.reverse().join('\n');
  }
  
  async function refreshLogs(renderAfter = true, patchOnly = false) {
    state.logs = displayLogText(await api.text(logsUrl()));
    if (!renderAfter) return;
    if (patchOnly) {
      const consoles = document.querySelectorAll('.log-console');
      if (consoles.length) {
        consoles.forEach((node) => {
          node.textContent = state.logs;
        });
        scrollLogsToBottom();
        return;
      }
      return;
    }
    render();
  }
  
  async function refreshDomainMonitor(renderAfter = true) {
    state.domainMonitor = await request('/api/domain-monitor?limit=1200');
    if (renderAfter) render();
  }
  
  async function controlDomainMonitor(action) {
    const result = await request('/api/domain-monitor', {
      method: 'POST',
      body: JSON.stringify({ action })
    });
    state.message = result.stdout || result.stderr || 'SNI-монитор обновлен';
    await refreshDomainMonitor(true);
  }
  
  async function probeMonitoredDomain(host) {
    const cleanHost = String(host || '').trim();
    if (!cleanHost) return;
    state.domainProbeChecking = cleanHost;
    state.message = `Проверяю ${cleanHost}: напрямую и через proxy...`;
    render();
    try {
      const result = await request('/api/diagnostics/domain-probe', {
        method: 'POST',
        body: JSON.stringify({
          host: cleanHost,
          tag: activeProxyTag() || '',
          timeoutMs: Math.max(1500, Number(state.serverCheckTimeout || 5000))
        })
      });
      state.domainProbeResults = { ...state.domainProbeResults, [cleanHost]: result };
      state.message = `${cleanHost}: ${result.verdict?.label || 'проверено'}`;
    } catch (error) {
      state.domainProbeResults = {
        ...state.domainProbeResults,
        [cleanHost]: { ok: false, stderr: error.message, host: cleanHost }
      };
      state.message = error.message;
    } finally {
      state.domainProbeChecking = '';
      render();
    }
  }
  
  function scrollLogsToBottom() {
    if (!state.logFollow || state.logSort === 'desc') return;
    requestAnimationFrame(() => {
      document.querySelectorAll('.log-console').forEach((node) => {
        node.scrollTop = node.scrollHeight;
      });
    });
  }
  
  function shouldDeferBackgroundRender() {
    if (document.querySelector('[data-modal], .modal-backdrop')) return true;
    if (document.querySelector('details[open]:not(.dashboard-log-details)')) return true;
    if (state.tab === 'dashboard' && state.configExpanded) return true;
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    const tag = active.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable;
  }
  
  function backgroundRender() {
    if (shouldDeferBackgroundRender()) {
      state.pendingBackgroundRender = true;
      return;
    }
    state.pendingBackgroundRender = false;
    render();
  }
  
  function flushPendingBackgroundRender() {
    if (!state.pendingBackgroundRender || shouldDeferBackgroundRender()) return;
    state.pendingBackgroundRender = false;
    render();
  }
  
  function recordTrafficSample(status = state.status) {
    const traffic = status?.system?.traffic || {};
    if (!traffic.interface && traffic.rxRate === undefined && traffic.txRate === undefined) return;
    const previous = state.trafficHistory[state.trafficHistory.length - 1];
    const sample = {
      at: Date.now(),
      iface: traffic.interface || previous?.iface || 'WAN',
      rxRate: Math.max(0, numberValue(traffic.rxRate)),
      txRate: Math.max(0, numberValue(traffic.txRate)),
      rxBytes: Math.max(0, numberValue(traffic.rxBytes)),
      txBytes: Math.max(0, numberValue(traffic.txBytes))
    };
    state.trafficHistory = [...state.trafficHistory, sample].slice(-72);
  }
  
  function recordXrayStatsSample(status = state.status) {
    const stats = status?.xrayStats || {};
    if (!stats.enabled || !Array.isArray(stats.outbounds)) return;
    const active = state.activeServerTag || activeProxyTag();
    const outbound = stats.outbounds.find((item) => item.tag === active) || stats.outbounds.find((item) => item.kind === 'proxy');
    if (!outbound) return;
    const sample = {
      at: Date.now(),
      tag: outbound.tag || active || 'proxy',
      downRate: Math.max(0, numberValue(outbound.downRate)),
      upRate: Math.max(0, numberValue(outbound.upRate)),
      downlink: Math.max(0, numberValue(outbound.downlink)),
      uplink: Math.max(0, numberValue(outbound.uplink))
    };
    state.xrayTrafficHistory = [...state.xrayTrafficHistory.filter((item) => item.tag === sample.tag), sample].slice(-72);
  }
  
  function recordStatusSnapshot(status) {
    state.status = status;
    recordTrafficSample(status);
    recordXrayStatsSample(status);
  }

  const refreshTimers = createRefreshTimers({
    state,
    request,
    refreshLogs,
    refreshDomainMonitor,
    recordStatus: recordStatusSnapshot,
    backgroundRender,
    clearAuth,
    setMessage: (message) => {
      state.message = message;
    }
  });

  function configureLogTimer() {
    refreshTimers.configureLogTimer();
  }

  function configureStatusTimer() {
    refreshTimers.configureStatusTimer();
  }

  async function refresh(options = {}) {
    const renderAfter = options.renderAfter !== false;
    const background = Boolean(options.background);
    try {
      const {
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
      } = await loadAppSnapshot({ request, text: api.text, logsUrl });
      recordStatusSnapshot(status);
      state.profiles = Array.isArray(profiles) ? profiles : [];
      syncConfig(config);
      if (!state.activeServerTag || !proxyOutbounds().some((outbound) => outbound?.tag === state.activeServerTag)) {
        setActiveServerTag(inferredActiveProxyTag());
      }
      state.logs = displayLogText(logs);
      state.leases = leases.leases || [];
      state.leasesSource = leases.source || '';
      state.coreReleases = releases.releases || [];
      state.coreAsset = releases.asset || '';
      state.coreArch = releases.arch || null;
      state.appRelease = appRelease?.release || null;
      if (!state.selectedCoreVersion) {
        const latestStable = state.coreReleases.find((release) => release.assetUrl && !release.prerelease);
        const latestInstallable = state.coreReleases.find((release) => release.assetUrl);
        state.selectedCoreVersion = latestStable?.tag || latestInstallable?.tag || state.coreReleases[0]?.tag || '';
      }
      state.geoStatus = geo;
      state.domainMonitor = domainMonitor;
      state.tcpFastOpen = tcpFastOpen;
      syncLanDnsStatus(lanDns);
      state.firewallStatus = firewallStatus;
      state.subscriptionPools = Array.isArray(subscriptions?.pools) ? subscriptions.pools : [];
      if (Array.isArray(disabledRoutes?.rules)) {
        state.disabledRouteRules = disabledRoutes.rules.filter((item) => item && item.rule);
        localStorage.setItem(disabledRouteRulesStorageKey, JSON.stringify(state.disabledRouteRules));
      }
      syncLoggingSettings(logging);
      syncServiceSettings(serviceSettings);
      state.geoCustomSources = Array.isArray(geo?.customSources) ? geo.customSources : state.geoCustomSources;
      if (geo?.schedule && !state.geoScheduleLoaded) {
        const schedule = geo.schedule;
        state.geoScheduleLoaded = true;
        state.geoScheduleEnabled = Boolean(schedule.enabled);
        state.geoScheduleInterval = schedule.interval || 'weekly';
        state.geoScheduleWeekday = String(schedule.weekday ?? '0');
        state.geoScheduleTime = schedule.time || '04:20';
        state.geoBackup = schedule.backup !== false;
        const scheduledPresets = Array.isArray(schedule.presets) ? schedule.presets : [schedule.preset || 'loyalsoldier'];
        const presetList = Array.isArray(geo?.presets) ? geo.presets : [];
        const base = scheduledPresets.find((id) => presetList.find((preset) => preset.id === id && preset.mode !== 'extra-geosite')) || 'loyalsoldier';
        state.geoBasePreset = base;
        state.geoPreset = base;
        state.geoExtraPresets = scheduledPresets.filter((id) => presetList.find((preset) => preset.id === id && preset.mode === 'extra-geosite'));
        state.geoCustomSourceIds = Array.isArray(schedule.customSourceIds) ? schedule.customSourceIds : [];
      }
      if (renderAfter) {
        if (background) backgroundRender();
        else render();
      }
    } catch (error) {
      if (isAuthError(error)) {
        clearAuth();
        configureLogTimer();
        configureStatusTimer();
      }
      state.message = error.message;
      if (renderAfter) {
        if (background) backgroundRender();
        else render();
      }
    }
  }

  return {
    logsUrl,
    displayLogText,
    refreshLogs,
    refreshDomainMonitor,
    controlDomainMonitor,
    probeMonitoredDomain,
    scrollLogsToBottom,
    shouldDeferBackgroundRender,
    backgroundRender,
    flushPendingBackgroundRender,
    recordTrafficSample,
    recordXrayStatsSample,
    recordStatusSnapshot,
    configureLogTimer,
    configureStatusTimer,
    refresh
  };
}
