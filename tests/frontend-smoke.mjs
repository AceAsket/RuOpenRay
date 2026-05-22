import { createAuxPanelsView } from '../cmd/ruopenray-ui/web/aux-panels-view.js';
import { bindActionControls } from '../cmd/ruopenray-ui/web/action-bindings.js';
import { anonymizeConfig, createConfigActions } from '../cmd/ruopenray-ui/web/config-actions.js';
import { bindConfigControls } from '../cmd/ruopenray-ui/web/config-bindings.js';
import { createDevicesModel } from '../cmd/ruopenray-ui/web/devices-model.js';
import { bindCoreControls } from '../cmd/ruopenray-ui/web/core-bindings.js';
import { bindDiagnosticsControls } from '../cmd/ruopenray-ui/web/diagnostics-bindings.js';
import { createDiagnosticsActions } from '../cmd/ruopenray-ui/web/diagnostics-actions.js';
import { createDiagnosticsModel } from '../cmd/ruopenray-ui/web/diagnostics-model.js';
import { createDevicesActions } from '../cmd/ruopenray-ui/web/devices-actions.js';
import { bindDeviceControls } from '../cmd/ruopenray-ui/web/devices-bindings.js';
import { createDnsActions } from '../cmd/ruopenray-ui/web/dns-actions.js';
import { bindDnsControls } from '../cmd/ruopenray-ui/web/dns-bindings.js';
import { createDnsModel } from '../cmd/ruopenray-ui/web/dns-model.js';
import { byteSize as formatByteSize, escapeHtml, formatDurationCompact } from '../cmd/ruopenray-ui/web/formatters.js';
import { createFirewallActions } from '../cmd/ruopenray-ui/web/firewall-actions.js';
import { bindGeoControls } from '../cmd/ruopenray-ui/web/geo-bindings.js';
import { createImportActions } from '../cmd/ruopenray-ui/web/import-actions.js';
import { bindImportControls } from '../cmd/ruopenray-ui/web/import-bindings.js';
import { bindModalControls, bindNavigationControls } from '../cmd/ruopenray-ui/web/navigation-bindings.js';
import { createObservatoryActions } from '../cmd/ruopenray-ui/web/observatory-actions.js';
import { createProfileActions } from '../cmd/ruopenray-ui/web/profile-actions.js';
import { bindProfileControls } from '../cmd/ruopenray-ui/web/profile-bindings.js';
import { bindRoutingControls } from '../cmd/ruopenray-ui/web/routing-bindings.js';
import { createRuntimeController } from '../cmd/ruopenray-ui/web/runtime-controller.js';
import { createRouteBalancerActions } from '../cmd/ruopenray-ui/web/route-balancer-actions.js';
import { createRoutingActions } from '../cmd/ruopenray-ui/web/routing-actions.js';
import { createRoutingDialogsView } from '../cmd/ruopenray-ui/web/routing-dialogs-view.js';
import { createRoutingDsl } from '../cmd/ruopenray-ui/web/routing-dsl.js';
import { createRoutingModel } from '../cmd/ruopenray-ui/web/routing-model.js';
import { bindServerCheckControls } from '../cmd/ruopenray-ui/web/server-check-bindings.js';
import { createServerActions } from '../cmd/ruopenray-ui/web/server-actions.js';
import { createFirewallModel } from '../cmd/ruopenray-ui/web/firewall-model.js';
import { createServerModel } from '../cmd/ruopenray-ui/web/server-model.js';
import { createSettingsActions } from '../cmd/ruopenray-ui/web/settings-actions.js';
import { createSetupActions } from '../cmd/ruopenray-ui/web/setup-actions.js';
import { createSetupModel } from '../cmd/ruopenray-ui/web/setup-model.js';
import { bindSettingsControls } from '../cmd/ruopenray-ui/web/settings-bindings.js';
import { createSniView } from '../cmd/ruopenray-ui/web/sni-view.js';
import { createSniActions } from '../cmd/ruopenray-ui/web/sni-actions.js';
import { createUpdatesActions } from '../cmd/ruopenray-ui/web/updates-actions.js';
import { createXrayDraftActions } from '../cmd/ruopenray-ui/web/xray-draft-actions.js';
import { createXrayConfigModel } from '../cmd/ruopenray-ui/web/xray-config-model.js';

const state = {
  clientTrafficUrl: 'https://www.gstatic.com/generate_204',
  dashboardLogsOpen: false,
  deviceIp: '',
  deviceMode: 'proxy',
  deviceName: '',
  diagnosticsTestUrl: 'https://www.gstatic.com/generate_204',
  domainMonitor: {
    devices: [{ name: 'phone', ip: '192.168.1.2', hits: 2, topDomains: [{ host: 'chatgpt.com' }] }],
    domains: [{ host: 'chatgpt.com', hits: 2, protocols: ['TCP'], lastSeenTs: 2 }],
    events: [{ host: 'chatgpt.com', protocol: 'TCP', timestamp: 2 }],
    source: 'b4sni',
  },
  domainMonitorFilter: 'all',
  domainMonitorMode: 'domains',
  domainMonitorQuery: '',
  domainMonitorSort: 'hits',
  leaseSearch: '',
  leases: [],
  leasesSource: '/tmp/dhcp.leases',
  logFollow: true,
  logIntervalSec: 2,
  logKind: 'all',
  logLevel: 'all',
  logLines: 240,
  logLive: true,
  logQuery: '',
  logSort: 'asc',
  logs: 'tcp:192.168.1.2:50000 accepted tcp:chatgpt.com:443 [proxy]',
  message: '',
  profiles: [],
  routeName: '',
  routeOutbound: 'proxy',
  routeRuleDialog: false,
  routeRuleEditingIndex: -1,
  routeRuleMode: 'single',
  routeTargetType: 'outbound',
  routeValue: '',
  sniCidr: '24',
  sniLimit: '256',
  sniScan: null,
  sniScanning: false,
  sniTarget: '',
  sniThreads: '16',
  sniTimeout: '1500',
};

const stat = (label, value, detail) => `<div>${escapeHtml(label)}${escapeHtml(value)}${escapeHtml(detail)}</div>`;
let renders = 0;
const render = () => { renders += 1; };

