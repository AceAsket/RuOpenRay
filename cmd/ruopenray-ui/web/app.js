import { hiddenBuiltinRoutePresetKeys, labels, managedRouteTags, nav, routeBundles, routeKinds, routePlaceholders, routePresets, tabTitles } from './presets.js';
import { bindActionControls } from './action-bindings.js';
import { createApiClient } from './api-client.js';
import { createAuxPanelsView } from './aux-panels-view.js';
import { bindConfigControls } from './config-bindings.js';
import { createConfigStateHelpers } from './config-state.js';
import { createDashboardView } from './dashboard-view.js';
import { createDevicesModel } from './devices-model.js';
import { createDiagnosticsActions } from './diagnostics-actions.js';
import { createDiagnosticsModel } from './diagnostics-model.js';
import { createDiagnosticsView } from './diagnostics-view.js';
import { createDnsModel } from './dns-model.js';
import { createDnsView } from './dns-view.js';
import { createGeoView } from './geo-view.js';
import { createFirewallModel } from './firewall-model.js';
import { byteRate, byteSize, escapeHtml, fmtUptime, formatDuration, formatDurationCompact, numberValue } from './formatters.js';
import { createImportDialogView } from './import-dialog-view.js';
import { bindImportControls } from './import-bindings.js';
import { bindModalControls, bindNavigationControls } from './navigation-bindings.js';
import { bindProfileControls } from './profile-bindings.js';
import { createSettingsView } from './settings-view.js';
import { createRefreshTimers, isAuthError, loadAppSnapshot } from './refresh.js';
import { createRoutingView } from './routing-view.js';
import { createRoutingDialogsView } from './routing-dialogs-view.js';
import { createRoutingDsl } from './routing-dsl.js';
import { createRoutingModel } from './routing-model.js';
import { bindServerCheckControls } from './server-check-bindings.js';
import { createServerModel } from './server-model.js';
import { createServersView } from './servers-view.js';
import { createSetupView } from './setup-view.js';
import { createSniView } from './sni-view.js';
import { createInitialState } from './state.js';
import { createXrayConfigModel } from './xray-config-model.js';
import {
  customRoutePresetsStorageKey,
  disabledRouteRulesStorageKey,
  domainMonitorFilterStorageKey,
  firewallBlockQuicStorageKey,
  firewallBypassModeStorageKey,
  firewallDeviceModeStorageKey,
  firewallPortModeStorageKey,
  firewallPortsStorageKey,
  firewallRouterModeStorageKey,
  firewallSelectedDevicesStorageKey,
  installPasswordStorageKey,
  loadDisabledRouteRules,
  savedPasswordStorageKey,
  setupSnapshotStorageKey,
  shellQuote,
  xrayStatsResetAtStorageKey
} from './storage.js';

const app = document.querySelector('#app');

const state = createInitialState();

function clearAuth() {
  state.token = '';
  localStorage.removeItem('openray_token');
}

const api = createApiClient({
  getToken: () => state.token,
  onUnauthorized: clearAuth
});

async function keepOperationVisible(startedAt, minMs = 700) {
  const elapsed = Date.now() - startedAt;
  if (elapsed < minMs) await delay(minMs - elapsed);
}

async function request(path, options = {}) {
  return api.request(path, options);
}



const {
  syncConfig,
  syncLoggingSettings,
  syncServiceSettings,
  syncLanDnsStatus,
  lanDnsModeLabel
} = createConfigStateHelpers(state);

const routingModel = createRoutingModel({
  state,
  managedRouteTags,
  routeBundles,
  routeKinds,
  routePresets,
  proxyOutbounds: () => proxyOutbounds()
});
const {
  routeRules,
  routeBalancers,
  outboundOptions,
  balancerOptions,
  routeTargetOptions,
  encodedRouteTarget,
  splitRouteValues,
  routeTarget,
  routeRuleKey,
  compactRouteValue,
  readableRouteTag,
  routeTagValue,
  isRuOpenRayManagedRoute,
  routeRuleName,
  setRouteRuleName,
  copyRouteRuleName,
  describeRouteRule,
  routeStats,
  routeSectionDefinitions,
  routeCategoryForRule,
  routeRuleSource,
  routeStatsFor
} = routingModel;

function setRoutingDraft(rules) {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  next.routing = next.routing && typeof next.routing === 'object' ? next.routing : {};
  next.routing.rules = rules;
  syncConfig(next);
}

function setRouteBalancersDraft(balancers) {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  next.routing = next.routing && typeof next.routing === 'object' ? next.routing : {};
  next.routing.balancers = balancers;
  syncConfig(next);
}

function cloneRules(rules) {
  return JSON.parse(JSON.stringify(Array.isArray(rules) ? rules : []));
}

function cloneOutboundWithTag(outbound, tag) {
  const next = JSON.parse(JSON.stringify(outbound || {}));
  next.tag = tag;
  return next;
}

function saveDisabledRouteRules() {
  localStorage.setItem(disabledRouteRulesStorageKey, JSON.stringify(state.disabledRouteRules));
  if (!state.token) return;
  request('/api/routing/disabled', {
    method: 'POST',
    body: JSON.stringify({ rules: state.disabledRouteRules })
  }).catch((error) => {
    state.message = error.message || 'Не удалось сохранить отключенные правила на роутере';
    render();
  });
}

async function refreshDisabledRouteRules() {
  try {
    const result = await request('/api/routing/disabled');
    if (Array.isArray(result.rules)) {
      state.disabledRouteRules = result.rules.filter((item) => item && item.rule);
      localStorage.setItem(disabledRouteRulesStorageKey, JSON.stringify(state.disabledRouteRules));
    }
  } catch {
    state.disabledRouteRules = loadDisabledRouteRules();
  }
}



const xrayConfigModel = createXrayConfigModel(state);
const {
  configInbounds,
  configOutbounds,
  advancedInbounds,
  currentSnifferSettings,
  tcpFastOpenDraftEnabled,
  currentDnsMode,
  outboundAddress,
  outboundTransport
} = xrayConfigModel;

const serverModel = createServerModel({
  state,
  configOutbounds,
  routeRules,
  routeBalancers,
  routeTarget,
  outboundAddress,
  outboundTransport,
  outboundMatchesSelectors,
  observatorySelectors,
  burstObservatorySelectors,
  strategyObserverType,
  observerLabel,
  checkForTag,
  checkLabel,
  ruleCountLabel,
  escapeHtml,
  splitRouteValues
});
const {
  outboundUsage,
  serverStats,
  isSystemOutbound,
  proxyOutbounds,
  inferredActiveProxyTag,
  activeProxyTag,
  activeProxyOutbound,
  setActiveServerTag,
  proxyRuleStrategyStats,
  proxyRuleSampleLabel,
  proxyDirectionSummary,
  proxyDirectionTitle,
  proxyDirectionDetail,
  dashboardProxyDirectionCards,
  balancerSelectorMatches,
  balancerTargetOptions,
  balancerMatchesTag,
  serverSubscriptionPool,
  serverBalancerLinks,
  serverObserverLabels,
  serverMetaChips,
  balancerObserverSummary,
  balancerMembersView
} = serverModel;

function setSnifferDraft(mode, patch = {}) {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  const targets = advancedInbounds().map((item) => item?.tag).filter(Boolean);
  next.inbounds = Array.isArray(next.inbounds) ? next.inbounds : [];
  const current = currentSnifferSettings();
  const enabled = mode !== 'off';
  const destOverride = mode === 'http-tls-quic' ? ['http', 'tls', 'quic'] : ['http', 'tls'];
  const domainsExcluded = String(patch.excluded ?? current.excluded ?? '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  const routeOnly = patch.routeOnly ?? current.routeOnly;
  next.inbounds = next.inbounds.map((inbound) => {
    if (targets.length && !targets.includes(inbound?.tag)) return inbound;
    if (!targets.length && inbound?.protocol === 'api') return inbound;
    const item = { ...inbound };
    if (!enabled) {
      item.sniffing = { ...(item.sniffing || {}), enabled: false };
      delete item.sniffing.destOverride;
      delete item.sniffing.domainsExcluded;
      delete item.sniffing.routeOnly;
      return item;
    }
    item.sniffing = {
      ...(item.sniffing || {}),
      enabled: true,
      destOverride,
      routeOnly: Boolean(routeOnly)
    };
    if (domainsExcluded.length) item.sniffing.domainsExcluded = domainsExcluded;
    else delete item.sniffing.domainsExcluded;
    return item;
  });
  syncConfig(next);
  state.message = enabled ? 'Сниффер обновлен в черновике. Проверьте конфигурацию и примените.' : 'Сниффер выключен в черновике.';
  render();
}

function setTcpFastOpenDraft(enabled) {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  const proxyTags = new Set(proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean));
  next.outbounds = (Array.isArray(next.outbounds) ? next.outbounds : []).map((outbound) => {
    if (!proxyTags.has(outbound?.tag)) return outbound;
    const item = { ...outbound, streamSettings: { ...(outbound.streamSettings || {}) } };
    item.streamSettings.sockopt = { ...(item.streamSettings.sockopt || {}), tcpFastOpen: Boolean(enabled) };
    return item;
  });
  const transparentTags = new Set(advancedInbounds().map((inbound) => inbound?.tag).filter(Boolean));
  next.inbounds = (Array.isArray(next.inbounds) ? next.inbounds : []).map((inbound) => {
    if (transparentTags.size && !transparentTags.has(inbound?.tag)) return inbound;
    if (!transparentTags.size && inbound?.protocol === 'api') return inbound;
    const item = { ...inbound, streamSettings: { ...(inbound.streamSettings || {}) } };
    item.streamSettings.sockopt = { ...(item.streamSettings.sockopt || {}), tcpFastOpen: Boolean(enabled) };
    return item;
  });
  syncConfig(next);
  state.message = enabled ? 'TCP Fast Open добавлен в черновик Xray.' : 'TCP Fast Open выключен в черновике Xray.';
  render();
}

function setDnsModeDraft(mode) {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  next.dns = next.dns && typeof next.dns === 'object' ? next.dns : {};
  next.dns.servers = Array.isArray(next.dns.servers) ? next.dns.servers : [];
  if (mode === 'fakedns') {
    next.dns.fakeDNS = next.dns.fakeDNS?.length ? next.dns.fakeDNS : [{ ipPool: '198.18.0.0/15', poolSize: 65535 }];
    if (!next.dns.servers.some((server) => typeof server === 'object' && server?.address === 'fakedns')) {
      next.dns.servers.unshift({ address: 'fakedns', domains: ['geosite:geolocation-!cn'] });
    }
    const current = currentSnifferSettings();
    const targets = new Set(advancedInbounds().map((inbound) => inbound?.tag).filter(Boolean));
    const destOverride = current.mode === 'http-tls-quic' ? ['http', 'tls', 'quic', 'fakedns'] : ['http', 'tls', 'fakedns'];
    const domainsExcluded = String(current.excluded || '').split(/\n|,/).map((item) => item.trim()).filter(Boolean);
    next.inbounds = (Array.isArray(next.inbounds) ? next.inbounds : []).map((inbound) => {
      if (targets.size && !targets.has(inbound?.tag)) return inbound;
      if (!targets.size && inbound?.protocol === 'api') return inbound;
      const item = { ...inbound };
      item.sniffing = { ...(item.sniffing || {}), enabled: true, destOverride, routeOnly: true };
      if (domainsExcluded.length) item.sniffing.domainsExcluded = domainsExcluded;
      return item;
    });
    syncConfig(next);
    state.message = 'FakeDNS подготовлен в черновике. Это advanced-режим: проверьте DNS/TProxy перед применением.';
    render();
    return;
  }
  delete next.dns.fakeDNS;
  next.dns.servers = next.dns.servers.filter((server) => !(typeof server === 'object' && server?.address === 'fakedns'));
  syncConfig(next);
  state.message = 'DNS-режим возвращен к обычному черновику.';
  render();
}

function resolveRoutingAlias(tag) {
  const value = String(tag || '').trim();
  if (value === 'proxy') return activeProxyTag() || 'proxy';
  return value;
}

const routingDsl = createRoutingDsl({
  state,
  escapeHtml,
  resolveRoutingAlias,
  routeStatsFor
});
const {
  parseRoutingDsl,
  isDslDefaultRule,
  dslPreviewStats,
  dslPreviewView
} = routingDsl;

function previewRoutingDsl() {
  state.routeDslPreview = parseRoutingDsl(state.routeDsl);
  const parsed = state.routeDslPreview;
  state.message = `Распознано правил: ${parsed.rules.length}${parsed.warnings.length ? `, предупреждений: ${parsed.warnings.length}` : ''}`;
  render();
}

function configAnalysisView() {
  const analysis = state.configAnalysis;
  if (!analysis) return '';
  const counts = analysis.counts || {};
  const lines = [
    ...(analysis.errors || []).map((text) => ['error', text]),
    ...(analysis.warnings || []).map((text) => ['warn', text]),
    ...(analysis.info || []).map((text) => ['info', text])
  ];
  return `
    <div class="config-analysis ${analysis.ok ? 'ok' : 'bad'}">
      <div class="analysis-head">
        <strong>${analysis.ok ? 'Правила выглядят согласованно' : 'Есть ошибки в правилах'}</strong>
        <span>${counts.total || 0} правил · proxy ${counts.proxy || 0} · direct ${counts.direct || 0} · block ${counts.block || 0} · другое ${counts.other || 0}</span>
      </div>
      ${lines.length ? `<ul>${lines.slice(0, 8).map(([kind, text]) => `<li class="${kind}">${escapeHtml(text)}</li>`).join('')}${lines.length > 8 ? `<li class="info">Еще ${lines.length - 8} сообщений...</li>` : ''}</ul>` : '<p class="muted">Отсутствующие geo-файлы и несуществующие outboundTag не найдены.</p>'}
    </div>
  `;
}

function applyRoutingDsl(mode, closeDialog = false) {
  const parsed = parseRoutingDsl(state.routeDsl);
  state.routeDslPreview = parsed;
  if (!parsed.rules.length) {
    state.message = 'Не нашёл правил для импорта';
    render();
    return;
  }
  const nextRules = mode === 'append' ? [...routeRules(), ...parsed.rules] : parsed.rules;
  setRoutingDraft(nextRules);
  const listName = state.routeDslName.trim();
  if (listName) {
    parsed.rules
      .filter((rule) => !isDslDefaultRule(rule, parsed))
      .forEach((rule) => setRouteRuleName(rule, listName));
  }
  state.message = mode === 'append'
    ? `Добавлено правил: ${parsed.rules.length}${listName ? ` · список «${listName}»` : ''}. Проверьте конфигурацию и примените изменения.`
    : `Черновик маршрутизации заменен: ${parsed.rules.length}${listName ? ` · список «${listName}»` : ''}. Проверьте конфигурацию и примените изменения.`;
  if (closeDialog) {
    state.routeRuleDialog = false;
    state.routeRuleMode = 'single';
  }
  render();
}

function checkForTag(tag) {
  return state.serverChecks[tag] || null;
}

function checkLabel(result) {
  if (!result) return 'не проверялся';
  if (result.skipped) return 'нет TCP-цели';
  if (result.ok) return `${result.latencyMs || 0} мс`;
  return 'нет ответа';
}

function checkMethodLabel(result) {
  if (!result) return 'не проверен';
  if (result.method === 'http') return 'HTTP';
  return 'TCP-порт';
}

function proxyInboundTags() {
  const tags = configInbounds()
    .map((item) => item?.tag)
    .filter((tag) => tag && /transparent|rule|socks|http/.test(tag));
  return tags.length ? [...new Set(tags)] : undefined;
}

const devicesModel = createDevicesModel({
  state,
  routeRules,
  routeRuleName,
  describeRouteRule,
  splitRouteValues,
  escapeHtml,
  formatDuration
});
const {
  leaseByIp,
  leaseSearchText,
  routeLeasePicker,
  deviceRules,
  deviceStats,
  normalizeDeviceIp
} = devicesModel;

const dnsModel = createDnsModel({ state });
const {
  dnsConfig,
  describeDnsServer,
  dnsAddressHasPort,
  normalizeDnsAddressInput,
  dnsStats,
  dnsAnswerText
} = dnsModel;

const firewallModel = createFirewallModel({
  state,
  configInbounds,
  configOutbounds,
  routeRules,
  splitRouteValues,
  deviceRules,
  routeRuleName,
  describeRouteRule
});
const {
  firewallInfo,
  firewallPorts,
  firewallDeviceChoices,
  firewallSelectedDevices,
  firewallPolicyPreview,
  firewallCommands,
  firewallPayload,
  firewallReadyStatus
} = firewallModel;

async function applyFirewallWithRetry(attempts = 2) {
  let lastResult = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await delay(1200);
    lastResult = await request('/api/firewall/apply', {
      method: 'POST',
      body: JSON.stringify(firewallPayload())
    });
    state.firewallStatus = lastResult.status || lastResult;
    if (lastResult.ok && firewallReadyStatus(state.firewallStatus)) return lastResult;

    await delay(800);
    const status = await request('/api/firewall/status').catch(() => null);
    if (status) state.firewallStatus = status;
    if (firewallReadyStatus(state.firewallStatus)) {
      return { ok: true, status: state.firewallStatus, retried: attempt > 0 };
    }
  }
  return lastResult || { ok: false, status: state.firewallStatus };
}

