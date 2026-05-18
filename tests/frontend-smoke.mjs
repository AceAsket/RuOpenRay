import { createAuxPanelsView } from '../cmd/ruopenray-ui/web/aux-panels-view.js';
import { bindActionControls } from '../cmd/ruopenray-ui/web/action-bindings.js';
import { bindConfigControls } from '../cmd/ruopenray-ui/web/config-bindings.js';
import { createDevicesModel } from '../cmd/ruopenray-ui/web/devices-model.js';
import { bindCoreControls } from '../cmd/ruopenray-ui/web/core-bindings.js';
import { bindDiagnosticsControls } from '../cmd/ruopenray-ui/web/diagnostics-bindings.js';
import { createDiagnosticsActions } from '../cmd/ruopenray-ui/web/diagnostics-actions.js';
import { createDiagnosticsModel } from '../cmd/ruopenray-ui/web/diagnostics-model.js';
import { bindDeviceControls } from '../cmd/ruopenray-ui/web/devices-bindings.js';
import { bindDnsControls } from '../cmd/ruopenray-ui/web/dns-bindings.js';
import { createDnsModel } from '../cmd/ruopenray-ui/web/dns-model.js';
import { byteSize as formatByteSize, escapeHtml, formatDurationCompact } from '../cmd/ruopenray-ui/web/formatters.js';
import { bindGeoControls } from '../cmd/ruopenray-ui/web/geo-bindings.js';
import { bindImportControls } from '../cmd/ruopenray-ui/web/import-bindings.js';
import { bindModalControls, bindNavigationControls } from '../cmd/ruopenray-ui/web/navigation-bindings.js';
import { bindProfileControls } from '../cmd/ruopenray-ui/web/profile-bindings.js';
import { bindRoutingControls } from '../cmd/ruopenray-ui/web/routing-bindings.js';
import { createRuntimeController } from '../cmd/ruopenray-ui/web/runtime-controller.js';
import { createRoutingDsl } from '../cmd/ruopenray-ui/web/routing-dsl.js';
import { createRoutingModel } from '../cmd/ruopenray-ui/web/routing-model.js';
import { bindServerCheckControls } from '../cmd/ruopenray-ui/web/server-check-bindings.js';
import { createFirewallModel } from '../cmd/ruopenray-ui/web/firewall-model.js';
import { createServerModel } from '../cmd/ruopenray-ui/web/server-model.js';
import { createSetupModel } from '../cmd/ruopenray-ui/web/setup-model.js';
import { bindSettingsControls } from '../cmd/ruopenray-ui/web/settings-bindings.js';
import { createSniView } from '../cmd/ruopenray-ui/web/sni-view.js';
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
  status: { core: { available: true, version: 'Xray test' } },
  geoStatus: { geoip: { exists: true, size: 1 }, geosite: { exists: true, size: 1 } },
  firewallStatus: { active: true, persistent: true, routerMode: 'tproxy' },
  lanDnsStatus: { mode: 'xray', readiness: { ready: true } },
  firewallRouterMode: 'tproxy',
};
const setupModel = createSetupModel({
  state: setupState,
  byteSize: formatByteSize,
  firewallInfo: () => ({ ready: true, transparent: [{}], transparentPort: 52345 }),
  proxyOutbounds: () => setupConfig.outbounds,
  setupSnapshotStorageKey: 'ruopenray:test:setup-snapshot',
  request: async () => ({}),
  syncConfig: (config) => { setupState.config = config; },
  ensureDnsServer: (config, server) => {
    config.dns = config.dns || {};
    config.dns.servers = config.dns.servers || [];
    if (!config.dns.servers.includes(server)) config.dns.servers.push(server);
  },
});

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
const firewallState = {
  config: {
    inbounds: [{ tag: 'transparent_ipv4', protocol: 'dokodemo-door', port: 52345, streamSettings: { sockopt: { tproxy: 'tproxy' } } }],
    outbounds: [{ tag: 'dns-out', protocol: 'dns' }],
    routing: { rules: [{ outboundTag: 'direct', ip: ['geoip:private'] }] },
  },
  firewallBlockQuic: true,
  firewallBypassMode: 'off',
  firewallDeviceMode: 'all',
  firewallPortMode: 'custom',
  firewallPorts: '80,443',
  firewallRouterMode: 'tproxy',
  firewallSelectedDevices: [],
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

const checks = [
  ['aux devices panel', aux.devicesPanel().includes('LAN')],
  ['aux logs panel', aux.logsPanel(true).includes('log-console')],
  ['diagnostics model events', model.logEvents().length === 1],
  ['diagnostics model domains', model.monitoredDomains()[0]?.host === 'chatgpt.com'],
  ['devices model lease picker', devicesModel.deviceStats().proxy === 1 && devicesModel.routeLeasePicker().includes('192.168.1.2')],
  ['diagnostics actions bytes', actions.totalXrayStatsBytes({ outbounds: [{ uplink: 1, downlink: 2 }] }) === 3],
  ['runtime controller samples', runtime.logsUrl().includes('q=chatgpt') && runtime.displayLogText('2\n1') === '1\n2' && (runtime.recordTrafficSample({ system: { traffic: { rxRate: 10, txRate: 5 } } }), runtimeState.trafficHistory.length === 1)],
  ['setup model draft', setupModel.setupReadiness().ready && (setupModel.prepareSetupDraft({ message: false }), setupState.config.inbounds.some((item) => item.tag === 'transparent_ipv4'))],
  ['sni panel', sni.sniPanel().includes('SNI')],
  ['formatters bytes', formatByteSize(1536) === '2 KB'],
  ['formatters duration', formatDurationCompact(3660) === '1 ч 1 мин'],
  ['initial state tab', initialState.tab === 'dashboard' && initialState.serverCheckMode === 'http'],
  ['routing model rules', routingModel.routeStats().proxy === 1 && routingModel.describeRouteRule(routingModel.routeRules()[0]).kind === 'Сайт или домен'],
  ['routing dsl parser', parsedDsl.rules.length === 2 && parsedDsl.proxyAlias === 'cloudone' && routingDsl.dslPreviewStats(parsedDsl).proxy === 2],
  ['dns model normalization', dnsModel.dnsStats().servers === 2 && dnsModel.normalizeDnsAddressInput('192.168.1.1').check === '192.168.1.1:53'],
  ['firewall model payload', firewallModel.firewallInfo().ready && firewallModel.firewallPorts().join(',') === '80,443' && firewallModel.firewallPayload().routerMode === 'tproxy'],
  ['server model active proxy', serverModel.activeProxyTag() === 'cloudone' && serverModel.proxyOutbounds().length === 1 && serverModel.outboundUsage('cloudone') === 1],
  ['xray config model', xrayConfigModel.currentSnifferSettings().mode === 'http-tls' && xrayConfigModel.outboundAddress(xrayConfigModel.configOutbounds()[0]) === 'example.com:443'],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`Frontend smoke failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

console.log(`Frontend smoke passed (${checks.length} checks, ${renders} renders)`);
