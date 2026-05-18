import { hiddenBuiltinRoutePresetKeys, labels, managedRouteTags, nav, routeBundles, routeKinds, routePlaceholders, routePresets, tabTitles } from './presets.js';
import { createApiClient } from './api-client.js';
import { createDashboardView } from './dashboard-view.js';
import { createDiagnosticsView } from './diagnostics-view.js';
import { createDnsView } from './dns-view.js';
import { createGeoView } from './geo-view.js';
import { createImportDialogView } from './import-dialog-view.js';
import { createSettingsView } from './settings-view.js';
import { createRefreshTimers, isAuthError, loadAppSnapshot } from './refresh.js';
import { createRoutingView } from './routing-view.js';
import { createRoutingDialogsView } from './routing-dialogs-view.js';
import { createServersView } from './servers-view.js';
import { createSetupView } from './setup-view.js';
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
  initialInstallPassword,
  installPasswordStorageKey,
  loadCustomRoutePresets,
  loadDisabledRouteRules,
  loadRouteNames,
  loadStringListStorage,
  routeNamesStorageKey,
  savedPasswordStorageKey,
  setupSnapshotStorageKey,
  shellQuote,
  xrayStatsResetAtStorageKey
} from './storage.js';

const app = document.querySelector('#app');

const state = {
  token: localStorage.getItem('openray_token') || '',
  tab: 'dashboard',
  status: null,
  profiles: [],
  config: {},
  configAnalysis: null,
  lastApplyBackup: '',
  logs: '',
  message: '',
  coreUpdate: null,
  coreUpdating: false,
  coreReleases: [],
  coreAsset: '',
  coreArch: null,
  selectedCoreVersion: '',
  coreDialogOpen: false,
  installWizardOpen: false,
  installPlan: null,
  installStep: 'plan',
  installPassword: initialInstallPassword(),
  setupWizardOpen: false,
  setupApplying: false,
  setupResult: null,
  setupSnapshot: null,
  setupRollbacking: false,
  setupRollbackResult: null,
  setupLanDnsMode: 'xray',
  setupLanDnsUpstream: '',
  setupRestartDnsmasq: true,
  coreReleaseFilter: 'stable',
  coreBackup: false,
  appRelease: null,
  appUpdate: null,
  appUpdating: false,
  appReleaseChecking: false,
  appBackup: false,
  geoStatus: null,
  geoPreset: 'nidelon',
  geoBasePreset: 'nidelon',
  geoExtraPresets: [],
  geoBackup: false,
  geoScheduleLoaded: false,
  geoScheduleEnabled: false,
  geoScheduleInterval: 'weekly',
  geoScheduleWeekday: '0',
  geoScheduleTime: '04:20',
  geoipUrl: '',
  geositeUrl: '',
  geoCustomSources: [],
  geoCustomSourceIds: [],
  geoSourceName: '',
  geoSourceKind: 'base',
  geoSourceGeoipUrl: '',
  geoSourceGeositeUrl: '',
  geoSourceUrl: '',
  geoSourceTarget: '',
  geoUpdating: false,
  geoUpdate: null,
  serverChecks: {},
  serverCheckHistory: [],
  serverChecking: false,
  serverCheckingTags: [],
  configTesting: false,
  configApplying: false,
  activeServerTag: localStorage.getItem('ruopenray_active_server') || '',
  pendingServerTag: '',
  serverCheckTimeout: '2500',
  serverCheckAttempts: '1',
  serverCheckMode: 'http',
  serverCheckUrl: 'https://www.gstatic.com/generate_204',
  observatoryInterval: '',
  serversView: 'list',
  subscriptionPools: [],
  sniTarget: '',
  sniCidr: '24',
  sniTimeout: '1500',
  sniThreads: '64',
  sniLimit: '256',
  sniScan: null,
  sniScanning: false,
  sniFocusedIndex: null,
  diagnosticsView: 'live',
  diagnosticsChainRunning: false,
  diagnosticsChainResult: null,
  diagnosticsTestUrl: 'https://www.gstatic.com/generate_204',
  clientTrafficBaseline: null,
  clientTrafficResult: null,
  clientTrafficUrl: 'https://www.gstatic.com/generate_204',
  importLink: '',
  importOutboundTag: '',
  importPreview: null,
  subscriptionUrl: '',
  subscriptionPreview: null,
  subscriptionAutoBalancer: true,
  subscriptionBalancerTag: '',
  subscriptionBalancerStrategy: 'random',
  importDialog: '',
  logKind: 'all',
  logLevel: 'all',
  logQuery: '',
  logLines: '240',
  logSort: 'asc',
  logLive: true,
  logFollow: true,
  logIntervalSec: '2',
  dashboardLogsOpen: false,
  trafficHistory: [],
  xrayTrafficHistory: [],
  xrayStatsResetAt: localStorage.getItem(xrayStatsResetAtStorageKey) || '',
  logTimer: null,
  statusTimer: null,
  domainMonitor: null,
  domainMonitorQuery: '',
  domainMonitorSort: 'hits',
  domainMonitorMode: 'domains',
  domainMonitorFilter: localStorage.getItem(domainMonitorFilterStorageKey) || 'domains',
  domainProbeResults: {},
  domainProbeChecking: '',
  profileName: '',
  routeKind: 'domain',
  routeValue: '',
  routeName: '',
  routeOutbound: 'proxy',
  routeTargetType: 'outbound',
  routeBalancer: '',
  routeBalancerDialog: false,
  routeBalancerEditingIndex: -1,
  routeBalancerTag: '',
  routeBalancerStrategy: 'random',
  routeBalancerSelectors: '',
  routeBalancerFallback: '',
  routingView: 'rules',
  dnsView: 'servers',
  routeSearch: '',
  routeDslName: '',
  routeDsl: '',
  routeDslPreview: null,
  routeRuleDialog: false,
  routeRuleMode: 'single',
  routeRuleEditingIndex: -1,
  routePresetDialog: false,
  selectedRoutePresets: [],
  routePresetEditor: '',
  routePresetEditTitle: '',
  routePresetEditDetail: '',
  routePresetEditDsl: '',
  routePresetEditPreview: null,
  routePresetEditChecked: false,
  customRoutePresets: loadCustomRoutePresets(),
  routeNames: loadRouteNames(),
  disabledRouteRules: loadDisabledRouteRules(),
  deviceName: '',
  deviceIp: '',
  deviceMode: 'proxy',
  leaseSearch: '',
  dnsAddress: 'https://dns.google:443/dns-query',
  dnsDomains: '',
  dnsHostName: '',
  dnsHostValue: '',
  dnsCheckHost: 'example.com',
  dnsCheckResult: null,
  lanDnsStatus: null,
  lanDnsMode: 'xray',
  lanDnsUpstream: '',
  lanDnsRestart: true,
  lanDnsSaving: false,
  lanDnsPreview: null,
  leases: [],
  leasesSource: '',
  password: localStorage.getItem(savedPasswordStorageKey) || '',
  passwordVisible: false,
  rememberPassword: Boolean(localStorage.getItem(savedPasswordStorageKey)),
  settingsCurrentPassword: '',
  settingsNewPassword: '',
  settingsConfirmPassword: '',
  settingsPasswordSaving: false,
  settingsView: 'logging',
  loggingSettings: null,
  loggingLevel: 'warning',
  loggingAccessLog: false,
  loggingAccessPath: '/var/log/xray/access.log',
  loggingErrorLog: false,
  loggingErrorPath: '/var/log/xray/error.log',
  loggingDnsLog: false,
  loggingMaxSizeMb: '2',
  loggingRotateCopies: '1',
  loggingClearOnRestart: false,
  loggingRestart: true,
  loggingSaving: false,
  serviceSettings: null,
  serviceStartupDelaySec: '0',
  serviceApplyDelaySec: '0',
  serviceGoMemLimit: '48MiB',
  serviceGoGC: '60',
  serviceDownloadMirror: 'direct',
  serviceMirrorPrefix: '',
  serviceSettingsSaving: false,
  tcpFastOpen: null,
  tcpFastOpenSaving: false,
  firewallBypassMode: localStorage.getItem(firewallBypassModeStorageKey) || 'off',
  firewallRouterMode: localStorage.getItem(firewallRouterModeStorageKey) || 'tproxy',
  firewallDeviceMode: localStorage.getItem(firewallDeviceModeStorageKey) || 'all',
  firewallSelectedDevices: loadStringListStorage(firewallSelectedDevicesStorageKey),
  firewallPortMode: localStorage.getItem(firewallPortModeStorageKey) || 'custom',
  firewallPorts: localStorage.getItem(firewallPortsStorageKey) || '80,443',
  firewallBlockQuic: localStorage.getItem(firewallBlockQuicStorageKey) !== '0',
  firewallStatus: null,
  firewallSaving: false,
  configExpanded: false,
  configScrollTop: 0,
  jsonDraft: '',
  pendingBackgroundRender: false
};

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

function formatDurationCompact(seconds = 0, { showSeconds = false, emptyText = 'меньше минуты' } = {}) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const tailHours = hours % 24;
  const tailMinutes = minutes % 60;
  if (days) {
    return [
      `${days} д`,
      tailHours ? `${tailHours} ч` : '',
      tailMinutes ? `${tailMinutes} мин` : ''
    ].filter(Boolean).join(' ');
  }
  if (hours) return [`${hours} ч`, tailMinutes ? `${tailMinutes} мин` : ''].filter(Boolean).join(' ');
  if (minutes) return `${minutes} мин`;
  return showSeconds ? `${Math.floor(seconds)} с` : emptyText;
}

function fmtUptime(seconds = 0) {
  return formatDurationCompact(Math.max(0, Number(seconds || 0)));
}

function formatDuration(seconds = 0) {
  const total = Math.max(0, Number(seconds || 0));
  return formatDurationCompact(total, { showSeconds: true, emptyText: '0 с' });
}

function byteSize(size) {
  const n = Number(size || 0);
  if (n >= 1024 * 1024 * 1024) return `${Math.round((n / 1024 / 1024 / 1024) * 10) / 10} GB`;
  if (n >= 1024 * 1024) return `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.max(0, Math.round(n))} B`;
}

function byteRate(size) {
  return `${byteSize(size)}/s`;
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function syncConfig(config) {
  state.config = config;
  state.jsonDraft = JSON.stringify(config, null, 2);
}

function syncLoggingSettings(settings) {
  if (!settings?.ok) return;
  state.loggingSettings = settings;
  state.loggingLevel = settings.level || 'warning';
  state.loggingAccessLog = Boolean(settings.accessLog);
  state.loggingAccessPath = settings.accessPath || '/var/log/xray/access.log';
  state.loggingErrorLog = Boolean(settings.errorLog);
  state.loggingErrorPath = settings.errorPath || '/var/log/xray/error.log';
  state.loggingDnsLog = Boolean(settings.dnsLog);
  state.loggingMaxSizeMb = String(settings.maxSizeMb ?? 2);
  state.loggingRotateCopies = String(settings.rotateCopies ?? 1);
  state.loggingClearOnRestart = Boolean(settings.clearOnRestart);
}

function syncServiceSettings(settings) {
  if (!settings?.ok) return;
  state.serviceSettings = settings;
  state.serviceStartupDelaySec = String(settings.startupDelaySec ?? 0);
  state.serviceApplyDelaySec = String(settings.applyDelaySec ?? 0);
  state.serviceGoMemLimit = settings.goMemLimit || '48MiB';
  state.serviceGoGC = String(settings.goGC ?? 60);
  state.serviceDownloadMirror = settings.downloadMirror || 'direct';
  state.serviceMirrorPrefix = settings.mirrorPrefix || '';
}

function syncLanDnsStatus(status) {
  if (!status) return;
  state.lanDnsStatus = status;
  const plannedMode = status.plan?.mode;
  if (plannedMode) state.lanDnsMode = plannedMode;
  else if (status.mode && status.mode !== 'manual' && status.mode !== 'unknown') state.lanDnsMode = status.mode;
  if (Array.isArray(status.servers) && status.servers.length && status.mode === 'upstream') {
    state.lanDnsUpstream = status.servers[0];
  }
  if (status.plan) {
    state.lanDnsPreview = status.plan;
  }
}

function lanDnsModeLabel(mode) {
  return ({
    xray: 'DNS через Xray',
    upstream: 'Внешний DNS / Pi-hole',
    system: 'Как в OpenWrt',
    manual: 'Ручная настройка',
    unknown: 'Неизвестно'
  })[mode] || 'Неизвестно';
}

function routeRules() {
  if (!state.config.routing || typeof state.config.routing !== 'object') state.config.routing = {};
  if (!Array.isArray(state.config.routing.rules)) state.config.routing.rules = [];
  return state.config.routing.rules;
}

function routeBalancers() {
  if (!state.config.routing || typeof state.config.routing !== 'object') state.config.routing = {};
  if (!Array.isArray(state.config.routing.balancers)) state.config.routing.balancers = [];
  return state.config.routing.balancers;
}

function outboundOptions() {
  const names = new Set(['proxy', 'direct', 'block']);
  for (const outbound of Array.isArray(state.config.outbounds) ? state.config.outbounds : []) {
    if (outbound?.tag) names.add(outbound.tag);
  }
  return [...names];
}

function balancerOptions() {
  return routeBalancers().map((item) => item?.tag).filter(Boolean);
}

function routeTargetOptions() {
  return [
    ...outboundOptions().map((tag) => ({ value: `outbound:${tag}`, label: readableRouteTag(tag) })),
    ...balancerOptions().map((tag) => ({ value: `balancer:${tag}`, label: `Балансировщик · ${tag}` }))
  ];
}

function encodedRouteTarget(rule) {
  if (rule?.balancerTag) return `balancer:${rule.balancerTag}`;
  return `outbound:${rule?.outboundTag || 'proxy'}`;
}

function splitRouteValues(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function routeTarget(rule) {
  if (Array.isArray(rule.domain) && rule.domain.length) return { kind: 'domain', values: rule.domain };
  if (Array.isArray(rule.ip) && rule.ip.length) return { kind: 'ip', values: rule.ip };
  if (Array.isArray(rule.source) && rule.source.length) return { kind: 'source', values: rule.source };
  if (Array.isArray(rule.inboundTag) && rule.inboundTag.length) return { kind: 'inboundTag', values: rule.inboundTag };
  if (rule.port) return { kind: 'port', values: [rule.port] };
  return { kind: 'other', values: ['особое правило'] };
}

function routeRuleKey(rule) {
  const target = routeTarget(rule || {});
  return JSON.stringify({
    type: rule?.type || 'field',
    outboundTag: rule?.outboundTag || '',
    balancerTag: rule?.balancerTag || '',
    network: rule?.network || '',
    kind: target.kind,
    values: target.values
  });
}

function saveRouteNames() {
  localStorage.setItem(routeNamesStorageKey, JSON.stringify(state.routeNames));
}

function compactRouteValue(value) {
  return String(value || '')
    .replace(/^domain:/, '')
    .replace(/^regexp:/, '')
    .replace(/^full:/, '')
    .replace(/^geosite:/, 'geosite:')
    .replace(/^geoip:/, 'geoip:')
    .replace(/^ext:"?([^":]+).*$/i, '$1')
    .replace(/\\/g, '')
    .trim();
}

function readableRouteTag(tag) {
  return managedRouteTags[String(tag || '')] || String(tag || '');
}

function routeTagValue(value, kind = '') {
  const raw = String(value || '');
  const readable = readableRouteTag(raw);
  if (readable === raw) return raw;
  return kind === 'full' ? `${readable} (${raw})` : readable;
}