async function applyFirewall() {
  state.firewallSaving = true;
  render();
  try {
    const result = await request('/api/firewall/apply', {
      method: 'POST',
      body: JSON.stringify(firewallPayload())
    });
    state.firewallStatus = result.status || result;
    state.message = result.ok
      ? 'Перехват применен и сохранен для перезапуска firewall'
      : (result.error || 'Не удалось применить перехват');
  } finally {
    state.firewallSaving = false;
    render();
  }
}

async function disableFirewall() {
  state.firewallSaving = true;
  render();
  try {
    const result = await request('/api/firewall/disable', { method: 'POST' });
    state.firewallStatus = result.status || result;
    state.message = result.ok ? 'Перехват отключен' : 'Не удалось полностью отключить перехват';
  } finally {
    state.firewallSaving = false;
    render();
  }
}

async function refreshFirewallStatus() {
  state.firewallStatus = await request('/api/firewall/status');
  render();
}

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

async function openInstallWizard() {
  state.installWizardOpen = true;
  state.installStep = 'plan';
  state.message = '';
  render();
  try {
    state.installPlan = await request('/api/install/plan');
  } catch (error) {
    state.installPlan = { ok: false, error: error.message, steps: [] };
  }
  render();
}

function setupReadiness() {
  const status = state.status || {};
  const geo = state.geoStatus || {};
  const firewall = state.firewallStatus || {};
  const lanDns = state.lanDnsStatus || {};
  const transparent = firewallInfo();
  const dnsReadiness = lanDns.readiness || {};
  const proxyCount = proxyOutbounds().length;
  const items = [
    {
      key: 'core',
      ok: Boolean(status.core?.available),
      title: 'Xray установлен',
      detail: status.core?.available ? String(status.core.version || '').split('\n')[0] : 'Нужен пакет xray-core и зависимости TPROXY.'
    },
    {
      key: 'geo',
      ok: Boolean(geo.geoip?.exists && geo.geosite?.exists),
      warn: Boolean(geo.geoip?.exists || geo.geosite?.exists),
      title: 'Geo-файлы готовы',
      detail: geo.geoip?.exists && geo.geosite?.exists
        ? `${byteSize(geo.geoip.size)} geoip.dat · ${byteSize(geo.geosite.size)} geosite.dat`
        : 'Для правил geoip/geosite нужны geoip.dat и geosite.dat.'
    },
    {
      key: 'servers',
      ok: proxyCount > 0,
      title: 'Proxy-сервер добавлен',
      detail: proxyCount ? `${proxyCount} proxy-направлений в конфигурации` : 'Добавьте VLESS/Vmess/Trojan/SS-сервер или подписку.'
    },
    {
      key: 'transparent',
      ok: Boolean(transparent.ready),
      warn: Boolean(transparent.transparent.length),
      title: 'Transparent inbound',
      detail: transparent.ready
        ? `Порт ${transparent.transparentPort}, dns-out и local bypass найдены`
        : 'Мастер подготовит inbound transparent_ipv4, dns-out и базовые bypass-правила.'
    },
    {
      key: 'firewall',
      ok: Boolean(firewall.active && firewall.persistent && !firewall.needsPolicyFix),
      warn: Boolean(firewall.active),
      title: 'Перехват nftables',
      detail: firewall.active
        ? `${firewall.routerMode || state.firewallRouterMode} · ${firewall.persistent ? 'сохранен' : 'только до перезапуска'}`
        : 'Нужно применить nftables и policy routing из RuOpenRay.'
    },
    {
      key: 'dns',
      ok: Boolean(dnsReadiness.ready && lanDns.mode === 'xray'),
      warn: Boolean(dnsReadiness.inbound || lanDns.mode === 'upstream'),
      title: 'LAN DNS',
      detail: lanDns.mode === 'xray'
        ? 'dnsmasq направлен на Xray DNS.'
        : lanDns.mode === 'upstream'
          ? `dnsmasq направлен на внешний DNS: ${(lanDns.servers || []).join(', ') || state.lanDnsUpstream || 'не задан'}`
          : 'Можно оставить OpenWrt DNS как есть или направить dnsmasq на Xray.'
    }
  ];
  const required = items.filter((item) => ['core', 'geo', 'servers', 'transparent', 'firewall'].includes(item.key));
  return {
    items,
    ready: required.every((item) => item.ok),
    canApply: Boolean(status.core?.available && proxyCount > 0)
  };
}

function loadSetupSnapshot() {
  if (state.setupSnapshot) return state.setupSnapshot;
  try {
    const snapshot = JSON.parse(localStorage.getItem(setupSnapshotStorageKey) || 'null');
    if (snapshot && snapshot.config) {
      state.setupSnapshot = snapshot;
      return snapshot;
    }
  } catch {}
  return null;
}

function saveSetupSnapshot(snapshot) {
  state.setupSnapshot = snapshot;
  try {
    localStorage.setItem(setupSnapshotStorageKey, JSON.stringify(snapshot));
  } catch {}
}

function clearSetupSnapshot() {
  state.setupSnapshot = null;
  state.setupRollbackResult = null;
  localStorage.removeItem(setupSnapshotStorageKey);
}

async function captureSetupSnapshot() {
  const [config, firewall, lanDns] = await Promise.all([
    request('/api/config'),
    request('/api/firewall/snapshot').catch(async () => ({ status: await request('/api/firewall/status').catch(() => null) })),
    request('/api/dns/lan-upstream').catch(() => null)
  ]);
  const snapshot = {
    createdAt: new Date().toISOString(),
    config,
    firewall,
    lanDns
  };
  saveSetupSnapshot(snapshot);
  return snapshot;
}

function lanDnsRestorePayload(lanDns) {
  const mode = lanDns?.mode || 'system';
  if (mode === 'xray') return { mode: 'xray', restart: true };
  if (mode === 'upstream') return { mode: 'upstream', upstream: (lanDns.servers || [])[0] || '', restart: true };
  return { mode: 'system', restart: true };
}

function privateBypassCidrs() {
  return ['10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16', '224.0.0.0/3', '::1/128', 'fc00::/7', 'fe80::/10'];
}

function normalizePrivateBypassRules(config) {
  const cidrs = privateBypassCidrs();
  const rules = Array.isArray(config?.routing?.rules) ? config.routing.rules : [];
  for (const rule of rules) {
    if (!Array.isArray(rule.ip)) continue;
    if (!rule.ip.includes('geoip:private')) continue;
    rule.ip = [...new Set(rule.ip.flatMap((item) => item === 'geoip:private' ? cidrs : [item]))];
  }
}

function setupRuleSignature(rule) {
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize).sort();
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = normalize(value[key]);
      return acc;
    }, {});
  };
  return JSON.stringify(normalize(rule));
}

function isIpLiteral(value) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value || '') || /^\[[0-9a-f:]+\]$/i.test(value || '') || /^[0-9a-f:]+$/i.test(value || '');
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

function serverBootstrapDomains(config) {
  const domains = new Set();
  const outbounds = Array.isArray(config?.outbounds) ? config.outbounds : [];
  for (const outbound of outbounds) {
    const host = outbound?.settings?.vnext?.[0]?.address || outbound?.settings?.servers?.[0]?.address || outbound?.settings?.address || '';
    if (host && !isIpLiteral(host)) domains.add(`domain:${host}`);
  }
  const dnsServers = Array.isArray(config?.dns?.servers) ? config.dns.servers : [];
  for (const server of dnsServers) {
    const value = typeof server === 'string' ? server : server?.address;
    if (!value) continue;
    const host = value.includes('://') ? hostnameFromUrl(value) : String(value).split(':')[0];
    if (host && !isIpLiteral(host)) domains.add(`domain:${host}`);
  }
  return [...domains];
}

function ensureDnsBootstrapHosts(config) {
  config.dns = config.dns && typeof config.dns === 'object' ? config.dns : {};
  config.dns.hosts = config.dns.hosts && typeof config.dns.hosts === 'object' && !Array.isArray(config.dns.hosts) ? config.dns.hosts : {};
  if (!config.dns.hosts['dns.google']) config.dns.hosts['dns.google'] = ['8.8.8.8', '8.8.4.4'];
  if (!config.dns.hosts['dns.adguard-dns.com']) config.dns.hosts['dns.adguard-dns.com'] = ['94.140.14.14', '94.140.15.15'];
}

function isSetupManagedRule(rule, bootstrapDomains = []) {
  const inbound = Array.isArray(rule?.inboundTag) ? rule.inboundTag : [];
  const ips = Array.isArray(rule?.ip) ? rule.ip : [];
  const domains = Array.isArray(rule?.domain) ? rule.domain : [];
  if (rule?.outboundTag === 'direct' && inbound.includes('transparent_ipv4') && ips.some((item) => privateBypassCidrs().includes(item) || item === 'geoip:private')) return true;
  if (rule?.outboundTag === 'dns-out' && inbound.includes('ruopenray_dns_in')) return true;
  if (rule?.outboundTag === 'dns-out' && String(rule?.port || '') === '53') return true;
  if (rule?.outboundTag === 'direct' && domains.length && domains.every((item) => bootstrapDomains.includes(item))) return true;
  return false;
}

function normalizeSetupRules(config) {
  normalizePrivateBypassRules(config);
  ensureDnsBootstrapHosts(config);
  config.routing = config.routing && typeof config.routing === 'object' ? config.routing : {};
  const rules = Array.isArray(config.routing.rules) ? config.routing.rules : [];
  const bootstrapDomains = serverBootstrapDomains(config);
  const managedRules = [
    { type: 'field', outboundTag: 'direct', inboundTag: ['transparent_ipv4'], ip: privateBypassCidrs() },
    ...(bootstrapDomains.length ? [{ type: 'field', outboundTag: 'direct', domain: bootstrapDomains }] : []),
    { type: 'field', inboundTag: ['ruopenray_dns_in'], outboundTag: 'dns-out' },
    { type: 'field', outboundTag: 'dns-out', port: '53' }
  ];
  const seen = new Set();
  const keptRules = [];
  for (const rule of rules) {
    if (isSetupManagedRule(rule, bootstrapDomains)) continue;
    const signature = setupRuleSignature(rule);
    if (seen.has(signature)) continue;
    seen.add(signature);
    keptRules.push(rule);
  }
  config.routing.rules = [...managedRules, ...keptRules];
}

function prepareSetupDraft({ message = true } = {}) {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  next.inbounds = Array.isArray(next.inbounds) ? next.inbounds : [];
  next.outbounds = Array.isArray(next.outbounds) ? next.outbounds : [];
  next.routing = next.routing && typeof next.routing === 'object' ? next.routing : {};
  next.routing.rules = Array.isArray(next.routing.rules) ? next.routing.rules : [];
  next.dns = next.dns && typeof next.dns === 'object' ? next.dns : {};
  next.dns.servers = Array.isArray(next.dns.servers) && next.dns.servers.length ? next.dns.servers : [];

  const redirectMode = state.firewallRouterMode === 'redirect';
  const sockoptMode = redirectMode ? 'redirect' : 'tproxy';
  const transparentNetwork = redirectMode ? 'tcp' : 'tcp,udp';
  const transparentInbound = next.inbounds.find((item) => item?.tag === 'transparent_ipv4' || item?.streamSettings?.sockopt?.tproxy);
  if (!transparentInbound) {
    next.inbounds.push({
      tag: 'transparent_ipv4',
      port: 52345,
      listen: '0.0.0.0',
      protocol: 'dokodemo-door',
      sniffing: { enabled: true, destOverride: ['http', 'tls'], routeOnly: true },
      settings: { network: transparentNetwork, followRedirect: true },
      streamSettings: { sockopt: { tproxy: sockoptMode } }
    });
  } else {
    transparentInbound.settings = transparentInbound.settings && typeof transparentInbound.settings === 'object' ? transparentInbound.settings : {};
    transparentInbound.settings.network = transparentNetwork;
    transparentInbound.settings.followRedirect = true;
    transparentInbound.streamSettings = transparentInbound.streamSettings && typeof transparentInbound.streamSettings === 'object' ? transparentInbound.streamSettings : {};
    transparentInbound.streamSettings.sockopt = transparentInbound.streamSettings.sockopt && typeof transparentInbound.streamSettings.sockopt === 'object' ? transparentInbound.streamSettings.sockopt : {};
    transparentInbound.streamSettings.sockopt.tproxy = sockoptMode;
  }

  if (!next.outbounds.some((item) => item?.tag === 'dns-out')) {
    next.outbounds.push({ tag: 'dns-out', protocol: 'dns', settings: { address: '8.8.8.8', port: 53, network: 'udp' } });
  }
  if (!next.inbounds.some((item) => item?.tag === 'ruopenray_dns_in')) {
    next.inbounds.push({
      tag: 'ruopenray_dns_in',
      listen: '127.0.0.1',
      port: 5353,
      protocol: 'dokodemo-door',
      settings: { address: '8.8.8.8', port: 53, network: 'tcp,udp' }
    });
  }
  ensureDnsServer(next, 'https://dns.google:443/dns-query');
  ensureDnsServer(next, 'https://dns.adguard-dns.com/dns-query');

  normalizeSetupRules(next);

  syncConfig(next);
  if (message) state.message = 'Черновик активного режима подготовлен: transparent inbound, DNS inbound, dns-out и базовые правила добавлены.';
}

async function openSetupWizard() {
  if (['tproxy', 'redirect'].includes(state.firewallStatus?.routerMode)) {
    state.firewallRouterMode = state.firewallStatus.routerMode;
    localStorage.setItem(firewallRouterModeStorageKey, state.firewallRouterMode);
  }
  state.setupWizardOpen = true;
  state.setupResult = null;
  state.setupRollbackResult = null;
  loadSetupSnapshot();
  state.message = '';
  if (!state.installPlan) {
    request('/api/install/plan').then((plan) => {
      state.installPlan = plan;
      if (state.setupWizardOpen) render();
    }).catch(() => {});
  }
  render();
}

function setupPrepareDraft() {
  prepareSetupDraft();
  render();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLanDnsReadiness() {
  let latest = state.lanDnsStatus;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    latest = await request('/api/dns/lan-upstream').catch(() => latest);
    if (latest) syncLanDnsStatus(latest);
    if (state.setupLanDnsMode !== 'xray' || latest?.readiness?.ready) return latest;
    await delay(1000);
  }
  return latest;
}

async function runSetupWizard() {
  const readiness = setupReadiness();
  if (!readiness.canApply) {
    state.setupResult = { ok: false, steps: [{ ok: false, title: 'Не хватает основы', detail: 'Сначала установите Xray и добавьте хотя бы один proxy-сервер.' }] };
    render();
    return;
  }
  state.setupApplying = true;
  state.setupResult = { ok: true, steps: [] };
  render();
  const steps = [];
  const pushStep = (ok, title, detail = '') => {
    steps.push({ ok, title, detail });
    state.setupResult = { ok: steps.every((step) => step.ok), steps };
    render();
  };
  try {
    const snapshot = await captureSetupSnapshot();
    pushStep(Boolean(snapshot.config), 'Снимок для отката', snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString('ru-RU') : '');

    prepareSetupDraft({ message: false });
    const config = JSON.parse(state.jsonDraft);
    const test = await request('/api/config/test', { method: 'POST', body: JSON.stringify({ config }) });
    pushStep(Boolean(test.ok), 'Проверка конфигурации Xray', test.stdout || test.stderr || '');
    if (!test.ok) throw new Error(test.stderr || 'Конфигурация Xray не прошла проверку');

    const apply = await request('/api/config/apply', { method: 'POST', body: JSON.stringify({ config }) });
    pushStep(Boolean(apply.ok), 'Применение конфигурации Xray', apply.restart?.stdout || apply.test?.stdout || '');
    if (!apply.ok) throw new Error(apply.restart?.stderr || apply.test?.stderr || 'Не удалось применить конфигурацию Xray');

    if (state.setupLanDnsMode !== 'keep') {
      const readiness = await waitForLanDnsReadiness();
      if (state.setupLanDnsMode === 'xray' && !readiness?.readiness?.ready) {
        pushStep(false, 'LAN DNS / dnsmasq', 'DNS inbound Xray еще не слушает 127.0.0.1:5353. Повторите после перезапуска Xray.');
        throw new Error('DNS inbound Xray еще не готов');
      }
      const lanDns = await request('/api/dns/lan-upstream', {
        method: 'POST',
        body: JSON.stringify({
          mode: state.setupLanDnsMode,
          upstream: state.setupLanDnsUpstream,
          restart: state.setupRestartDnsmasq
        })
      });
      syncLanDnsStatus(lanDns);
      let lanDnsOk = Boolean(lanDns.ok);
      if (!lanDnsOk) {
        await delay(1000);
        const afterLanDns = await request('/api/dns/lan-upstream').catch(() => null);
        if (afterLanDns) syncLanDnsStatus(afterLanDns);
        lanDnsOk = Boolean(afterLanDns?.mode === state.setupLanDnsMode && (state.setupLanDnsMode !== 'xray' || afterLanDns?.readiness?.ready));
      }
      pushStep(lanDnsOk, 'LAN DNS / dnsmasq', lanDns.mode ? lanDnsModeLabel(lanDns.mode) : (lanDns.error || ''));
      if (!lanDnsOk) throw new Error(lanDns.error || 'Не удалось настроить LAN DNS');
    } else {
      pushStep(true, 'LAN DNS / dnsmasq', 'Оставлен текущий режим OpenWrt.');
    }

    const firewall = await applyFirewallWithRetry(3);
    state.firewallStatus = firewall.status || state.firewallStatus || firewall;
    const firewallOk = Boolean(firewall.ok && firewallReadyStatus(state.firewallStatus));
    pushStep(firewallOk, 'nftables и policy routing', state.firewallStatus?.routerMode || firewall.status?.routerMode || state.firewallRouterMode);
    if (!firewallOk) throw new Error(firewall.error || 'Не удалось включить перехват');

    state.message = 'Активный режим RuOpenRay включен';
    await refresh({ renderAfter: false });
    state.setupResult = { ok: true, steps };
  } catch (error) {
    state.setupResult = { ok: false, steps, error: error.message };
    state.message = error.message;
  } finally {
    state.setupApplying = false;
    render();
  }
}