const aux = createAuxPanelsView({
  state,
  labels: { active: 'active', stored: 'stored' },
  escapeHtml,
  stat,
  deviceRules: () => [],
  deviceStats: () => ({ proxy: 0, direct: 0, block: 0, other: 0 }),
  outboundOptions: () => ['proxy', 'direct', 'block'],
  leaseSearchText: () => '',
  formatDuration: () => '',
  leaseByIp: () => null,
});

const model = createDiagnosticsModel({
  state,
  routeRules: () => [{ domain: ['domain:chatgpt.com'] }],
  describeRouteRule: (rule) => (rule.domain ? { kind: 'domain' } : { kind: 'other' }),
  isIpLiteral: (value) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(value || '')),
});
const devicesModel = createDevicesModel({
  state: {
    routeKind: 'source',
    routeValue: '192.168.1.2',
    leaseSearch: '',
    leasesSource: '/tmp/dhcp.leases',
    leases: [{ name: 'phone', ip: '192.168.1.2', mac: 'aa:bb', remaining: 3600 }],
  },
  routeRules: () => [{ source: ['192.168.1.2'], outboundTag: 'proxy' }],
  routeRuleName: () => 'phone',
  describeRouteRule: () => ({ kind: 'source' }),
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
  escapeHtml,
  formatDuration: () => '1 ч',
});

const deviceActionState = {
  config: { routing: { rules: [] } },
  deviceIp: '192.168.1.77',
  deviceMode: 'proxy',
  deviceName: '',
};
const devicesActions = createDevicesActions({
  state: deviceActionState,
  render,
  normalizeDeviceIp: (value) => String(value || '').trim(),
  proxyInboundTags: () => ['transparent_ipv4'],
  routeRules: () => deviceActionState.config.routing.rules,
  setRoutingDraft: (rules) => {
    deviceActionState.config.routing.rules = rules;
  },
});
devicesActions.addDeviceRule();

const actions = createDiagnosticsActions({
  state,
  request: async (path) => {
    if (path === '/api/firewall/status') return { nft: { stdout: 'counter packets 1 bytes 64' } };
    if (path === '/api/xray/stats') return { outbounds: [{ uplink: 10, downlink: 20 }] };
    return { ok: true };
  },
  render,
  byteSize: (value) => `${value} B`,
  xrayActiveStats: () => ({ tag: 'proxy' }),
  activeProxyTag: () => 'proxy',
});
const runtimeState = {
  logKind: 'all',
  logLevel: 'all',
  logQuery: 'chatgpt',
  logLines: 50,
  logSort: 'asc',
  trafficHistory: [],
  xrayTrafficHistory: [],
  status: {},
};
const runtime = createRuntimeController({
  state: runtimeState,
  api: { text: async () => '2\n1' },
  request: async () => ({}),
  render,
  numberValue: (value) => Number(value || 0),
  activeProxyTag: () => 'proxy',
  syncConfig: () => {},
  proxyOutbounds: () => [{ tag: 'proxy' }],
  setActiveServerTag: () => {},
  inferredActiveProxyTag: () => 'proxy',
  syncLanDnsStatus: () => {},
  disabledRouteRulesStorageKey: 'ruopenray:test:disabled',
  syncLoggingSettings: () => {},
  syncServiceSettings: () => {},
  clearAuth: () => {},
});
const setupConfig = {
  inbounds: [],
  outbounds: [{ tag: 'proxy', protocol: 'vless', settings: { vnext: [{ address: 'cloudone.example', port: 443 }] } }],
  routing: { rules: [{ outboundTag: 'direct', ip: ['geoip:private'] }] },
  dns: { servers: ['https://dns.google/dns-query'] },
};
const setupState = {
  config: setupConfig,
  jsonDraft: JSON.stringify(setupConfig),
  status: { core: { available: true, version: 'Xray test' } },
  geoStatus: { geoip: { exists: true, size: 1 }, geosite: { exists: true, size: 1 } },
  firewallStatus: { active: true, persistent: true, routerMode: 'tproxy' },
  lanDnsStatus: { mode: 'xray', readiness: { ready: true } },
  firewallRouterMode: 'tproxy',
  setupLanDnsMode: 'keep',
};
const setupModel = createSetupModel({
  state: setupState,
  byteSize: formatByteSize,
  firewallInfo: () => ({ ready: true, transparent: [{}], transparentPort: 52345 }),
  proxyOutbounds: () => setupConfig.outbounds,
  setupSnapshotStorageKey: 'ruopenray:test:setup-snapshot',
  request: async (path) => {
    if (path === '/api/install/plan') return { ok: true, steps: [] };
    if (path === '/api/config') return setupState.config;
    if (path === '/api/firewall/snapshot') return { ok: true };
    if (path === '/api/dns/lan-upstream') return { ok: true, mode: 'xray', readiness: { ready: true } };
    return {};
  },
  syncConfig: (config) => {
    setupState.config = config;
    setupState.jsonDraft = JSON.stringify(config);
  },
  ensureDnsServer: (config, server) => {
    config.dns = config.dns || {};
    config.dns.servers = config.dns.servers || [];
    if (!config.dns.servers.includes(server)) config.dns.servers.push(server);
  },
});
globalThis.localStorage = globalThis.localStorage || {
  data: new Map(),
  getItem(key) { return this.data.get(key) || null; },
  setItem(key, value) { this.data.set(key, String(value)); },
  removeItem(key) { this.data.delete(key); },
};
const setupActions = createSetupActions({
  state: setupState,
  request: async (path) => {
    if (path === '/api/install/plan') return { ok: true, steps: [] };
    if (path === '/api/config') return setupState.config;
    if (path === '/api/firewall/snapshot') return { ok: true };
    if (path === '/api/dns/lan-upstream') return { ok: true, mode: 'xray', readiness: { ready: true } };
    if (path === '/api/config/test') return { ok: true, stdout: 'ok' };
    if (path === '/api/config/apply') return { ok: true, test: { stdout: 'applied' } };
    return { ok: true };
  },
  render,
  refresh: async () => { setupState.refreshed = true; },
  syncLanDnsStatus: (status) => { setupState.lanDnsStatus = status; },
  lanDnsModeLabel: (mode) => mode,
  setupReadiness: setupModel.setupReadiness,
  loadSetupSnapshot: setupModel.loadSetupSnapshot,
  captureSetupSnapshot: setupModel.captureSetupSnapshot,
  clearSetupSnapshot: setupModel.clearSetupSnapshot,
  lanDnsRestorePayload: setupModel.lanDnsRestorePayload,
  prepareSetupDraft: setupModel.prepareSetupDraft,
  applyFirewallWithRetry: async () => ({ ok: true, status: { active: true, persistent: true, routerMode: 'tproxy' } }),
  firewallReadyStatus: () => true,
  firewallRouterModeStorageKey: 'ruopenray:test:setup-fw-mode',
});
await setupActions.openSetupWizard();
await setupActions.runSetupWizard();
const settingsActionState = {
  serviceStartupDelaySec: '1',
  serviceApplyDelaySec: '2',
  serviceGoMemLimit: '32MiB',
  serviceGoGC: '80',
  downloadMirror: 'github',
  mirrorPrefix: '',
};
const settingsActions = createSettingsActions({
  state: settingsActionState,
  request: async (path) => {
    if (path === '/api/settings/service') return { ok: true, stdout: 'saved', settings: { goGC: 80 } };
    if (path === '/api/service') return { ok: true, stdout: 'service ok' };
    return { ok: true, settings: {} };
  },
  render,
  refresh: async () => { settingsActionState.refreshed = true; },
  refreshLogs: async () => {},
  configureLogTimer: () => {},
  configureStatusTimer: () => {},
  syncLoggingSettings: (settings) => { settingsActionState.logging = settings; },
  syncServiceSettings: (settings) => { settingsActionState.service = settings; },
  savedPasswordStorageKey: 'ruopenray:test:password',
});
await settingsActions.saveServiceSettings();
await settingsActions.service('restart');
settingsActionState.token = 'test-token';
localStorage.setItem('openray_token', 'test-token');
settingsActions.logout();
const logoutClearedSession = !settingsActionState.token && !localStorage.getItem('openray_token') && settingsActionState.tab === 'dashboard';

