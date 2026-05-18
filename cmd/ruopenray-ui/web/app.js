import { hiddenBuiltinRoutePresetKeys, labels, managedRouteTags, nav, routeBundles, routeKinds, routePlaceholders, routePresets, tabTitles } from './presets.js';
import { bindActionControls } from './action-bindings.js';
import { createApiClient } from './api-client.js';
import { createAuxPanelsView } from './aux-panels-view.js';
import { createConfigActions } from './config-actions.js';
import { bindConfigControls } from './config-bindings.js';
import { createConfigStateHelpers } from './config-state.js';
import { bindCoreControls } from './core-bindings.js';
import { createDashboardView } from './dashboard-view.js';
import { createDevicesActions } from './devices-actions.js';
import { bindDeviceControls } from './devices-bindings.js';
import { createDevicesModel } from './devices-model.js';
import { createDiagnosticsActions } from './diagnostics-actions.js';
import { bindDiagnosticsControls } from './diagnostics-bindings.js';
import { createDiagnosticsModel } from './diagnostics-model.js';
import { createDiagnosticsView } from './diagnostics-view.js';
import { createDnsActions } from './dns-actions.js';
import { bindDnsControls } from './dns-bindings.js';
import { createDnsModel } from './dns-model.js';
import { createDnsView } from './dns-view.js';
import { createGeoView } from './geo-view.js';
import { createFirewallActions } from './firewall-actions.js';
import { createFirewallModel } from './firewall-model.js';
import { byteRate, byteSize, escapeHtml, fmtUptime, formatDuration, formatDurationCompact, numberValue } from './formatters.js';
import { createImportDialogView } from './import-dialog-view.js';
import { bindGeoControls } from './geo-bindings.js';
import { createImportActions } from './import-actions.js';
import { bindImportControls } from './import-bindings.js';
import { bindModalControls, bindNavigationControls } from './navigation-bindings.js';
import { createProfileActions } from './profile-actions.js';
import { bindProfileControls } from './profile-bindings.js';
import { bindRoutingControls } from './routing-bindings.js';
import { createSettingsView } from './settings-view.js';
import { bindSettingsControls } from './settings-bindings.js';
import { createRuntimeController } from './runtime-controller.js';
import { createRoutingView } from './routing-view.js';
import { createRoutingDialogsView } from './routing-dialogs-view.js';
import { createRoutingDsl } from './routing-dsl.js';
import { createRoutingModel } from './routing-model.js';
import { bindServerCheckControls } from './server-check-bindings.js';
import { createServerModel } from './server-model.js';
import { createServersView } from './servers-view.js';
import { createSettingsActions } from './settings-actions.js';
import { createSetupActions } from './setup-actions.js';
import { createSetupView } from './setup-view.js';
import { createUpdatesActions } from './updates-actions.js';
import { createSetupModel } from './setup-model.js';
import { createSniActions } from './sni-actions.js';
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
  state.message = 'Сессия устарела. Войдите заново.';
  render();
}