async function rollbackSetupWizard() {
  const snapshot = loadSetupSnapshot();
  if (!snapshot?.config) {
    state.setupRollbackResult = { ok: false, steps: [{ ok: false, title: 'Нет снимка', detail: 'Мастер еще не сохранял состояние до применения.' }] };
    render();
    return;
  }
  state.setupRollbacking = true;
  state.setupRollbackResult = { ok: true, steps: [] };
  render();
  const steps = [];
  const pushStep = (ok, title, detail = '') => {
    steps.push({ ok, title, detail });
    state.setupRollbackResult = { ok: steps.every((step) => step.ok), steps };
    render();
  };
  try {
    const configTest = await request('/api/config/test', { method: 'POST', body: JSON.stringify({ config: snapshot.config }) });
    pushStep(Boolean(configTest.ok), 'Проверка прежней конфигурации Xray', configTest.stdout || configTest.stderr || '');
    if (!configTest.ok) throw new Error(configTest.stderr || 'Прежняя конфигурация Xray не прошла проверку');

    const configApply = await request('/api/config/apply', { method: 'POST', body: JSON.stringify({ config: snapshot.config }) });
    pushStep(Boolean(configApply.ok), 'Возврат конфигурации Xray', configApply.restart?.stdout || configApply.test?.stdout || '');
    if (!configApply.ok) throw new Error(configApply.restart?.stderr || configApply.test?.stderr || 'Не удалось вернуть конфигурацию Xray');

    if (snapshot.lanDns) {
      const lan = await request('/api/dns/lan-upstream', { method: 'POST', body: JSON.stringify(lanDnsRestorePayload(snapshot.lanDns)) });
      syncLanDnsStatus(lan);
      pushStep(Boolean(lan.ok), 'Возврат LAN DNS', lan.mode ? lanDnsModeLabel(lan.mode) : (lan.error || ''));
      if (!lan.ok) throw new Error(lan.error || 'Не удалось вернуть LAN DNS');
    } else {
      pushStep(true, 'Возврат LAN DNS', 'Снимок DNS отсутствовал, шаг пропущен.');
    }

    const firewall = await request('/api/firewall/restore', { method: 'POST', body: JSON.stringify({ snapshot: snapshot.firewall || {} }) });
    state.firewallStatus = firewall.status || firewall;
    pushStep(Boolean(firewall.ok), 'Возврат nftables', state.firewallStatus?.routerMode || '');
    if (!firewall.ok) throw new Error(firewall.error || 'Не удалось вернуть nftables');

    clearSetupSnapshot();
    state.message = 'Откат мастера выполнен';
    await refresh({ renderAfter: false });
    state.setupRollbackResult = { ok: true, steps };
  } catch (error) {
    state.setupRollbackResult = { ok: false, steps, error: error.message };
    state.message = error.message;
  } finally {
    state.setupRollbacking = false;
    render();
  }
}

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

async function updateCore() {
  const version = state.selectedCoreVersion || '';
  if (!version) {
    state.message = 'Сначала выберите версию Xray-core';
    render();
    return;
  }
  state.coreUpdating = true;
  state.message = `Устанавливаю Xray-core ${version}...`;
  render();
  try {
    const result = await request('/api/core/update', { method: 'POST', body: JSON.stringify({ version, backup: state.coreBackup }) });
    state.coreUpdate = result;
    state.coreDialogOpen = false;
    state.message = result.ok
      ? `Ядро Xray установлено: ${result.after || version}`
      : result.stderr || result.message || 'Не удалось обновить ядро Xray';
    await refresh();
  } finally {
    state.coreUpdating = false;
    render();
  }
}

async function updateApp() {
  const target = state.appRelease?.tag || '';
  if (!target) {
    state.message = 'Не удалось получить последний релиз RuOpenRay UI';
    render();
    return;
  }
  state.appUpdating = true;
  state.message = `Обновляю RuOpenRay UI до ${target}...`;
  render();
  try {
    const result = await request('/api/app/update', {
      method: 'POST',
      body: JSON.stringify({ version: target, backup: state.appBackup })
    });
    state.appUpdate = result;
    state.message = result.ok
      ? `RuOpenRay UI обновлен до ${result.version || target}. Сервис перезапускается.`
      : result.stderr || 'Не удалось обновить RuOpenRay UI';
    if (result.ok) {
      setTimeout(() => refresh().catch(() => {}), 2500);
    } else {
      await refresh();
    }
  } finally {
    state.appUpdating = false;
    render();
  }
}

async function checkAppUpdate() {
  state.appReleaseChecking = true;
  state.message = 'Проверяю обновления RuOpenRay UI...';
  render();
  try {
    const result = await request('/api/app/releases');
    state.appRelease = result?.release || null;
    if (result?.version && state.status?.app) {
      state.status = {
        ...(state.status || {}),
        app: { ...(state.status.app || {}), version: result.version, asset: result.asset || state.status.app.asset }
      };
    }
    const release = state.appRelease || {};
    state.message = release.update && release.assetUrl
      ? `Доступно обновление RuOpenRay UI: ${release.current || result.version || 'текущая'} → ${release.tag}`
      : `RuOpenRay UI актуален: ${result?.version || state.status?.app?.version || 'dev'}`;
  } catch (error) {
    state.message = error.message || 'Не удалось проверить обновления RuOpenRay UI';
  } finally {
    state.appReleaseChecking = false;
    render();
  }
}

async function appVersionClick() {
  const release = state.appRelease || {};
  if (release.update && release.assetUrl) {
    state.tab = 'settings';
    state.settingsView = 'updates';
    state.message = `Доступно обновление RuOpenRay UI: ${release.current || state.status?.app?.version || 'текущая'} → ${release.tag}`;
    render();
    return;
  }
  await checkAppUpdate();
  if (state.appRelease?.update && state.appRelease?.assetUrl) {
    state.tab = 'settings';
    state.settingsView = 'updates';
    render();
  }
}

async function updateGeo() {
  state.geoUpdating = true;
  state.message = 'Обновляю geoip.dat и geosite.dat...';
  render();
  try {
    const presets = geoSelectedPresetIds();
    const result = await request('/api/geo/update', {
      method: 'POST',
      body: JSON.stringify({
        preset: state.geoBasePreset,
        presets,
        customSourceIds: state.geoCustomSourceIds,
        geoipUrl: state.geoipUrl,
        geositeUrl: state.geositeUrl,
        backup: state.geoBackup
      })
    });
    state.geoUpdate = result;
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.ok ? 'Geo-файлы обновлены, Xray перезапущен' : result.stderr || 'Не удалось обновить geo-файлы';
    await refresh();
  } finally {
    state.geoUpdating = false;
    render();
  }
}

async function saveGeoSchedule() {
  const result = await request('/api/geo/schedule', {
    method: 'POST',
    body: JSON.stringify({
      enabled: state.geoScheduleEnabled,
      interval: state.geoScheduleInterval,
      weekday: state.geoScheduleWeekday,
      time: state.geoScheduleTime,
      preset: state.geoBasePreset,
      presets: geoSelectedPresetIds(),
      customSourceIds: state.geoCustomSourceIds,
      geoipUrl: state.geoipUrl,
      geositeUrl: state.geositeUrl,
      backup: state.geoBackup
    })
  });
  state.geoUpdate = result;
  state.geoStatus = result.status || state.geoStatus;
  state.message = result.stdout || 'Расписание geo сохранено';
  render();
}

async function installCorePackage() {
  state.coreUpdating = true;
  state.installStep = 'installing';
  state.message = 'Устанавливаю Xray из пакетов OpenWrt...';
  render();
  try {
    const result = await request('/api/core/update', { method: 'POST', body: JSON.stringify({ version: '' }) });
    state.coreUpdate = result;
    state.coreDialogOpen = false;
    state.installStep = result.ok ? 'done' : 'error';
    state.message = result.ok ? `Xray установлен: ${result.after || 'проверьте статус'}` : result.stderr || result.stdout || 'Не удалось установить Xray';
    await refresh();
    state.installPlan = await request('/api/install/plan').catch(() => state.installPlan);
  } finally {
    state.coreUpdating = false;
  }
  render();
}

async function cleanupGeoBackups() {
  const result = await request('/api/geo/cleanup', { method: 'POST', body: '{}' });
  state.geoUpdate = result;
  state.geoStatus = result.status || state.geoStatus;
  state.message = result.stdout || 'Geo-бэкапы очищены';
  render();
}

async function deleteGeoFile(file) {
  const name = String(file || '').trim();
  if (!name) return;
  if (!confirm(`Удалить ${name}? Если активные правила ссылаются на этот файл, следующая проверка конфигурации покажет ошибку.`)) return;
  const result = await request('/api/geo/delete', {
    method: 'POST',
    body: JSON.stringify({ files: [name] })
  });
  state.geoUpdate = result;
  state.geoStatus = result.status || state.geoStatus;
  state.message = result.ok ? result.stdout || `${name} удален` : result.stderr || `Не удалось удалить ${name}`;
  render();
}

async function cleanupExtraGeoDat() {
  const files = (state.geoStatus?.files || [])
    .filter((file) => file.role === 'extra' && file.exists !== false)
    .map((file) => file.name)
    .filter(Boolean);
  if (!files.length) {
    state.message = 'Дополнительных dat-файлов для удаления нет';
    return render();
  }
  if (!confirm(`Удалить дополнительные dat-файлы: ${files.join(', ')}?`)) return;
  const result = await request('/api/geo/delete', {
    method: 'POST',
    body: JSON.stringify({ files })
  });
  state.geoUpdate = result;
  state.geoStatus = result.status || state.geoStatus;
  state.message = result.ok ? result.stdout || 'Дополнительные dat-файлы удалены' : result.stderr || 'Не удалось удалить дополнительные dat-файлы';
  render();
}

function cleanGeoSourcePayload(source = {}) {
  const name = String(source.name || '').trim();
  const kind = source.kind === 'extra' ? 'extra' : 'base';
  return {
    id: source.id || '',
    name,
    kind,
    geoipUrl: String(source.geoipUrl || '').trim(),
    geositeUrl: String(source.geositeUrl || '').trim(),
    url: String(source.url || '').trim(),
    target: String(source.target || '').trim(),
    enabled: source.enabled !== false
  };
}

async function saveGeoSources(sources) {
  const result = await request('/api/geo/sources', {
    method: 'POST',
    body: JSON.stringify({ sources })
  });
  state.geoCustomSources = result.sources || [];
  state.geoStatus = result.status || state.geoStatus;
  state.message = result.stdout || 'Свои источники geodata сохранены';
  render();
}

async function addGeoSource() {
  const source = cleanGeoSourcePayload({
    name: state.geoSourceName,
    kind: state.geoSourceKind,
    geoipUrl: state.geoSourceGeoipUrl,
    geositeUrl: state.geoSourceGeositeUrl,
    url: state.geoSourceUrl,
    target: state.geoSourceTarget,
    enabled: true
  });
  if (!source.name) {
    state.message = 'Укажите название источника geodata';
    render();
    return;
  }
  if (source.kind === 'base' && (!source.geoipUrl || !source.geositeUrl)) {
    state.message = 'Для базового источника нужны ссылки на geoip.dat и geosite.dat';
    render();
    return;
  }
  if (source.kind === 'extra' && (!source.url || !source.target)) {
    state.message = 'Для дополнительного dat-файла нужны URL и имя файла';
    render();
    return;
  }
  const next = [...state.geoCustomSources, source];
  state.geoSourceName = '';
  state.geoSourceGeoipUrl = '';
  state.geoSourceGeositeUrl = '';
  state.geoSourceUrl = '';
  state.geoSourceTarget = '';
  await saveGeoSources(next);
}

async function removeGeoSource(id) {
  state.geoCustomSourceIds = state.geoCustomSourceIds.filter((item) => item !== id);
  await saveGeoSources(state.geoCustomSources.filter((source) => source.id !== id));
}

async function toggleGeoSourceEnabled(id, enabled) {
  await saveGeoSources(state.geoCustomSources.map((source) => (source.id === id ? { ...source, enabled } : source)));
}

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

async function importLink() {
  const result = await request('/api/import', {
    method: 'POST',
    body: JSON.stringify({ link: state.importLink, profileName: state.profileName, outboundTag: state.importOutboundTag })
  });
  state.message = `Импортирован ${result.outbound.protocol} в профиль ${result.profile}`;
  state.importLink = '';
  state.importOutboundTag = '';
  state.importPreview = null;
  state.importDialog = '';
  await refresh();
}

function serverImportOutbound() {
  if (!state.importPreview?.outbound) return null;
  const outbound = JSON.parse(JSON.stringify(state.importPreview.outbound));
  const tag = String(state.importOutboundTag || '').trim();
  if (tag) outbound.tag = tag;
  return outbound;
}

function serverImportPreviewItem() {
  if (!state.importPreview?.items?.length) return null;
  const item = { ...state.importPreview.items[0] };
  const tag = String(state.importOutboundTag || '').trim();
  if (tag) item.tag = tag;
  return item;
}

function activeProfileName() {
  return (Array.isArray(state.profiles) ? state.profiles : []).find((profile) => profile.active)?.name || 'default';
}

function mergeOutboundsIntoConfig(config, outbounds) {
  const next = JSON.parse(JSON.stringify(config || {}));
  const imported = outbounds.filter(Boolean).map((outbound) => JSON.parse(JSON.stringify(outbound)));
  const tags = new Set(imported.map((outbound) => outbound?.tag).filter(Boolean));
  const existing = Array.isArray(next.outbounds) ? next.outbounds.filter((outbound) => !tags.has(outbound?.tag)) : [];
  const regular = existing.filter((outbound) => !isSystemOutbound(outbound));
  const system = existing.filter((outbound) => isSystemOutbound(outbound));
  next.outbounds = [...imported, ...regular, ...system];
  return next;
}