let loginRefreshStarted = false;
let loginRefreshResolved = false;
let loginRenderCount = 0;
const loginActionState = { password: '', rememberPassword: false, message: '' };
const loginActions = createSettingsActions({
  state: loginActionState,
  request: async (path) => {
    if (path === '/api/login') return { token: 'login-token' };
    return { ok: true };
  },
  render: () => { loginRenderCount += 1; },
  refresh: () => {
    loginRefreshStarted = true;
    return new Promise((resolve) => {
      setTimeout(() => {
        loginRefreshResolved = true;
        resolve();
      }, 25);
    });
  },
  refreshLogs: async () => {},
  configureLogTimer: () => {},
  configureStatusTimer: () => {},
  syncLoggingSettings: () => {},
  syncServiceSettings: () => {},
  savedPasswordStorageKey: 'ruopenray:test:login-password',
});

const profileActionState = {
  jsonDraft: JSON.stringify({ outbounds: [] }),
};
const profileActions = createProfileActions({
  state: profileActionState,
  request: async (path) => {
    if (path === '/api/profiles/activate') return { ok: true };
    if (path === '/api/backup') return { path: '/tmp/backup.json' };
    return { ok: true };
  },
  render,
  refresh: async () => { profileActionState.refreshed = true; },
});
await profileActions.activateProfile('default');
await profileActions.backup();

const importActionState = {
  importLink: 'link-placeholder',
  importOutboundTag: 'proxy-new',
  importPreview: null,
  profileName: '',
  profiles: [{ name: 'default', active: true }],
  config: {
    outbounds: [{ tag: 'direct', protocol: 'freedom' }],
    routing: { rules: [] }
  },
  subscriptionAutoBalancer: true,
  subscriptionBalancerTag: '',
  subscriptionUrl: '',
};
const importActions = createImportActions({
  state: importActionState,
  request: async (path) => {
    if (path === '/api/import/preview') {
      return {
        links: 1,
        items: [{ tag: 'preview-tag', protocol: 'vless', address: 'example.com:443' }],
        outbound: { tag: 'preview-tag', protocol: 'vless', settings: {} },
        outbounds: [{ tag: 'preview-tag', protocol: 'vless', settings: {} }]
      };
    }
    return { ok: true };
  },
  render,
  refresh: async () => { importActionState.refreshed = true; },
  syncConfig: (config) => { importActionState.config = config; },
  applyConfig: async () => { importActionState.applied = true; },
  isSystemOutbound: (outbound) => ['direct', 'block'].includes(outbound?.tag),
  cloneOutboundWithTag: (outbound, tag) => ({ ...JSON.parse(JSON.stringify(outbound)), tag }),
  routeRules: () => importActionState.config.routing?.rules || [],
  activeProxyTag: () => 'proxy-old',
  setRoutingDraft: (rules) => {
    importActionState.config = {
      ...importActionState.config,
      routing: { ...(importActionState.config.routing || {}), rules }
    };
  },
  setActiveServerTag: (tag) => { importActionState.activeServerTag = tag; },
});
await importActions.previewImport();
await importActions.importToCurrent(true);

const serverActionState = {
  config: {
    outbounds: [{ tag: 'proxy-old' }, { tag: 'proxy-new' }],
    routing: { rules: [{ outboundTag: 'proxy-old', type: 'field', domain: ['domain:example.com'] }] },
  },
  serverCheckTimeout: 100,
  serverCheckAttempts: 1,
  serverCheckMode: 'tcp',
  serverCheckUrl: 'https://www.gstatic.com/generate_204',
  serverChecks: {},
  serverCheckHistory: [],
  serverChecking: false,
  serverCheckingTags: [],
  pendingServerTag: '',
};
const serverActions = createServerActions({
  state: serverActionState,
  request: async (path) => {
    if (path === '/api/outbounds/check') return { results: [{ tag: 'proxy-new', ok: true, latencyMs: 10 }] };
    if (path === '/api/subscriptions/fallback') return { ok: true, selected: { tag: 'proxy-new' } };
    return { ok: true };
  },
  render,
  refresh: async () => { serverActionState.refreshed = true; },
  syncConfig: (config) => { serverActionState.config = config; },
  keepOperationVisible: async () => {},
  configOutbounds: () => serverActionState.config.outbounds || [],
  proxyOutbounds: () => (serverActionState.config.outbounds || []).filter((item) => item.tag?.startsWith('proxy')),
  proxyRuleStrategyStats: () => ({ primary: 1, pinned: 0 }),
  setActiveProxyDraft: (tag) => {
    serverActionState.config.routing.rules = serverActionState.config.routing.rules.map((rule) => ({ ...rule, outboundTag: tag }));
  },
  applyConfig: async () => { serverActionState.applied = true; },
});
await serverActions.checkServers(['proxy-new']);
await serverActions.routeAllToOutbound('proxy-new');
await serverActions.fallbackSubscriptionPool('subscription');