const api = createApiClient({
  getToken: () => state.token,
  onUnauthorized: clearAuth
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  dnsAnswerText,
  ensureDnsServer
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

const firewallActions = createFirewallActions({
  state,
  request,
  render,
  delay,
  firewallPayload,
  firewallReadyStatus,
  storageKeys: {
    firewallBypassModeStorageKey,
    firewallRouterModeStorageKey,
    firewallDeviceModeStorageKey,
    firewallPortModeStorageKey,
    firewallSelectedDevicesStorageKey,
    firewallBlockQuicStorageKey
  }
});
const {
  applyFirewallWithRetry,
  applyFirewall,
  disableFirewall,
  refreshFirewallStatus,
  setFirewallBypassMode,
  setFirewallRouterMode,
  setFirewallDeviceMode,
  setFirewallPortMode,
  toggleFirewallDevice,
  setFirewallBlockQuic,
  setQuicPolicy
} = firewallActions;

const runtimeController = createRuntimeController({
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
});
const {
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
} = runtimeController;

const setupModel = createSetupModel({
  state,
  byteSize,
  firewallInfo,
  proxyOutbounds,
  setupSnapshotStorageKey,
  request,
  syncConfig,
  ensureDnsServer
});
const {
  setupReadiness,
  loadSetupSnapshot,
  saveSetupSnapshot,
  clearSetupSnapshot,
  captureSetupSnapshot,
  lanDnsRestorePayload,
  privateBypassCidrs,
  normalizePrivateBypassRules,
  setupRuleSignature,
  isIpLiteral,
  hostnameFromUrl,
  serverBootstrapDomains,
  ensureDnsBootstrapHosts,
  isSetupManagedRule,
  normalizeSetupRules,
  prepareSetupDraft
} = setupModel;

const setupActions = createSetupActions({
  state,
  request,
  render,
  refresh,
  syncLanDnsStatus,
  lanDnsModeLabel,
  setupReadiness,
  loadSetupSnapshot,
  captureSetupSnapshot,
  clearSetupSnapshot,
  lanDnsRestorePayload,
  prepareSetupDraft,
  applyFirewallWithRetry,
  firewallReadyStatus,
  firewallRouterModeStorageKey
});
const {
  openInstallWizard,
  openSetupWizard,
  setupPrepareDraft,
  waitForLanDnsReadiness,
  runSetupWizard,
  rollbackSetupWizard
} = setupActions;

const settingsActions = createSettingsActions({
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
});
const {
  login,
  changePanelPassword,
  saveLoggingSettings,
  clearLoggingFiles,
  refreshDhcpLeases,
  saveServiceSettings,
  setSystemTcpFastOpen,
  service
} = settingsActions;

const updatesActions = createUpdatesActions({
  state,
  request,
  render,
  refresh,
  geoSelectedPresetIds
});
const {
  updateCore,
  updateApp,
  checkAppUpdate,
  appVersionClick,
  updateGeo,
  saveGeoSchedule,
  installCorePackage,
  cleanupGeoBackups,
  deleteGeoFile,
  cleanupExtraGeoDat,
  cleanGeoSourcePayload,
  saveGeoSources,
  addGeoSource,
  removeGeoSource,
  toggleGeoSourceEnabled
} = updatesActions;

const configActions = createConfigActions({
  state,
  request,
  render,
  refresh,
  keepOperationVisible,
  recordXrayStatsSample,
  xrayStatsResetAtStorageKey
});
const {
  testConfig,
  applyConfig,
  setXrayStats,
  resetXrayStats,
  analyzeConfig,
  restoreLatestBackup
} = configActions;






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









const importActions = createImportActions({
  state,
  request,
  render,
  refresh,
  syncConfig,
  applyConfig,
  isSystemOutbound,
  cloneOutboundWithTag,
  routeRules,
  activeProxyTag,
  setRoutingDraft,
  setActiveServerTag
});
const {
  importLink,
  serverImportPreviewItem,
  activeProfileName,
  suggestedSubscriptionBalancerTag,
  setActiveProxyDraft,
  importToCurrent,
  importSubscriptionToCurrent,
  previewImport,
  previewSubscription,
  importSubscription
} = importActions;

const profileActions = createProfileActions({
  state,
  request,
  render,
  refresh
});
const {
  activateProfile,
  saveProfile,
  backup
} = profileActions;

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

const sniActions = createSniActions({
  state,
  request,
  render,
  outboundAddress,
  activeProxyOutbound
});
const {
  scanSni,
  focusSniResult
} = sniActions;

const devicesActions = createDevicesActions({
  state,
  render,
  normalizeDeviceIp,
  proxyInboundTags,
  routeRules,
  setRoutingDraft
});
const {
  addDeviceRule,
  updateDeviceRule,
  removeDeviceRule
} = devicesActions;

const dnsActions = createDnsActions({
  state,
  request,
  render,
  syncConfig,
  syncLanDnsStatus,
  activeProxyTag,
  splitRouteValues,
  dnsConfig,
  normalizeDnsAddressInput,
  ensureDnsBootstrapHosts
});
const {
  addDnsServer,
  saveDnsHost,
  editDnsHost,
  removeDnsHost,
  applyDnsGuardPreset,
  removeDnsServer,
  checkDnsServer,
  applyLanDnsUpstream,
  applyDnsBootstrapHosts,
  previewLanDnsUpstream
} = dnsActions;

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