function routeHasInbound(rule, tag) {
  return Array.isArray(rule?.inboundTag) && rule.inboundTag.includes(tag);
}

function isRuOpenRayManagedRoute(rule) {
  if (!rule) return false;
  if (rule.outboundTag === 'ruopenray-api' && routeHasInbound(rule, 'ruopenray-api')) return true;
  if (rule.outboundTag === 'dns-out' && routeHasInbound(rule, 'ruopenray_dns_in')) return true;
  if (rule.outboundTag === 'dns-out' && String(rule.port || '') === '53') return true;
  if (rule.outboundTag === 'direct' && routeHasInbound(rule, 'transparent_ipv4')) return true;
  return false;
}

function managedRouteName(rule) {
  if (rule.outboundTag === 'ruopenray-api' && routeHasInbound(rule, 'ruopenray-api')) return 'Статистика Xray';
  if (rule.outboundTag === 'dns-out' && routeHasInbound(rule, 'ruopenray_dns_in')) return 'DNS через RuOpenRay';
  if (rule.outboundTag === 'dns-out' && String(rule.port || '') === '53') return 'DNS-запросы на Xray';
  if (rule.outboundTag === 'direct' && routeHasInbound(rule, 'transparent_ipv4')) return 'Локальная сеть напрямую';
  return '';
}

function managedRouteDetail(rule) {
  if (rule.outboundTag === 'ruopenray-api' && routeHasInbound(rule, 'ruopenray-api')) return 'Служебный маршрут для локального Xray StatsService API';
  if (rule.outboundTag === 'dns-out' && routeHasInbound(rule, 'ruopenray_dns_in')) return 'Служебный маршрут: DNS с 127.0.0.1:5353 отправляется в DNS-выход Xray';
  if (rule.outboundTag === 'dns-out' && String(rule.port || '') === '53') return 'Служебный маршрут для DNS-запросов';
  if (rule.outboundTag === 'direct' && routeHasInbound(rule, 'transparent_ipv4')) return 'Служебный direct для локальной сети и приватных адресов';
  return '';
}

function guessRouteRuleName(rule, info) {
  const target = routeTarget(rule || {});
  const raw = target.values.join(' ').toLowerCase();
  const first = compactRouteValue(target.values[0]);
  const managedName = managedRouteName(rule || {});
  if (managedName) return managedName;
  if (raw.includes('geoip:private')) return 'Локальная сеть';
  if (raw.includes('antifilter')) return 'Antifilter community';
  if (raw.includes('discord')) return rule.network === 'udp' ? 'Discord UDP' : 'Discord';
  if (raw.includes('telegram') || raw.includes('91.108.') || raw.includes('149.154.')) return rule.network === 'udp' ? 'Telegram calls' : 'Telegram';
  if (raw.includes('nintendo')) return 'Nintendo eShop';
  if (raw.includes('openai') || raw.includes('chatgpt')) return 'ChatGPT / OpenAI';
  if (raw.includes('gemini') || raw.includes('ai.google')) return 'Google AI';
  if (raw.includes('youtube') || raw.includes('googlevideo') || raw.includes('ytimg')) return 'YouTube';
  if (raw.includes('cloudflare') || raw.includes('104.16.0.0/12') || raw.includes('188.114.96.0/20')) return 'Cloudflare UDP';
  if (raw.includes('66.22.192.0/18')) return 'Discord voice';
  if (target.kind === 'source') return `Устройство ${first}`;
  if (target.kind === 'port') return `Порты ${first}`;
  if (target.kind === 'inboundTag') return `Входящий поток ${routeTagValue(first)}`;
  if (first) return first.length > 42 ? `${first.slice(0, 42)}…` : first;
  return info?.kind || 'Правило маршрутизации';
}

function routeRuleName(rule, info) {
  const saved = state.routeNames[routeRuleKey(rule)];
  return saved || guessRouteRuleName(rule, info);
}

function setRouteRuleName(rule, name) {
  const key = routeRuleKey(rule);
  const cleanName = String(name || '').trim();
  if (cleanName) state.routeNames[key] = cleanName;
  else delete state.routeNames[key];
  saveRouteNames();
}

function copyRouteRuleName(fromRule, toRule) {
  const oldKey = routeRuleKey(fromRule);
  const name = state.routeNames[oldKey];
  if (!name) return;
  state.routeNames[routeRuleKey(toRule)] = name;
  delete state.routeNames[oldKey];
  saveRouteNames();
}

function describeRouteRule(rule) {
  const target = routeTarget(rule || {});
  const values = target.values.map((value) => target.kind === 'inboundTag' ? routeTagValue(value) : value).join(', ');
  const fullValues = target.values.map((value) => target.kind === 'inboundTag' ? routeTagValue(value, 'full') : value).join(', ');
  const network = rule.network ? ` · ${rule.network}` : '';
  const outbound = rule.balancerTag ? `Балансировщик · ${rule.balancerTag}` : readableRouteTag(rule.outboundTag || 'не задано');
  const managedDetail = managedRouteDetail(rule || {});
  return {
    kind: routeKinds[target.kind] || 'Другое',
    value: values.length > 96 ? `${values.slice(0, 96)}…` : values,
    fullValue: fullValues,
    outbound,
    detail: managedDetail || `${rule.type || 'field'}${network}`
  };
}

function routeStats() {
  const stats = { proxy: 0, direct: 0, block: 0, other: 0 };
  const proxyTags = new Set(['proxy', ...proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean)]);
  for (const rule of routeRules()) {
    if (rule.balancerTag || proxyTags.has(rule.outboundTag)) stats.proxy += 1;
    else if (rule.outboundTag === 'direct') stats.direct += 1;
    else if (rule.outboundTag === 'block') stats.block += 1;
    else stats.other += 1;
  }
  return stats;
}

function routeSectionDefinitions(stats = routeStats()) {
  return [
    { id: 'proxy', title: 'Через proxy', count: stats.proxy, detail: 'Сайты и устройства через сервер' },
    { id: 'direct', title: 'Напрямую', count: stats.direct, detail: 'Обход прокси и локальная сеть' },
    { id: 'block', title: 'Блокировка', count: stats.block, detail: 'Остановленные направления' },
    { id: 'other', title: 'Другое', count: stats.other, detail: 'DNS, API и особые маршруты' }
  ];
}

function routeCategoryForRule(rule) {
  if (rule?.balancerTag) return 'proxy';
  const outbound = rule?.outboundTag || '';
  const proxyTags = new Set(['proxy', ...proxyOutbounds().map((item) => item?.tag).filter(Boolean)]);
  if (proxyTags.has(outbound)) return 'proxy';
  if (outbound === 'direct') return 'direct';
  if (outbound === 'block') return 'block';
  return 'other';
}

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

function routeRuleSource(rule) {
  if (isRuOpenRayManagedRoute(rule)) return 'Служебное правило RuOpenRay';
  const encoded = JSON.stringify(rule || {});
  for (const [key, preset] of Object.entries(routePresets)) {
    if (JSON.stringify(preset.rule) === encoded) return `Подборка: ${preset.title}`;
  }
  for (const [key, bundle] of Object.entries(routeBundles)) {
    const match = (bundle.rules || []).some((item) => JSON.stringify(item) === encoded);
    if (match) return `Подборка: ${bundle.title}`;
  }
  if (Array.isArray(rule?.source) && rule.source.length) return 'Устройство LAN';
  if (state.routeNames[routeRuleKey(rule)]) return 'Пользовательское правило';
  return 'Из профиля';
}

function routeStatsFor(rules) {
  const stats = { proxy: 0, direct: 0, block: 0, other: 0 };
  const proxyTags = new Set(['proxy', ...proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean)]);
  for (const rule of rules || []) {
    if (rule.balancerTag || proxyTags.has(rule.outboundTag)) stats.proxy += 1;
    else if (rule.outboundTag === 'direct') stats.direct += 1;
    else if (rule.outboundTag === 'block') stats.block += 1;
    else stats.other += 1;
  }
  return stats;
}

function configInbounds() {
  if (!Array.isArray(state.config.inbounds)) state.config.inbounds = [];
  return state.config.inbounds;
}

function configOutbounds() {
  if (!Array.isArray(state.config.outbounds)) state.config.outbounds = [];
  return state.config.outbounds;
}

function advancedInbounds() {
  const inbounds = configInbounds();
  const transparent = inbounds.filter((item) => {
    const tag = String(item?.tag || '').toLowerCase();
    return tag.includes('transparent') || item?.streamSettings?.sockopt?.tproxy || item?.protocol === 'dokodemo-door';
  });
  return transparent.length ? transparent : inbounds;
}

function currentSnifferSettings() {
  const inbound = advancedInbounds().find((item) => item?.sniffing?.enabled) || advancedInbounds()[0] || {};
  const sniffing = inbound?.sniffing || {};
  const overrides = Array.isArray(sniffing.destOverride) ? sniffing.destOverride : [];
  const mode = !sniffing.enabled
    ? 'off'
    : overrides.includes('quic')
      ? 'http-tls-quic'
      : 'http-tls';
  return {
    mode,
    routeOnly: sniffing.routeOnly !== false,
    excluded: Array.isArray(sniffing.domainsExcluded) ? sniffing.domainsExcluded.join('\n') : '',
    targets: advancedInbounds().length
  };
}

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