function slugTag(value, fallback = 'subscription-auto') {
  const clean = String(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return clean || fallback;
}

function suggestedSubscriptionBalancerTag() {
  return slugTag(state.subscriptionBalancerTag || state.profileName || state.subscriptionPreview?.items?.[0]?.tag || state.subscriptionUrl, 'subscription-auto');
}

function ensureBalancerInConfig(config, balancer) {
  const next = JSON.parse(JSON.stringify(config || {}));
  next.routing = next.routing && typeof next.routing === 'object' ? next.routing : {};
  const current = Array.isArray(next.routing.balancers) ? next.routing.balancers : [];
  next.routing.balancers = [balancer, ...current.filter((item) => item?.tag !== balancer.tag)];
  return next;
}

function mergeObservatoryIntoConfig(config, selectors) {
  const next = JSON.parse(JSON.stringify(config || {}));
  const current = next.observatory && typeof next.observatory === 'object' ? next.observatory : {};
  const existing = Array.isArray(current.subjectSelector) ? current.subjectSelector : [];
  const subjectSelector = [...new Set([...existing, ...selectors.filter(Boolean)])];
  const probeURL = String(state.serverCheckUrl || current.probeURL || 'https://www.gstatic.com/generate_204').trim() || 'https://www.gstatic.com/generate_204';
  const probeInterval = normalizeObservatoryInterval(state.observatoryInterval || current.probeInterval || '10s');
  next.observatory = {
    ...current,
    subjectSelector,
    probeURL,
    probeInterval
  };
  return next;
}

function mergeBurstObservatoryIntoConfig(config, selectors) {
  const next = JSON.parse(JSON.stringify(config || {}));
  const current = next.burstObservatory && typeof next.burstObservatory === 'object' ? next.burstObservatory : {};
  const existing = Array.isArray(current.subjectSelector) ? current.subjectSelector : [];
  const subjectSelector = [...new Set([...existing, ...selectors.filter(Boolean)])];
  const currentPing = current.pingConfig && typeof current.pingConfig === 'object' ? current.pingConfig : {};
  const destination = String(state.serverCheckUrl || currentPing.destination || 'https://connectivitycheck.gstatic.com/generate_204').trim() || 'https://connectivitycheck.gstatic.com/generate_204';
  const interval = normalizeObservatoryInterval(state.observatoryInterval || currentPing.interval || '1m');
  next.burstObservatory = {
    ...current,
    subjectSelector,
    pingConfig: {
      ...currentPing,
      destination,
      interval,
      sampling: Number(currentPing.sampling || 10),
      timeout: currentPing.timeout || '5s',
      httpMethod: currentPing.httpMethod || 'HEAD'
    }
  };
  return next;
}

function normalizeObservatoryInterval(value) {
  const text = String(value || '').trim();
  if (!text) return '10s';
  if (/^\d+$/.test(text)) return `${text}s`;
  return /^(?:\d+(?:ns|us|ms|s|m|h))+$/.test(text) ? text : '10s';
}

function strategyObserverType(strategy) {
  if (strategy === 'leastPing') return 'observatory';
  if (strategy === 'leastLoad') return 'burstObservatory';
  return '';
}

function strategyNeedsObservatory(strategy) {
  return Boolean(strategyObserverType(strategy));
}

function observatoryConfig() {
  return state.config?.observatory && typeof state.config.observatory === 'object' ? state.config.observatory : {};
}

function burstObservatoryConfig() {
  return state.config?.burstObservatory && typeof state.config.burstObservatory === 'object' ? state.config.burstObservatory : {};
}

function observatorySelectors() {
  return Array.isArray(observatoryConfig().subjectSelector) ? observatoryConfig().subjectSelector.filter(Boolean) : [];
}

function burstObservatorySelectors() {
  return Array.isArray(burstObservatoryConfig().subjectSelector) ? burstObservatoryConfig().subjectSelector.filter(Boolean) : [];
}

function outboundMatchesSelectors(outbound, selectors = observatorySelectors()) {
  const tag = String(outbound?.tag || '');
  return selectors.some((selector) => tag.includes(String(selector || '').trim()));
}

function observatoryMatchedOutbounds() {
  const selectors = observatorySelectors();
  if (!selectors.length) return [];
  return proxyOutbounds().filter((outbound) => outboundMatchesSelectors(outbound, selectors));
}

function observatoryRequiredBalancers() {
  return routeBalancers().filter((balancer) => strategyNeedsObservatory(balancer?.strategy?.type));
}

function applyObserverForStrategy(config, strategy, selectors) {
  if (strategy === 'leastLoad') return mergeBurstObservatoryIntoConfig(config, selectors);
  if (strategy === 'leastPing') return mergeObservatoryIntoConfig(config, selectors);
  return config;
}

function observerLabel(type) {
  if (type === 'burstObservatory') return 'Burst Observatory';
  if (type === 'observatory') return 'Observatory';
  return 'не требуется';
}

function balancerStrategyLabel(strategy) {
  return {
    random: 'случайно',
    roundRobin: 'по очереди',
    leastPing: 'меньший ping',
    leastLoad: 'меньшая нагрузка'
  }[strategy] || strategy || 'случайно';
}

function enableObservatoryForProxy() {
  const tags = proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean);
  if (!tags.length) {
    state.message = 'Сначала добавьте хотя бы один proxy-сервер';
    render();
    return;
  }
  const required = observatoryRequiredBalancers();
  const leastPingSelectors = [];
  const leastLoadSelectors = [];
  required.forEach((balancer) => {
    const selectors = Array.isArray(balancer.selector) ? balancer.selector.filter(Boolean) : [];
    if (strategyObserverType(balancer?.strategy?.type) === 'burstObservatory') leastLoadSelectors.push(...selectors);
    if (strategyObserverType(balancer?.strategy?.type) === 'observatory') leastPingSelectors.push(...selectors);
  });
  let nextConfig = state.config;
  if (leastPingSelectors.length || (!leastLoadSelectors.length && !required.length)) {
    nextConfig = mergeObservatoryIntoConfig(nextConfig, leastPingSelectors.length ? leastPingSelectors : tags);
  }
  if (leastLoadSelectors.length) {
    nextConfig = mergeBurstObservatoryIntoConfig(nextConfig, leastLoadSelectors);
  }
  syncConfig(nextConfig);
  const parts = [
    leastPingSelectors.length || (!leastLoadSelectors.length && !required.length) ? 'Observatory' : '',
    leastLoadSelectors.length ? 'Burst Observatory' : ''
  ].filter(Boolean).join(' и ');
  state.message = `${parts || 'Наблюдение'} включено для proxy-серверов. Проверьте конфигурацию и примените.`;
  render();
}

async function checkObservatoryTargets() {
  const selectors = [...new Set([...observatorySelectors(), ...burstObservatorySelectors()])];
  const tags = selectors.length ? proxyOutbounds().filter((outbound) => outboundMatchesSelectors(outbound, selectors)).map((outbound) => outbound.tag).filter(Boolean) : [];
  const fallbackTags = proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean);
  await checkServers(tags.length ? tags : fallbackTags);
}

function setFirewallBypassMode(mode) {
  state.firewallBypassMode = ['off', 'bypass', 'redirect'].includes(mode) ? mode : 'off';
  localStorage.setItem(firewallBypassModeStorageKey, state.firewallBypassMode);
  render();
}

function setFirewallRouterMode(mode) {
  state.firewallRouterMode = ['tproxy', 'redirect'].includes(mode) ? mode : 'tproxy';
  localStorage.setItem(firewallRouterModeStorageKey, state.firewallRouterMode);
  render();
}

function setFirewallDeviceMode(mode) {
  state.firewallDeviceMode = ['all', 'selected', 'exclude'].includes(mode) ? mode : 'all';
  localStorage.setItem(firewallDeviceModeStorageKey, state.firewallDeviceMode);
  render();
}

function setFirewallPortMode(mode) {
  state.firewallPortMode = mode === 'all' ? 'all' : 'custom';
  localStorage.setItem(firewallPortModeStorageKey, state.firewallPortMode);
  render();
}

function toggleFirewallDevice(ip, enabled) {
  const selected = new Set(state.firewallSelectedDevices);
  if (enabled) selected.add(ip);
  else selected.delete(ip);
  state.firewallSelectedDevices = [...selected];
  localStorage.setItem(firewallSelectedDevicesStorageKey, JSON.stringify(state.firewallSelectedDevices));
  render();
}

function setFirewallBlockQuic(enabled) {
  state.firewallBlockQuic = Boolean(enabled);
  localStorage.setItem(firewallBlockQuicStorageKey, state.firewallBlockQuic ? '1' : '0');
  render();
}

function setQuicPolicy(policy) {
  setFirewallBlockQuic(policy === 'block');
}

function setActiveProxyDraft(tag) {
  const rules = routeRules();
  if (!rules.length) {
    setRoutingDraft([{ type: 'field', outboundTag: tag, port: '0-65535' }]);
  } else {
    const currentTag = activeProxyTag();
    const switchable = new Set(['proxy', currentTag].filter(Boolean));
    let changed = 0;
    const nextRules = rules.map((rule) => {
      if (rule?.outboundTag && switchable.has(rule.outboundTag)) {
        changed += 1;
        return { ...rule, outboundTag: tag };
      }
      return rule;
    });
    setRoutingDraft(changed ? nextRules : [{ type: 'field', outboundTag: tag, port: '0-65535' }, ...rules]);
  }
  setActiveServerTag(tag);
}

function setActiveProxyBalancerDraft(tag) {
  const rules = routeRules();
  const currentTag = activeProxyTag();
  const switchable = new Set(['proxy', currentTag].filter(Boolean));
  if (!rules.length) {
    setRoutingDraft([{ type: 'field', balancerTag: tag, port: '0-65535' }]);
  } else {
    let changed = 0;
    const nextRules = rules.map((rule) => {
      if (rule?.balancerTag === tag) return rule;
      if (rule?.outboundTag && switchable.has(rule.outboundTag)) {
        changed += 1;
        const next = { ...rule, balancerTag: tag };
        delete next.outboundTag;
        return next;
      }
      return rule;
    });
    setRoutingDraft(changed ? nextRules : [{ type: 'field', balancerTag: tag, port: '0-65535' }, ...rules]);
  }
  setActiveServerTag('');
}

async function saveCurrentProfileConfig() {
  const name = activeProfileName();
  await request('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ name, config: state.config })
  });
  await request('/api/profiles/activate', { method: 'POST', body: JSON.stringify({ name }) });
}

async function importToCurrent(makeActive = false) {
  if (!state.importPreview?.outbound) await previewImport();
  const outbound = serverImportOutbound();
  if (!outbound) return;
  syncConfig(mergeOutboundsIntoConfig(state.config, [outbound]));
  if (makeActive) setActiveProxyDraft(outbound.tag);
  await saveCurrentProfileConfig();
  state.importLink = '';
  state.importOutboundTag = '';
  state.importPreview = null;
  state.importDialog = '';
  state.message = makeActive
    ? `Сервер ${outbound.tag} добавлен в текущий профиль и выбран активным`
    : `Сервер ${outbound.tag} добавлен в текущий профиль`;
  if (makeActive) await applyConfig();
  else {
    await refresh();
  }
}

async function importSubscriptionToCurrent(makeActive = false) {
  if (!state.subscriptionPreview?.outbounds?.length) await previewSubscription();
  const outbounds = state.subscriptionPreview?.outbounds || [];
  if (!outbounds.length) return;
  let stableTag = '';
  if (state.subscriptionAutoBalancer) {
    stableTag = suggestedSubscriptionBalancerTag();
    syncConfig(mergeOutboundsIntoConfig(state.config, [cloneOutboundWithTag(outbounds[0], stableTag)]));
    await request('/api/subscriptions/pool', {
      method: 'POST',
      body: JSON.stringify({ tag: stableTag, url: state.subscriptionUrl, outbounds, active: 0 })
    });
  } else {
    syncConfig(mergeOutboundsIntoConfig(state.config, outbounds));
  }
  if (makeActive && stableTag) setActiveProxyDraft(stableTag);
  else if (makeActive && outbounds[0]?.tag) setActiveProxyDraft(outbounds[0].tag);
  await saveCurrentProfileConfig();
  state.subscriptionUrl = '';
  state.subscriptionPreview = null;
  state.subscriptionBalancerTag = '';
  state.importDialog = '';
  state.message = makeActive
    ? `Подписка добавлена в текущий профиль, активна цель ${stableTag || outbounds[0].tag}`
    : `Подписка добавлена в текущий профиль: ${outbounds.length} серверов${stableTag ? `, стабильная цель ${stableTag}` : ''}`;
  if (makeActive) await applyConfig();
  else {
    await refresh();
  }
}

async function previewImport() {
  const result = await request('/api/import/preview', {
    method: 'POST',
    body: JSON.stringify({ link: state.importLink, outboundTag: state.importOutboundTag })
  });
  state.importPreview = result;
  state.message = `Распознано: ${result.items[0]?.protocol || 'сервер'} ${result.items[0]?.address || ''}`;
  render();
}

async function previewSubscription() {
  const result = await request('/api/import/preview', {
    method: 'POST',
    body: JSON.stringify({ url: state.subscriptionUrl })
  });
  state.subscriptionPreview = result;
  state.message = `В подписке найдено серверов: ${result.links}`;
  render();
}

async function importSubscription() {
  const result = await request('/api/import/subscription', {
    method: 'POST',
    body: JSON.stringify({ url: state.subscriptionUrl, profileName: state.profileName })
  });
  state.subscriptionUrl = '';
  state.subscriptionPreview = null;
  state.importDialog = '';
  state.message = `Импортировано серверов: ${result.imported.length}. Профиль: ${result.profile}`;
  await refresh();
}

async function activateProfile(name) {
  await request('/api/profiles/activate', { method: 'POST', body: JSON.stringify({ name }) });
  state.message = `Активирован профиль ${name}`;
  await refresh();
}

async function saveProfile() {
  const name = prompt('Имя профиля', 'custom');
  if (!name) return;
  await request('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ name, config: JSON.parse(state.jsonDraft) })
  });
  state.message = `Профиль ${name} сохранен`;
  await refresh();
}

async function backup() {
  const result = await request('/api/backup', { method: 'POST', body: '{}' });
  state.message = `Резервная копия создана: ${result.path}`;
  render();
}

function addRoutingRule() {
  const values = splitRouteValues(state.routeValue);
  if (!values.length) {
    state.message = 'Укажите сайт, IP, устройство или порт для правила';
    render();
    return;
  }
  const rule = { type: 'field' };
  if (state.routeTargetType === 'balancer') {
    if (!state.routeBalancer) {
      state.message = 'Выберите балансировщик или создайте его в маршрутизации';
      render();
      return;
    }
    rule.balancerTag = state.routeBalancer;
  } else {
    rule.outboundTag = state.routeOutbound;
  }
  if (state.routeKind === 'port') {
    rule.port = values.join(',');
  } else {
    rule[state.routeKind] = values;
  }
  setRouteRuleName(rule, state.routeName);
  setRoutingDraft([rule, ...routeRules()]);
  state.routeName = '';
  state.routeValue = '';
  state.routeRuleDialog = false;
  state.message = 'Правило добавлено в черновик маршрутизации. Проверьте конфигурацию и примените изменения.';
  render();
}

function resetRouteRuleForm() {
  state.routeName = '';
  state.routeKind = 'domain';
  state.routeValue = '';
  state.routeOutbound = activeProxyTag() || 'proxy';
  state.routeTargetType = 'outbound';
  state.routeBalancer = balancerOptions()[0] || '';
  state.routeRuleMode = 'single';
  state.routeRuleEditingIndex = -1;
}

function routeRuleFromForm(baseRule = {}) {
  const values = splitRouteValues(state.routeValue);
  if (!values.length) return null;
  const rule = { ...baseRule, type: baseRule.type || 'field' };
  delete rule.domain;
  delete rule.ip;
  delete rule.source;
  delete rule.port;
  delete rule.inboundTag;
  delete rule.outboundTag;
  delete rule.balancerTag;
  if (state.routeTargetType === 'balancer') {
    if (!state.routeBalancer) return null;
    rule.balancerTag = state.routeBalancer;
  } else {
    rule.outboundTag = state.routeOutbound || 'proxy';
  }
  if (state.routeKind === 'port') rule.port = values.join(',');
  else rule[state.routeKind] = values;
  return rule;
}

function openRoutingRuleEditor(index) {
  const rule = routeRules()[index];
  if (!rule) return;
  if (isRuOpenRayManagedRoute(rule)) {
    state.message = 'Это служебное правило RuOpenRay. Меняйте его через раздел DNS, Перехват или Статистика Xray, чтобы не сломать системную часть конфигурации.';
    render();
    return;
  }
  const target = routeTarget(rule);
  if (!routeKinds[target.kind]) {
    state.message = 'Это особое правило пока нельзя редактировать в форме. Его можно изменить в активной конфигурации.';
    render();
    return;
  }
  const info = describeRouteRule(rule);
  state.routeRuleEditingIndex = index;
  state.routeRuleDialog = true;
  state.routeRuleMode = 'single';
  state.routeName = routeRuleName(rule, info);
  state.routeKind = target.kind;
  state.routeValue = target.values.join(', ');
  state.routeTargetType = rule.balancerTag ? 'balancer' : 'outbound';
  state.routeBalancer = rule.balancerTag || balancerOptions()[0] || '';
  state.routeOutbound = rule.outboundTag || 'proxy';
  state.message = '';
  render();
}

function saveRoutingRuleEdit() {
  const index = state.routeRuleEditingIndex;
  const current = routeRules();
  const oldRule = current[index];
  if (!oldRule) {
    resetRouteRuleForm();
    state.routeRuleDialog = false;
    render();
    return;
  }
  const nextRule = routeRuleFromForm(oldRule);
  if (!nextRule) {
    state.message = state.routeTargetType === 'balancer' && !state.routeBalancer
      ? 'Выберите балансировщик или переключите цель на сервер'
      : 'Укажите значение правила';
    render();
    return;
  }
  const nextRules = current.map((rule, ruleIndex) => (ruleIndex === index ? nextRule : rule));
  delete state.routeNames[routeRuleKey(oldRule)];
  setRouteRuleName(nextRule, state.routeName);
  setRoutingDraft(nextRules);
  resetRouteRuleForm();
  state.routeRuleDialog = false;
  state.message = 'Правило обновлено в черновике маршрутизации. Проверьте конфигурацию и примените изменения.';
  render();
}

function addRoutingPreset(name) {
  const rules = routePresetRules(name);
  if (!rules.length) return;
  setRoutingDraft([...rules.map(normalizePresetRule), ...routeRules()]);
  state.message = `Подборка добавлена: ${routePresetTitle(name)}`;
  render();
}

function normalizePresetRule(rule) {
  const next = JSON.parse(JSON.stringify(rule));
  if (next.outboundTag === 'proxy') next.outboundTag = activeProxyTag() || 'proxy';
  return next;
}

function applySelectedRoutingPresets() {
  const selectedPresets = state.selectedRoutePresets.filter((key) => routePresets[key] || routeBundles[key]);
  const selectedCustom = state.selectedRoutePresets.filter((key) => customRoutePreset(key));
  const selected = [...selectedPresets, ...selectedCustom];
  if (!selected.length) {
    state.message = 'Отметьте хотя бы одну подборку';
    render();
    return;
  }
  const rules = [
    ...selectedPresets.flatMap((key) => routePresetRules(key).map(normalizePresetRule)),
    ...selectedCustom.flatMap((key) => routePresetRules(key).map(normalizePresetRule))
  ];
  setRoutingDraft([...rules, ...routeRules()]);
  state.routePresetDialog = false;
  state.routeRuleDialog = false;
  state.routeRuleMode = 'single';
  state.selectedRoutePresets = [];
  state.message = `Добавлено подборок: ${selected.length}, правил: ${rules.length}`;
  render();
}

function routePresetRules(key) {
  const custom = customRoutePreset(key);
  if (custom) return custom.rules || [];
  if (routeBundles[key]) return routeBundles[key].rules;
  if (routePresets[key]) return [routePresets[key].rule];
  return [];
}

function routePresetTitle(key) {
  const custom = customRoutePreset(key);
  if (custom) return custom.title || key;
  return routeBundles[key]?.title || routePresets[key]?.title || key;
}

