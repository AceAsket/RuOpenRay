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
import { createLoginView } from './login-view.js';
import { bindModalControls, bindNavigationControls } from './navigation-bindings.js';
import { createObservatoryActions } from './observatory-actions.js';
import { createProfileActions } from './profile-actions.js';
import { bindProfileControls } from './profile-bindings.js';
import { createRouteBalancerActions } from './route-balancer-actions.js';
import { createRoutingActions } from './routing-actions.js';
import { bindRoutingControls } from './routing-bindings.js';
import { createSettingsView } from './settings-view.js';
import { bindSettingsControls } from './settings-bindings.js';
import { createRuntimeController } from './runtime-controller.js';
import { createRoutingView } from './routing-view.js';
import { createRoutingDialogsView } from './routing-dialogs-view.js';
import { createRoutingDsl } from './routing-dsl.js';
import { createRoutingModel } from './routing-model.js';
import { bindServerCheckControls } from './server-check-bindings.js';
import { createServerActions } from './server-actions.js';
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
import { createXrayDraftActions } from './xray-draft-actions.js';
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
  saveRouteNames,
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

let serverActions;
const checkServers = (...args) => serverActions.checkServers(...args);

const observatoryActions = createObservatoryActions({
  state,
  syncConfig,
  render,
  routeBalancers,
  proxyOutbounds: () => proxyOutbounds(),
  checkServers
});
const {
  strategyObserverType,
  observatoryConfig,
  burstObservatoryConfig,
  observatorySelectors,
  burstObservatorySelectors,
  outboundMatchesSelectors,
  observatoryMatchedOutbounds,
  observatoryRequiredBalancers,
  applyObserverForStrategy,
  observerLabel,
  balancerStrategyLabel,
  enableObservatoryForProxy,
  checkObservatoryTargets
} = observatoryActions;

const activeProxyTagForRouting = (...args) => activeProxyTag(...args);