function tcpFastOpenDraftEnabled() {
  return [...configOutbounds(), ...advancedInbounds()].some((item) => item?.streamSettings?.sockopt?.tcpFastOpen === true);
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

function currentDnsMode() {
  const dns = state.config?.dns || {};
  const fakeDNS = Array.isArray(dns.fakeDNS) && dns.fakeDNS.length;
  return fakeDNS ? 'fakedns' : 'normal';
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

function outboundAddress(outbound) {
  const protocol = outbound?.protocol;
  if (protocol === 'vless' || protocol === 'vmess') {
    const vnext = outbound?.settings?.vnext?.[0];
    return [vnext?.address, vnext?.port].filter(Boolean).join(':') || 'адрес не задан';
  }
  if (protocol === 'trojan' || protocol === 'shadowsocks') {
    const server = outbound?.settings?.servers?.[0];
    return [server?.address, server?.port].filter(Boolean).join(':') || 'адрес не задан';
  }
  if (protocol === 'dns') {
    return [outbound?.settings?.address, outbound?.settings?.port].filter(Boolean).join(':') || 'DNS';
  }
  if (protocol === 'freedom') return 'напрямую';
  if (protocol === 'blackhole') return 'блокировка';
  return outbound?.sendThrough || 'служебное направление';
}

function outboundTransport(outbound) {
  const stream = outbound?.streamSettings || {};
  const network = stream.network || 'tcp';
  const security = stream.security || 'none';
  if (outbound?.protocol === 'freedom') return 'direct';
  if (outbound?.protocol === 'blackhole') return 'block';
  if (outbound?.protocol === 'dns') return 'dns';
  return `${network} / ${security}`;
}

function outboundUsage(tag) {
  return routeRules().filter((rule) => rule.outboundTag === tag || (rule.outboundTag === 'proxy' && resolveRoutingAlias('proxy') === tag)).length;
}

function leaseByIp(ip) {
  return state.leases.find((lease) => lease.ip === ip);
}

function leaseSearchText(lease = {}) {
  return [lease.name, lease.hostname, lease.ip, lease.mac]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function routeLeasePicker() {
  if (state.routeKind !== 'source') return '';
  const selected = new Set(splitRouteValues(state.routeValue));
  const source = state.leasesSource || '/tmp/dhcp.leases';
  return `
    <div class="route-lease-picker">
      <div class="route-lease-head">
        <span>${state.leases.length ? `${state.leases.length} DHCP leases · ${escapeHtml(source)}` : 'DHCP leases пока не найдены'}</span>
        <button class="btn secondary" type="button" data-action="refreshDhcpLeases">Обновить DHCP</button>
      </div>
      <input class="lease-search" data-lease-search value="${escapeHtml(state.leaseSearch)}" placeholder="Найти устройство: имя, IP или MAC" />
      <div class="route-lease-grid">
        ${state.leases.length ? state.leases.map((lease) => {
          const active = selected.has(lease.ip);
          const name = lease.name || 'Без имени';
          const detail = [lease.ip, lease.mac, lease.remaining ? `осталось ${formatDuration(lease.remaining)}` : ''].filter(Boolean).join(' · ');
          return `<button type="button" class="route-lease-card ${active ? 'active' : ''}" data-lease-search-item data-lease-search-text="${escapeHtml(leaseSearchText(lease))}" data-route-lease-ip="${escapeHtml(lease.ip)}" data-route-lease-name="${escapeHtml(name)}">
            <strong>${escapeHtml(name)}</strong>
            <span>${escapeHtml(detail)}</span>
          </button>`;
        }).join('') : '<p class="muted">На OpenWrt обычно читается <code>/tmp/dhcp.leases</code>. Можно ввести IP вручную.</p>'}
        <p class="muted lease-search-empty" data-lease-search-empty hidden>По этому запросу устройств нет.</p>
      </div>
    </div>
  `;
}

function serverStats() {
  const stats = { proxy: 0, system: 0, used: 0, unused: 0 };
  for (const outbound of configOutbounds()) {
    const tag = outbound?.tag || '';
    const system = ['direct', 'block', 'dns-out'].includes(tag) || ['freedom', 'blackhole', 'dns'].includes(outbound?.protocol);
    if (system) {
      stats.system += 1;
      continue;
    }
    stats.proxy += 1;
    if (outboundUsage(tag)) stats.used += 1;
    else stats.unused += 1;
  }
  return stats;
}

function isSystemOutbound(outbound) {
  const tag = outbound?.tag || '';
  return ['direct', 'block', 'dns-out'].includes(tag) || ['freedom', 'blackhole', 'dns'].includes(outbound?.protocol);
}

function proxyOutbounds() {
  return configOutbounds().filter((outbound) => !isSystemOutbound(outbound));
}

function inferredActiveProxyTag() {
  const used = proxyOutbounds().find((outbound) => outboundUsage(outbound?.tag || '') > 0);
  return used?.tag || proxyOutbounds()[0]?.tag || '';
}

function activeProxyTag() {
  const explicit = state.activeServerTag;
  if (explicit && proxyOutbounds().some((outbound) => outbound?.tag === explicit)) return explicit;
  return inferredActiveProxyTag();
}

function activeProxyOutbound() {
  const tag = activeProxyTag();
  return proxyOutbounds().find((outbound) => outbound?.tag === tag) || proxyOutbounds()[0] || null;
}

function setActiveServerTag(tag) {
  state.activeServerTag = tag || '';
  if (state.activeServerTag) localStorage.setItem('ruopenray_active_server', state.activeServerTag);
  else localStorage.removeItem('ruopenray_active_server');
}

function proxyRuleStrategyStats(activeTag = activeProxyTag()) {
  const proxyTags = new Set(proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean));
  let primary = 0;
  let pinned = 0;
  let alias = 0;
  for (const rule of routeRules()) {
    const tag = rule?.outboundTag || '';
    if (tag === 'proxy') {
      alias += 1;
      primary += 1;
    } else if (activeTag && tag === activeTag) {
      primary += 1;
    } else if (proxyTags.has(tag)) {
      pinned += 1;
    }
  }
  return { primary, pinned, alias };
}

function proxyRuleSampleLabel(rule) {
  const target = routeTarget(rule || {});
  const value = Array.isArray(target.values) ? target.values[0] : '';
  return value || target.kind || 'правило';
}

function proxyDirectionSummary() {
  const proxyTags = new Set(proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean));
  const outbounds = new Map();
  const balancers = new Map();
  const add = (map, tag, rule) => {
    if (!tag) return;
    const current = map.get(tag) || { tag, rules: 0, samples: [] };
    current.rules += 1;
    if (current.samples.length < 3) current.samples.push(proxyRuleSampleLabel(rule));
    map.set(tag, current);
  };
  for (const rule of routeRules()) {
    if (rule?.balancerTag) {
      add(balancers, rule.balancerTag, rule);
      continue;
    }
    const rawTag = rule?.outboundTag || '';
    const tag = rawTag === 'proxy' ? activeProxyTag() : rawTag;
    if (proxyTags.has(tag)) add(outbounds, tag, rule);
  }
  const implicit = !outbounds.size && !balancers.size ? activeProxyTag() : '';
  if (implicit) outbounds.set(implicit, { tag: implicit, rules: 0, samples: [], implicit: true });
  const total = [...outbounds.values(), ...balancers.values()].reduce((sum, item) => sum + Number(item.rules || 0), 0);
  return { outbounds, balancers, total };
}

function proxyDirectionTitle(summary) {
  const count = summary.outbounds.size + summary.balancers.size;
  if (count === 1 && summary.balancers.size === 1) return 'Активная группа серверов';
  if (count === 1) return 'Активный сервер';
  return 'Proxy-направления';
}

function proxyDirectionDetail(summary) {
  const count = summary.outbounds.size + summary.balancers.size;
  if (!count) return 'Proxy-направления пока не настроены.';
  if (count === 1 && summary.balancers.size === 1) {
    const item = [...summary.balancers.values()][0];
    return `${item.tag} · ${item.rules || 0} правил ведут в балансировщик`;
  }
  if (count === 1) {
    const item = [...summary.outbounds.values()][0];
    return item.implicit ? 'Основное направление будет использовано для новых proxy-правил.' : `${item.rules || 0} proxy-правил ведут в этот сервер`;
  }
  return `${count} активных направлений · ${summary.total || 0} proxy-правил распределены по серверам и группам`;
}

function dashboardProxyDirectionCards(summary) {
  const cards = [
    ...[...summary.outbounds.values()].map((item) => ({ ...item, kind: 'server' })),
    ...[...summary.balancers.values()].map((item) => ({ ...item, kind: 'balancer' }))
  ];
  if (cards.length <= 1) return '';
  return `<div class="dashboard-proxy-directions">
    ${cards.map((item) => {
      const detail = item.kind === 'balancer'
        ? 'Балансировщик'
        : outboundAddress(proxyOutbounds().find((outbound) => outbound?.tag === item.tag)) || 'сервер';
      return `<article>
        <span>${item.kind === 'balancer' ? 'Группа' : 'Сервер'}</span>
        <strong>${escapeHtml(item.tag)}</strong>
        <small>${escapeHtml(`${item.rules || 0} правил · ${detail}`)}</small>
      </article>`;
    }).join('')}
  </div>`;
}

function resolveRoutingAlias(tag) {
  const value = String(tag || '').trim();
  if (value === 'proxy') return activeProxyTag() || 'proxy';
  return value;
}

function stripDslComment(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return '';
  return line.replace(/\s+#.*$/, '').trim();
}

function addDslTarget(rule, key, value) {
  const target = value.trim().replace(/^([A-Za-z0-9_-]+):"(.*)"$/, '$1:$2');
  if (!target) return false;
  if (key === 'network') {
    rule.network = target;
    return true;
  }
  if (key === 'port') {
    rule.port = target;
    return true;
  }
  if (['domain', 'ip', 'source', 'inboundTag'].includes(key)) {
    if (!Array.isArray(rule[key])) rule[key] = [];
    rule[key].push(target);
    return true;
  }
  return false;
}

function parseRoutingDsl(text) {
  const rules = [];
  const warnings = [];
  let defaultOutbound = '';

  String(text || '')
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const lineNo = index + 1;
      const line = stripDslComment(rawLine);
      if (!line) return;

      const defaultMatch = line.match(/^default\s*:\s*([A-Za-z0-9_.:-]+)\s*$/i);
      if (defaultMatch) {
        defaultOutbound = resolveRoutingAlias(defaultMatch[1]);
        return;
      }

      const match = line.match(/^(.+?)\s*->\s*([A-Za-z0-9_.:-]+)\s*$/);
      if (!match) {
        warnings.push(`Строка ${lineNo}: не понял формат`);
        return;
      }

      const target = match[2].startsWith('balancer:') ? match[2].slice('balancer:'.length) : '';
      const rule = target
        ? { type: 'field', balancerTag: target }
        : { type: 'field', outboundTag: resolveRoutingAlias(match[2]) };
      let targets = 0;
      const parts = match[1].split(/\s*&&\s*/).map((part) => part.trim()).filter(Boolean);
      for (const part of parts) {
        const condition = part.match(/^([A-Za-z][A-Za-z0-9_]*)\((.*)\)$/);
        if (!condition) {
          warnings.push(`Строка ${lineNo}: не понял условие "${part}"`);
          continue;
        }
        if (addDslTarget(rule, condition[1], condition[2])) {
          if (condition[1] !== 'network') targets += 1;
          const normalized = condition[2].trim().replace(/^([A-Za-z0-9_-]+):"(.*)"$/, '$1:$2');
          if (condition[1] === 'domain' && normalized.startsWith('ext:')) {
            warnings.push(`Строка ${lineNo}: ext-списку нужен .dat файл на роутере`);
          }
        } else {
          warnings.push(`Строка ${lineNo}: условие "${condition[1]}" пока не поддержано`);
        }
      }

      if (!targets && !rule.port) {
        warnings.push(`Строка ${lineNo}: нет домена, IP, источника или порта`);
        return;
      }
      rules.push(rule);
    });

  if (defaultOutbound) {
    rules.push(
      defaultOutbound.startsWith('balancer:')
        ? { type: 'field', balancerTag: defaultOutbound.slice('balancer:'.length), port: '0-65535' }
        : { type: 'field', outboundTag: defaultOutbound, port: '0-65535' }
    );
  }

  return {
    rules,
    warnings,
    defaultOutbound,
    proxyAlias: resolveRoutingAlias('proxy')
  };
}

function previewRoutingDsl() {
  state.routeDslPreview = parseRoutingDsl(state.routeDsl);
  const parsed = state.routeDslPreview;
  state.message = `Распознано правил: ${parsed.rules.length}${parsed.warnings.length ? `, предупреждений: ${parsed.warnings.length}` : ''}`;
  render();
}

function isDslDefaultRule(rule, preview) {
  return Boolean(
    preview.defaultOutbound &&
      rule.outboundTag === preview.defaultOutbound &&
      rule.port === '0-65535' &&
      !rule.domain &&
      !rule.ip &&
      !rule.source &&
      !rule.inboundTag
  );
}

function dslPreviewStats(preview) {
  const explicitRules = preview.rules.filter((rule) => !isDslDefaultRule(rule, preview));
  const count = (tag) => explicitRules.filter((rule) => rule.outboundTag === tag).length;
  const proxy = count(preview.proxyAlias);
  const direct = count('direct');
  const block = count('block');
  const known = new Set([preview.proxyAlias, 'direct', 'block']);
  const other = explicitRules.filter((rule) => !known.has(rule.outboundTag)).length;
  return { explicit: explicitRules.length, proxy, direct, block, other, total: preview.rules.length };
}

function dslPreviewView(preview) {
  const stats = dslPreviewStats(preview);
  const listName = state.routeDslName.trim();
  return `
    <div class="dsl-preview">
      <div class="dsl-preview-head">
        <strong>${stats.total} правил распознано</strong>
        <span>proxy -> ${escapeHtml(preview.proxyAlias)}</span>
      </div>
      ${listName ? `<small>Название списка: ${escapeHtml(listName)}</small>` : ''}
      <div class="dsl-preview-stats">
        <div><strong>${stats.proxy}</strong><span>proxy</span></div>
        <div><strong>${stats.direct}</strong><span>direct</span></div>
        <div><strong>${stats.block}</strong><span>block</span></div>
        <div><strong>${stats.other}</strong><span>другое</span></div>
        <div class="default"><strong>${escapeHtml(preview.defaultOutbound || 'не задан')}</strong><span>default</span></div>
      </div>
      <small>${preview.defaultOutbound ? `Default добавит catch-all правило в ${escapeHtml(preview.defaultOutbound)}.` : 'Default не задан: Xray применит свое поведение после последнего правила.'}</small>
      ${preview.warnings.length ? `<small class="warn">${escapeHtml(preview.warnings.slice(0, 4).join(' · '))}${preview.warnings.length > 4 ? ' · ...' : ''}</small>` : '<small>Ошибок формата не найдено</small>'}
    </div>
  `;
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

function firewallInfo() {
  const transparent = configInbounds().filter((item) => {
    const tproxy = item?.streamSettings?.sockopt?.tproxy;
    return item?.protocol === 'dokodemo-door' || tproxy || String(item?.tag || '').includes('transparent');
  });
  const dnsOut = configOutbounds().filter((item) => item?.protocol === 'dns' || String(item?.tag || '').includes('dns'));
  const localBypass = routeRules().filter((rule) => {
    const ips = Array.isArray(rule.ip) ? rule.ip.join(' ') : '';
    return rule.outboundTag === 'direct' && /geoip:private|127\.0\.0\.1|192\.168|10\.0\.0|172\.16|::1/.test(ips);
  });
  const sourceRules = routeRules().filter((rule) => Array.isArray(rule.source) && rule.source.length);
  const transparentPort = transparent.find((item) => item?.streamSettings?.sockopt?.tproxy)?.port || transparent[0]?.port || 52345;

  return {
    transparent,
    dnsOut,
    localBypass,
    sourceRules,
    transparentPort,
    ready: Boolean(transparent.length && dnsOut.length && localBypass.length)
  };
}

function firewallPorts() {
  if (state.firewallPortMode === 'all') return [];
  return splitRouteValues(state.firewallPorts)
    .map((item) => item.replace(':', '-'))
    .filter((item) => /^\d+(-\d+)?$/.test(item));
}

function firewallDeviceChoices() {
  const map = new Map();
  for (const lease of state.leases || []) {
    if (!lease?.ip) continue;
    map.set(lease.ip, { ip: lease.ip, name: lease.name || lease.hostname || lease.mac || lease.ip, mac: lease.mac || '' });
  }
  for (const { rule } of deviceRules()) {
    for (const ip of rule.source || []) {
      if (!map.has(ip)) map.set(ip, { ip, name: routeRuleName(rule, describeRouteRule(rule)), mac: '' });
    }
  }
  return [...map.values()];
}

function firewallSelectedDevices() {
  const selected = new Set(state.firewallSelectedDevices);
  return firewallDeviceChoices().filter((device) => selected.has(device.ip));
}

function nftList(items) {
  return `{ ${items.join(', ')} }`;
}

function firewallDeviceExpression() {
  const selected = firewallSelectedDevices().map((device) => device.ip);
  if (state.firewallDeviceMode === 'selected' && selected.length) return `ip saddr ${nftList(selected)} `;
  if (state.firewallDeviceMode === 'exclude' && selected.length) return `ip saddr ${nftList(selected)} return\n`;
  return '';
}

function firewallPortExpression() {
  if (state.firewallPortMode === 'all') return '';
  const ports = firewallPorts();
  return ports.length ? ` th dport ${nftList(ports)}` : '';
}

function firewallTargetRule(port) {
  const portExpr = firewallPortExpression();
  const deviceExpr = state.firewallDeviceMode === 'selected' ? firewallDeviceExpression() : '';
  const lanExpr = 'iifname "br-lan" ';
  if (state.firewallRouterMode === 'redirect') {
    return `nft add rule inet ruopenray prerouting ${lanExpr}${deviceExpr}meta l4proto tcp${portExpr} redirect to :${port}`;
  }
  return `nft add rule inet ruopenray prerouting ${lanExpr}${deviceExpr}meta l4proto { tcp, udp }${portExpr} counter tproxy to :${port} meta mark set 1`;
}

function firewallPolicyPreview() {
  const devices = firewallSelectedDevices();
  const ports = firewallPorts();
  const traffic = state.firewallDeviceMode === 'selected'
    ? `только выбранные устройства (${devices.length})`
    : state.firewallDeviceMode === 'exclude'
      ? `все LAN, кроме выбранных устройств (${devices.length})`
      : 'все LAN-устройства';
  const router = state.firewallRouterMode === 'redirect'
    ? 'REDIRECT: проще, только TCP, без сохранения полного UDP/QUIC пути'
    : 'TPROXY: TCP+UDP, сохраняет исходное назначение';
  const policyName = state.firewallBypassMode === 'off'
    ? 'Все через правила Xray'
    : state.firewallBypassMode === 'bypass'
      ? 'Direct мимо Xray'
      : 'Только proxy в Xray';
  const policy = state.firewallBypassMode === 'off'
    ? 'RuOpenRay передает выбранный трафик в Xray, а direct/proxy/block решают правила маршрутизации.'
    : state.firewallBypassMode === 'bypass'
      ? 'Адреса из direct-списка сразу идут напрямую, остальное передается в Xray.'
      : 'В Xray отправляются только адреса из proxy-списка, остальное сразу идет напрямую.';
  const warnings = [];
  if (state.firewallRouterMode === 'redirect' && !state.firewallBlockQuic) warnings.push('REDIRECT не обрабатывает UDP/QUIC надежно. Лучше включить блокировку QUIC или выбрать TPROXY.');
  if (state.firewallDeviceMode !== 'all' && !devices.length) warnings.push('Выбран режим по устройствам, но устройства не отмечены.');
  if (state.firewallPortMode !== 'all' && !ports.length) warnings.push('Выбран режим портов, но порты не заданы.');
  return { router, traffic, policyName, policy, ports: state.firewallPortMode === 'all' ? 'все порты' : ports.join(', ') || 'не заданы', quic: state.firewallBlockQuic ? 'UDP/443 будет заблокирован до Xray' : 'UDP/443 не блокируется', warnings };
}

function proxyInboundTags() {
  const tags = configInbounds()
    .map((item) => item?.tag)
    .filter((tag) => tag && /transparent|rule|socks|http/.test(tag));
  return tags.length ? [...new Set(tags)] : undefined;
}

function deviceRules() {
  return routeRules()
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => Array.isArray(rule.source) && rule.source.length);
}

function deviceStats() {
  const stats = { proxy: 0, direct: 0, block: 0, other: 0 };
  for (const { rule } of deviceRules()) {
    if (rule.outboundTag === 'proxy') stats.proxy += 1;
    else if (rule.outboundTag === 'direct') stats.direct += 1;
    else if (rule.outboundTag === 'block') stats.block += 1;
    else stats.other += 1;
  }
  return stats;
}

function normalizeDeviceIp(value) {
  return String(value || '').trim();
}

function dnsConfig() {
  if (!state.config.dns || typeof state.config.dns !== 'object') state.config.dns = {};
  if (!Array.isArray(state.config.dns.servers)) state.config.dns.servers = [];
  if (!state.config.dns.hosts || typeof state.config.dns.hosts !== 'object' || Array.isArray(state.config.dns.hosts)) state.config.dns.hosts = {};
  return state.config.dns;
}