function routePresetDetail(key) {
  const custom = customRoutePreset(key);
  if (custom) return custom.detail || ruleCountLabel((custom.rules || []).reduce((sum, rule) => sum + routeRuleConditionCount(rule), 0));
  const preset = routeBundles[key] || routePresets[key];
  if (!preset) return '';
  if (preset.detail) return preset.detail;
  if (preset.rule) return describeRouteRule(preset.rule).fullValue;
  return '';
}

function routeRuleConditionCount(rule) {
  if (!rule) return 0;
  let count = 0;
  for (const key of ['domain', 'ip', 'source', 'inboundTag']) {
    if (Array.isArray(rule[key])) count += rule[key].length;
    else if (rule[key]) count += 1;
  }
  if (rule.port) count += 1;
  if (!count && rule.network) count += 1;
  return Math.max(1, count);
}

function routePresetConditionCount(key) {
  return routePresetRules(key).reduce((sum, rule) => sum + routeRuleConditionCount(rule), 0);
}

function builtinRoutePresetEntries({ includeHidden = false } = {}) {
  return [
    ...Object.entries(routeBundles),
    ...Object.entries(routePresets)
  ].filter(([key]) => includeHidden || !hiddenBuiltinRoutePresetKeys.has(key));
}

function ruleCountLabel(count) {
  const n = Math.abs(Number(count || 0));
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? 'правило'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? 'правила'
      : 'правил';
  return `${count || 0} ${word}`;
}

function customRoutePreset(key) {
  const id = String(key || '').startsWith('custom:') ? String(key).slice(7) : '';
  return id ? state.customRoutePresets[id] : null;
}

function customRoutePresetEntries() {
  return Object.entries(state.customRoutePresets)
    .sort(([, left], [, right]) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
    .map(([id, preset]) => [`custom:${id}`, preset]);
}

function saveCustomRoutePresets() {
  localStorage.setItem(customRoutePresetsStorageKey, JSON.stringify(state.customRoutePresets));
}

function scenarioIdFromTitle(title) {
  const base = String(title || 'scenario')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'scenario';
  let id = base;
  let counter = 2;
  while (state.customRoutePresets[id]) {
    id = `${base}-${counter}`;
    counter += 1;
  }
  return id;
}

function routeRuleToDslLines(rule) {
  const outbound = rule.balancerTag ? `balancer:${rule.balancerTag}` : (rule.outboundTag || 'proxy');
  const prefix = rule.network ? [`network(${rule.network})`] : [];
  const lines = [];
  const addMany = (kind, values) => {
    for (const value of values || []) {
      lines.push([...prefix, `${kind}(${value})`].join(' && ') + ` -> ${outbound}`);
    }
  };
  addMany('domain', rule.domain);
  addMany('ip', rule.ip);
  addMany('source', rule.source);
  addMany('inboundTag', rule.inboundTag);
  if (rule.port) lines.push([...prefix, `port(${rule.port})`].join(' && ') + ` -> ${outbound}`);
  if (!lines.length && prefix.length) lines.push(`${prefix.join(' && ')} -> ${outbound}`);
  return lines;
}

function clearRoutePresetEditor() {
  state.routePresetEditor = '';
  state.routePresetEditTitle = '';
  state.routePresetEditDetail = '';
  state.routePresetEditDsl = '';
  state.routePresetEditPreview = null;
  state.routePresetEditChecked = false;
}

function newRoutingPreset() {
  state.routeRuleDialog = false;
  state.routePresetDialog = true;
  state.routePresetEditor = 'custom:new';
  state.routePresetEditTitle = '';
  state.routePresetEditDetail = '';
  state.routePresetEditDsl = '';
  state.routePresetEditPreview = null;
  state.routePresetEditChecked = false;
  state.message = '';
  render();
}

function editRoutingPreset(key) {
  const rules = routePresetRules(key);
  if (!rules.length) return;
  const title = routePresetTitle(key);
  state.routeRuleDialog = false;
  state.routePresetDialog = true;
  state.routePresetEditor = key;
  state.routePresetEditTitle = title;
  state.routePresetEditDetail = routePresetDetail(key);
  state.routePresetEditDsl = [`# ${title}`, ...rules.flatMap(routeRuleToDslLines)].join('\n');
  state.routePresetEditPreview = parseRoutingDsl(state.routePresetEditDsl);
  state.routePresetEditChecked = false;
  state.message = '';
  render();
}

function previewRoutePresetEdit() {
  state.routePresetEditPreview = parseRoutingDsl(state.routePresetEditDsl);
  state.routePresetEditChecked = true;
  state.message = '';
  render();
}

function routePresetCheckResultView(preview) {
  const stats = dslPreviewStats(preview);
  const tone = stats.total ? 'ok' : 'bad';
  const text = stats.total
    ? `Распознано правил: ${stats.total}. Через proxy: ${stats.proxy}, напрямую: ${stats.direct}, блокировка: ${stats.block}, другое: ${stats.other}.`
    : 'Правила пока не распознаны. Вставьте строки маршрутизации и нажмите “Проверить” еще раз.';
  return `
    <div class="preset-check-result ${tone}">
      <strong>Результат проверки</strong>
      <span>${escapeHtml(text)}</span>
      ${(preview.warnings || []).length ? `<ul>${preview.warnings.slice(0, 6).map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
    </div>
    ${dslPreviewView(preview)}
  `;
}

function applyRoutePresetEdit() {
  const parsed = parseRoutingDsl(state.routePresetEditDsl);
  state.routePresetEditPreview = parsed;
  state.routePresetEditChecked = true;
  if (!parsed.rules.length) {
    state.message = 'Не нашёл правил в изменённом сценарии';
    render();
    return;
  }
  const rules = parsed.rules.map(normalizePresetRule);
  setRoutingDraft([...rules, ...routeRules()]);
  const title = state.routePresetEditTitle.trim() || routePresetTitle(state.routePresetEditor);
  clearRoutePresetEditor();
  state.routePresetDialog = false;
  state.selectedRoutePresets = [];
  state.message = `Добавлена подборка после правки: ${title}. Правил: ${rules.length}`;
  render();
}

function saveRoutePresetEdit() {
  const parsed = parseRoutingDsl(state.routePresetEditDsl);
  state.routePresetEditPreview = parsed;
  state.routePresetEditChecked = true;
  if (!parsed.rules.length) {
    state.message = 'Не нашёл правил в сценарии';
    render();
    return;
  }
  const title = state.routePresetEditTitle.trim() || 'Новая подборка';
  const key = state.routePresetEditor || 'custom:new';
  const existingId = key.startsWith('custom:') && key !== 'custom:new' ? key.slice(7) : '';
  const id = existingId || scenarioIdFromTitle(title);
  state.customRoutePresets[id] = {
    title,
    detail: state.routePresetEditDetail.trim(),
    rules: parsed.rules.map((rule) => JSON.parse(JSON.stringify(rule))),
    updatedAt: new Date().toISOString()
  };
  saveCustomRoutePresets();
  state.routePresetEditor = '';
  state.routePresetDialog = false;
  state.selectedRoutePresets = [`custom:${id}`];
  state.message = `Подборка сохранена: ${title}`;
  render();
}

function deleteCustomRoutePreset(key) {
  const id = String(key || '').startsWith('custom:') ? String(key).slice(7) : '';
  if (!id || !state.customRoutePresets[id]) return;
  const title = state.customRoutePresets[id].title || id;
  delete state.customRoutePresets[id];
  state.selectedRoutePresets = state.selectedRoutePresets.filter((item) => item !== key);
  saveCustomRoutePresets();
  state.message = `Подборка удалена: ${title}`;
  render();
}

function removeRoutingRule(index) {
  const current = routeRules();
  if (current[index]) {
    delete state.routeNames[routeRuleKey(current[index])];
    saveRouteNames();
  }
  const rules = current.filter((_, ruleIndex) => ruleIndex !== index);
  setRoutingDraft(rules);
  state.message = 'Правило удалено из черновика';
  render();
}

function disableRoutingRule(index) {
  const current = routeRules();
  const rule = current[index];
  if (!rule) return;
  const info = describeRouteRule(rule);
  const name = routeRuleName(rule, info);
  state.disabledRouteRules = [
    { id: `disabled-${Date.now()}-${index}`, rule: JSON.parse(JSON.stringify(rule)), name, disabledAt: new Date().toISOString() },
    ...state.disabledRouteRules
  ].slice(0, 120);
  saveDisabledRouteRules();
  setRoutingDraft(current.filter((_, ruleIndex) => ruleIndex !== index));
  state.message = `Правило отключено без удаления: ${name}`;
  render();
}

function restoreDisabledRouteRule(id) {
  const item = state.disabledRouteRules.find((entry) => entry.id === id);
  if (!item?.rule) return;
  state.disabledRouteRules = state.disabledRouteRules.filter((entry) => entry.id !== id);
  saveDisabledRouteRules();
  setRoutingDraft([item.rule, ...routeRules()]);
  if (item.name) setRouteRuleName(item.rule, item.name);
  state.message = `Правило возвращено наверх списка: ${item.name || 'без названия'}`;
  render();
}

function deleteDisabledRouteRule(id) {
  state.disabledRouteRules = state.disabledRouteRules.filter((entry) => entry.id !== id);
  saveDisabledRouteRules();
  state.message = 'Отключенное правило удалено из панели';
  render();
}

function visibleRoutingRuleItems(limit = 80) {
  const search = state.routeSearch.trim().toLowerCase();
  return routeRules()
    .map((rule, index) => {
      const info = describeRouteRule(rule);
      return { rule, index, info, name: routeRuleName(rule, info), source: routeRuleSource(rule) };
    })
    .filter(({ info, name, source }) => {
      if (!search) return true;
      return `${name} ${source} ${info.kind} ${info.value} ${info.outbound} ${info.detail}`.toLowerCase().includes(search);
    })
    .slice(0, limit);
}

function routeRowHtml(item, options, rulesLength) {
  const { index, info, name, source } = item;
  const selectedTarget = encodedRouteTarget(item.rule);
  const category = routeCategoryForRule(item.rule);
  const managed = isRuOpenRayManagedRoute(item.rule);
  const targetOptions = options.some((option) => option.value === selectedTarget)
    ? options
    : [{ value: selectedTarget, label: item.rule.balancerTag ? `Балансировщик · ${item.rule.balancerTag}` : readableRouteTag(item.rule.outboundTag || 'не задано') }, ...options];
  const section = routeSectionDefinitions().find((entry) => entry.id === category) || routeSectionDefinitions().find((entry) => entry.id === 'other');
  return `<article class="route-row route-row-${escapeHtml(category)} ${managed ? 'route-row-managed' : ''}" draggable="${managed ? 'false' : 'true'}" data-route-index="${index}">
    <div class="route-order">
      <button class="route-drag-handle" type="button" ${managed ? 'disabled' : ''} title="${managed ? 'Служебное правило управляется настройками RuOpenRay' : 'Перетащить правило'}" aria-label="${managed ? 'Служебное правило управляется настройками RuOpenRay' : 'Перетащить правило'}">${managed ? '•' : '⋮⋮'}</button>
      <span>${index + 1}</span>
    </div>
    <div class="route-kind-stack">
      <span class="route-category route-category-${escapeHtml(category)}">${escapeHtml(section?.title || 'Другое')}</span>
      <span class="route-kind">${escapeHtml(info.kind)}</span>
    </div>
    <div class="route-title">
      <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
      <span>${escapeHtml(source)} · выше = раньше</span>
    </div>
    <div class="route-main">
      <strong title="${escapeHtml(info.fullValue)}">${escapeHtml(info.value)}</strong>
      <span>${escapeHtml(info.detail)}</span>
    </div>
    <select class="route-outbound" data-route-target="${index}" ${managed ? 'disabled' : ''} title="${managed ? 'Служебное правило меняется через профильный раздел' : ''}">
      ${targetOptions.map((option) => `<option value="${escapeHtml(option.value)}" ${selectedTarget === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
    </select>
    <div class="route-actions">
      <button class="icon-btn route-action-btn move-up" type="button" data-route-move="${index}" data-direction="-1" ${index === 0 || managed ? 'disabled' : ''} title="Поднять выше" aria-label="Поднять правило выше">↑</button>
      <button class="icon-btn route-action-btn move-down" type="button" data-route-move="${index}" data-direction="1" ${index === rulesLength - 1 || managed ? 'disabled' : ''} title="Опустить ниже" aria-label="Опустить правило ниже">↓</button>
      <button class="icon-btn route-action-btn edit" type="button" data-route-edit="${index}" ${managed ? 'disabled' : ''} title="${managed ? 'Служебное правило меняется через DNS, Перехват или Статистику Xray' : 'Править'}" aria-label="Править правило">✎</button>
      <button class="icon-btn route-action-btn disable" type="button" data-route-disable="${index}" ${managed ? 'disabled' : ''} title="${managed ? 'Служебное правило нельзя поставить на паузу из общего списка' : 'Отключить без удаления'}" aria-label="Отключить правило без удаления">⏸</button>
      <button class="icon-btn route-action-btn danger" type="button" data-route-delete="${index}" ${managed ? 'disabled' : ''} title="${managed ? 'Служебное правило удаляется отключением соответствующей функции' : 'Удалить'}" aria-label="Удалить правило">×</button>
    </div>
  </article>`;
}

function orderedRouteList(items, options, rulesLength) {
  if (!items.length) {
    return `<p class="muted route-empty-state">${state.routeSearch.trim() ? 'Правил по этому поиску нет.' : 'Правил пока нет. Добавьте правило или выберите подборку.'}</p>`;
  }
  return `<section class="route-ordered-list">
    <header class="route-order-head">
      <strong>Порядок выполнения Xray</strong>
      <span>Сверху вниз: правило №1 проверяется первым. Перетаскивание меняет реальный порядок в конфигурации.</span>
    </header>
    <div class="route-section-list">
      ${items.map((item) => routeRowHtml(item, options, rulesLength)).join('')}
    </div>
  </section>`;
}

function disableVisibleRoutingRules() {
  const visible = visibleRoutingRuleItems(80);
  if (!visible.length) return;
  const current = routeRules();
  const disabledIndexes = new Set(visible.map((item) => item.index));
  const disabled = visible.map(({ rule, name, index }) => ({
    id: `disabled-${Date.now()}-${index}`,
    rule: JSON.parse(JSON.stringify(rule)),
    name,
    disabledAt: new Date().toISOString()
  }));
  state.disabledRouteRules = [...disabled, ...state.disabledRouteRules].slice(0, 160);
  saveDisabledRouteRules();
  setRoutingDraft(current.filter((_, index) => !disabledIndexes.has(index)));
  state.message = `Отключено правил: ${disabled.length}. Их можно вернуть из списка ниже.`;
  render();
}

function restoreAllDisabledRouteRules() {
  if (!state.disabledRouteRules.length) return;
  const restored = state.disabledRouteRules.map((item) => item.rule).filter(Boolean);
  for (const item of state.disabledRouteRules) {
    if (item.rule && item.name) setRouteRuleName(item.rule, item.name);
  }
  state.disabledRouteRules = [];
  saveDisabledRouteRules();
  setRoutingDraft([...restored, ...routeRules()]);
  state.message = `Возвращено правил: ${restored.length}. Они добавлены в начало списка.`;
  render();
}

function updateRoutingTarget(index, targetValue) {
  const rules = routeRules().map((rule, ruleIndex) => {
    if (ruleIndex !== index) return rule;
    const [kind, ...rest] = String(targetValue || '').split(':');
    const tag = rest.join(':') || 'proxy';
    const next = { ...rule };
    delete next.outboundTag;
    delete next.balancerTag;
    if (kind === 'balancer') next.balancerTag = tag;
    else next.outboundTag = tag;
    copyRouteRuleName(rule, next);
    return next;
  });
  setRoutingDraft(rules);
  state.message = 'Цель правила изменена в черновике';
  render();
}

function moveRoutingRule(index, direction) {
  reorderRoutingRule(index, direction > 0 ? index + 2 : index - 1);
}

function reorderRoutingRule(fromIndex, toIndex) {
  const rules = [...routeRules()];
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= rules.length || toIndex > rules.length || fromIndex === toIndex) return;
  const [rule] = rules.splice(fromIndex, 1);
  if (fromIndex < toIndex) toIndex -= 1;
  if (toIndex === fromIndex) return;
  rules.splice(toIndex, 0, rule);
  setRoutingDraft(rules);
  state.message = 'Порядок правил изменен. Xray читает правила сверху вниз.';
  render();
}

function renameRoutingRule(index) {
  const rule = routeRules()[index];
  if (!rule) return;
  const info = describeRouteRule(rule);
  const nextName = prompt('Название правила', routeRuleName(rule, info));
  if (nextName === null) return;
  setRouteRuleName(rule, nextName);
  state.message = nextName.trim() ? 'Название правила сохранено' : 'Название сброшено, будет показано автоматически';
  render();
}

function prepareTransparentDraft() {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  next.inbounds = Array.isArray(next.inbounds) ? next.inbounds : [];
  next.outbounds = Array.isArray(next.outbounds) ? next.outbounds : [];
  next.routing = next.routing && typeof next.routing === 'object' ? next.routing : {};
  next.routing.rules = Array.isArray(next.routing.rules) ? next.routing.rules : [];
  const redirectMode = state.firewallRouterMode === 'redirect';
  const sockoptMode = redirectMode ? 'redirect' : 'tproxy';
  const transparentNetwork = redirectMode ? 'tcp' : 'tcp,udp';

  const transparentInbound = next.inbounds.find((item) => item?.tag === 'transparent_ipv4' || item?.streamSettings?.sockopt?.tproxy);
  if (!transparentInbound) {
    next.inbounds.push({
      tag: 'transparent_ipv4',
      port: 52345,
      listen: '0.0.0.0',
      protocol: 'dokodemo-door',
      sniffing: { enabled: true, destOverride: ['http', 'tls'], routeOnly: true },
      settings: { network: transparentNetwork, followRedirect: true },
      streamSettings: { sockopt: { tproxy: sockoptMode } }
    });
  } else {
    transparentInbound.settings = transparentInbound.settings && typeof transparentInbound.settings === 'object' ? transparentInbound.settings : {};
    transparentInbound.settings.network = transparentNetwork;
    transparentInbound.settings.followRedirect = true;
    transparentInbound.streamSettings = transparentInbound.streamSettings && typeof transparentInbound.streamSettings === 'object' ? transparentInbound.streamSettings : {};
    transparentInbound.streamSettings.sockopt = transparentInbound.streamSettings.sockopt && typeof transparentInbound.streamSettings.sockopt === 'object' ? transparentInbound.streamSettings.sockopt : {};
    transparentInbound.streamSettings.sockopt.tproxy = sockoptMode;
  }

  if (!next.outbounds.some((item) => item?.tag === 'dns-out')) {
    next.outbounds.push({
      tag: 'dns-out',
      protocol: 'dns',
      settings: { address: '8.8.8.8', port: 53, network: 'udp' }
    });
  }

  normalizeSetupRules(next);

  syncConfig(next);
  state.message = 'Черновик прозрачного прокси подготовлен. Проверьте конфигурацию и примените изменения.';
  render();
}

function prepareDnsInboundDraft() {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  next.inbounds = Array.isArray(next.inbounds) ? next.inbounds : [];
  next.outbounds = Array.isArray(next.outbounds) ? next.outbounds : [];
  next.routing = next.routing && typeof next.routing === 'object' ? next.routing : {};
  next.routing.rules = Array.isArray(next.routing.rules) ? next.routing.rules : [];
  next.dns = next.dns && typeof next.dns === 'object' ? next.dns : {};
  next.dns.servers = Array.isArray(next.dns.servers) && next.dns.servers.length ? next.dns.servers : ['https://dns.google/dns-query'];

  if (!next.inbounds.some((item) => item?.tag === 'ruopenray_dns_in')) {
    next.inbounds.push({
      tag: 'ruopenray_dns_in',
      listen: '127.0.0.1',
      port: 5353,
      protocol: 'dokodemo-door',
      settings: { address: '8.8.8.8', port: 53, network: 'tcp,udp' }
    });
  }
  if (!next.outbounds.some((item) => item?.tag === 'dns-out')) {
    next.outbounds.push({
      tag: 'dns-out',
      protocol: 'dns',
      settings: { address: '8.8.8.8', port: 53, network: 'udp' }
    });
  }
  const dnsRule = { type: 'field', inboundTag: ['ruopenray_dns_in'], outboundTag: 'dns-out' };
  if (!next.routing.rules.some((rule) => JSON.stringify(rule) === JSON.stringify(dnsRule))) {
    next.routing.rules.unshift(dnsRule);
  }
  syncConfig(next);
  state.message = 'DNS inbound подготовлен в черновике. После применения dnsmasq можно направить на 127.0.0.1#5353.';
  render();
}

async function copyFirewallCommands() {
  await navigator.clipboard.writeText(firewallCommands());
  state.message = 'Команды OpenWrt скопированы в буфер обмена';
  render();
}

async function copyInstallCommand(withXray = false) {
  await navigator.clipboard.writeText(githubInstallCommand(withXray));
  state.message = 'Команда установки скопирована';
  render();
}

function removeOutbound(index) {
  const outbound = configOutbounds()[index];
  const tag = outbound?.tag || '';
  if (['direct', 'block', 'dns-out'].includes(tag)) {
    state.message = 'Служебные направления direct, block и dns-out лучше не удалять';
    render();
    return;
  }
  const next = JSON.parse(JSON.stringify(state.config || {}));
  next.outbounds = configOutbounds().filter((_, itemIndex) => itemIndex !== index);
  syncConfig(next);
  state.message = `Сервер ${tag || index + 1} удален из черновика`;
  render();
}

async function routeAllToOutbound(tag, { apply = true } = {}) {
  if (state.configApplying) return;
  const before = proxyRuleStrategyStats();
  setActiveProxyDraft(tag);
  const after = proxyRuleStrategyStats(tag);
  state.pendingServerTag = '';
  const switched = Math.max(before.primary, after.primary);
  const pinned = after.pinned ? `, закрепленных на других серверах не тронуто: ${after.pinned}` : '';
  if (!apply) {
    state.message = `Основное proxy-направление теперь ведет в ${tag}. Переключено правил: ${switched}${pinned}`;
    render();
    return;
  }
  state.message = `Подключаю ${tag}: меняю proxy-направление, записываю config.json и перезапускаю Xray...`;
  render();
  await applyConfig({
    successMessage: `Подключен ${tag}. Переключено правил: ${switched}${pinned}`
  });
}

function resetRouteBalancerForm() {
  state.routeBalancerEditingIndex = -1;
  state.routeBalancerTag = '';
  state.routeBalancerStrategy = 'random';
  state.routeBalancerSelectors = '';
  state.routeBalancerFallback = '';
}

function openRouteBalancerDialog(index = -1) {
  const balancer = routeBalancers()[index];
  if (balancer) {
    state.routeBalancerEditingIndex = index;
    state.routeBalancerTag = balancer.tag || '';
    state.routeBalancerStrategy = balancer.strategy?.type || 'random';
    state.routeBalancerSelectors = Array.isArray(balancer.selector) ? balancer.selector.join('\n') : '';
    state.routeBalancerFallback = balancer.fallbackTag || '';
  } else {
    resetRouteBalancerForm();
  }
  state.routeBalancerDialog = true;
  state.message = '';
  render();
}

function closeRouteBalancerDialog() {
  state.routeBalancerDialog = false;
  resetRouteBalancerForm();
  render();
}

function setRouteBalancerSelector(tag, enabled) {
  const selectors = splitRouteValues(state.routeBalancerSelectors);
  const next = enabled
    ? [...selectors, tag]
    : selectors.filter((item) => item !== tag);
  state.routeBalancerSelectors = [...new Set(next)].join('\n');
}

function moveRouteBalancerSelector(tag, direction) {
  const selectors = splitRouteValues(state.routeBalancerSelectors);
  const index = selectors.indexOf(tag);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= selectors.length) return;
  [selectors[index], selectors[nextIndex]] = [selectors[nextIndex], selectors[index]];
  state.routeBalancerSelectors = selectors.join('\n');
}

function saveRouteBalancer() {
  const tag = state.routeBalancerTag.trim();
  const selectors = splitRouteValues(state.routeBalancerSelectors);
  if (!tag) {
    state.message = 'Укажите имя балансировщика';
    render();
    return;
  }
  if (!selectors.length) {
    state.message = 'Выберите хотя бы один сервер или подписку для балансировщика';
    render();
    return;
  }
  const editing = state.routeBalancerEditingIndex;
  const exists = routeBalancers().some((item, index) => item?.tag === tag && index !== editing);
  if (exists) {
    state.message = `Балансировщик ${tag} уже есть`;
    render();
    return;
  }
  const balancer = {
    tag,
    selector: selectors,
    strategy: { type: state.routeBalancerStrategy || 'random' }
  };
  if (state.routeBalancerFallback.trim()) balancer.fallbackTag = state.routeBalancerFallback.trim();
  const balancers = [...routeBalancers()];
  if (editing >= 0 && balancers[editing]) balancers[editing] = balancer;
  else balancers.unshift(balancer);
  setRouteBalancersDraft(balancers);
  const observerType = strategyObserverType(balancer.strategy.type);
  if (observerType) syncConfig(applyObserverForStrategy(state.config, balancer.strategy.type, selectors));
  state.routeBalancer = tag;
  state.routeTargetType = 'balancer';
  state.routeBalancerDialog = false;
  resetRouteBalancerForm();
  state.message = `Группа серверов ${tag} сохранена в черновик${observerType ? `, ${observerLabel(observerType)} включен для Xray` : ''}`;
  render();
}

function removeRouteBalancer(index) {
  const balancer = routeBalancers()[index];
  if (!balancer) return;
  const used = routeRules().some((rule) => rule.balancerTag === balancer.tag);
  if (used) {
    state.message = `Балансировщик ${balancer.tag} используется в правилах. Сначала переназначьте эти правила.`;
    render();
    return;
  }
  setRouteBalancersDraft(routeBalancers().filter((_, itemIndex) => itemIndex !== index));
  if (state.routeBalancer === balancer.tag) state.routeBalancer = '';
  state.message = `Балансировщик ${balancer.tag} удален из черновика`;
  render();
}

async function checkServers(tags = [], options = {}) {
  const startedAt = Date.now();
  const renderAfter = options.renderAfter !== false;
  const requestedTags = tags.length
    ? tags
    : proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean);
  state.serverChecking = true;
  state.serverCheckingTags = requestedTags;
  state.message = requestedTags.length === 1 ? 'Проверяю выбранный прокси...' : 'Проверяю все прокси...';
  if (renderAfter) render();
  const result = await request('/api/outbounds/check', {
    method: 'POST',
    body: JSON.stringify({
      tags: requestedTags,
      timeoutMs: Number(state.serverCheckTimeout) || 2500,
      attempts: Number(state.serverCheckAttempts) || 1,
      mode: state.serverCheckMode,
      url: state.serverCheckUrl
    })
  });
  for (const item of result.results || []) {
    if (item.tag) state.serverChecks[item.tag] = item;
  }
  const alive = (result.results || []).filter((item) => item.ok).length;
  state.serverCheckHistory = [
    {
      at: new Date().toISOString(),
      total: result.results?.length || 0,
      alive,
      results: result.results || []
    },
    ...state.serverCheckHistory
  ].slice(0, 12);
  state.message = requestedTags.length === 1
    ? `Проверка сервера: ${alive ? 'доступен' : 'нет ответа'}`
    : `Проверено серверов: ${result.results?.length || 0}, доступны: ${alive}`;
  await keepOperationVisible(startedAt);
  state.serverChecking = false;
  state.serverCheckingTags = [];
  if (renderAfter) render();
}

async function fallbackSubscriptionPool(tag) {
  const result = await request('/api/subscriptions/fallback', {
    method: 'POST',
    body: JSON.stringify({
      tag,
      mode: state.serverCheckMode,
      url: state.serverCheckUrl,
      timeoutMs: Number(state.serverCheckTimeout) || 2500,
      attempts: Number(state.serverCheckAttempts) || 1,
      restart: true
    })
  });
  state.message = result.ok
    ? `Подписка ${tag}: выбран ${result.selected?.tag || result.selected?.address || 'новый сервер'}`
    : `Подписка ${tag}: ${result.error || 'доступный сервер не найден'}`;
  await refresh();
}

async function scanSni() {
  const target = state.sniTarget.trim() || outboundAddress(activeProxyOutbound() || {}).split(':')[0] || '';
  if (!target) {
    state.message = 'Укажите IP или домен для SNI-поиска';
    render();
    return;
  }
  state.sniTarget = target;
  state.sniScanning = true;
  state.message = `Ищу TLS/SNI точки рядом с ${target}...`;
  render();
  try {
    state.sniScan = await request('/api/sni/scan', {
      method: 'POST',
      body: JSON.stringify({
        target,
        cidr: Number(state.sniCidr) || 24,
        timeoutMs: Number(state.sniTimeout) || 1500,
        threads: Number(state.sniThreads) || 64,
        limit: Number(state.sniLimit) || 256
      })
    });
    state.message = `SNI-поиск завершен: найдено ${state.sniScan.results?.length || 0} из ${state.sniScan.scanned || 0} адресов`;
  } finally {
    state.sniScanning = false;
    render();
  }
}

function focusSniResult(index) {
  const normalized = Number(index);
  if (!Number.isFinite(normalized)) return;
  state.sniFocusedIndex = normalized;
  document.querySelectorAll('.sni-row.focused').forEach((row) => row.classList.remove('focused'));
  const row = document.querySelector(`[data-sni-result="${normalized}"]`);
  if (!row) return;
  row.classList.add('focused');
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function addDeviceRule() {
  const ip = normalizeDeviceIp(state.deviceIp);
  if (!ip) {
    state.message = 'Укажите IP устройства в LAN, например 192.168.50.42';
    render();
    return;
  }
  const rule = {
    type: 'field',
    outboundTag: state.deviceMode,
    source: [ip]
  };
  const inbounds = proxyInboundTags();
  if (inbounds) rule.inboundTag = inbounds;
  setRoutingDraft([rule, ...routeRules()]);
  state.deviceIp = '';
  state.deviceName = '';
  state.message = `Правило для устройства ${ip} добавлено в черновик`;
  render();
}

function updateDeviceRule(index, outboundTag) {
  const rules = routeRules().map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, outboundTag } : rule));
  setRoutingDraft(rules);
  state.message = 'Режим устройства изменен в черновике';
  render();
}

