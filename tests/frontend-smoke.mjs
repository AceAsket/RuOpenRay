import { createAuxPanelsView } from '../cmd/ruopenray-ui/web/aux-panels-view.js';
import { bindActionControls } from '../cmd/ruopenray-ui/web/action-bindings.js';
import { bindConfigControls } from '../cmd/ruopenray-ui/web/config-bindings.js';
import { bindCoreControls } from '../cmd/ruopenray-ui/web/core-bindings.js';
import { bindDiagnosticsControls } from '../cmd/ruopenray-ui/web/diagnostics-bindings.js';
import { createDiagnosticsActions } from '../cmd/ruopenray-ui/web/diagnostics-actions.js';
import { createDiagnosticsModel } from '../cmd/ruopenray-ui/web/diagnostics-model.js';
import { bindDeviceControls } from '../cmd/ruopenray-ui/web/devices-bindings.js';
import { bindDnsControls } from '../cmd/ruopenray-ui/web/dns-bindings.js';
import { byteSize as formatByteSize, escapeHtml, formatDurationCompact } from '../cmd/ruopenray-ui/web/formatters.js';
import { bindGeoControls } from '../cmd/ruopenray-ui/web/geo-bindings.js';
import { bindImportControls } from '../cmd/ruopenray-ui/web/import-bindings.js';
import { bindModalControls, bindNavigationControls } from '../cmd/ruopenray-ui/web/navigation-bindings.js';
import { bindProfileControls } from '../cmd/ruopenray-ui/web/profile-bindings.js';
import { bindRoutingControls } from '../cmd/ruopenray-ui/web/routing-bindings.js';
import { createRoutingModel } from '../cmd/ruopenray-ui/web/routing-model.js';
import { bindServerCheckControls } from '../cmd/ruopenray-ui/web/server-check-bindings.js';
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
  ['diagnostics actions bytes', actions.totalXrayStatsBytes({ outbounds: [{ uplink: 1, downlink: 2 }] }) === 3],
  ['sni panel', sni.sniPanel().includes('SNI')],
  ['formatters bytes', formatByteSize(1536) === '2 KB'],
  ['formatters duration', formatDurationCompact(3660) === '1 ч 1 мин'],
  ['initial state tab', initialState.tab === 'dashboard' && initialState.serverCheckMode === 'http'],
  ['routing model rules', routingModel.routeStats().proxy === 1 && routingModel.describeRouteRule(routingModel.routeRules()[0]).kind === 'Сайт или домен'],
  ['xray config model', xrayConfigModel.currentSnifferSettings().mode === 'http-tls' && xrayConfigModel.outboundAddress(xrayConfigModel.configOutbounds()[0]) === 'example.com:443'],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`Frontend smoke failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

console.log(`Frontend smoke passed (${checks.length} checks, ${renders} renders)`);