const observatoryState = {
  config: {},
  serverCheckUrl: 'https://www.gstatic.com/generate_204',
  observatoryInterval: '15',
  message: '',
};
let observatoryConfigDraft = null;
let observatoryCheckedTags = [];
const observatoryActions = createObservatoryActions({
  state: observatoryState,
  syncConfig: (config) => {
    observatoryState.config = config;
    observatoryConfigDraft = config;
  },
  render,
  routeBalancers: () => [{ tag: 'auto', selector: ['proxy'], strategy: { type: 'leastPing' } }],
  proxyOutbounds: () => [{ tag: 'proxy-one' }, { tag: 'other' }],
  checkServers: async (tags) => { observatoryCheckedTags = tags; },
});
observatoryActions.enableObservatoryForProxy();
await observatoryActions.checkObservatoryTargets();

const configActionState = {
  jsonDraft: JSON.stringify({ outbounds: [] }),
  status: {},
  xrayTrafficHistory: [],
};
const configActions = createConfigActions({
  state: configActionState,
  request: async (path) => {
    if (path === '/api/config/analyze') return { errors: [], warnings: [] };
    if (path === '/api/config/test') return { ok: true, stdout: 'ok' };
    if (path === '/api/config/apply') return { ok: true, test: { stdout: 'applied' }, analysis: { errors: [] }, backup: '/tmp/backup.json' };
    if (path === '/api/xray/stats/reset') return { ok: true };
    return { ok: true };
  },
  render,
  refresh: async () => { configActionState.refreshed = true; },
  keepOperationVisible: async () => {},
  recordXrayStatsSample: () => { configActionState.sampled = true; },
  xrayStatsResetAtStorageKey: 'ruopenray:test:xray-reset',
});
await configActions.analyzeConfig();
await configActions.applyConfig();

const sniActionState = {
  sniTarget: '',
  sniCidr: '24',
  sniTimeout: '1500',
  sniThreads: '16',
  sniLimit: '64',
};
const sniActions = createSniActions({
  state: sniActionState,
  request: async () => ({ results: [{ ip: '1.1.1.1' }], scanned: 1 }),
  render,
  outboundAddress: () => 'cloudone.example:443',
  activeProxyOutbound: () => ({}),
});
await sniActions.scanSni();

const updatesState = {
  geoCustomSources: [],
  geoSourceName: '  Custom Geo  ',
  geoSourceKind: 'base',
  geoSourceGeoipUrl: ' https://example.test/geoip.dat ',
  geoSourceGeositeUrl: ' https://example.test/geosite.dat ',
  geoSourceUrl: '',
  geoSourceTarget: '',
};
const updatesActions = createUpdatesActions({
  state: updatesState,
  request: async (path, options = {}) => {
    if (path === '/api/geo/sources') {
      const payload = JSON.parse(options.body || '{}');
      return { ok: true, sources: payload.sources || [], status: {} };
    }
    return { ok: true, sources: [], status: {} };
  },
  render,
  refresh: async () => {},
  geoSelectedPresetIds: () => ['loyalsoldier'],
});
await updatesActions.addGeoSource();

const sni = createSniView({
  state,
  escapeHtml,
  stat,
  outboundAddress: () => 'example.com:443',
  activeProxyOutbound: () => ({}),
});

globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
};
globalThis.localStorage = globalThis.localStorage || {
  data: new Map(),
  getItem(key) { return this.data.get(key) || null; },
  setItem(key, value) { this.data.set(key, String(value)); },
  removeItem(key) { this.data.delete(key); },
};
globalThis.window = globalThis.window || {
  crypto: {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index + 1;
      return bytes;
    },
  },
};
globalThis.document = {
  ...globalThis.document,
  querySelector: (selector) => {
    if (selector === '#password') return { value: 'admin' };
    if (selector === '#rememberPassword') return { checked: false };
    return null;
  },
  querySelectorAll: () => [],
};
await loginActions.login({ preventDefault: () => {} });
const loginReturnedBeforeRefresh = loginRefreshStarted && !loginRefreshResolved && loginActionState.token === 'login-token' && loginRenderCount > 0;
await new Promise((resolve) => setTimeout(resolve, 35));