function removeDeviceRule(index) {
  const rules = routeRules().filter((_, ruleIndex) => ruleIndex !== index);
  setRoutingDraft(rules);
  state.message = 'Правило устройства удалено из черновика';
  render();
}

function addDnsServer() {
  const address = String(state.dnsAddress || '').trim();
  if (!address) {
    state.message = 'Укажите DNS-сервер, например https://dns.google:443/dns-query';
    render();
    return;
  }
  const domains = splitRouteValues(state.dnsDomains);
  const normalized = normalizeDnsAddressInput(address);
  const server = typeof normalized.config === 'object'
    ? { ...normalized.config, ...(domains.length ? { domains } : {}) }
    : domains.length
      ? { address: normalized.config, domains }
      : normalized.config;
  const next = JSON.parse(JSON.stringify(state.config || {}));
  next.dns = next.dns && typeof next.dns === 'object' ? next.dns : {};
  next.dns.servers = Array.isArray(next.dns.servers) ? next.dns.servers : [];
  next.dns.servers.push(server);
  syncConfig(next);
  state.dnsDomains = '';
  state.message = 'DNS-сервер добавлен в черновик';
  render();
}

function dnsHostValueFromInput(value) {
  const values = splitRouteValues(value);
  if (!values.length) return '';
  return values.length === 1 ? values[0] : values;
}

function dnsHostValueToInput(value) {
  if (Array.isArray(value)) return value.join(', ');
  return String(value || '');
}

function saveDnsHost() {
  const host = String(state.dnsHostName || '').trim();
  const value = dnsHostValueFromInput(state.dnsHostValue);
  if (!host || !value || (Array.isArray(value) && !value.length)) {
    state.message = 'Укажите домен и значение host-подмены';
    render();
    return;
  }
  const next = JSON.parse(JSON.stringify(state.config || {}));
  next.dns = next.dns && typeof next.dns === 'object' ? next.dns : {};
  next.dns.hosts = next.dns.hosts && typeof next.dns.hosts === 'object' && !Array.isArray(next.dns.hosts) ? next.dns.hosts : {};
  next.dns.hosts[host] = value;
  syncConfig(next);
  state.dnsHostName = '';
  state.dnsHostValue = '';
  state.message = 'Host-подмена сохранена в черновик';
  render();
}

function editDnsHost(host) {
  const hosts = dnsConfig().hosts || {};
  state.dnsHostName = host;
  state.dnsHostValue = dnsHostValueToInput(hosts[host]);
  state.message = '';
  render();
}

function removeDnsHost(host) {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  next.dns = next.dns && typeof next.dns === 'object' ? next.dns : {};
  next.dns.hosts = next.dns.hosts && typeof next.dns.hosts === 'object' && !Array.isArray(next.dns.hosts) ? next.dns.hosts : {};
  delete next.dns.hosts[host];
  syncConfig(next);
  if (state.dnsHostName === host) {
    state.dnsHostName = '';
    state.dnsHostValue = '';
  }
  state.message = 'Host-подмена удалена из черновика';
  render();
}

function ensureDnsServer(next, server) {
  next.dns = next.dns && typeof next.dns === 'object' ? next.dns : {};
  next.dns.servers = Array.isArray(next.dns.servers) ? next.dns.servers : [];
  const target = typeof server === 'string' ? server : server.address;
  const exists = next.dns.servers.some((item) => {
    const address = typeof item === 'string' ? item : item?.address;
    return address === target;
  });
  if (!exists) next.dns.servers.push(server);
}

function applyDnsGuardPreset(mode) {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  if (mode === 'secure') {
    ensureDnsServer(next, 'https://dns.google:443/dns-query');
    ensureDnsServer(next, 'https://dns.adguard-dns.com/dns-query');
  }
  if (mode === 'ru') {
    ensureDnsServer(next, 'https://common.dot.dns.yandex.net/dns-query');
    ensureDnsServer(next, 'https://dns.adguard-dns.com/dns-query');
  }
  if (mode === 'strict') {
    ensureDnsServer(next, 'https://dns.google:443/dns-query');
    ensureDnsServer(next, 'https://dns.adguard-dns.com/dns-query');
    const rules = Array.isArray(next.routing?.rules) ? next.routing.rules : [];
    const hasUdp443 = rules.some((rule) => String(rule.network || '').includes('udp') && String(rule.port || '') === '443');
    next.routing = next.routing && typeof next.routing === 'object' ? next.routing : {};
    next.routing.rules = hasUdp443
      ? rules
      : [{ type: 'field', network: 'udp', port: '443', outboundTag: activeProxyTag() || 'proxy' }, ...rules];
  }
  syncConfig(next);
  state.message = mode === 'strict'
    ? 'Защита DNS добавила DoH и правило UDP/443 в черновик'
    : 'Защита DNS добавила защищенные DNS-серверы в черновик';
  render();
}