function describeDnsServer(server) {
  if (typeof server === 'string') {
    return { address: server, domains: [], port: '', network: '', raw: server };
  }
  if (server && typeof server === 'object') {
    const address = [server.address, server.port].filter(Boolean).join(':') || 'DNS';
    return {
      address,
      domains: Array.isArray(server.domains) ? server.domains : [],
      port: server.port || '',
      network: server.network || '',
      raw: JSON.stringify(server)
    };
  }
  return { address: 'DNS', domains: [], port: '', network: '', raw: '' };
}

function dnsAddressHasPort(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (text.startsWith('[')) return /\]:\d+$/.test(text);
  const colonCount = (text.match(/:/g) || []).length;
  return colonCount === 1 && /:\d+$/.test(text);
}

function normalizeDnsAddressInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return { raw: '', config: '', check: '' };
  const lower = raw.toLowerCase();
  if (lower.startsWith('https://')) return { raw, config: raw, check: raw };
  if (lower.startsWith('tcp://') || lower.startsWith('udp://')) {
    const scheme = lower.startsWith('tcp://') ? 'tcp://' : 'udp://';
    const target = raw.slice(scheme.length);
    const normalized = dnsAddressHasPort(target) || target.includes(']')
      ? raw
      : `${scheme}${target}:53`;
    return { raw, config: normalized, check: normalized };
  }
  if (dnsAddressHasPort(raw)) return { raw, config: raw, check: raw };
  return {
    raw,
    config: { address: raw, port: 53 },
    check: `${raw}:53`
  };
}

function dnsStats() {
  const dns = dnsConfig();
  const doh = dns.servers.filter((server) => describeDnsServer(server).address.startsWith('https://')).length;
  const tcp = dns.servers.filter((server) => describeDnsServer(server).address.startsWith('tcp://') || describeDnsServer(server).network === 'tcp').length;
  return {
    servers: dns.servers.length,
    hosts: Object.keys(dns.hosts).length,
    doh,
    tcp
  };
}

function dnsAnswerText(result = {}) {
  if (result.error && !(result.addresses || []).length) return 'ошибка проверки';
  const a = Array.isArray(result.a) ? result.a : [];
  const aaaa = Array.isArray(result.aaaa) ? result.aaaa : [];
  if (a.length || aaaa.length) {
    return [
      a.length ? `A: ${a.join(', ')}` : '',
      aaaa.length ? `AAAA: ${aaaa.join(', ')}` : ''
    ].filter(Boolean).join(' · ');
  }
  const addresses = result.addresses || [];
  return addresses.length ? addresses.join(', ') : 'A/AAAA-записи не найдены';
}

function firewallCommands() {
  const info = firewallInfo();
  const port = info.transparentPort || 52345;
  const excludedDeviceReturn = state.firewallDeviceMode === 'exclude' ? firewallDeviceExpression().trim() : '';
  const packageCommand = state.firewallRouterMode === 'tproxy'
    ? 'if command -v apk >/dev/null 2>&1; then apk update && apk add kmod-nf-tproxy kmod-nft-tproxy kmod-nft-socket; else opkg update && opkg install kmod-nf-tproxy kmod-nft-tproxy kmod-nft-socket; fi'
    : '# REDIRECT-режиму kmod-nft-tproxy не нужен';
  const blockQuicRule = state.firewallBlockQuic ? 'nft add rule inet ruopenray prerouting iifname "br-lan" udp dport 443 drop # Block QUIC/HTTP3' : '';
  const common = [
    '# Черновик для OpenWrt firewall4/nftables. Проверьте LAN-интерфейс и порт перед применением.',
    packageCommand,
    'nft delete table inet ruopenray 2>/dev/null || true',
    state.firewallRouterMode === 'tproxy' ? 'ip rule del fwmark 1 table 100 2>/dev/null || true' : '',
    state.firewallRouterMode === 'tproxy' ? 'ip route flush table 100 2>/dev/null || true' : '',
    'nft add table inet ruopenray',
    state.firewallRouterMode === 'tproxy'
      ? 'nft add chain inet ruopenray prerouting { type filter hook prerouting priority mangle \\; policy accept \\; }'
      : 'nft add chain inet ruopenray prerouting { type nat hook prerouting priority dstnat \\; policy accept \\; }',
    state.firewallRouterMode === 'tproxy' ? 'nft add chain inet ruopenray output { type route hook output priority mangle \\; policy accept \\; }' : '',
    'nft add rule inet ruopenray prerouting iifname != "br-lan" return',
    'nft add rule inet ruopenray prerouting ip daddr { 10.0.0.0/8, 127.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 } return',
    excludedDeviceReturn ? `nft add rule inet ruopenray prerouting ${excludedDeviceReturn}` : '',
    blockQuicRule,
    state.firewallRouterMode === 'tproxy' ? 'ip rule add fwmark 1 table 100' : '',
    state.firewallRouterMode === 'tproxy' ? 'ip route add local 0.0.0.0/0 dev lo table 100' : '',
    ''
  ].filter(Boolean);
  if (state.firewallBypassMode === 'bypass') {
    return [
      ...common,
      '# BYPASS: direct-сети возвращаются до Xray, остальное уходит в transparent inbound.',
      'nft add set inet ruopenray bypass4 { type ipv4_addr \\; flags interval \\; }',
      'nft add element inet ruopenray bypass4 { 10.0.0.0/8, 127.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 }',
      'nft add rule inet ruopenray prerouting ip daddr @bypass4 return',
      '# Позже сюда можно подключить dnsmasq/ipset для direct-доменов из правил.',
      firewallTargetRule(port)
    ].join('\n');
  }
  if (state.firewallBypassMode === 'redirect') {
    return [
      ...common,
      '# REDIRECT: в Xray идут только адреса из proxy4. Direct-трафик не заходит в Xray.',
      'nft add set inet ruopenray proxy4 { type ipv4_addr \\; flags interval \\; }',
      '# Заполняйте proxy4 из доменов/geo-правил через dnsmasq/ipset или отдельный updater.',
      state.firewallRouterMode === 'redirect'
        ? `nft add rule inet ruopenray prerouting iifname "br-lan" ip daddr @proxy4 ${state.firewallDeviceMode === 'selected' ? firewallDeviceExpression() : ''}meta l4proto tcp${firewallPortExpression()} redirect to :${port}`
        : `nft add rule inet ruopenray prerouting iifname "br-lan" ip daddr @proxy4 ${state.firewallDeviceMode === 'selected' ? firewallDeviceExpression() : ''}meta l4proto { tcp, udp }${firewallPortExpression()} counter tproxy to :${port} meta mark set 1`
    ].join('\n');
  }
  return [
    ...common,
    '# OFF: весь TCP/UDP после локальных исключений попадает в Xray routing.',
    firewallTargetRule(port)
  ].join('\n');
}

function firewallPayload() {
  const info = firewallInfo();
  return {
    routerMode: state.firewallRouterMode,
    bypassMode: state.firewallBypassMode,
    deviceMode: state.firewallDeviceMode,
    devices: firewallSelectedDevices().map((device) => device.ip),
    portMode: state.firewallPortMode,
    ports: firewallPorts(),
    blockQuic: state.firewallBlockQuic,
    transparentPort: Number(info.transparentPort || 52345),
    lanInterface: 'br-lan'
  };
}

function firewallReadyStatus(status) {
  return Boolean(
    status?.active &&
    status?.persistent &&
    (state.firewallRouterMode !== 'tproxy' || (status.ipRule && status.ipRoute))
  );
}

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

function balancerSelectorMatches(selectors) {
  const prefixes = splitRouteValues(selectors);
  if (!prefixes.length) return [];
  return proxyOutbounds()
    .map((item) => item?.tag)
    .filter(Boolean)
    .filter((tag) => prefixes.some((prefix) => tag.startsWith(prefix)));
}

function balancerTargetOptions() {
  const pools = new Map((state.subscriptionPools || []).map((pool) => [pool?.tag, pool]).filter(([tag]) => tag));
  const targets = [];
  const seen = new Set();
  proxyOutbounds().forEach((outbound) => {
    const tag = outbound?.tag || '';
    if (!tag || seen.has(tag)) return;
    seen.add(tag);
    const pool = pools.get(tag);
    targets.push({
      tag,
      kind: pool ? 'subscription' : 'server',
      title: tag,
      detail: pool
        ? `${pool.count || 0} кандидатов · активен ${pool.activeCandidate?.tag || 'сервер не выбран'}`
        : `${outboundAddress(outbound)} · ${outboundTransport(outbound)}`
    });
  });
  (state.subscriptionPools || []).forEach((pool) => {
    const tag = pool?.tag || '';
    if (!tag || seen.has(tag)) return;
    seen.add(tag);
    targets.push({
      tag,
      kind: 'subscription',
      title: tag,
      detail: `${pool.count || 0} кандидатов · stable outbound подписки`
    });
  });
  return targets;
}

function balancerMatchesTag(tag, balancer = {}) {
  const selectors = Array.isArray(balancer.selector) ? balancer.selector.filter(Boolean) : [];
  return selectors.some((selector) => String(tag || '').startsWith(String(selector || '').trim()));
}

function serverSubscriptionPool(tag) {
  return (state.subscriptionPools || []).find((pool) => pool?.tag === tag) || null;
}

function serverBalancerLinks(tag) {
  return routeBalancers().filter((balancer) => balancerMatchesTag(tag, balancer) || balancer?.fallbackTag === tag);
}

function serverObserverLabels(outbound) {
  const labels = [];
  if (outboundMatchesSelectors(outbound, observatorySelectors())) labels.push('Observatory');
  if (outboundMatchesSelectors(outbound, burstObservatorySelectors())) labels.push('Burst');
  return labels;
}

function serverMetaChips(outbound, usage, check) {
  const tag = outbound?.tag || '';
  const pool = serverSubscriptionPool(tag);
  const balancers = serverBalancerLinks(tag);
  const observers = serverObserverLabels(outbound);
  const chips = [
    { label: ruleCountLabel(usage), tone: usage ? 'ok' : 'muted' }
  ];
  if (pool) chips.push({ label: `подписка · ${pool.count || 0}`, tone: 'info' });
  if (balancers.length) chips.push({ label: `группа · ${balancers.map((item) => item.tag).filter(Boolean).slice(0, 2).join(', ')}${balancers.length > 2 ? ` +${balancers.length - 2}` : ''}`, tone: 'info' });
  if (observers.length) chips.push({ label: observers.join(' + '), tone: 'ok' });
  chips.push({ label: check ? `ручная · ${checkLabel(check)}` : 'ручная · не проверен', tone: check?.ok ? 'ok' : check ? 'warn' : 'muted' });
  return `<div class="server-meta-chips">${chips.map((chip) => `<span class="server-chip ${chip.tone}">${escapeHtml(chip.label)}</span>`).join('')}</div>`;
}

function balancerObserverSummary(balancer = {}) {
  const strategy = balancer?.strategy?.type || 'random';
  const type = strategyObserverType(strategy);
  if (!type) return { label: 'может работать без наблюдения', tone: 'ok' };
  const required = Array.isArray(balancer.selector) ? balancer.selector.filter(Boolean) : [];
  const configured = type === 'burstObservatory' ? burstObservatorySelectors() : observatorySelectors();
  const covered = required.length && required.every((selector) => configured.includes(selector));
  return {
    label: covered ? `${observerLabel(type)} · может работать` : `${observerLabel(type)} · нужно включить`,
    tone: covered ? 'ok' : 'warn'
  };
}