const { createInitialState } = await import('../cmd/ruopenray-ui/web/state.js');
const initialState = createInitialState();
const routingModel = createRoutingModel({
  state: {
    config: {
      routing: { rules: [{ domain: ['domain:chatgpt.com'], outboundTag: 'proxy', type: 'field' }] },
      outbounds: [{ tag: 'proxy', protocol: 'vless' }],
    },
    routeNames: {},
  },
  managedRouteTags: { proxy: 'proxy' },
  routeBundles: {},
  routeKinds: { domain: 'Сайт или домен' },
  routePresets: {},
  proxyOutbounds: () => [{ tag: 'proxy' }],
});
const routingDsl = createRoutingDsl({
  state: { routeDslName: 'Discord' },
  escapeHtml,
  resolveRoutingAlias: (tag) => (tag === 'proxy' ? 'cloudone' : tag),
  routeStatsFor: () => ({}),
});
const parsedDsl = routingDsl.parseRoutingDsl('domain(domain:discord.com) -> proxy\nnetwork(udp) && ip(104.16.0.0/12) -> proxy');
const routingActionState = {
  config: { routing: { rules: [] } },
  routeKind: 'domain',
  routeValue: 'domain:example.com',
  routeName: 'Example',
  routeTargetType: 'outbound',
  routeOutbound: 'proxy',
  routeBalancer: '',
  routeNames: {},
  disabledRouteRules: [],
  customRoutePresets: {},
  selectedRoutePresets: [],
  routeRuleDialog: true,
  routeRuleMode: 'single',
  routeRuleEditingIndex: -1,
  routeSearch: '',
};
const routingActionModel = createRoutingModel({
  state: routingActionState,
  managedRouteTags: { proxy: 'proxy' },
  routeBundles: {},
  routeKinds: { domain: 'Сайт или домен' },
  routePresets: {},
  proxyOutbounds: () => [{ tag: 'proxy' }],
});
const routingActions = createRoutingActions({
  state: routingActionState,
  render,
  escapeHtml,
  routeKinds: { domain: 'Сайт или домен' },
  routePresets: {},
  routeBundles: {},
  hiddenBuiltinRoutePresetKeys: new Set(),
  customRoutePresetsStorageKey: 'ruopenray:test:custom-presets',
  parseRoutingDsl: routingDsl.parseRoutingDsl,
  isDslDefaultRule: routingDsl.isDslDefaultRule,
  dslPreviewStats: routingDsl.dslPreviewStats,
  dslPreviewView: routingDsl.dslPreviewView,
  routeRules: routingActionModel.routeRules,
  setRoutingDraft: (rules) => {
    routingActionState.config.routing = { ...(routingActionState.config.routing || {}), rules };
  },
  activeProxyTag: () => 'proxy',
  balancerOptions: () => [],
  splitRouteValues: routingActionModel.splitRouteValues,
  routeTarget: routingActionModel.routeTarget,
  routeRuleKey: routingActionModel.routeRuleKey,
  readableRouteTag: routingActionModel.readableRouteTag,
  encodedRouteTarget: routingActionModel.encodedRouteTarget,
  isRuOpenRayManagedRoute: routingActionModel.isRuOpenRayManagedRoute,
  routeRuleName: routingActionModel.routeRuleName,
  setRouteRuleName: routingActionModel.setRouteRuleName,
  copyRouteRuleName: routingActionModel.copyRouteRuleName,
  describeRouteRule: routingActionModel.describeRouteRule,
  routeSectionDefinitions: routingActionModel.routeSectionDefinitions,
  routeCategoryForRule: routingActionModel.routeCategoryForRule,
  routeRuleSource: routingActionModel.routeRuleSource,
  routeTargetOptions: routingActionModel.routeTargetOptions,
  saveRouteNames: routingActionModel.saveRouteNames,
  saveDisabledRouteRules: () => {},
});
routingActions.addRoutingRule();
const routeDialogState = {
  routeRuleDialog: true,
  routeRuleMode: 'presets',
  routeRuleEditingIndex: -1,
  selectedRoutePresets: [],
  customRoutePresets: {},
  message: '',
};
const routeDialogView = createRoutingDialogsView({
  state: routeDialogState,
  escapeHtml,
  routeKinds: { domain: 'Сайт или домен' },
  routePlaceholders: { domain: 'domain:example.com' },
  customRoutePresetEntries: () => [],
  builtinRoutePresetEntries: () => [['chatgpt', { title: 'ChatGPT', rule: { type: 'field', outboundTag: 'proxy', domain: ['domain:chatgpt.com'] } }]],
  ruleCountLabel: (count) => `${count} правило`,
  routePresetConditionCount: () => 1,
  routeTargetOptions: () => [],
  balancerOptions: () => [],
  outboundOptions: () => ['proxy'],
  routeLeasePicker: () => '',
  dslPreviewView: () => '',
  routeBalancers: () => [],
  balancerTargetOptions: () => [],
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
  balancerSelectorMatches: () => [],
  strategyObserverType: () => '',
  observerLabel: () => '',
  routeRules: () => [],
  balancerStrategyLabel: () => '',
  routePresetCheckResultView: () => '',
  describeRouteRule: (rule) => ({ fullValue: rule?.domain?.join(', ') || 'правило' }),
  routePresetRules: (key) => key === 'chatgpt' ? [{ type: 'field', outboundTag: 'proxy', domain: ['domain:chatgpt.com'] }] : [],
});
const routeDialogPresetsHtml = routeDialogView.routeRuleDialog();
const routeBalancerState = {
  config: { routing: { balancers: [] } },
  routeBalancerEditingIndex: -1,
  routeBalancerTag: 'auto',
  routeBalancerStrategy: 'leastPing',
  routeBalancerSelectors: 'proxy-one\nproxy-two',
  routeBalancerFallback: 'proxy-one',
  routeBalancer: '',
  routeTargetType: 'outbound',
};
const routeBalancerActions = createRouteBalancerActions({
  state: routeBalancerState,
  render,
  routeBalancers: () => routeBalancerState.config.routing.balancers || [],
  routeRules: () => [],
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
  setRouteBalancersDraft: (balancers) => {
    routeBalancerState.config.routing = { ...(routeBalancerState.config.routing || {}), balancers };
  },
  syncConfig: (config) => {
    routeBalancerState.config = config;
  },
  strategyObserverType: (strategy) => (strategy === 'leastPing' ? 'observatory' : ''),
  applyObserverForStrategy: (config) => ({ ...config, observatory: { enabled: true } }),
  observerLabel: () => 'Observatory',
});
routeBalancerActions.saveRouteBalancer();
const dnsModel = createDnsModel({
  state: {
    config: {
      dns: {
        servers: ['https://dns.google/dns-query', { address: '1.1.1.1', port: 53, network: 'tcp' }],
        hosts: { 'example.test': '127.0.0.1' },
      },
    },
  },
});
const dnsActionState = {
  config: { dns: { servers: [], hosts: {} }, routing: { rules: [] } },
  dnsAddress: '192.168.1.1',
  dnsDomains: 'lan',
  dnsHostName: 'router.lan',
  dnsHostValue: '192.168.1.1',
  dnsCheckHost: 'example.com',
  lanDnsMode: 'xray',
  lanDnsUpstream: '127.0.0.1#5353',
  lanDnsRestart: false,
};
const dnsActionModel = createDnsModel({ state: dnsActionState });
const dnsActions = createDnsActions({
  state: dnsActionState,
  request: async (path) => {
    if (path === '/api/dns/check') return { ok: true, a: ['93.184.216.34'], addresses: ['93.184.216.34'] };
    if (path === '/api/dns/lan-upstream') return { ok: true, mode: dnsActionState.lanDnsMode, upstream: dnsActionState.lanDnsUpstream };
    return { ok: true };
  },
  render,
  syncConfig: (config) => { dnsActionState.config = config; },
  syncLanDnsStatus: (status) => { dnsActionState.lanDnsStatus = status; },
  activeProxyTag: () => 'proxy',
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
  dnsConfig: dnsActionModel.dnsConfig,
  normalizeDnsAddressInput: dnsActionModel.normalizeDnsAddressInput,
  ensureDnsBootstrapHosts: (config) => {
    config.dns = config.dns || {};
    config.dns.hosts = { ...(config.dns.hosts || {}), 'dns.google': '8.8.8.8' };
  },
});
dnsActions.addDnsServer();
dnsActions.saveDnsHost();
const firewallState = {
  config: {
    inbounds: [{ tag: 'transparent_ipv4', protocol: 'dokodemo-door', port: 52345, streamSettings: { sockopt: { tproxy: 'tproxy' } } }],
    outbounds: [{ tag: 'dns-out', protocol: 'dns' }],
    routing: { rules: [
      { outboundTag: 'direct', ip: ['geoip:private'], domain: ['domain:router.lan'] },
      { outboundTag: 'proxy', domain: ['domain:telegram.org', 'geosite:youtube'] },
    ] },
  },
  firewallBlockQuic: true,
  firewallBypassMode: 'off',
  firewallDeviceMode: 'all',
  firewallPortMode: 'custom',
  firewallPorts: '80,443',
  firewallRouterMode: 'tproxy',
  firewallSelectedDevices: [],
  firewallKillSwitchEnabled: true,
  firewallKillSwitchTargets: '162.159.140.0/24, openai.com',
  leases: [],
};
const firewallModel = createFirewallModel({
  state: firewallState,
  configInbounds: () => firewallState.config.inbounds,
  configOutbounds: () => firewallState.config.outbounds,
  routeRules: () => firewallState.config.routing.rules,
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
  deviceRules: () => [],
  routeRuleName: () => 'rule',
  describeRouteRule: () => ({ kind: 'ip' }),
});
const dnsOnlyFirewallModel = createFirewallModel({
  state: firewallState,
  configInbounds: () => [{ tag: 'ruopenray_dns_in', protocol: 'dokodemo-door', port: 5353, settings: { network: 'tcp,udp' } }],
  configOutbounds: () => [{ tag: 'dns-out', protocol: 'dns' }],
  routeRules: () => [{ outboundTag: 'dns-out', inboundTag: ['ruopenray_dns_in'], type: 'field' }],
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
  deviceRules: () => [],
  routeRuleName: () => 'rule',
  describeRouteRule: () => ({ kind: 'ip' }),
});
const firewallActions = createFirewallActions({
  state: firewallState,
  request: async (path) => {
    if (path === '/api/firewall/apply') return { ok: true, status: { active: true, routerMode: 'tproxy', ipRule: true, ipRoute: true } };
    if (path === '/api/firewall/status') return { active: true, routerMode: 'tproxy', ipRule: true, ipRoute: true };
    if (path === '/api/firewall/preview') return { ok: true, nft: 'table inet ruopenray {}', status: { active: true } };
    if (path === '/api/firewall/disable') return { ok: true, status: { active: false } };
    return { ok: true };
  },
  render,
  delay: async () => {},
  firewallPayload: firewallModel.firewallPayload,
  firewallCommands: firewallModel.firewallCommands,
  firewallReadyStatus: firewallModel.firewallReadyStatus,
  storageKeys: {
    firewallBypassModeStorageKey: 'ruopenray:test:fw:bypass',
    firewallRouterModeStorageKey: 'ruopenray:test:fw:router',
    firewallDeviceModeStorageKey: 'ruopenray:test:fw:device',
    firewallPortModeStorageKey: 'ruopenray:test:fw:port',
    firewallSelectedDevicesStorageKey: 'ruopenray:test:fw:selected',
    firewallBlockQuicStorageKey: 'ruopenray:test:fw:quic',
    firewallKillSwitchEnabledStorageKey: 'ruopenray:test:fw:ks',
    firewallKillSwitchTargetsStorageKey: 'ruopenray:test:fw:ks-targets',
  },
});
firewallActions.setFirewallBypassMode('redirect');
firewallActions.setFirewallPortMode('all');
firewallActions.setFirewallKillSwitchTargets('172.64.150.0/24, chatgpt.com');
const xrayDraftState = {
  config: {
    inbounds: [{ tag: 'transparent_ipv4', protocol: 'dokodemo-door', streamSettings: {} }],
    outbounds: [{ tag: 'proxy', protocol: 'vless', streamSettings: {} }],
    routing: { rules: [] },
    dns: { servers: [] },
  },
  firewallRouterMode: 'tproxy',
};
const xrayDraftActions = createXrayDraftActions({
  state: xrayDraftState,
  render,
  syncConfig: (config) => { xrayDraftState.config = config; },
  advancedInbounds: () => xrayDraftState.config.inbounds,
  currentSnifferSettings: () => ({ mode: 'http-tls', routeOnly: true, excluded: '' }),
  proxyOutbounds: () => xrayDraftState.config.outbounds.filter((item) => item.tag === 'proxy'),
  normalizeSetupRules: (config) => { config.routing.rules.push({ type: 'field', ip: ['geoip:private'], outboundTag: 'direct' }); },
  firewallCommands: () => 'nft list ruleset',
  githubInstallCommand: () => 'install command',
});
xrayDraftActions.setDnsModeDraft('fakedns');
xrayDraftActions.setTcpFastOpenDraft(true);
xrayDraftActions.prepareTransparentDraft();
const serverModel = createServerModel({
  state: {
    activeServerTag: '',
    config: {
      outbounds: [
        { tag: 'cloudone', protocol: 'vless', settings: { vnext: [{ address: 'cloudone.example', port: 443 }] } },
        { tag: 'direct', protocol: 'freedom' },
      ],
      routing: { rules: [{ outboundTag: 'proxy', domain: ['domain:chatgpt.com'], type: 'field' }] },
    },
    subscriptionPools: [],
  },
  configOutbounds: () => [
    { tag: 'cloudone', protocol: 'vless', settings: { vnext: [{ address: 'cloudone.example', port: 443 }] } },
    { tag: 'direct', protocol: 'freedom' },
  ],
  routeRules: () => [{ outboundTag: 'proxy', domain: ['domain:chatgpt.com'], type: 'field' }],
  routeBalancers: () => [],
  routeTarget: (rule) => ({ kind: 'domain', values: rule.domain || [] }),
  outboundAddress: () => 'cloudone.example:443',
  outboundTransport: () => 'tcp / reality',
  outboundMatchesSelectors: () => false,
  observatorySelectors: () => [],
  burstObservatorySelectors: () => [],
  strategyObserverType: () => '',
  observerLabel: () => '',
  checkForTag: () => null,
  checkLabel: () => 'не проверен',
  ruleCountLabel: (count) => `${count} правило`,
  escapeHtml,
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
});
const xrayConfigModel = createXrayConfigModel({
  config: {
    inbounds: [{ tag: 'transparent_ipv4', protocol: 'dokodemo-door', sniffing: { enabled: true, destOverride: ['http', 'tls'] } }],
    outbounds: [{ tag: 'proxy', protocol: 'vless', settings: { vnext: [{ address: 'example.com', port: 443 }] } }],
    dns: {},
  },
});