function removeDnsServer(index) {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  next.dns = next.dns && typeof next.dns === 'object' ? next.dns : {};
  next.dns.servers = Array.isArray(next.dns.servers) ? next.dns.servers.filter((_, itemIndex) => itemIndex !== index) : [];
  syncConfig(next);
  state.message = 'DNS-сервер удален из черновика';
  render();
}

async function checkDnsServer() {
  const normalized = normalizeDnsAddressInput(state.dnsAddress);
  const result = await request('/api/dns/check', {
    method: 'POST',
    body: JSON.stringify({ server: normalized.check || state.dnsAddress, host: state.dnsCheckHost })
  });
  state.dnsCheckResult = result;
  state.message = result.ok ? 'DNS проверен' : 'DNS не ответил';
  render();
}

async function applyLanDnsUpstream() {
  state.lanDnsSaving = true;
  render();
  try {
    const result = await request('/api/dns/lan-upstream', {
      method: 'POST',
      body: JSON.stringify({
        mode: state.lanDnsMode,
        upstream: state.lanDnsUpstream,
        restart: state.lanDnsRestart
      })
    });
    syncLanDnsStatus(result);
    state.message = result.ok ? 'LAN DNS настроен, dnsmasq обновлен' : (result.error || 'Не удалось настроить LAN DNS');
  } finally {
    state.lanDnsSaving = false;
    render();
  }
}

function applyDnsBootstrapHosts() {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  ensureDnsBootstrapHosts(next);
  syncConfig(next);
  state.message = 'Bootstrap hosts для DoH добавлены в черновик. Проверьте и примените конфигурацию.';
  render();
}

async function previewLanDnsUpstream() {
  state.lanDnsSaving = true;
  state.lanDnsPreview = null;
  render();
  try {
    const result = await request('/api/dns/lan-upstream', {
      method: 'POST',
      body: JSON.stringify({
        mode: state.lanDnsMode,
        upstream: state.lanDnsUpstream,
        restart: state.lanDnsRestart,
        dryRun: true
      })
    });
    syncLanDnsStatus(result);
    state.message = result.ok ? 'План LAN DNS готов: проверьте команды перед применением' : (result.error || 'Не удалось подготовить план LAN DNS');
  } finally {
    state.lanDnsSaving = false;
    render();
  }
}

function loginView() {
  const eyeIcon = state.passwordVisible
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path><path d="M9.9 4.2A10.5 10.5 0 0 1 12 4c5 0 8.6 3.6 10 8a13.3 13.3 0 0 1-3 4.7"></path><path d="M6.6 6.6A13 13 0 0 0 2 12c1.4 4.4 5 8 10 8 1.5 0 2.9-.3 4.1-.9"></path></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  app.innerHTML = `
    <main class="login">
      <form class="login-card" id="loginForm">
        <div class="brand" style="margin-bottom: 18px">
          <img class="brand-mark" src="/assets/ruopenray-icon-512.png" alt="" />
          <div><strong>RuOpenRay UI</strong><span>Панель управления Xray</span></div>
        </div>
        <div class="form-row">
          <label>Пароль</label>
          <div class="password-field">
            <input id="password" type="${state.passwordVisible ? 'text' : 'password'}" value="${escapeHtml(state.password)}" autocomplete="current-password" autofocus />
            <button type="button" class="password-toggle" data-action="togglePassword" aria-label="${state.passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}" title="${state.passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}">${eyeIcon}</button>
          </div>
        </div>
        <label class="login-remember">
          <input id="rememberPassword" type="checkbox" ${state.rememberPassword ? 'checked' : ''} />
          <span>Запомнить пароль в этом браузере</span>
        </label>
        <button class="btn" type="submit" style="width: 100%; height: 42px">Войти</button>
        ${state.message ? `<p class="notice" style="margin-top: 14px">${escapeHtml(state.message)}</p>` : ''}
      </form>
    </main>
  `;
  document.querySelector('#loginForm').addEventListener('submit', login);
  document.querySelector('#password').addEventListener('input', (event) => {
    state.password = event.target.value;
    if (state.rememberPassword) localStorage.setItem(savedPasswordStorageKey, state.password);
  });
  document.querySelector('#rememberPassword').addEventListener('change', (event) => {
    state.rememberPassword = event.target.checked;
    if (state.rememberPassword) localStorage.setItem(savedPasswordStorageKey, state.password);
    else localStorage.removeItem(savedPasswordStorageKey);
  });
  document.querySelector('[data-action="togglePassword"]').addEventListener('click', () => {
    state.passwordVisible = !state.passwordVisible;
    loginView();
    const password = document.querySelector('#password');
    password.focus();
    password.setSelectionRange(password.value.length, password.value.length);
  });
}

const setupView = createSetupView({
  state,
  shellQuote,
  escapeHtml,
  byteSize,
  setupReadiness,
  loadSetupSnapshot,
  firewallReadyStatus,
  firewallPorts,
});

function normalizeCoreVersion(...args) {
  return setupView.normalizeCoreVersion(...args);
}

function versionParts(...args) {
  return setupView.versionParts(...args);
}

function compareCoreVersions(...args) {
  return setupView.compareCoreVersions(...args);
}

function installedCoreVersion(...args) {
  return setupView.installedCoreVersion(...args);
}

function releaseDate(...args) {
  return setupView.releaseDate(...args);
}

function filteredCoreReleases(...args) {
  return setupView.filteredCoreReleases(...args);
}

function coreUpdateInfo(...args) {
  return setupView.coreUpdateInfo(...args);
}

function coreReleaseBadge(...args) {
  return setupView.coreReleaseBadge(...args);
}

function appVersionPill(...args) {
  return setupView.appVersionPill(...args);
}

function coreArchitectureText(...args) {
  return setupView.coreArchitectureText(...args);
}

function githubInstallCommand(...args) {
  return setupView.githubInstallCommand(...args);
}

function setupFlowStep(...args) {
  return setupView.setupFlowStep(...args);
}

function setupFlowGuide(...args) {
  return setupView.setupFlowGuide(...args);
}

function setupWizardDialog(...args) {
  return setupView.setupWizardDialog(...args);
}

function installWizardDialog(...args) {
  return setupView.installWizardDialog(...args);
}

function coreUpdateDialog(...args) {
  return setupView.coreUpdateDialog(...args);
}
const dashboardView = createDashboardView({
  state,
  labels,
  escapeHtml,
  routeStats,
  deviceStats,
  dnsStats,
  coreUpdateInfo,
  proxyOutbounds,
  deviceRules,
  outboundAddress,
  logsPanel,
  byteSize,
  fmtUptime,
  byteRate,
  numberValue,
  activeProxyTag,
  configOutbounds,
  releaseDate,
  coreReleaseBadge,
  outboundTransport,
  proxyDirectionSummary,
  proxyDirectionTitle,
  proxyDirectionDetail,
  dashboardProxyDirectionCards,
  checkForTag,
  checkLabel,
  checkMethodLabel,
});

function checkModeLabel(...args) {
  return dashboardView.checkModeLabel(...args);
}

function coreStat(...args) {
  return dashboardView.coreStat(...args);
}

function dashboard(...args) {
  return dashboardView.dashboard(...args);
}

function dashboardServerSwitch(...args) {
  return dashboardView.dashboardServerSwitch(...args);
}

function dashboardSystemStats(...args) {
  return dashboardView.dashboardSystemStats(...args);
}

function flowStep(...args) {
  return dashboardView.flowStep(...args);
}

function isCheckingServer(...args) {
  return dashboardView.isCheckingServer(...args);
}

function metricIcon(...args) {
  return dashboardView.metricIcon(...args);
}

function metricStat(...args) {
  return dashboardView.metricStat(...args);
}

function operationProgressView(...args) {
  return dashboardView.operationProgressView(...args);
}

function quickAction(...args) {
  return dashboardView.quickAction(...args);
}

function serverCheckButton(...args) {
  return dashboardView.serverCheckButton(...args);
}

function serverTrafficView(...args) {
  return dashboardView.serverTrafficView(...args);
}

function stat(...args) {
  return dashboardView.stat(...args);
}

function trafficMetricStat(...args) {
  return dashboardView.trafficMetricStat(...args);
}

function trafficMonitor(...args) {
  return dashboardView.trafficMonitor(...args);
}

function xrayActiveGraph(...args) {
  return dashboardView.xrayActiveGraph(...args);
}

function xrayActiveStats(...args) {
  return dashboardView.xrayActiveStats(...args);
}

function xrayCoreDashboard(...args) {
  return dashboardView.xrayCoreDashboard(...args);
}

function xrayDashboardStats(...args) {
  return dashboardView.xrayDashboardStats(...args);
}

function xrayStatsGroupLabel(...args) {
  return dashboardView.xrayStatsGroupLabel(...args);
}

function xrayStatsOutbound(...args) {
  return dashboardView.xrayStatsOutbound(...args);
}

function xrayStatsOutboundConfig(...args) {
  return dashboardView.xrayStatsOutboundConfig(...args);
}

function xrayStatsPanel(...args) {
  return dashboardView.xrayStatsPanel(...args);
}

function xrayStatsPeriodLabel(...args) {
  return dashboardView.xrayStatsPeriodLabel(...args);
}

function xrayStatsSeriesPath(...args) {
  return dashboardView.xrayStatsSeriesPath(...args);
}

function xrayStatsShare(...args) {
  return dashboardView.xrayStatsShare(...args);
}

function xrayStatsTotals(...args) {
  return dashboardView.xrayStatsTotals(...args);
}

const importDialogView = createImportDialogView({
  state,
  escapeHtml,
  checkForTag,
  checkLabel,
  outboundTransport,
  outboundAddress,
  serverCheckButton,
  suggestedSubscriptionBalancerTag,
  serverImportPreviewItem,
});

function importButton(...args) {
  return importDialogView.importButton(...args);
}

function serverMini(...args) {
  return importDialogView.serverMini(...args);
}

function emptyMini(...args) {
  return importDialogView.emptyMini(...args);
}

function importDialog(...args) {
  return importDialogView.importDialog(...args);
}

function previewBox(...args) {
  return importDialogView.previewBox(...args);
}

const serversView = createServersView({
  activeProxyTag,
  checkForTag,
  configOutbounds,
  escapeHtml,
  isSystemOutbound,
  operationProgressView,
  outboundAddress,
  outboundTransport,
  outboundUsage,
  proxyOutbounds,
  proxyRuleStrategyStats,
  routingBalancersPanel,
  serverCheckButton,
  serverMetaChips,
  serverStats,
  serverTrafficView,
  state,
  stat,
});

function serverCard(...args) {
  return serversView.serverCard(...args);
}

function subscriptionPoolCard(...args) {
  return serversView.subscriptionPoolCard(...args);
}

function serverAvailabilityPanel(...args) {
  return serversView.serverAvailabilityPanel(...args);
}

function serversPanel(...args) {
  return serversView.serversPanel(...args);
}

const sniView = createSniView({
  state,
  escapeHtml,
  stat,
  outboundAddress,
  activeProxyOutbound,
});

function clamp(...args) {
  return sniView.clamp(...args);
}

function ipParts(...args) {
  return sniView.ipParts(...args);
}

function sniRadar(...args) {
  return sniView.sniRadar(...args);
}

function sniPanel(...args) {
  return sniView.sniPanel(...args);
}

const geoView = createGeoView({ state, escapeHtml, stat });

function fileSize(...args) {
  return geoView.fileSize(...args);
}

function geoSelectedPresetIds(...args) {
  return geoView.geoSelectedPresetIds(...args);
}

function geoSelectedPresets(...args) {
  return geoView.geoSelectedPresets(...args);
}

function geoRequiredSpace(...args) {
  return geoView.geoRequiredSpace(...args);
}

function geoDiskWarning(...args) {
  return geoView.geoDiskWarning(...args);
}

function selectedGeoPreset(...args) {
  return geoView.selectedGeoPreset(...args);
}

function geoActionLabel(...args) {
  return geoView.geoActionLabel(...args);
}

function geoNandCard(...args) {
  return geoView.geoNandCard(...args);
}

function geoPurposeLabel(...args) {
  return geoView.geoPurposeLabel(...args);
}

function geoPanel(...args) {
  return geoView.geoPanel(...args);
}

const dnsView = createDnsView({
  activeProxyTag,
  configInbounds,
  currentDnsMode,
  describeDnsServer,
  dnsAnswerText,
  dnsConfig,
  dnsStats,
  escapeHtml,
  lanDnsModeLabel,
  routeRules,
  state,
  stat,
});

function dnsPanel(...args) {
  return dnsView.dnsPanel(...args);
}

const auxPanelsView = createAuxPanelsView({
  state,
  labels,
  escapeHtml,
  stat,
  deviceRules,
  deviceStats,
  outboundOptions,
  leaseSearchText,
  formatDuration,
  leaseByIp,
});

function devicesPanel(...args) {
  return auxPanelsView.devicesPanel(...args);
}

function profilesPanel(...args) {
  return auxPanelsView.profilesPanel(...args);
}

function logsPanel(...args) {
  return auxPanelsView.logsPanel(...args);
}

function accessLogRows(...args) {
  return auxPanelsView.accessLogRows(...args);
}

function accessLogTable(...args) {
  return auxPanelsView.accessLogTable(...args);
}

function applyLeaseSearch(scope, query) {
  const text = String(query || '').trim().toLowerCase();
  let visible = 0;
  scope.querySelectorAll('[data-lease-search-item]').forEach((item) => {
    const match = !text || String(item.dataset.leaseSearchText || '').includes(text);
    item.hidden = !match;
    if (match) visible += 1;
  });
  scope.querySelectorAll('[data-lease-search-empty]').forEach((item) => {
    item.hidden = visible !== 0 || !text;
  });
}

const diagnosticsModel = createDiagnosticsModel({
  state,
  routeRules,
  describeRouteRule,
  isIpLiteral,
});

function domainDiagnosticRows(...args) {
  return diagnosticsModel.domainDiagnosticRows(...args);
}

function isPrivateIp(...args) {
  return diagnosticsModel.isPrivateIp(...args);
}

function cleanLogHost(...args) {
  return diagnosticsModel.cleanLogHost(...args);
}

function logEvents(...args) {
  return diagnosticsModel.logEvents(...args);
}

function aggregateLogDevices(...args) {
  return diagnosticsModel.aggregateLogDevices(...args);
}

function aggregateLogDomains(...args) {
  return diagnosticsModel.aggregateLogDomains(...args);
}

function domainMonitorProtocols(...args) {
  return diagnosticsModel.domainMonitorProtocols(...args);
}

function domainMonitorDevicesText(...args) {
  return diagnosticsModel.domainMonitorDevicesText(...args);
}

function domainMonitorHost(...args) {
  return diagnosticsModel.domainMonitorHost(...args);
}

function domainMonitorMatchesFilter(...args) {
  return diagnosticsModel.domainMonitorMatchesFilter(...args);
}

function domainMonitorMatchesQuery(...args) {
  return diagnosticsModel.domainMonitorMatchesQuery(...args);
}

function domainMonitorRows(...args) {
  return diagnosticsModel.domainMonitorRows(...args);
}

function domainMonitorFilterCounts(...args) {
  return diagnosticsModel.domainMonitorFilterCounts(...args);
}

function monitoredDomains(...args) {
  return diagnosticsModel.monitoredDomains(...args);
}

function monitoredDevices(...args) {
  return diagnosticsModel.monitoredDevices(...args);
}

function monitoredEvents(...args) {
  return diagnosticsModel.monitoredEvents(...args);
}

function monitorSourceLabel(...args) {
  return diagnosticsModel.monitorSourceLabel(...args);
}

function domainMonitorDomainQuality(...args) {
  return diagnosticsModel.domainMonitorDomainQuality(...args);
}

const diagnosticsActions = createDiagnosticsActions({
  state,
  request,
  render,
  byteSize,
  xrayActiveStats,
  activeProxyTag,
});

function nftBytes(...args) {
  return diagnosticsActions.nftBytes(...args);
}

function totalXrayStatsBytes(...args) {
  return diagnosticsActions.totalXrayStatsBytes(...args);
}

function triggerBrowserTraffic(...args) {
  return diagnosticsActions.triggerBrowserTraffic(...args);
}

async function runConnectivityDiagnostics(...args) {
  return diagnosticsActions.runConnectivityDiagnostics(...args);
}

async function startClientTrafficTest(...args) {
  return diagnosticsActions.startClientTrafficTest(...args);
}

async function finishClientTrafficTest(...args) {
  return diagnosticsActions.finishClientTrafficTest(...args);
}