function resolveRoutingAlias(tag) {
  const value = String(tag || '').trim();
  if (value === 'proxy') return activeProxyTagForRouting() || 'proxy';
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





const routingActions = createRoutingActions({
  state,
  render,
  escapeHtml,
  routeKinds,
  routePresets,
  routeBundles,
  hiddenBuiltinRoutePresetKeys,
  customRoutePresetsStorageKey,
  parseRoutingDsl,
  isDslDefaultRule,
  dslPreviewStats,
  dslPreviewView,
  routeRules,
  setRoutingDraft,
  activeProxyTag: activeProxyTagForRouting,
  balancerOptions,
  splitRouteValues,
  routeTarget,
  routeRuleKey,
  readableRouteTag,
  encodedRouteTarget,
  isRuOpenRayManagedRoute,
  routeRuleName,
  setRouteRuleName,
  copyRouteRuleName,
  saveRouteNames,
  describeRouteRule,
  routeSectionDefinitions,
  routeCategoryForRule,
  routeRuleSource,
  routeTargetOptions,
  saveDisabledRouteRules
});
const {
  previewRoutingDsl,
  configAnalysisView,
  applyRoutingDsl,
  addRoutingRule,
  resetRouteRuleForm,
  routeRuleFromForm,
  openRoutingRuleEditor,
  saveRoutingRuleEdit,
  addRoutingPreset,
  normalizePresetRule,
  applySelectedRoutingPresets,
  routePresetRules,
  routePresetTitle,
  routePresetDetail,
  routeRuleConditionCount,
  routePresetConditionCount,
  builtinRoutePresetEntries,
  ruleCountLabel,
  customRoutePreset,
  customRoutePresetEntries,
  saveCustomRoutePresets,
  scenarioIdFromTitle,
  routeRuleToDslLines,
  clearRoutePresetEditor,
  newRoutingPreset,
  editRoutingPreset,
  previewRoutePresetEdit,
  routePresetCheckResultView,
  applyRoutePresetEdit,
  saveRoutePresetEdit,
  deleteCustomRoutePreset,
  removeRoutingRule,
  disableRoutingRule,
  restoreDisabledRouteRule,
  deleteDisabledRouteRule,
  visibleRoutingRuleItems,
  routeRowHtml,
  orderedRouteList,
  disableVisibleRoutingRules,
  restoreAllDisabledRouteRules,
  updateRoutingTarget,
  moveRoutingRule,
  reorderRoutingRule,
  renameRoutingRule
} = routingActions;


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

const routeBalancerActions = createRouteBalancerActions({
  state,
  render,
  routeBalancers,
  routeRules,
  splitRouteValues,
  setRouteBalancersDraft,
  syncConfig,
  strategyObserverType,
  applyObserverForStrategy,
  observerLabel
});
const {
  resetRouteBalancerForm,
  openRouteBalancerDialog,
  closeRouteBalancerDialog,
  setRouteBalancerSelector,
  moveRouteBalancerSelector,
  saveRouteBalancer,
  removeRouteBalancer
} = routeBalancerActions;

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

const loginViewController = createLoginView({
  state,
  app,
  escapeHtml,
  savedPasswordStorageKey,
  login
});
const { loginView } = loginViewController;

const updatesActions = createUpdatesActions({
  state,
  request,
  render,
  refresh,
  geoSelectedPresetIds: (...args) => geoSelectedPresetIds(...args)
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

serverActions = createServerActions({
  state,
  request,
  render,
  refresh,
  syncConfig,
  keepOperationVisible,
  configOutbounds,
  proxyOutbounds,
  proxyRuleStrategyStats,
  setActiveProxyDraft,
  applyConfig
});
const {
  removeOutbound,
  routeAllToOutbound,
  fallbackSubscriptionPool
} = serverActions;

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
const {
  normalizeCoreVersion,
  versionParts,
  compareCoreVersions,
  installedCoreVersion,
  releaseDate,
  filteredCoreReleases,
  coreUpdateInfo,
  coreReleaseBadge,
  appVersionPill,
  coreArchitectureText,
  githubInstallCommand
} = setupView;

const xrayDraftActions = createXrayDraftActions({
  state,
  render,
  syncConfig,
  advancedInbounds,
  currentSnifferSettings,
  proxyOutbounds,
  normalizeSetupRules,
  firewallCommands,
  githubInstallCommand
});
const {
  setSnifferDraft,
  setTcpFastOpenDraft,
  setDnsModeDraft,
  prepareTransparentDraft,
  prepareDnsInboundDraft,
  copyFirewallCommands,
  copyInstallCommand
} = xrayDraftActions;

const {
  setupFlowStep,
  setupFlowGuide,
  setupWizardDialog,
  installWizardDialog,
  coreUpdateDialog
} = setupView;
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
  logsPanel: (...args) => logsPanel(...args),
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
const {
  checkModeLabel,
  coreStat,
  dashboard,
  dashboardServerSwitch,
  dashboardSystemStats,
  flowStep,
  isCheckingServer,
  metricIcon,
  metricStat,
  operationProgressView,
  quickAction,
  serverCheckButton,
  serverTrafficView,
  stat,
  trafficMetricStat,
  trafficMonitor,
  xrayActiveGraph,
  xrayActiveStats,
  xrayCoreDashboard,
  xrayDashboardStats,
  xrayStatsGroupLabel,
  xrayStatsOutbound,
  xrayStatsOutboundConfig,
  xrayStatsPanel,
  xrayStatsPeriodLabel,
  xrayStatsSeriesPath,
  xrayStatsShare,
  xrayStatsTotals
} = dashboardView;

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
const {
  importButton,
  serverMini,
  emptyMini,
  importDialog,
  previewBox
} = importDialogView;

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
  routingBalancersPanel: (...args) => routingBalancersPanel(...args),
  serverCheckButton,
  serverMetaChips,
  serverStats,
  serverTrafficView,
  state,
  stat,
});
const {
  serverCard,
  subscriptionPoolCard,
  serverAvailabilityPanel,
  serversPanel
} = serversView;

const sniView = createSniView({
  state,
  escapeHtml,
  stat,
  outboundAddress,
  activeProxyOutbound,
});
const {
  clamp,
  ipParts,
  sniRadar,
  sniPanel
} = sniView;

const geoView = createGeoView({ state, escapeHtml, stat });
const {
  fileSize,
  geoSelectedPresetIds,
  geoSelectedPresets,
  geoRequiredSpace,
  geoDiskWarning,
  selectedGeoPreset,
  geoActionLabel,
  geoNandCard,
  geoPurposeLabel,
  geoPanel
} = geoView;

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
const { dnsPanel } = dnsView;

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
const {
  devicesPanel,
  profilesPanel,
  logsPanel,
  accessLogRows,
  accessLogTable
} = auxPanelsView;

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
const {
  domainDiagnosticRows,
  isPrivateIp,
  cleanLogHost,
  logEvents,
  aggregateLogDevices,
  aggregateLogDomains,
  domainMonitorProtocols,
  domainMonitorDevicesText,
  domainMonitorHost,
  domainMonitorMatchesFilter,
  domainMonitorMatchesQuery,
  domainMonitorRows,
  domainMonitorFilterCounts,
  monitoredDomains,
  monitoredDevices,
  monitoredEvents,
  monitorSourceLabel,
  domainMonitorDomainQuality
} = diagnosticsModel;

const diagnosticsActions = createDiagnosticsActions({
  state,
  request,
  render,
  byteSize,
  xrayActiveStats,
  activeProxyTag,
});
const {
  nftBytes,
  totalXrayStatsBytes,
  triggerBrowserTraffic,
  runConnectivityDiagnostics,
  startClientTrafficTest,
  finishClientTrafficTest
} = diagnosticsActions;

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
const {
  clientTrafficTestView,
  diagnosticsChainView,
  diagnosticsPanel,
  observatoryPanel
} = diagnosticsView;
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
const {
  routingRulesPanel,
  routingScenariosPanel,
  routingBalancersPanel,
  interceptAdvancedSections,
  interceptAdvancedAccordion,
  routingPanel,
  firewallPanel,
  firewallApplyPanel
} = routingView;

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
const { settingsPanel } = settingsView;

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