bindDiagnosticsControls({
  state,
  render,
  domainMonitorFilterStorageKey: 'ruopenray:test',
  activeProxyTag: () => 'proxy',
  probeMonitoredDomain: async () => {},
  focusSniResult: () => {},
  refreshLogs: async () => {},
  configureLogTimer: () => {},
  scrollLogsToBottom: () => {},
});

bindCoreControls({
  state,
  render,
  filteredCoreReleases: () => [],
});

bindSettingsControls({
  state,
  render,
  installPasswordStorageKey: 'ruopenray:test:install-password',
  githubInstallCommand: () => 'install command',
});

bindGeoControls({
  state,
  render,
  toggleGeoSourceEnabled: () => {},
  removeGeoSource: () => {},
  deleteGeoFile: () => {},
});

bindDeviceControls({
  state,
  render,
  updateDeviceRule: () => {},
  removeDeviceRule: () => {},
});

bindDnsControls({
  state,
  render,
  removeDnsServer: () => {},
  editDnsHost: () => {},
  removeDnsHost: () => {},
  setDnsModeDraft: () => {},
});

bindRoutingControls({
  state,
  render,
  firewallPortsStorageKey: 'ruopenray:test:ports',
  addRoutingPreset: () => {},
  editRoutingPreset: () => {},
  deleteCustomRoutePreset: () => {},
  removeRoutingRule: () => {},
  disableRoutingRule: () => {},
  restoreDisabledRouteRule: () => {},
  deleteDisabledRouteRule: () => {},
  moveRoutingRule: () => {},
  openRoutingRuleEditor: () => {},
  openRouteBalancerDialog: () => {},
  removeRouteBalancer: () => {},
  setFirewallBypassMode: () => {},
  setFirewallRouterMode: () => {},
  setFirewallDeviceMode: () => {},
  toggleFirewallDevice: () => {},
  reorderRoutingRule: () => {},
  routeRules: () => [],
  describeRouteRule: () => null,
  updateRoutingTarget: () => {},
  removeOutbound: () => {},
  routeAllToOutbound: async () => {},
  checkServers: async () => {},
  setSnifferDraft: () => {},
  setQuicPolicy: () => {},
  currentSnifferSettings: () => ({ mode: 'off' }),
  setFirewallPortMode: () => {},
  setFirewallBlockQuic: () => {},
  applyLeaseSearch: () => {},
  setRouteBalancerSelector: () => {},
  moveRouteBalancerSelector: () => {},
  balancerOptions: () => [],
});