const diagnosticsView = createDiagnosticsView({
  accessLogRows,
  accessLogTable,
  activeProxyTag,
  aggregateLogDomains,
  burstObservatoryConfig,
  burstObservatorySelectors,
  byteRate,
  byteSize,
  checkForTag,
  checkLabel,
  configInbounds,
  deviceRules,
  domainDiagnosticRows,
  domainMonitorDevicesText,
  domainMonitorDomainQuality,
  domainMonitorFilterCounts,
  domainMonitorHost,
  domainMonitorMatchesFilter,
  domainMonitorProtocols,
  domainMonitorRows,
  escapeHtml,
  isIpLiteral,
  logsPanel,
  monitorSourceLabel,
  monitoredDevices,
  monitoredDomains,
  monitoredEvents,
  observatoryConfig,
  observatoryMatchedOutbounds,
  observatoryRequiredBalancers,
  observatorySelectors,
  outboundAddress,
  outboundMatchesSelectors,
  proxyOutbounds,
  sniPanel,
  stat,
  state,
  strategyObserverType,
  trafficMonitor,
  xrayActiveStats,
  xrayStatsPanel,
  xrayStatsTotals,
});

function clientTrafficTestView(...args) {
  return diagnosticsView.clientTrafficTestView(...args);
}

function diagnosticsChainView(...args) {
  return diagnosticsView.diagnosticsChainView(...args);
}

function diagnosticsPanel(...args) {
  return diagnosticsView.diagnosticsPanel(...args);
}

function observatoryPanel(...args) {
  return diagnosticsView.observatoryPanel(...args);
}
const routingView = createRoutingView({
  state,
  escapeHtml,
  operationProgressView,
  stat,
  routeRules,
  routeStats,
  routeTargetOptions,
  visibleRoutingRuleItems,
  routeSectionDefinitions,
  orderedRouteList,
  describeRouteRule,
  routeRuleName,
  resolveRoutingAlias,
  dslPreviewView,
  configAnalysisView,
  builtinRoutePresetEntries,
  customRoutePresetEntries,
  ruleCountLabel,
  routePresetConditionCount,
  routeBalancers,
  observatoryPanel,
  balancerSelectorMatches,
  balancerObserverSummary,
  balancerStrategyLabel,
  balancerMembersView,
  currentSnifferSettings,
  tcpFastOpenDraftEnabled,
  firewallInfo,
  firewallPolicyPreview,
  firewallDeviceChoices,
  firewallSelectedDevices,
  firewallCommands,
  geoPanel,
});

function routingRulesPanel(...args) {
  return routingView.routingRulesPanel(...args);
}

function routingScenariosPanel(...args) {
  return routingView.routingScenariosPanel(...args);
}

function routingBalancersPanel(...args) {
  return routingView.routingBalancersPanel(...args);
}

function interceptAdvancedSections(...args) {
  return routingView.interceptAdvancedSections(...args);
}

function interceptAdvancedAccordion(...args) {
  return routingView.interceptAdvancedAccordion(...args);
}

function routingPanel(...args) {
  return routingView.routingPanel(...args);
}

function firewallPanel(...args) {
  return routingView.firewallPanel(...args);
}

function firewallApplyPanel(...args) {
  return routingView.firewallApplyPanel(...args);
}

function placeholder(title, body) {
  return `
    <section class="panel">
      <div class="panel-title"><div><h2>${title}</h2><span>${body}</span></div></div>
      <p class="muted">Раздел подготовлен в MVP и будет подключен следующим шагом: визуальные правила маршрутизации, firewall/TProxy, GeoIP/GeoSite и настройки.</p>
    </section>
  `;
}

function loadingDashboard() {
  return `
    <section class="dash-hero is-loading">
      <div class="dash-status">
        <span class="eyebrow">Состояние роутера</span>
        <h2>Проверяем Xray</h2>
        <p>Получаем статус сервиса, ядра и активной конфигурации с OpenWrt.</p>
        ${state.message ? `<p class="notice dash-notice">${escapeHtml(state.message)}</p>` : ''}
      </div>
      <div class="dash-actions">
        <button class="btn secondary" data-action="refresh">Обновить статус</button>
      </div>
    </section>

    <section class="stats stats-dashboard">
      ${stat('Сервис', 'Проверяем', 'Ждём ответ OpenWrt service manager')}
      ${stat('Ядро', 'Проверяем', 'Пока не показываем действия установки')}
    </section>

    <section class="panel">
      <div class="panel-title">
        <div><h2>Загрузка панели</h2><span>Это занимает пару секунд после обновления страницы или перезапуска сервиса.</span></div>
      </div>
      <p class="muted">Если статус долго не появляется, проверьте доступность RuOpenRay UI и повторите обновление.</p>
    </section>
  `;
}

const settingsView = createSettingsView({ state, byteSize, escapeHtml });

function settingsPanel(...args) {
  return settingsView.settingsPanel(...args);
}

function content() {
  if (!state.status) return loadingDashboard();
  if (state.tab === 'dashboard') return dashboard();
  if (state.tab === 'servers') return serversPanel();
  if (state.tab === 'diagnostics') return diagnosticsPanel();
  if (state.tab === 'sni') return sniPanel();
  if (state.tab === 'geo') return geoPanel();
  if (state.tab === 'devices') return devicesPanel();
  if (state.tab === 'dns') return dnsPanel();
  if (state.tab === 'profiles') return profilesPanel();
  if (state.tab === 'logs') return logsPanel();
  if (state.tab === 'routing') return routingPanel();
  if (state.tab === 'firewall') return firewallPanel();
  if (state.tab === 'settings') return settingsPanel();
  return placeholder('Настройки', 'Пароль панели, адрес привязки, имя сервиса и канал обновлений.');
}

const routingDialogsView = createRoutingDialogsView({
  state,
  escapeHtml,
  routeKinds,
  routePlaceholders,
  customRoutePresetEntries,
  builtinRoutePresetEntries,
  ruleCountLabel,
  routePresetConditionCount,
  routeTargetOptions,
  balancerOptions,
  outboundOptions,
  routeLeasePicker,
  dslPreviewView,
  routeBalancers,
  balancerTargetOptions,
  splitRouteValues,
  balancerSelectorMatches,
  strategyObserverType,
  observerLabel,
  routeRules,
  balancerStrategyLabel,
  routePresetCheckResultView,
});

function routeRuleDialog(...args) {
  return routingDialogsView.routeRuleDialog(...args);
}

function routeBalancerDialog(...args) {
  return routingDialogsView.routeBalancerDialog(...args);
}

function routePresetDialog(...args) {
  return routingDialogsView.routePresetDialog(...args);
}

function render() {
  state.pendingBackgroundRender = false;
  if (!state.token) return loginView();
  const statusLoaded = Boolean(state.status);
  const running = state.status?.service?.running;
  const xrayUptime = Number(state.status?.service?.uptime || 0);
  const xrayStatusText = statusLoaded
    ? running
      ? `Xray работает${xrayUptime > 0 ? ` · ${fmtUptime(xrayUptime)}` : ''}`
      : 'Xray остановлен'
    : 'Проверяем Xray';
  const activeProfile = activeProfileName();
  const serviceButtons = [
    !statusLoaded
      ? null
      : running
        ? null
        : '<button class="service-icon" data-action="start" title="Запустить Xray" aria-label="Запустить Xray">▶</button>',
    statusLoaded && running
      ? '<button class="service-icon" data-action="restart" title="Перезапустить Xray" aria-label="Перезапустить Xray">↻</button>'
      : null,
    statusLoaded && running
      ? '<button class="service-icon danger" data-action="stop" title="Остановить Xray" aria-label="Остановить Xray">■</button>'
      : null,
  ].filter(Boolean).join('');
  app.innerHTML = `
    ${routeRuleDialog()}
    ${routeBalancerDialog()}
    ${importDialog(state.importDialog)}
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="brand-mark" src="/assets/ruopenray-icon-512.png" alt="" />
          <div><strong>RuOpenRay UI</strong><span>Панель Xray для OpenWrt</span></div>
        </div>
        <nav class="nav">
          ${nav.map(([key, title]) => `<button class="${key === state.tab ? 'active' : ''}" data-tab="${key}">${title}</button>`).join('')}
        </nav>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="title">
            <h1>${tabTitles[state.tab] || state.tab}</h1>
            ${state.status ? '' : '<p>Загрузка статуса роутера</p>'}
          </div>
          <div class="top-actions">
            ${appVersionPill()}
            <span class="pill" title="${xrayUptime > 0 ? `xray-core запущен ${fmtUptime(xrayUptime)}` : 'Аптайм xray-core пока не определен'}"><i class="dot ${running ? 'ok' : ''}"></i>${escapeHtml(xrayStatusText)}</span>
            <button class="pill profile-pill" data-tab-jump="profiles" type="button" title="Выбрать профиль">${escapeHtml(activeProfile)}</button>
            <div class="service-controls" aria-label="Управление сервисом Xray">
              ${serviceButtons}
            </div>
          </div>
        </header>
        ${content()}
      </main>
    </div>
    ${setupWizardDialog()}
    ${installWizardDialog()}
    ${coreUpdateDialog()}
    ${routePresetDialog()}
  `;
  bind();
  restoreConfigScroll();
  scrollLogsToBottom();
}

function restoreConfigScroll() {
  const node = document.querySelector('#jsonDraft');
  if (!node || !state.configScrollTop) return;
  requestAnimationFrame(() => {
    const current = document.querySelector('#jsonDraft');
    if (current) current.scrollTop = state.configScrollTop;
  });
}

function openRoutePresetPicker() {
  resetRouteRuleForm();
  state.routeRuleDialog = true;
  state.routeRuleMode = 'presets';
  state.selectedRoutePresets = [];
  state.message = '';
  render();
}

function bind() {
  bindNavigationControls({ state, render });
  bindModalControls();
  bindActionControls({
    state,
    render,
    handlers: {
      start: () => service('start'),
      stop: () => service('stop'),
      restart: () => service('restart'),
      refresh,
      changePanelPassword,
      saveLoggingSettings,
      clearLoggingFiles,
      refreshDhcpLeases,
      saveServiceSettings,
      appVersionClick,
      checkAppUpdate,
      updateApp,
      test: testConfig,
      apply: applyConfig,
      applyFirewall,
      disableFirewall,
      refreshFirewallStatus,
      enableXrayStats: () => setXrayStats(true),
      disableXrayStats: () => setXrayStats(false),
      resetXrayStats,
      analyzeConfig,
      openCoreDialog: () => {
        const info = coreUpdateInfo();
        state.coreDialogOpen = true;
        state.selectedCoreVersion = state.selectedCoreVersion || info.target?.tag || filteredCoreReleases().find((release) => release.assetUrl)?.tag || '';
        render();
      },
      closeCoreDialog: () => {
        state.coreDialogOpen = false;
        render();
      },
      openRouteRuleDialog: () => {
        resetRouteRuleForm();
        state.routeRuleDialog = true;
        state.routeRuleMode = 'single';
        state.message = '';
        render();
      },
      openRouteRulePresets: () => openRoutePresetPicker(),
      openRoutePresetDialog: () => openRoutePresetPicker(),
      closeRouteRuleDialog: () => {
        state.routeRuleDialog = false;
        resetRouteRuleForm();
        state.selectedRoutePresets = [];
        state.message = '';
        render();
      },
      openRouteBalancerDialog,
      closeRouteBalancerDialog,
      saveRouteBalancer,
      newRoutePreset: newRoutingPreset,
      closeRoutePresetDialog: () => {
        state.routePresetDialog = false;
        clearRoutePresetEditor();
        render();
      },
      backToRoutePresets: () => {
        clearRoutePresetEditor();
        state.message = '';
        render();
      },
      selectAllRoutePresets: () => {
        state.selectedRoutePresets = [...customRoutePresetEntries().map(([key]) => key), ...builtinRoutePresetEntries().map(([key]) => key)];
        render();
      },
      clearRoutePresets: () => {
        state.selectedRoutePresets = [];
        render();
      },
      applyRoutePresets: applySelectedRoutingPresets,
      previewRoutePresetEdit,
      saveRoutePresetEdit,
      applyRoutePresetEdit,
      openInstallWizard,
      openSetupWizard,
      closeSetupWizard: () => {
        state.setupWizardOpen = false;
        render();
      },
      setupPrepareDraft,
      runSetupWizard,
      rollbackSetupWizard,
      clearSetupSnapshot: () => {
        clearSetupSnapshot();
        render();
      },
      refreshInstallPlan: async () => {
        state.installPlan = await request('/api/install/plan');
        render();
      },
      closeInstallWizard: () => {
        state.installWizardOpen = false;
        render();
      },
      updateCore,
      installCorePackage,
      updateGeo,
      saveGeoSchedule,
      cleanupGeoBackups,
      cleanupExtraGeoDat,
      addGeoSource,
      refreshLogs: () => refreshLogs(true, true),
      runConnectivityDiagnostics,
      refreshDomainMonitor: () => refreshDomainMonitor(true),
      startDomainMonitor: () => controlDomainMonitor('start'),
      stopDomainMonitor: () => controlDomainMonitor('stop'),
      clearDomainMonitor: () => controlDomainMonitor('clear'),
      toggleConfig: () => {
        state.configExpanded = !state.configExpanded;
        render();
      },
      import: importLink,
      previewImport,
      importToCurrent: () => importToCurrent(false),
      importActive: () => importToCurrent(true),
      previewSubscription,
      importSubscription,
      importSubscriptionToCurrent: () => importSubscriptionToCurrent(false),
      importSubscriptionActive: () => importSubscriptionToCurrent(true),
      closeImport: () => {
        state.importDialog = '';
        render();
      },
      addRoute: addRoutingRule,
      saveRouteEdit: saveRoutingRuleEdit,
      previewRouteDsl: previewRoutingDsl,
      appendRouteDsl: () => applyRoutingDsl('append'),
      appendRouteDslFromDialog: () => applyRoutingDsl('append', true),
      replaceRouteDsl: () => applyRoutingDsl('replace'),
      filterRoutes: render,
      disableVisibleRoutes: disableVisibleRoutingRules,
      restoreAllDisabledRoutes: restoreAllDisabledRouteRules,
      enableTcpFastOpenSystem: () => setSystemTcpFastOpen(true),
      disableTcpFastOpenSystem: () => setSystemTcpFastOpen(false),
      enableTcpFastOpenDraft: () => setTcpFastOpenDraft(true),
      disableTcpFastOpenDraft: () => setTcpFastOpenDraft(false),
      prepareTransparent: prepareTransparentDraft,
      prepareDnsInbound: prepareDnsInboundDraft,
      copyFirewall: copyFirewallCommands,
      copyInstallCommand: () => copyInstallCommand(),
      copyInstallWithXrayCommand: () => copyInstallCommand(true),
      startClientTrafficTest,
      finishClientTrafficTest,
      addDevice: addDeviceRule,
      addDns: addDnsServer,
      saveDnsHost,
      previewLanDnsUpstream,
      applyLanDnsUpstream,
      dnsWizardSecure: () => applyDnsGuardPreset('secure'),
      dnsWizardRu: () => applyDnsGuardPreset('ru'),
      dnsWizardStrict: () => applyDnsGuardPreset('strict'),
      checkDns: checkDnsServer,
      applyDnsBootstrapHosts,
      checkServers,
      checkObservatoryTargets,
      enableObservatoryForProxy,
      fallbackSubscription: (button) => fallbackSubscriptionPool(button.dataset.subscriptionFallback || ''),
      scanSni,
      saveProfile,
      backup,
      restoreLatestBackup,
    },
  });
  bindCoreControls({
    state,
    render,
    filteredCoreReleases,
  });
  bindSettingsControls({
    state,
    render,
    installPasswordStorageKey,
    githubInstallCommand,
  });
  bindGeoControls({
    state,
    render,
    toggleGeoSourceEnabled,
    removeGeoSource,
    deleteGeoFile,
  });
  bindDeviceControls({
    state,
    render,
    updateDeviceRule,
    removeDeviceRule,
  });
  bindDnsControls({
    state,
    render,
    removeDnsServer,
    editDnsHost,
    removeDnsHost,
    setDnsModeDraft,
  });
  bindRoutingControls({
    state,
    render,
    firewallPortsStorageKey,
    addRoutingPreset,
    editRoutingPreset,
    deleteCustomRoutePreset,
    removeRoutingRule,
    disableRoutingRule,
    restoreDisabledRouteRule,
    deleteDisabledRouteRule,
    moveRoutingRule,
    openRoutingRuleEditor,
    openRouteBalancerDialog,
    removeRouteBalancer,
    setFirewallBypassMode,
    setFirewallRouterMode,
    setFirewallDeviceMode,
    toggleFirewallDevice,
    reorderRoutingRule,
    routeRules,
    describeRouteRule,
    updateRoutingTarget,
    removeOutbound,
    routeAllToOutbound,
    checkServers,
    setSnifferDraft,
    setQuicPolicy,
    currentSnifferSettings,
    setFirewallPortMode,
    setFirewallBlockQuic,
    applyLeaseSearch,
    setRouteBalancerSelector,
    moveRouteBalancerSelector,
    balancerOptions,
  });
  bindDiagnosticsControls({
    state,
    render,
    domainMonitorFilterStorageKey,
    activeProxyTag,
    probeMonitoredDomain,
    focusSniResult,
    refreshLogs,
    configureLogTimer,
    scrollLogsToBottom,
  });
  bindProfileControls({ activateProfile });
  bindConfigControls({ state });
  bindImportControls({ state, render });
  bindServerCheckControls({ state, render });

}

render();
if (state.token) {
  configureLogTimer();
  configureStatusTimer();
  refresh({ background: true });
}

document.addEventListener('focusout', () => {
  setTimeout(flushPendingBackgroundRender, 80);
}, true);
document.addEventListener('pointerup', () => {
  setTimeout(flushPendingBackgroundRender, 80);
}, true);