function balancerMembersView(tags = []) {
  if (!tags.length) return '<div class="balancer-members muted">серверы не выбраны</div>';
  return `<div class="balancer-members">
    ${tags.slice(0, 6).map((tag) => {
      const outbound = proxyOutbounds().find((item) => item?.tag === tag);
      const check = checkForTag(tag);
      return `<span class="${check?.ok ? 'ok' : check ? 'warn' : ''}" title="${escapeHtml(outboundAddress(outbound))}">
        ${escapeHtml(tag)}
      </span>`;
    }).join('')}
    ${tags.length > 6 ? `<span>+${tags.length - 6}</span>` : ''}
  </div>`;
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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function ipParts(ip = '') {
  const parts = String(ip).split('.').map((part) => Number(part));
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function sniRadar(results, scan) {
  const targetIp = scan?.targetIp || '';
  const targetParts = ipParts(targetIp);
  const visible = results.filter((item) => item.ip !== targetIp).slice(0, 12);
  const slots = [
    [16, 18], [50, 14], [84, 18], [8, 40], [92, 40], [8, 60],
    [92, 60], [16, 82], [50, 86], [84, 82], [30, 12], [70, 88]
  ];
  const points = visible.map((item, index) => {
    const proximity = clamp(Number(item.proximity || 0), 0, 100);
    const [x, y] = slots[index % slots.length];
    const near = proximity >= 90;
    const shortName = String(item.domain || item.ip).replace(/^\*\./, '').split('.')[0].slice(0, 10);
    return `<button class="sni-map-point ${near ? 'near' : ''}" data-sni-map="${index}" style="left:${x}%; top:${y}%; --delay:${index * 70}ms; --z:${30 - index}" title="${escapeHtml(item.domain || item.ip)} · ${escapeHtml(item.proximity)}%">
      <span>${escapeHtml(item.proximity)}%</span>
      <small>${escapeHtml(shortName)}</small>
    </button>`;
  }).join('');
  const radiusLabel = targetParts ? `${targetParts[0]}.${targetParts[1]}.${targetParts[2]}.x` : scan?.network || 'диапазон';
  return `
    <section class="panel sni-map-panel">
      <div class="panel-title">
        <div><h2>Карта близости SNI</h2><span>Центр — ваш адрес, ближе к центру — выше шанс, что SNI живет рядом с сервером.</span></div>
      </div>
      <div class="sni-map">
        <div class="sni-map-grid"></div>
        <div class="sni-map-ring ring-a"></div>
        <div class="sni-map-ring ring-b"></div>
        <div class="sni-map-center">
          <strong>${escapeHtml(targetIp || scan?.target || 'цель')}</strong>
          <span>${escapeHtml(radiusLabel)}</span>
        </div>
        ${points || '<div class="sni-map-empty">После поиска здесь появятся ближайшие SNI-точки</div>'}
      </div>
    </section>
  `;
}

function sniPanel() {
  const targetIp = state.sniScan?.targetIp || '';
  const results = (state.sniScan?.results || []).filter((item) => item.ip !== targetIp);
  const best = results[0];
  const targetHint = outboundAddress(activeProxyOutbound() || {}).split(':')[0] || 'example-sni.test';
  return `
    <section class="route-hero">
      <div>
        <h2>SNI-поисковик</h2>
        <p>Ищет TLS-хосты рядом с IP или доменом, снимает сертификат и показывает домены, которые могут быть полезны для REALITY/SNI-настроек.</p>
      </div>
      <div class="route-score">
        <strong>${results.length}</strong>
        <span>кандидатов</span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <div><h2>Поиск рядом с адресом</h2><span>По умолчанию ограничиваем поиск /24 и 256 адресами, чтобы не перегружать роутер.</span></div>
        <button class="btn" data-action="scanSni" ${state.sniScanning ? 'disabled' : ''}>${state.sniScanning ? 'Ищу...' : 'Начать поиск'}</button>
      </div>
      <div class="sni-form">
        <div class="form-row">
          <label>IP или домен</label>
          <input id="sniTarget" value="${escapeHtml(state.sniTarget)}" placeholder="${escapeHtml(targetHint)}" />
        </div>
        <div class="form-row">
          <label>CIDR</label>
          <select id="sniCidr">
            ${[24, 25, 26, 27, 28, 29, 30, 32].map((cidr) => `<option value="${cidr}" ${state.sniCidr === String(cidr) ? 'selected' : ''}>/${cidr}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>Таймаут, мс</label>
          <input id="sniTimeout" type="number" min="500" max="8000" step="100" value="${escapeHtml(state.sniTimeout)}" />
        </div>
        <div class="form-row">
          <label>Потоков</label>
          <input id="sniThreads" type="number" min="1" max="128" step="1" value="${escapeHtml(state.sniThreads)}" />
        </div>
        <div class="form-row">
          <label>Лимит IP</label>
          <input id="sniLimit" type="number" min="1" max="1024" step="1" value="${escapeHtml(state.sniLimit)}" />
        </div>
      </div>
      <p class="muted">Сканируйте только свои адреса или диапазоны, где у вас есть разрешение. Это активная проверка TCP/443.</p>
      ${state.message ? `<p class="notice" style="margin-top: 14px">${escapeHtml(state.message)}</p>` : ''}
    </section>

    ${state.sniScan ? `<section class="stats route-stats">
      ${stat('Диапазон', state.sniScan.network || '-', `${state.sniScan.scanned || 0} IP проверено`)}
      ${stat('Найдено', results.length, 'ответили TLS-сертификатом')}
      ${stat('Ближайший', best?.ip || '-', best?.domain || 'нет результатов')}
      ${stat('Цель', state.sniScan.targetIp || '-', state.sniScan.target || '')}
    </section>` : ''}

    ${sniRadar(results, state.sniScan || { target: state.sniTarget || targetHint })}

    <section class="panel">
      <div class="panel-title">
        <div><h2>Кандидаты SNI</h2><span>Сортировка по близости к целевому IP. Клик по точке на карте перематывает к строке в списке.</span></div>
      </div>
      <div class="sni-results">
        ${results
          .map((item, index) => `<article class="sni-row ${state.sniFocusedIndex === index ? 'focused' : ''}" data-sni-result="${index}">
            <div class="sni-proximity"><strong>${escapeHtml(item.proximity)}%</strong><span>близость</span></div>
            <div class="sni-main">
              <strong>${escapeHtml(item.domain || item.ip)}</strong>
              <span>${escapeHtml(item.ip)} · ${escapeHtml(item.issuer || 'issuer не указан')} · ${escapeHtml(item.latencyMs || 0)} мс</span>
            </div>
          </article>`)
          .join('') || '<p class="muted">Пока нет результатов. Запустите поиск по IP или домену вашего сервера.</p>'}
      </div>
    </section>
  `;
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

function devicesPanel() {
  const devices = deviceRules();
  const stats = deviceStats();
  const options = outboundOptions();
  return `
    <section class="route-hero devices-hero">
      <div>
        <h2>Устройства LAN</h2>
        <p>Назначайте режимы по IP: телевизор напрямую, приставку через proxy, отдельный клиент в block. RuOpenRay делает это обычными Xray source-правилами.</p>
      </div>
      <div class="route-score">
        <strong>${devices.length}</strong>
        <span>устройств с правилами</span>
      </div>
    </section>

    <section class="stats route-stats">
      ${stat('Через proxy', stats.proxy, 'Устройства идут через сервер')}
      ${stat('Напрямую', stats.direct, 'Обход прокси')}
      ${stat('Блокировка', stats.block, 'Доступ остановлен')}
      ${stat('Другое', stats.other, 'Особые направления')}
    </section>

    <div class="route-layout devices-layout">
      <section class="panel">
        <div class="panel-title">
          <div><h2>Добавить устройство</h2><span>${state.leases.length ? `${state.leases.length} DHCP leases · ${state.leasesSource || '/tmp/dhcp.leases'}` : 'Выберите клиента из DHCP leases или введите IP вручную.'}</span></div>
          <button class="btn secondary" data-action="refreshDhcpLeases">Обновить DHCP</button>
        </div>
        <input class="lease-search" data-lease-search value="${escapeHtml(state.leaseSearch)}" placeholder="Найти устройство: имя, IP или MAC" />
        <div class="lease-grid">
          ${state.leases.map((lease) => `<button class="lease-card" data-lease-search-item data-lease-search-text="${escapeHtml(leaseSearchText(lease))}" data-lease-ip="${escapeHtml(lease.ip)}" data-lease-name="${escapeHtml(lease.name || lease.mac)}">
            <strong>${escapeHtml(lease.name || 'Без имени')}</strong>
            <span>${escapeHtml([lease.ip, lease.mac, lease.remaining ? `осталось ${formatDuration(lease.remaining)}` : ''].filter(Boolean).join(' · '))}</span>
          </button>`).join('') || '<p class="muted">DHCP leases пока не найдены. На OpenWrt обычно читается /tmp/dhcp.leases.</p>'}
          <p class="muted lease-search-empty" data-lease-search-empty hidden>По этому запросу устройств нет.</p>
        </div>
        <div class="device-form">
          <div class="form-row">
            <label>Название</label>
            <input id="deviceName" value="${escapeHtml(state.deviceName)}" placeholder="Телевизор, консоль, ноутбук" />
          </div>
          <div class="form-row">
            <label>IP устройства</label>
            <input id="deviceIp" value="${escapeHtml(state.deviceIp)}" placeholder="192.168.50.42" />
          </div>
          <div class="form-row">
            <label>Режим</label>
            <select id="deviceMode">
              ${options.map((tag) => `<option value="${escapeHtml(tag)}" ${state.deviceMode === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}
            </select>
          </div>
          <button class="btn" data-action="addDevice">Добавить правило</button>
        </div>
        <div class="device-modes">
          <button class="mode-card" data-device-mode="proxy"><strong>Через proxy</strong><span>YouTube, Discord, ChatGPT и заблокированные сайты.</span></button>
          <button class="mode-card" data-device-mode="direct"><strong>Напрямую</strong><span>Банки, локальные сервисы, умный дом и IPTV.</span></button>
          <button class="mode-card" data-device-mode="block"><strong>Блокировка</strong><span>Отключить доступ для отдельного клиента.</span></button>
        </div>
        ${state.message ? `<p class="notice" style="margin-top: 14px">${escapeHtml(state.message)}</p>` : ''}
      </section>

      <section class="panel">
        <div class="panel-title">
          <div><h2>Найденные правила устройств</h2><span>Это source-правила из текущей маршрутизации.</span></div>
          <div class="split-actions">
            <button class="btn secondary" data-action="test">Проверить конфигурацию</button>
            <button class="btn warning" data-action="apply">Применить</button>
          </div>
        </div>
        <div class="device-list">
          ${devices
            .map(({ rule, index }) => {
              const sources = rule.source.join(', ');
              const lease = leaseByIp(rule.source[0]);
              return `<article class="device-row">
                <div class="device-ip">${escapeHtml(sources)}</div>
                <div class="device-main">
                  <strong>${escapeHtml(lease?.name || rule.outboundTag || 'не задано')}</strong>
                  <span>${escapeHtml(lease ? `${rule.outboundTag} · ${lease.mac}` : ((rule.inboundTag || []).join(', ') || 'все входящие'))}</span>
                </div>
                <select data-device-outbound="${index}">
                  ${options.map((tag) => `<option value="${escapeHtml(tag)}" ${rule.outboundTag === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}
                </select>
                <button class="btn secondary" data-device-delete="${index}">Удалить</button>
              </article>`;
            })
            .join('') || '<p class="muted">Пока нет правил для отдельных LAN-устройств.</p>'}
        </div>
      </section>
    </div>
  `;
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

function profilesPanel(compact = false) {
  const rows = compact ? state.profiles.slice(0, 5) : state.profiles;
  return `
    <section class="panel">
      <div class="panel-title">
        <div><h2>Профили</h2><span>Каждый профиль хранится отдельным JSON-файлом.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-action="backup">Бэкап активного</button>
          <button class="btn danger" data-action="restoreLatestBackup">Откатить apply</button>
        </div>
      </div>
      <table class="table">
        <thead><tr><th>Имя</th><th>Обновлен</th><th>Размер</th><th>Статус</th><th></th></tr></thead>
        <tbody>
          ${rows
            .map(
              (p) => `<tr>
                <td>${escapeHtml(p.name)}</td>
                <td>${new Date(p.updatedAt).toLocaleString()}</td>
                <td>${Math.round(p.size / 10) / 100} KB</td>
                <td>${p.active ? `<span class="tag">${labels.active}</span>` : `<span class="muted">${labels.stored}</span>`}</td>
                <td><button class="btn secondary" data-profile="${escapeHtml(p.name)}">Активировать</button></td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </section>
  `;
}

function logsPanel(compact = false) {
  if (compact) {
    return `
      <section class="panel log-panel compact dashboard-log-card">
        <div class="panel-title dashboard-log-title">
          <div><h2>Логи</h2><span>Журнал Xray и RuOpenRay</span></div>
          <div class="split-actions">
            <button class="btn secondary" data-action="refreshLogs">Обновить</button>
          </div>
        </div>
        <details class="dashboard-log-details" ${state.dashboardLogsOpen ? 'open' : ''}>
          <summary>Последние строки</summary>
          <pre class="console log-console">${escapeHtml(state.logs)}</pre>
        </details>
      </section>
    `;
  }
  return `
    <section class="panel log-panel">
      <div class="panel-title">
        <div><h2>Логи</h2><span>Обновляются в реальном времени, можно фильтровать и менять порядок записей.</span></div>
        <div class="split-actions">
          <label class="toggle-row log-toggle">
            <input id="logLive" type="checkbox" ${state.logLive ? 'checked' : ''} />
            <span>Live</span>
          </label>
          <button class="btn secondary" data-action="refreshLogs">Обновить</button>
        </div>
      </div>
      <div class="log-filters">
        <div class="form-row">
          <label>Источник</label>
          <select id="logKind">
            ${[
              ['all', 'Все'],
              ['error', 'Error'],
              ['access', 'Access'],
              ['system', 'System']
            ].map(([value, label]) => `<option value="${value}" ${state.logKind === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>Уровень</label>
          <select id="logLevel">
            ${['all', 'error', 'warning', 'info', 'debug'].map((value) => `<option value="${value}" ${state.logLevel === value ? 'selected' : ''}>${value}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>Время</label>
          <select id="logSort">
            ${[
              ['asc', 'Старые → новые'],
              ['desc', 'Новые → старые']
            ].map(([value, label]) => `<option value="${value}" ${state.logSort === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>Строк</label>
          <input id="logLines" type="number" min="20" max="2000" step="20" value="${escapeHtml(state.logLines)}" />
        </div>
        <div class="form-row">
          <label>Live, сек</label>
          <input id="logIntervalSec" type="number" min="1" max="60" step="1" value="${escapeHtml(state.logIntervalSec)}" />
        </div>
        <div class="form-row">
          <label>Поиск</label>
          <input id="logQuery" value="${escapeHtml(state.logQuery)}" placeholder="domain, error, outbound..." />
        </div>
      </div>
      <label class="toggle-row log-follow">
        <input id="logFollow" type="checkbox" ${state.logFollow ? 'checked' : ''} ${state.logSort === 'desc' ? 'disabled' : ''} />
        <span>Держать окно внизу при новых строках</span>
      </label>
      <pre class="console log-console">${escapeHtml(state.logs)}</pre>
    </section>
  `;
}

function accessLogRows(text = '') {
  return String(text || '')
    .split('\n')
    .map((line) => {
      const lower = line.toLowerCase();
      const protocol = lower.includes(' udp:') || lower.includes('udp:') ? 'UDP' : 'TCP';
      const endpoints = [...line.matchAll(/\b(?:tcp|udp):([^/\s,[\]()]+)(?::(\d+))?/gi)];
      const target = endpoints.length ? `${endpoints[endpoints.length - 1][1]}${endpoints[endpoints.length - 1][2] ? `:${endpoints[endpoints.length - 1][2]}` : ''}` : '';
      const sourceMatch = line.match(/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?\b/);
      const sourceIp = (sourceMatch?.[0] || '').replace(/:\d+$/, '');
      const lease = sourceIp ? leaseByIp(sourceIp) : null;
      const source = lease ? `${lease.name || lease.mac || 'LAN'} · ${sourceIp}` : sourceIp;
      const outbound = line.match(/\[([A-Za-z0-9_.:-]+)\](?:\s|$)/)?.[1] || '';
      const time = line.match(/\d{2}:\d{2}:\d{2}/)?.[0] || line.slice(0, 19);
      if (!target && !source && !outbound) return null;
      return { time, source, target, outbound, protocol };
    })
    .filter(Boolean);
}

function accessLogTable(rows = []) {
  if (!rows.length) return '';
  return `<div class="access-log-table">
    <div class="access-log-summary">
      <strong>Access view</strong>
      <span>${rows.length} строк разобрано из текущего окна логов</span>
    </div>
    <div class="access-log-head">
      <span>Время</span>
      <span>Устройство</span>
      <span>Домен / IP</span>
      <span>Направление</span>
      <span>Протокол</span>
    </div>
    ${rows.map((row) => `<article>
      <span>${escapeHtml(row.time)}</span>
      <strong>${escapeHtml(row.source || 'источник ?')}</strong>
      <code>${escapeHtml(row.target || 'цель ?')}</code>
      <em>${escapeHtml(row.outbound || 'направление ?')}</em>
      <b>${escapeHtml(row.protocol || 'tcp')}</b>
    </article>`).join('')}
  </div>`;
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

function domainDiagnosticRows() {
  return routeRules()
    .map((rule, index) => ({ rule, index, info: describeRouteRule(rule) }))
    .filter(({ info }) => info.kind === 'domain')
    .slice(0, 18);
}

function isPrivateIp(value = '') {
  return /^10\./.test(value) || /^192\.168\./.test(value) || /^172\.(1[6-9]|2\d|3[01])\./.test(value);
}

function cleanLogHost(value = '') {
  const host = String(value)
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/[),;]+$/, '')
    .trim();
  if (!host || host === '127.0.0.1' || host === '::1') return '';
  if (/^\d+$/.test(host)) return '';
  return host;
}

function logEvents() {
  const lines = String(state.logs || '').split('\n').filter(Boolean);
  return lines.map((line) => {
    const privateIp = line.match(/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/);
    const targets = [...line.matchAll(/\b(?:tcp|udp):([^/\s,[\]()]+)(?::\d+)?/gi)]
      .map((match) => cleanLogHost(match[1]))
      .filter((host) => host && !isPrivateIp(host));
    const domain = targets.reverse().find((host) => /[a-zа-яё-]/i.test(host) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) || '';
    const ipTarget = targets.find((host) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) || '';
    const protocol = line.match(/\b(udp|tcp):/i)?.[1]?.toLowerCase() || '';
    const outbound = line.match(/\[(proxy|direct|block|[A-Za-z0-9_.:-]+)\](?:\s|$)/)?.[1] || '';
    return { line, deviceIp: privateIp?.[0] || '', domain, ipTarget, protocol, outbound };
  }).filter((event) => event.deviceIp || event.domain || event.ipTarget);
}

function aggregateLogDevices() {
  const map = new Map();
  for (const event of logEvents()) {
    const key = event.deviceIp || 'router';
    const item = map.get(key) || { ip: key, hits: 0, domains: new Map(), protocols: new Set() };
    item.hits += 1;
    if (event.domain) item.domains.set(event.domain, (item.domains.get(event.domain) || 0) + 1);
    if (event.protocol) item.protocols.add(event.protocol);
    map.set(key, item);
  }
  return [...map.values()]
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 18)
    .map((item) => ({
      ...item,
      topDomains: [...item.domains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    }));
}

function aggregateLogDomains() {
  const map = new Map();
  for (const event of logEvents()) {
    const key = event.domain || event.ipTarget;
    if (!key) continue;
    const item = map.get(key) || { host: key, hits: 0, devices: new Set(), protocols: new Set(), outbound: new Set() };
    item.hits += 1;
    if (event.deviceIp) item.devices.add(event.deviceIp);
    if (event.protocol) item.protocols.add(event.protocol);
    if (event.outbound) item.outbound.add(event.outbound);
    map.set(key, item);
  }
  return [...map.values()].sort((a, b) => b.hits - a.hits).slice(0, 32);
}

function domainMonitorProtocols(item = {}) {
  const values = [];
  if (item.protocol) values.push(item.protocol);
  if (Array.isArray(item.protocols)) values.push(...item.protocols);
  if (item.tcp) values.push('TCP');
  if (item.udp) values.push('UDP');
  if (Array.isArray(item.samples)) values.push(...item.samples.map((sample) => sample.protocol));
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function domainMonitorDevicesText(item = {}) {
  const devices = Array.isArray(item.devices) ? item.devices : [];
  if (!devices.length) return item.sourceDevice || item.sourceIp || 'router';
  return devices
    .slice(0, 3)
    .map((device) => `${device.name || device.ip || 'router'}${device.hits ? ` (${device.hits})` : ''}`)
    .join(', ');
}

function domainMonitorHost(item = {}) {
  return item.host || item.domain || item.destinationIp || '';
}

function domainMonitorMatchesFilter(item = {}, filter = state.domainMonitorFilter) {
  const host = domainMonitorHost(item);
  const protocols = domainMonitorProtocols(item).map((value) => value.toLowerCase());
  if (filter === 'domains') return Boolean(host && !isIpLiteral(host));
  if (filter === 'ip') return Boolean(host && isIpLiteral(host));
  if (filter === 'dns') return protocols.includes('dns') || String(item.source || '').toLowerCase().includes('dns');
  if (filter === 'tcp') return protocols.includes('tcp');
  if (filter === 'udp') return protocols.includes('udp');
  return true;
}

function domainMonitorMatchesQuery(item = {}, query = state.domainMonitorQuery.trim().toLowerCase()) {
  if (!query) return true;
  return [
    domainMonitorHost(item),
    domainMonitorDevicesText(item),
    ...(domainMonitorProtocols(item)),
    ...(Array.isArray(item.outbounds) ? item.outbounds : []),
    item.outbound,
    item.source,
    item.raw
  ].join(' ').toLowerCase().includes(query);
}

function domainMonitorRows() {
  return Array.isArray(state.domainMonitor?.domains) ? [...state.domainMonitor.domains] : [];
}

function domainMonitorFilterCounts() {
  const rows = domainMonitorRows();
  const count = (filter) => rows.filter((item) => domainMonitorMatchesFilter(item, filter)).length;
  return {
    all: rows.length,
    domains: count('domains'),
    ip: count('ip'),
    dns: count('dns'),
    tcp: count('tcp'),
    udp: count('udp')
  };
}

function monitoredDomains() {
  const rows = domainMonitorRows();
  const query = state.domainMonitorQuery.trim().toLowerCase();
  const filtered = rows.filter((item) => domainMonitorMatchesFilter(item) && domainMonitorMatchesQuery(item, query));
  if (state.domainMonitorSort === 'last') return filtered.sort((a, b) => (b.lastSeenTs || 0) - (a.lastSeenTs || 0));
  if (state.domainMonitorSort === 'name') return filtered.sort((a, b) => String(a.host).localeCompare(String(b.host)));
  return filtered.sort((a, b) => (b.hits || 0) - (a.hits || 0));
}

function monitoredDevices() {
  const rows = Array.isArray(state.domainMonitor?.devices) ? [...state.domainMonitor.devices] : [];
  const query = state.domainMonitorQuery.trim().toLowerCase();
  const filtered = query
    ? rows.filter((item) => `${item.name} ${item.ip} ${(item.topDomains || []).map((domain) => domain.host).join(' ')}`.toLowerCase().includes(query))
    : rows;
  return filtered.sort((a, b) => (b.hits || 0) - (a.hits || 0));
}

function monitoredEvents() {
  const rows = Array.isArray(state.domainMonitor?.events) ? [...state.domainMonitor.events] : [];
  const query = state.domainMonitorQuery.trim().toLowerCase();
  const filtered = rows.filter((item) => domainMonitorMatchesFilter(item) && domainMonitorMatchesQuery(item, query));
  return filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function monitorSourceLabel() {
  if (!state.domainMonitor) return 'нет данных';
  if (state.domainMonitor.source === 'b4sni') return 'B4SNI';
  return 'Xray access';
}

function domainMonitorDomainQuality() {
  const events = Array.isArray(state.domainMonitor?.events) ? state.domainMonitor.events : [];
  const domains = events.filter((item) => item?.host && !isIpLiteral(item.host));
  const ips = events.filter((item) => item?.host && isIpLiteral(item.host));
  return {
    total: events.length,
    domains: domains.length,
    ips: ips.length,
    hasDomains: domains.length > 0,
    domainShare: events.length ? Math.round((domains.length / events.length) * 100) : 0
  };
}

function nftBytes(status) {
  const matches = [...String(status?.nft?.stdout || '').matchAll(/\bbytes\s+(\d+)/g)].map((match) => Number(match[1]) || 0);
  return matches.reduce((sum, value) => sum + value, 0);
}

function totalXrayStatsBytes(stats) {
  const outbounds = Array.isArray(stats?.outbounds) ? stats.outbounds : [];
  return outbounds.reduce((sum, item) => sum + Number(item.uplink || 0) + Number(item.downlink || 0), 0);
}

async function triggerBrowserTraffic(url) {
  const target = `${url}${url.includes('?') ? '&' : '?'}ruopenray_check=${Date.now()}`;
  try {
    const response = await request('/api/diagnostics/http-probe', { method: 'POST', body: JSON.stringify({ url: target, timeout: 8 }) });
    return {
      ok: Boolean(response.ok),
      detail: response.ok
        ? `запрос с роутера выполнен${response.status ? `, HTTP ${response.status}` : ''}`
        : (response.error || response.stderr || response.message || 'запрос с роутера не выполнен'),
    };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

async function runConnectivityDiagnostics() {
  state.diagnosticsChainRunning = true;
  state.diagnosticsChainResult = { steps: [] };
  render();
  const steps = [];
  const pushStep = (ok, title, detail = '', tone = '') => {
    steps.push({ ok, title, detail, tone });
    state.diagnosticsChainResult = { ok: steps.every((step) => step.ok || step.tone === 'warn'), steps, updatedAt: new Date().toISOString() };
    render();
  };
  try {
    const config = await request('/api/config');
    const test = await request('/api/config/test', { method: 'POST', body: JSON.stringify({ config }) });
    pushStep(Boolean(test.ok), 'Конфигурация Xray', test.ok ? 'Configuration OK' : (test.stderr || 'Ошибка проверки'));

    const lanDns = await request('/api/dns/lan-upstream');
    const dnsReady = Boolean(lanDns.ok && (lanDns.mode !== 'xray' || lanDns.readiness?.ready));
    pushStep(dnsReady, 'LAN DNS / dnsmasq', `${lanDns.mode || 'unknown'} · ${(lanDns.servers || []).join(', ') || 'серверы не заданы'}`);

    const dnsServer = lanDns.mode === 'xray' ? '127.0.0.1:5353' : ((lanDns.servers || [])[0] || '127.0.0.1:53');
    const dnsCheck = await request('/api/dns/check', { method: 'POST', body: JSON.stringify({ server: dnsServer, host: 'example.com' }) });
    const addresses = [...(dnsCheck.addresses || []), ...(dnsCheck.a || [])];
    pushStep(Boolean(dnsCheck.ok && addresses.length), 'Проверка DNS-ответа', addresses.length ? addresses.join(', ') : (dnsCheck.error || 'нет A-записей'));

    const firewallBefore = await request('/api/firewall/status');
    const firewallReady = Boolean(firewallBefore.active && firewallBefore.persistent && (firewallBefore.routerMode !== 'tproxy' || (firewallBefore.ipRule && firewallBefore.ipRoute)));
    pushStep(firewallReady, 'nftables и policy routing', `${firewallBefore.routerMode || 'unknown'} · active=${Boolean(firewallBefore.active)} · persistent=${Boolean(firewallBefore.persistent)}`);

    const statsBefore = await request('/api/xray/stats').catch(() => null);
    const beforeBytes = nftBytes(firewallBefore);
    const beforeStats = totalXrayStatsBytes(statsBefore);
    const browserTraffic = await triggerBrowserTraffic(state.diagnosticsTestUrl || 'https://www.gstatic.com/generate_204');
    const firewallAfter = await request('/api/firewall/status');
    const statsAfter = await request('/api/xray/stats').catch(() => null);
    const nftDelta = nftBytes(firewallAfter) - beforeBytes;
    const statsDelta = totalXrayStatsBytes(statsAfter) - beforeStats;
    const trafficDetail = `nft +${byteSize(Math.max(0, nftDelta))} · Xray stats +${byteSize(Math.max(0, statsDelta))} · ${browserTraffic.detail}${nftDelta <= 0 && statsDelta <= 0 ? ' · трафик самого роутера может идти мимо LAN-перехвата' : ''}`;
    pushStep(Boolean(browserTraffic.ok || nftDelta > 0 || statsDelta > 0), 'Проверка выхода с роутера', trafficDetail, browserTraffic.ok ? 'warn' : '');

    const active = xrayActiveStats(statsAfter || state.status?.xrayStats || {});
    pushStep(Boolean(statsAfter?.enabled), 'Статистика Xray', statsAfter?.enabled ? `активный: ${active?.tag || 'не выбран'} · proxy принято ${byteSize(statsAfter.groups?.proxy?.downlink || 0)} · отправлено ${byteSize(statsAfter.groups?.proxy?.uplink || 0)}` : 'учет трафика выключен', statsAfter?.enabled ? '' : 'warn');
  } catch (error) {
    pushStep(false, 'Диагностика остановлена', error.message);
  } finally {
    state.diagnosticsChainRunning = false;
    render();
  }
}

async function startClientTrafficTest() {
  const [firewall, stats] = await Promise.all([
    request('/api/firewall/status'),
    request('/api/xray/stats').catch(() => null)
  ]);
  state.clientTrafficBaseline = {
    at: new Date().toISOString(),
    nftBytes: nftBytes(firewall),
    statsBytes: totalXrayStatsBytes(stats),
    statsEnabled: Boolean(stats?.enabled),
    activeTag: activeProxyTag(),
  };
  state.clientTrafficResult = null;
  state.message = 'Точка отсчета сохранена. Откройте проверочный URL с устройства в LAN и нажмите “Проверить после клиента”.';
  render();
}

async function finishClientTrafficTest() {
  if (!state.clientTrafficBaseline) {
    await startClientTrafficTest();
    return;
  }
  const [firewall, stats] = await Promise.all([
    request('/api/firewall/status'),
    request('/api/xray/stats').catch(() => null)
  ]);
  const nftDelta = nftBytes(firewall) - Number(state.clientTrafficBaseline.nftBytes || 0);
  const statsDelta = totalXrayStatsBytes(stats) - Number(state.clientTrafficBaseline.statsBytes || 0);
  state.clientTrafficResult = {
    ok: nftDelta > 0 || statsDelta > 0,
    at: new Date().toISOString(),
    nftDelta: Math.max(0, nftDelta),
    statsDelta: Math.max(0, statsDelta),
    statsEnabled: Boolean(stats?.enabled),
    activeTag: activeProxyTag(),
  };
  state.message = state.clientTrafficResult.ok
    ? 'Клиентский трафик замечен: счетчики выросли.'
    : 'Счетчики не выросли. Проверьте, что устройство использует этот роутер как шлюз и DNS.';
  render();
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

function bind() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      render();
    });
  });
  document.querySelectorAll('[data-tab-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tabJump;
      if (button.dataset.routingViewJump) state.routingView = button.dataset.routingViewJump;
      if (button.dataset.diagnosticsJump) state.diagnosticsView = button.dataset.diagnosticsJump;
      render();
    });
  });
  document.querySelectorAll('[data-diagnostics-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.diagnosticsView = button.dataset.diagnosticsView;
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
  document.querySelectorAll('.modal-backdrop[data-action]').forEach((backdrop) => {
    backdrop.addEventListener('pointerdown', (event) => {
      backdrop.dataset.pointerStartedInModal = event.target.closest('[data-modal]') ? '1' : '0';
    }, true);
  });
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      try {
        if (button.classList.contains('modal-backdrop')) {
          const startedInModal = button.dataset.pointerStartedInModal === '1';
          button.dataset.pointerStartedInModal = '0';
          if (startedInModal || event.target !== button) return;
        }
        const action = button.dataset.action;
        if (['start', 'stop', 'restart'].includes(action)) return await service(action);
        if (action === 'refresh') return await refresh();
        if (action === 'changePanelPassword') return await changePanelPassword();
        if (action === 'saveLoggingSettings') return await saveLoggingSettings();
        if (action === 'clearLoggingFiles') return await clearLoggingFiles();
        if (action === 'refreshDhcpLeases') return await refreshDhcpLeases();
        if (action === 'saveServiceSettings') return await saveServiceSettings();
        if (action === 'appVersionClick') return await appVersionClick();
        if (action === 'checkAppUpdate') return await checkAppUpdate();
        if (action === 'updateApp') return await updateApp();
        if (action === 'test') return await testConfig();
        if (action === 'apply') return await applyConfig();
        if (action === 'applyFirewall') return await applyFirewall();
        if (action === 'disableFirewall') return await disableFirewall();
        if (action === 'refreshFirewallStatus') return await refreshFirewallStatus();
        if (action === 'enableXrayStats') return await setXrayStats(true);
        if (action === 'disableXrayStats') return await setXrayStats(false);
        if (action === 'resetXrayStats') return await resetXrayStats();
        if (action === 'analyzeConfig') return await analyzeConfig();
        if (action === 'openCoreDialog') {
          const info = coreUpdateInfo();
          state.coreDialogOpen = true;
          state.selectedCoreVersion = state.selectedCoreVersion || info.target?.tag || filteredCoreReleases().find((release) => release.assetUrl)?.tag || '';
          return render();
        }
        if (action === 'closeCoreDialog') {
          state.coreDialogOpen = false;
          return render();
        }
        if (action === 'openRouteRuleDialog') {
          resetRouteRuleForm();
          state.routeRuleDialog = true;
          state.routeRuleMode = 'single';
          state.message = '';
          return render();
        }
        if (action === 'openRouteRulePresets' || action === 'openRoutePresetDialog') {
          resetRouteRuleForm();
          state.routeRuleDialog = true;
          state.routeRuleMode = 'presets';
          state.selectedRoutePresets = [];
          state.message = '';
          return render();
        }
        if (action === 'closeRouteRuleDialog') {
          state.routeRuleDialog = false;
          resetRouteRuleForm();
          state.selectedRoutePresets = [];
          state.message = '';
          return render();
        }
        if (action === 'openRouteBalancerDialog') return openRouteBalancerDialog();
        if (action === 'closeRouteBalancerDialog') return closeRouteBalancerDialog();
        if (action === 'saveRouteBalancer') return saveRouteBalancer();
        if (action === 'newRoutePreset') return newRoutingPreset();
        if (action === 'closeRoutePresetDialog') {
          state.routePresetDialog = false;
          clearRoutePresetEditor();
          return render();
        }
        if (action === 'backToRoutePresets') {
          clearRoutePresetEditor();
          state.message = '';
          return render();
        }
        if (action === 'selectAllRoutePresets') {
          state.selectedRoutePresets = [...customRoutePresetEntries().map(([key]) => key), ...builtinRoutePresetEntries().map(([key]) => key)];
          return render();
        }
        if (action === 'clearRoutePresets') {
          state.selectedRoutePresets = [];
          return render();
        }
        if (action === 'applyRoutePresets') return applySelectedRoutingPresets();
        if (action === 'previewRoutePresetEdit') return previewRoutePresetEdit();
        if (action === 'saveRoutePresetEdit') return saveRoutePresetEdit();
        if (action === 'applyRoutePresetEdit') return applyRoutePresetEdit();
        if (action === 'openInstallWizard') return await openInstallWizard();
        if (action === 'openSetupWizard') return await openSetupWizard();
        if (action === 'closeSetupWizard') {
          state.setupWizardOpen = false;
          return render();
        }
        if (action === 'setupPrepareDraft') return setupPrepareDraft();
        if (action === 'runSetupWizard') return await runSetupWizard();
        if (action === 'rollbackSetupWizard') return await rollbackSetupWizard();
        if (action === 'clearSetupSnapshot') {
          clearSetupSnapshot();
          return render();
        }
        if (action === 'refreshInstallPlan') {
          state.installPlan = await request('/api/install/plan');
          return render();
        }
        if (action === 'closeInstallWizard') {
          state.installWizardOpen = false;
          return render();
        }
        if (action === 'updateCore') return await updateCore();
        if (action === 'installCorePackage') return await installCorePackage();
        if (action === 'updateGeo') return await updateGeo();
        if (action === 'saveGeoSchedule') return await saveGeoSchedule();
        if (action === 'cleanupGeoBackups') return await cleanupGeoBackups();
        if (action === 'cleanupExtraGeoDat') return await cleanupExtraGeoDat();
        if (action === 'addGeoSource') return await addGeoSource();
        if (action === 'refreshLogs') return await refreshLogs(true, true);
        if (action === 'runConnectivityDiagnostics') return await runConnectivityDiagnostics();
        if (action === 'refreshDomainMonitor') return await refreshDomainMonitor(true);
        if (action === 'startDomainMonitor') return await controlDomainMonitor('start');
        if (action === 'stopDomainMonitor') return await controlDomainMonitor('stop');
        if (action === 'clearDomainMonitor') return await controlDomainMonitor('clear');
        if (action === 'toggleConfig') {
          state.configExpanded = !state.configExpanded;
          return render();
        }
        if (action === 'import') return await importLink();
        if (action === 'previewImport') return await previewImport();
        if (action === 'importToCurrent') return await importToCurrent(false);
        if (action === 'importActive') return await importToCurrent(true);
        if (action === 'previewSubscription') return await previewSubscription();
        if (action === 'importSubscription') return await importSubscription();
        if (action === 'importSubscriptionToCurrent') return await importSubscriptionToCurrent(false);
        if (action === 'importSubscriptionActive') return await importSubscriptionToCurrent(true);
        if (action === 'closeImport') {
          state.importDialog = '';
          return render();
        }
        if (action === 'addRoute') return addRoutingRule();
        if (action === 'saveRouteEdit') return saveRoutingRuleEdit();
        if (action === 'previewRouteDsl') return previewRoutingDsl();
        if (action === 'appendRouteDsl') return applyRoutingDsl('append');
        if (action === 'appendRouteDslFromDialog') return applyRoutingDsl('append', true);
        if (action === 'replaceRouteDsl') return applyRoutingDsl('replace');
        if (action === 'filterRoutes') return render();
        if (action === 'disableVisibleRoutes') return disableVisibleRoutingRules();
        if (action === 'restoreAllDisabledRoutes') return restoreAllDisabledRouteRules();
        if (action === 'enableTcpFastOpenSystem') return await setSystemTcpFastOpen(true);
        if (action === 'disableTcpFastOpenSystem') return await setSystemTcpFastOpen(false);
        if (action === 'enableTcpFastOpenDraft') return setTcpFastOpenDraft(true);
        if (action === 'disableTcpFastOpenDraft') return setTcpFastOpenDraft(false);
        if (action === 'prepareTransparent') return prepareTransparentDraft();
        if (action === 'prepareDnsInbound') return prepareDnsInboundDraft();
        if (action === 'copyFirewall') return await copyFirewallCommands();
        if (action === 'copyInstallCommand') return await copyInstallCommand();
        if (action === 'copyInstallWithXrayCommand') return await copyInstallCommand(true);
        if (action === 'startClientTrafficTest') return await startClientTrafficTest();
        if (action === 'finishClientTrafficTest') return await finishClientTrafficTest();
        if (action === 'addDevice') return addDeviceRule();
        if (action === 'addDns') return addDnsServer();
        if (action === 'saveDnsHost') return saveDnsHost();
        if (action === 'previewLanDnsUpstream') return await previewLanDnsUpstream();
        if (action === 'applyLanDnsUpstream') return await applyLanDnsUpstream();
        if (action === 'dnsWizardSecure') return applyDnsGuardPreset('secure');
        if (action === 'dnsWizardRu') return applyDnsGuardPreset('ru');
        if (action === 'dnsWizardStrict') return applyDnsGuardPreset('strict');
        if (action === 'checkDns') return await checkDnsServer();
        if (action === 'applyDnsBootstrapHosts') return applyDnsBootstrapHosts();
        if (action === 'checkServers') return await checkServers();
        if (action === 'checkObservatoryTargets') return await checkObservatoryTargets();
        if (action === 'enableObservatoryForProxy') return enableObservatoryForProxy();
        if (action === 'fallbackSubscription') return await fallbackSubscriptionPool(button.dataset.subscriptionFallback || '');
        if (action === 'scanSni') return await scanSni();
        if (action === 'saveProfile') return await saveProfile();
        if (action === 'backup') return await backup();
        if (action === 'restoreLatestBackup') return await restoreLatestBackup();
      } catch (error) {
        state.configTesting = false;
        state.configApplying = false;
        state.serverChecking = false;
        state.serverCheckingTags = [];
        state.message = error.message;
        render();
      }
    });
  });
  document.querySelectorAll('[data-modal]').forEach((modal) => {
    modal.addEventListener('click', (event) => event.stopPropagation());
  });
  document.querySelectorAll('[data-profile]').forEach((button) => {
    button.addEventListener('click', () => activateProfile(button.dataset.profile));
  });
  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => addRoutingPreset(button.dataset.preset));
  });
  document.querySelectorAll('[data-route-preset-check]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const key = checkbox.dataset.routePresetCheck;
      const selected = new Set(state.selectedRoutePresets);
      if (checkbox.checked) selected.add(key);
      else selected.delete(key);
      state.selectedRoutePresets = [...selected];
      checkbox.closest('.preset-check')?.classList.toggle('active', checkbox.checked);
      const applyButton = document.querySelector('[data-action="applyRoutePresets"]');
      if (applyButton) applyButton.disabled = state.selectedRoutePresets.length === 0;
    });
  });
  document.querySelectorAll('[data-route-preset-edit]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      editRoutingPreset(button.dataset.routePresetEdit);
    });
  });
  document.querySelectorAll('[data-route-preset-delete]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteCustomRoutePreset(button.dataset.routePresetDelete);
    });
  });
  document.querySelectorAll('[data-route-delete]').forEach((button) => {
    button.addEventListener('click', () => removeRoutingRule(Number(button.dataset.routeDelete)));
  });
  document.querySelectorAll('[data-route-disable]').forEach((button) => {
    button.addEventListener('click', () => disableRoutingRule(Number(button.dataset.routeDisable)));
  });
  document.querySelectorAll('[data-route-restore]').forEach((button) => {
    button.addEventListener('click', () => restoreDisabledRouteRule(button.dataset.routeRestore));
  });
  document.querySelectorAll('[data-route-disabled-delete]').forEach((button) => {
    button.addEventListener('click', () => deleteDisabledRouteRule(button.dataset.routeDisabledDelete));
  });
  document.querySelectorAll('[data-route-move]').forEach((button) => {
    button.addEventListener('click', () => moveRoutingRule(Number(button.dataset.routeMove), Number(button.dataset.direction)));
  });
  document.querySelectorAll('[data-route-edit]').forEach((button) => {
    button.addEventListener('click', () => openRoutingRuleEditor(Number(button.dataset.routeEdit)));
  });
  document.querySelectorAll('[data-route-balancer-edit]').forEach((button) => {
    button.addEventListener('click', () => openRouteBalancerDialog(Number(button.dataset.routeBalancerEdit)));
  });
  document.querySelectorAll('[data-route-balancer-delete]').forEach((button) => {
    button.addEventListener('click', () => removeRouteBalancer(Number(button.dataset.routeBalancerDelete)));
  });
  document.querySelectorAll('[data-firewall-bypass-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallBypassMode(button.dataset.firewallBypassMode));
  });
  document.querySelectorAll('[data-firewall-router-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallRouterMode(button.dataset.firewallRouterMode));
  });
  document.querySelectorAll('[data-firewall-device-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallDeviceMode(button.dataset.firewallDeviceMode));
  });
  document.querySelectorAll('[data-firewall-device]').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => toggleFirewallDevice(checkbox.dataset.firewallDevice, event.target.checked));
  });
  document.querySelectorAll('[data-route-index]').forEach((row) => {
    row.addEventListener('pointerdown', (event) => {
      row.dataset.dragHandle = event.target.closest('.route-drag-handle') ? '1' : '0';
    });
    row.addEventListener('dragstart', (event) => {
      if (row.dataset.dragHandle !== '1') {
        event.preventDefault();
        return;
      }
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.dataset.routeIndex);
    });
    row.addEventListener('dragend', () => {
      document.querySelectorAll('.route-row.dragging, .route-row.drag-over, .route-row.drop-before, .route-row.drop-after')
        .forEach((item) => item.classList.remove('dragging', 'drag-over', 'drop-before', 'drop-after'));
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      document.querySelectorAll('.route-row.drag-over, .route-row.drop-before, .route-row.drop-after')
        .forEach((item) => {
          if (item !== row) item.classList.remove('drag-over', 'drop-before', 'drop-after');
        });
      row.classList.add('drag-over');
      row.classList.toggle('drop-before', before);
      row.classList.toggle('drop-after', !before);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over', 'drop-before', 'drop-after'));
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      const fromIndex = Number(event.dataTransfer.getData('text/plain'));
      const toIndex = Number(row.dataset.routeIndex);
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      row.classList.remove('drag-over', 'drop-before', 'drop-after');
      reorderRoutingRule(fromIndex, before ? toIndex : toIndex + 1);
    });
  });
  document.querySelectorAll('[data-route-focus]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.routeFocus);
      const rule = routeRules()[index];
      const info = rule ? describeRouteRule(rule) : null;
      state.routeSearch = info?.value || '';
      state.tab = 'routing';
      render();
    });
  });
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
  document.querySelectorAll('[data-route-target]').forEach((select) => {
    select.addEventListener('change', (event) => updateRoutingTarget(Number(select.dataset.routeTarget), event.target.value));
  });
  document.querySelectorAll('[data-outbound-delete]').forEach((button) => {
    button.addEventListener('click', () => removeOutbound(Number(button.dataset.outboundDelete)));
  });
  document.querySelectorAll('[data-route-all]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await routeAllToOutbound(button.dataset.routeAll);
      } catch (error) {
        state.configApplying = false;
        state.message = error.message;
        render();
      }
    });
  });
  document.querySelectorAll('[data-dashboard-connect]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await routeAllToOutbound(button.dataset.dashboardConnect);
      } catch (error) {
        state.configApplying = false;
        state.message = error.message;
        render();
      }
    });
  });
  document.querySelectorAll('[data-server-check]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (state.serverChecking) return;
      try {
        await checkServers([button.dataset.serverCheck]);
      } catch (error) {
        state.serverChecking = false;
        state.serverCheckingTags = [];
        state.message = error.message;
        render();
      }
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
  document.querySelectorAll('[data-device-ip]').forEach((button) => {
    button.addEventListener('click', () => {
      state.deviceIp = button.dataset.deviceIp || '';
      state.tab = 'devices';
      render();
    });
  });
  document.querySelectorAll('[data-core-version]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedCoreVersion = button.dataset.coreVersion;
      render();
    });
  });
  document.querySelectorAll('[data-core-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.coreReleaseFilter = button.dataset.coreFilter;
      const visible = filteredCoreReleases().find((release) => release.assetUrl);
      state.selectedCoreVersion = visible?.tag || '';
      render();
    });
  });
  document.querySelectorAll('[data-logging-level]').forEach((button) => {
    button.addEventListener('click', () => {
      state.loggingLevel = button.dataset.loggingLevel;
      render();
    });
  });
  document.querySelectorAll('[data-geo-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      state.geoPreset = button.dataset.geoPreset;
      render();
    });
  });
  document.querySelectorAll('[data-geo-base]').forEach((button) => {
    button.addEventListener('click', () => {
      state.geoBasePreset = button.dataset.geoBase;
      state.geoPreset = button.dataset.geoBase;
      render();
    });
  });
  document.querySelectorAll('[data-geo-extra]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.geoExtra;
      state.geoExtraPresets = input.checked
        ? [...new Set([...state.geoExtraPresets, id])]
        : state.geoExtraPresets.filter((item) => item !== id);
      render();
    });
  });
  document.querySelectorAll('[data-geo-custom]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.geoCustom;
      state.geoCustomSourceIds = input.checked
        ? [...new Set([...state.geoCustomSourceIds, id])]
        : state.geoCustomSourceIds.filter((item) => item !== id);
      render();
    });
  });
  document.querySelectorAll('[data-geo-source-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const source = state.geoCustomSources.find((item) => item.id === button.dataset.geoSourceToggle);
      if (source) toggleGeoSourceEnabled(source.id, source.enabled === false);
    });
  });
  document.querySelectorAll('[data-geo-source-delete]').forEach((button) => {
    button.addEventListener('click', () => removeGeoSource(button.dataset.geoSourceDelete));
  });
  document.querySelectorAll('[data-geo-delete]').forEach((button) => {
    button.addEventListener('click', () => deleteGeoFile(button.dataset.geoDelete));
  });
  document.querySelectorAll('[data-device-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.deviceMode = button.dataset.deviceMode;
      render();
    });
  });
  document.querySelectorAll('[data-device-outbound]').forEach((select) => {
    select.addEventListener('change', (event) => updateDeviceRule(Number(select.dataset.deviceOutbound), event.target.value));
  });
  document.querySelectorAll('[data-device-delete]').forEach((button) => {
    button.addEventListener('click', () => removeDeviceRule(Number(button.dataset.deviceDelete)));
  });
  document.querySelectorAll('[data-lease-ip]').forEach((button) => {
    button.addEventListener('click', () => {
      state.deviceIp = button.dataset.leaseIp;
      state.deviceName = button.dataset.leaseName || '';
      render();
    });
  });
  document.querySelectorAll('[data-dns-delete]').forEach((button) => {
    button.addEventListener('click', () => removeDnsServer(Number(button.dataset.dnsDelete)));
  });
  document.querySelectorAll('[data-dns-host-edit]').forEach((button) => {
    button.addEventListener('click', () => editDnsHost(button.dataset.dnsHostEdit || ''));
  });
  document.querySelectorAll('[data-dns-host-delete]').forEach((button) => {
    button.addEventListener('click', () => removeDnsHost(button.dataset.dnsHostDelete || ''));
  });
  document.querySelectorAll('[data-dns-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      state.dnsAddress = button.dataset.dnsPreset;
      render();
    });
  });
  document.querySelectorAll('[data-lan-dns-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.lanDnsMode = button.dataset.lanDnsMode;
      state.lanDnsPreview = null;
      render();
    });
  });
  const jsonDraftNode = document.querySelector('#jsonDraft');
  jsonDraftNode?.addEventListener('input', (event) => {
    state.jsonDraft = event.target.value;
    state.configScrollTop = event.target.scrollTop;
    try {
      state.config = JSON.parse(event.target.value);
    } catch {
      // Keep the draft text editable until the user fixes JSON.
    }
  });
  jsonDraftNode?.addEventListener('scroll', (event) => {
    state.configScrollTop = event.target.scrollTop;
  }, { passive: true });
  document.querySelector('#importLink')?.addEventListener('input', (event) => {
    state.importLink = event.target.value;
    state.importPreview = null;
  });
  document.querySelector('#importOutboundTag')?.addEventListener('input', (event) => {
    state.importOutboundTag = event.target.value;
  });
  document.querySelector('#subscriptionUrl')?.addEventListener('input', (event) => {
    state.subscriptionUrl = event.target.value;
    state.subscriptionPreview = null;
  });
  document.querySelector('#subscriptionAutoBalancer')?.addEventListener('change', (event) => {
    state.subscriptionAutoBalancer = event.target.checked;
    render();
  });
  document.querySelector('#subscriptionBalancerTag')?.addEventListener('input', (event) => {
    state.subscriptionBalancerTag = event.target.value;
  });
  document.querySelector('#subscriptionBalancerStrategy')?.addEventListener('change', (event) => {
    state.subscriptionBalancerStrategy = event.target.value;
    render();
  });
  document.querySelector('#profileName')?.addEventListener('input', (event) => {
    state.profileName = event.target.value;
  });
  document.querySelector('#coreBackup')?.addEventListener('change', (event) => {
    state.coreBackup = event.target.checked;
  });
  document.querySelector('#appBackup')?.addEventListener('change', (event) => {
    state.appBackup = event.target.checked;
    render();
  });
  document.querySelector('#settingsCurrentPassword')?.addEventListener('input', (event) => {
    state.settingsCurrentPassword = event.target.value;
  });
  document.querySelector('#settingsNewPassword')?.addEventListener('input', (event) => {
    state.settingsNewPassword = event.target.value;
  });
  document.querySelector('#settingsConfirmPassword')?.addEventListener('input', (event) => {
    state.settingsConfirmPassword = event.target.value;
  });
  document.querySelector('#installPassword')?.addEventListener('input', (event) => {
    state.installPassword = event.target.value;
    localStorage.setItem(installPasswordStorageKey, state.installPassword);
    const basic = document.querySelector('#installCommandBasic');
    const withXray = document.querySelector('#installCommandWithXray');
    if (basic) basic.textContent = githubInstallCommand(false);
    if (withXray) withXray.textContent = githubInstallCommand(true);
  });
  document.querySelector('#loggingAccessLog')?.addEventListener('change', (event) => {
    state.loggingAccessLog = event.target.checked;
    render();
  });
  document.querySelector('#loggingErrorLog')?.addEventListener('change', (event) => {
    state.loggingErrorLog = event.target.checked;
    render();
  });
  document.querySelector('#loggingDnsLog')?.addEventListener('change', (event) => {
    state.loggingDnsLog = event.target.checked;
    render();
  });
  document.querySelector('#loggingAccessPath')?.addEventListener('input', (event) => {
    state.loggingAccessPath = event.target.value;
  });
  document.querySelector('#loggingErrorPath')?.addEventListener('input', (event) => {
    state.loggingErrorPath = event.target.value;
  });
  document.querySelector('#loggingMaxSizeMb')?.addEventListener('input', (event) => {
    state.loggingMaxSizeMb = event.target.value;
  });
  document.querySelector('#loggingRotateCopies')?.addEventListener('input', (event) => {
    state.loggingRotateCopies = event.target.value;
  });
  document.querySelector('#loggingClearOnRestart')?.addEventListener('change', (event) => {
    state.loggingClearOnRestart = event.target.checked;
    render();
  });
  document.querySelector('#loggingRestart')?.addEventListener('change', (event) => {
    state.loggingRestart = event.target.checked;
    render();
  });
  document.querySelector('#serviceStartupDelaySec')?.addEventListener('input', (event) => {
    state.serviceStartupDelaySec = event.target.value;
  });
  document.querySelector('#serviceApplyDelaySec')?.addEventListener('input', (event) => {
    state.serviceApplyDelaySec = event.target.value;
  });
  document.querySelector('#serviceGoMemLimit')?.addEventListener('input', (event) => {
    state.serviceGoMemLimit = event.target.value;
  });
  document.querySelector('#serviceGoGC')?.addEventListener('input', (event) => {
    state.serviceGoGC = event.target.value;
  });
  document.querySelector('#serviceDownloadMirror')?.addEventListener('change', (event) => {
    state.serviceDownloadMirror = event.target.value;
    render();
  });
  document.querySelector('#serviceMirrorPrefix')?.addEventListener('input', (event) => {
    state.serviceMirrorPrefix = event.target.value;
  });
  document.querySelectorAll('[data-sniffer-mode]').forEach((button) => {
    button.addEventListener('click', () => setSnifferDraft(button.dataset.snifferMode));
  });
  document.querySelectorAll('[data-quic-policy]').forEach((button) => {
    button.addEventListener('click', () => setQuicPolicy(button.dataset.quicPolicy));
  });
  document.querySelector('#snifferRouteOnly')?.addEventListener('change', (event) => {
    setSnifferDraft(currentSnifferSettings().mode, { routeOnly: event.target.checked });
  });
  document.querySelector('#snifferExcluded')?.addEventListener('change', (event) => {
    setSnifferDraft(currentSnifferSettings().mode, { excluded: event.target.value });
  });
  document.querySelector('#firewallPorts')?.addEventListener('input', (event) => {
    state.firewallPorts = event.target.value;
    localStorage.setItem(firewallPortsStorageKey, state.firewallPorts);
  });
  document.querySelectorAll('[data-firewall-port-mode]').forEach((button) => {
    button.addEventListener('click', () => setFirewallPortMode(button.dataset.firewallPortMode));
  });
  document.querySelector('#firewallBlockQuic')?.addEventListener('change', (event) => setFirewallBlockQuic(event.target.checked));
  document.querySelectorAll('[data-dns-mode]').forEach((button) => {
    button.addEventListener('click', () => setDnsModeDraft(button.dataset.dnsMode));
  });
  document.querySelectorAll('#routeKind').forEach((input) => input.addEventListener('change', (event) => {
    state.routeKind = event.target.value;
    render();
  }));
  document.querySelectorAll('#routeName').forEach((input) => input.addEventListener('input', (event) => {
    state.routeName = event.target.value;
  }));
  document.querySelectorAll('#routeValue').forEach((input) => input.addEventListener('input', (event) => {
    state.routeValue = event.target.value;
  }));
  document.querySelectorAll('[data-route-lease-ip]').forEach((button) => {
    button.addEventListener('click', () => {
      state.routeValue = button.dataset.routeLeaseIp || '';
      if (!state.routeName.trim() && button.dataset.routeLeaseName) state.routeName = button.dataset.routeLeaseName;
      render();
    });
  });
  document.querySelectorAll('[data-lease-search]').forEach((input) => {
    applyLeaseSearch(input.closest('.route-lease-picker, .panel') || document, input.value);
    input.addEventListener('input', (event) => {
      state.leaseSearch = event.target.value;
      applyLeaseSearch(input.closest('.route-lease-picker, .panel') || document, event.target.value);
    });
  });
  document.querySelectorAll('#routeOutbound').forEach((input) => input.addEventListener('change', (event) => {
    state.routeOutbound = event.target.value;
  }));
  document.querySelectorAll('#routeBalancer').forEach((input) => input.addEventListener('change', (event) => {
    state.routeBalancer = event.target.value;
  }));
  document.querySelector('#routeBalancerTag')?.addEventListener('input', (event) => {
    state.routeBalancerTag = event.target.value;
  });
  document.querySelector('#routeBalancerStrategy')?.addEventListener('change', (event) => {
    state.routeBalancerStrategy = event.target.value;
    render();
  });
  document.querySelectorAll('[data-balancer-selector]').forEach((input) => {
    input.addEventListener('change', (event) => {
      setRouteBalancerSelector(input.dataset.balancerSelector, event.target.checked);
      render();
    });
  });
  document.querySelectorAll('[data-balancer-selector-move]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      moveRouteBalancerSelector(button.dataset.balancerSelectorMove, Number(button.dataset.direction) || 0);
      render();
    });
  });
  document.querySelector('#routeBalancerFallback')?.addEventListener('change', (event) => {
    state.routeBalancerFallback = event.target.value;
  });
  document.querySelectorAll('[data-route-target-type]').forEach((button) => {
    button.addEventListener('click', () => {
      state.routeTargetType = button.dataset.routeTargetType;
      if (state.routeTargetType === 'balancer' && !state.routeBalancer) state.routeBalancer = balancerOptions()[0] || '';
      render();
    });
  });
  document.querySelectorAll('[data-route-rule-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.routeRuleMode = button.dataset.routeRuleMode;
      state.message = '';
      render();
    });
  });
  document.querySelector('#routeSearch')?.addEventListener('input', (event) => {
    state.routeSearch = event.target.value;
  });
  document.querySelector('#routeSearch')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') render();
  });
  document.querySelectorAll('#routeDslName').forEach((input) => input.addEventListener('input', (event) => {
    state.routeDslName = event.target.value;
  }));
  document.querySelectorAll('#routeDsl').forEach((input) => input.addEventListener('input', (event) => {
    state.routeDsl = event.target.value;
    state.routeDslPreview = null;
  }));
  document.querySelector('#routePresetEditTitle')?.addEventListener('input', (event) => {
    state.routePresetEditTitle = event.target.value;
  });
  document.querySelector('#routePresetEditDetail')?.addEventListener('input', (event) => {
    state.routePresetEditDetail = event.target.value;
  });
  document.querySelector('#routePresetEditDsl')?.addEventListener('input', (event) => {
    state.routePresetEditDsl = event.target.value;
    state.routePresetEditPreview = null;
    state.routePresetEditChecked = false;
  });
  document.querySelector('#deviceName')?.addEventListener('input', (event) => {
    state.deviceName = event.target.value;
  });
  document.querySelector('#deviceIp')?.addEventListener('input', (event) => {
    state.deviceIp = event.target.value;
  });
  document.querySelector('#deviceMode')?.addEventListener('change', (event) => {
    state.deviceMode = event.target.value;
  });
  document.querySelector('#dnsAddress')?.addEventListener('input', (event) => {
    state.dnsAddress = event.target.value;
  });
  document.querySelector('#dnsDomains')?.addEventListener('input', (event) => {
    state.dnsDomains = event.target.value;
  });
  document.querySelector('#dnsHostName')?.addEventListener('input', (event) => {
    state.dnsHostName = event.target.value;
  });
  document.querySelector('#dnsHostValue')?.addEventListener('input', (event) => {
    state.dnsHostValue = event.target.value;
  });
  document.querySelector('#dnsCheckHost')?.addEventListener('input', (event) => {
    state.dnsCheckHost = event.target.value;
  });
  document.querySelector('#lanDnsUpstream')?.addEventListener('input', (event) => {
    state.lanDnsUpstream = event.target.value;
    state.lanDnsPreview = null;
  });
  document.querySelector('#lanDnsRestart')?.addEventListener('change', (event) => {
    state.lanDnsRestart = event.target.checked;
    state.lanDnsPreview = null;
    render();
  });
  document.querySelector('#setupLanDnsUpstream')?.addEventListener('input', (event) => {
    state.setupLanDnsUpstream = event.target.value;
  });
  document.querySelector('#setupRestartDnsmasq')?.addEventListener('change', (event) => {
    state.setupRestartDnsmasq = event.target.checked;
    render();
  });
  document.querySelector('#diagnosticsTestUrl')?.addEventListener('input', (event) => {
    state.diagnosticsTestUrl = event.target.value;
  });
  document.querySelector('#clientTrafficUrl')?.addEventListener('input', (event) => {
    state.clientTrafficUrl = event.target.value;
  });
  document.querySelector('#serverCheckTimeout')?.addEventListener('input', (event) => {
    state.serverCheckTimeout = event.target.value;
  });
  document.querySelector('#serverCheckAttempts')?.addEventListener('input', (event) => {
    state.serverCheckAttempts = event.target.value;
  });
  document.querySelector('#serverCheckMode')?.addEventListener('change', (event) => {
    state.serverCheckMode = event.target.value;
    render();
  });
  document.querySelector('#serverCheckUrl')?.addEventListener('input', (event) => {
    state.serverCheckUrl = event.target.value;
  });
  document.querySelector('#observatoryCheckUrl')?.addEventListener('input', (event) => {
    state.serverCheckUrl = event.target.value;
  });
  document.querySelector('#observatoryInterval')?.addEventListener('input', (event) => {
    state.observatoryInterval = event.target.value;
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
  document.querySelector('#selectedCoreVersion')?.addEventListener('change', (event) => {
    state.selectedCoreVersion = event.target.value;
    render();
  });
  document.querySelector('#geoipUrl')?.addEventListener('input', (event) => {
    state.geoipUrl = event.target.value;
  });
  document.querySelector('#geositeUrl')?.addEventListener('input', (event) => {
    state.geositeUrl = event.target.value;
  });
  document.querySelector('#geoSourceName')?.addEventListener('input', (event) => {
    state.geoSourceName = event.target.value;
  });
  document.querySelector('#geoSourceKind')?.addEventListener('change', (event) => {
    state.geoSourceKind = event.target.value;
    render();
  });
  document.querySelector('#geoSourceGeoipUrl')?.addEventListener('input', (event) => {
    state.geoSourceGeoipUrl = event.target.value;
  });
  document.querySelector('#geoSourceGeositeUrl')?.addEventListener('input', (event) => {
    state.geoSourceGeositeUrl = event.target.value;
  });
  document.querySelector('#geoSourceUrl')?.addEventListener('input', (event) => {
    state.geoSourceUrl = event.target.value;
  });
  document.querySelector('#geoSourceTarget')?.addEventListener('input', (event) => {
    state.geoSourceTarget = event.target.value;
  });
  document.querySelector('#geoBackup')?.addEventListener('change', (event) => {
    state.geoBackup = event.target.checked;
    render();
  });
  document.querySelector('#geoScheduleEnabled')?.addEventListener('change', (event) => {
    state.geoScheduleEnabled = event.target.checked;
  });
  document.querySelector('#geoScheduleInterval')?.addEventListener('change', (event) => {
    state.geoScheduleInterval = event.target.value;
    render();
  });
  document.querySelector('#geoScheduleWeekday')?.addEventListener('change', (event) => {
    state.geoScheduleWeekday = event.target.value;
  });
  document.querySelector('#geoScheduleTime')?.addEventListener('input', (event) => {
    state.geoScheduleTime = event.target.value;
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