bindProfileControls({
  activateProfile: () => {},
});

bindNavigationControls({
  state,
  render,
});
bindModalControls();

bindConfigControls({ state });

bindImportControls({
  state,
  render,
});

bindServerCheckControls({
  state,
  render,
});

bindActionControls({
  state,
  render,
  handlers: {},
});

const actionBusyState = {
  busyAction: '',
  busyLabel: '',
  configTesting: false,
  configApplying: false,
  serverChecking: false,
  serverCheckingTags: [],
  message: '',
};
let actionBusySeen = false;
let actionBusyDuringHandler = false;
let actionClickHandler = null;
let actionErrorClickHandler = null;
const actionButton = {
  dataset: { action: 'apply' },
  classList: { contains: () => false },
  textContent: 'Применить',
  addEventListener: (_event, handler) => { actionClickHandler = handler; },
};
const actionErrorButton = {
  dataset: { action: 'restart' },
  classList: { contains: () => false },
  textContent: 'Перезапустить',
  addEventListener: (_event, handler) => { actionErrorClickHandler = handler; },
};
globalThis.document = {
  ...globalThis.document,
  querySelectorAll: (selector) => (selector === '[data-action]' ? [actionButton, actionErrorButton] : []),
};
bindActionControls({
  state: actionBusyState,
  render: () => {
    if (actionBusyState.busyAction === 'apply' && actionBusyState.busyLabel) {
      actionBusySeen = true;
    }
  },
  handlers: {
    apply: async () => {
      actionBusyDuringHandler = actionBusyState.busyAction === 'apply';
      await Promise.resolve();
    },
    restart: async () => {
      throw new Error('exit status 1');
    },
  },
});
await actionClickHandler({ target: actionButton });
await actionErrorClickHandler({ target: actionErrorButton });

const anonymizedConfig = anonymizeConfig({
  outbounds: [{
    tag: 'cloudone-private',
    protocol: 'vless',
    settings: { vnext: [{ address: 'cloudone.example', users: [{ id: '4277f460-216c-412e-99fb-c94534544138', encryption: 'none' }] }] },
    streamSettings: { security: 'reality', realitySettings: { serverName: 'cloudone.example', privateKey: 'secret', shortId: 'abcd' } }
  }],
  routing: { rules: [{ outboundTag: 'cloudone-private', domain: ['domain:2ip.ru'] }] }
});

const checks = [
  ['aux devices panel', aux.devicesPanel().includes('LAN')],
  ['aux logs panel', aux.logsPanel(true).includes('log-console')],
  ['diagnostics model events', model.logEvents().length === 1],
  ['diagnostics model domains', model.monitoredDomains()[0]?.host === 'chatgpt.com'],
  ['devices model lease picker', devicesModel.deviceStats().proxy === 1 && devicesModel.routeLeasePicker().includes('192.168.1.2')],
  ['devices actions draft', deviceActionState.config.routing.rules[0]?.source?.[0] === '192.168.1.77' && deviceActionState.config.routing.rules[0]?.inboundTag?.[0] === 'transparent_ipv4'],
  ['diagnostics actions bytes', actions.totalXrayStatsBytes({ outbounds: [{ uplink: 1, downlink: 2 }] }) === 3],
  ['runtime controller samples', runtime.logsUrl().includes('q=chatgpt') && runtime.displayLogText('2\n1') === '1\n2' && (runtime.recordTrafficSample({ system: { traffic: { rxRate: 10, txRate: 5 } } }), runtimeState.trafficHistory.length === 1)],
  ['setup model draft', setupModel.setupReadiness().ready && (setupModel.prepareSetupDraft({ message: false }), setupState.config.inbounds.some((item) => item.tag === 'transparent_ipv4'))],
  ['setup actions run', setupState.setupResult?.ok && setupState.refreshed],
  ['settings actions service', settingsActionState.service?.goGC === 80 && settingsActionState.refreshed],
  ['settings actions logout', logoutClearedSession],
  ['settings actions login is nonblocking', loginReturnedBeforeRefresh && loginRefreshResolved],
  ['action bindings busy state', actionBusySeen && actionBusyDuringHandler && actionBusyState.busyAction === '' && actionBusyState.message.includes('exit status 1')],
  ['profile actions', profileActionState.refreshed && profileActionState.message?.includes('/tmp/backup.json')],
  ['import actions active', importActionState.applied && importActionState.activeServerTag === 'proxy-new' && importActionState.config.outbounds[0]?.tag === 'proxy-new'],
  ['server actions check and switch', serverActionState.serverChecks['proxy-new']?.ok && serverActionState.config.routing.rules[0]?.outboundTag === 'proxy-new' && serverActionState.applied && serverActionState.refreshed],
  ['observatory actions', observatoryConfigDraft?.observatory?.probeInterval === '15s' && observatoryCheckedTags[0] === 'proxy-one'],
  ['config actions apply', configActionState.configAnalysis?.errors?.length === 0 && configActionState.lastApplyBackup === '/tmp/backup.json'],
  ['config anonymized export', anonymizedConfig.outbounds[0]?.tag === 'proxy-1' && anonymizedConfig.routing.rules[0]?.outboundTag === 'proxy-1' && anonymizedConfig.outbounds[0]?.settings?.vnext?.[0]?.address?.startsWith('[masked') && anonymizedConfig.outbounds[0]?.settings?.vnext?.[0]?.users?.[0]?.id?.startsWith('[masked')],
  ['updates actions geo payload', updatesActions.cleanGeoSourcePayload({ name: ' Custom ', geoipUrl: ' https://x/geoip.dat ', geositeUrl: ' https://x/geosite.dat ' }).geoipUrl === 'https://x/geoip.dat'],
  ['updates actions geo save', updatesState.geoCustomSources[0]?.name === 'Custom Geo' && updatesState.geoCustomSources[0]?.enabled],
  ['sni actions scan', sniActionState.sniScan?.results?.length === 1 && sniActionState.sniTarget === 'cloudone.example'],
  ['sni panel', sni.sniPanel().includes('SNI')],
  ['formatters bytes', formatByteSize(1536) === '2 KB'],
  ['formatters duration', formatDurationCompact(3660) === '1 ч 1 мин'],
  ['initial state tab', initialState.tab === 'dashboard' && initialState.serverCheckMode === 'http'],
  ['routing model rules', routingModel.routeStats().proxy === 1 && routingModel.describeRouteRule(routingModel.routeRules()[0]).kind === 'Сайт или домен'],
  ['routing dsl parser', parsedDsl.rules.length === 2 && parsedDsl.proxyAlias === 'cloudone' && routingDsl.dslPreviewStats(parsedDsl).proxy === 2],
  ['routing dialog presets render', routeDialogPresetsHtml.includes('ChatGPT') && routeDialogPresetsHtml.includes('data-route-preset-check')],
  ['route balancer actions', routeBalancerState.config.routing.balancers[0]?.tag === 'auto' && routeBalancerState.config.observatory?.enabled && routeBalancerState.routeTargetType === 'balancer'],
  ['dns model normalization', dnsModel.dnsStats().servers === 2 && dnsModel.normalizeDnsAddressInput('192.168.1.1').check === '192.168.1.1:53'],
  ['dns actions draft', dnsActionState.config.dns.servers[0]?.address === '192.168.1.1' && dnsActionState.config.dns.hosts['router.lan'] === '192.168.1.1'],
  ['firewall model payload', firewallModel.firewallInfo().ready && firewallModel.firewallPayload().routerMode === 'tproxy' && firewallModel.firewallPayload().killSwitchIps[0] === '172.64.150.0/24' && firewallModel.firewallPayload().proxyDomains.includes('telegram.org') && firewallModel.firewallPayload().proxyGeosite.includes('youtube')],
  ['firewall model ignores dns inbound as transparent', !dnsOnlyFirewallModel.firewallInfo().ready && dnsOnlyFirewallModel.firewallInfo().transparent.length === 0 && dnsOnlyFirewallModel.firewallPolicyPreview().warnings.some((item) => item.includes('Нет transparent inbound'))],
  ['firewall actions draft', firewallState.firewallBypassMode === 'redirect' && firewallState.firewallPortMode === 'all' && firewallState.firewallKillSwitchTargets.includes('chatgpt.com')],
  ['xray draft actions', xrayDraftState.config.dns.fakeDNS?.length === 1 && xrayDraftState.config.outbounds[0]?.streamSettings?.sockopt?.tcpFastOpen === true && xrayDraftState.config.routing.rules[0]?.outboundTag === 'direct'],
  ['server model active proxy', serverModel.activeProxyTag() === 'cloudone' && serverModel.proxyOutbounds().length === 1 && serverModel.outboundUsage('cloudone') === 1],
  ['xray config model', xrayConfigModel.currentSnifferSettings().mode === 'http-tls' && xrayConfigModel.outboundAddress(xrayConfigModel.configOutbounds()[0]) === 'example.com:443'],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`Frontend smoke failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

console.log(`Frontend smoke passed (${checks.length} checks, ${renders} renders)`);
