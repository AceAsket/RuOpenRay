import { hiddenBuiltinRoutePresetKeys, labels, managedRouteTags, nav, routeBundles, routeKinds, routePlaceholders, routePresets, tabTitles } from './presets.js';
import { createApiClient } from './api-client.js';
import { createRefreshTimers, isAuthError, loadAppSnapshot } from './refresh.js';
import { createServersView } from './servers-view.js';
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

function normalizeCoreVersion(value = '') {
  const text = String(value || '');
  const explicit = text.match(/v?\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?/);
  return explicit ? explicit[0].replace(/^v/i, '') : '';
}

function versionParts(version = '') {
  return normalizeCoreVersion(version).split(/[.-]/).map((part) => Number.parseInt(part, 10)).filter((part) => Number.isFinite(part));
}

function compareCoreVersions(a = '', b = '') {
  const left = versionParts(a);
  const right = versionParts(b);
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function installedCoreVersion() {
  return normalizeCoreVersion(state.status?.core?.version || '');
}

function releaseDate(release) {
  const date = release?.publishedAt ? new Date(release.publishedAt) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'дата неизвестна';
}

function filteredCoreReleases() {
  const releases = state.coreReleases || [];
  if (state.coreReleaseFilter === 'stable') return releases.filter((release) => !release.prerelease);
  if (state.coreReleaseFilter === 'pre') return releases.filter((release) => release.prerelease);
  return releases;
}

function coreUpdateInfo() {
  const installed = installedCoreVersion();
  const installable = state.coreReleases.filter((release) => release.assetUrl);
  const latestStable = installable.find((release) => !release.prerelease);
  const latestAny = installable[0];
  const target = latestStable || latestAny;
  const current = installed ? `v${installed}` : '';
  const targetVersion = target?.tag || '';
  const hasUpdate = Boolean(targetVersion && (!installed || compareCoreVersions(targetVersion, installed) > 0));
  return { installed, current, target, latestStable, latestAny, hasUpdate };
}

function coreReleaseBadge(release) {
  if (release.prerelease) return '<span class="release-badge pre">Pre-release</span>';
  return '<span class="release-badge stable">Stable</span>';
}

function appVersionPill() {
  const app = state.status?.app || {};
  const version = app.version || 'dev';
  const release = state.appRelease || {};
  const hasUpdate = Boolean(release.update && release.assetUrl);
  const target = release.tag || '';
  const title = state.appReleaseChecking
    ? 'Проверяю обновления RuOpenRay UI'
    : hasUpdate
      ? `Доступно обновление RuOpenRay UI: ${version} → ${target}`
      : `RuOpenRay UI ${version}. Нажмите, чтобы проверить обновления`;
  const label = hasUpdate ? `RuOpenRay ${version} → ${target}` : `RuOpenRay ${version}`;
  return `<button class="pill app-version-pill ${hasUpdate ? 'has-update' : ''} ${state.appReleaseChecking ? 'checking' : ''}" type="button" data-action="appVersionClick" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
    <i class="dot ${hasUpdate ? 'warn' : 'ok'}"></i>${escapeHtml(state.appReleaseChecking ? 'Проверяю...' : label)}
  </button>`;
}

function coreArchitectureText() {
  const arch = state.coreArch || {};
  const runtimeArch = [arch.goos || arch.platform, arch.goarch || arch.arch].filter(Boolean).join('/');
  const packageArch = arch.packageArch ? `пакет: ${arch.packageArch}` : '';
  const uname = arch.uname ? `ядро: ${arch.uname}` : '';
  const asset = state.coreAsset || arch.githubAsset || '';
  return [
    runtimeArch ? `runtime: ${runtimeArch}` : '',
    packageArch,
    uname,
    asset ? `GitHub: ${asset}` : ''
  ].filter(Boolean).join(' · ') || 'Архитектура будет определена перед установкой.';
}

function githubInstallCommand(withXray = false) {
  const env = [`RUOPENRAY_PASSWORD=${shellQuote(state.installPassword || 'admin')}`];
  if (withXray) env.push('RUOPENRAY_INSTALL_XRAY=1');
  return `${env.join(' ')} sh -c "$(wget -O - https://raw.githubusercontent.com/AceAsket/RuOpenRay/main/scripts/install-openwrt.sh)"`;
}

function setupFlowStep(id, title, detail, ok, actionLabel, attrs = '') {
  return `<article class="setup-flow-step ${ok ? 'ok' : ''}">
    <span>${ok ? '✓' : id}</span>
    <div>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
    ${actionLabel ? `<button class="btn secondary" type="button" ${attrs}>${escapeHtml(actionLabel)}</button>` : ''}
  </article>`;
}

function setupFlowGuide(readiness) {
  const xrayReady = state.status?.core?.available;
  const dnsReady = Boolean(state.lanDnsStatus?.ok && state.lanDnsStatus?.mode === 'xray' && state.lanDnsStatus?.readiness?.ready);
  const fwReady = firewallReadyStatus(state.firewallStatus || {});
  const statsReady = Boolean(state.status?.xrayStats?.enabled);
  return `
    <section class="setup-flow-guide">
      <div>
        <h3>Порядок настройки</h3>
        <p>Этот мастер собирает самостоятельный режим RuOpenRay: ядро, DNS, перехват и проверку трафика. Если что-то пойдет не так, ниже есть откат снимка.</p>
      </div>
      <div class="setup-flow-grid">
        ${setupFlowStep('1', 'Установить основу', xrayReady ? 'Xray найден. Можно продолжать.' : 'Поставьте Xray и зависимости OpenWrt 24/25.', xrayReady, 'Открыть установку', 'data-action="openInstallWizard"')}
        ${setupFlowStep('2', 'Настроить DNS', dnsReady ? 'dnsmasq → Xray DNS.' : 'Подготовьте DNS inbound и направьте LAN DNS в 127.0.0.1#5353 или внешний Pi-hole.', dnsReady, 'DNS', 'data-tab-jump="dns"')}
        ${setupFlowStep('3', 'Включить перехват', fwReady ? 'nftables и policy routing активны.' : 'Выберите TPROXY/REDIRECT, устройства и порты, затем примените firewall.', fwReady, 'Перехват', 'data-tab-jump="routing" data-routing-view-jump="intercept"')}
        ${setupFlowStep('4', 'Проверить трафик', statsReady ? 'Статистика Xray включена.' : 'Включите статистику Xray и проверьте рост счетчиков с LAN-устройства.', statsReady, 'Диагностика', 'data-tab-jump="diagnostics" data-diagnostics-jump="chain"')}
      </div>
      ${!readiness.canApply ? '<p class="settings-warning compact"><strong>Перед включением</strong><span>Закройте красные пункты готовности выше: мастер не применяет рискованную схему вслепую.</span></p>' : ''}
    </section>
  `;
}

function setupWizardDialog() {
  if (!state.setupWizardOpen) return '';
  const readiness = setupReadiness();
  const result = state.setupResult;
  const rollback = state.setupRollbackResult;
  const snapshot = loadSetupSnapshot();
  const installPlan = state.installPlan;
  const diskFree = state.geoStatus?.disk?.free || state.status?.system?.disk?.free || installPlan?.disk?.free;
  return `
    <div class="modal-backdrop" data-action="closeSetupWizard">
      <section class="modal setup-wizard-modal" role="dialog" aria-modal="true" aria-labelledby="setupWizardTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="setupWizardTitle">Мастер активации RuOpenRay</h2>
            <p>Проверяет основу и включает самостоятельный режим: Xray, geo, transparent inbound, nftables и DNS для LAN.</p>
          </div>
          <button class="icon-btn" type="button" data-action="closeSetupWizard" aria-label="Закрыть">×</button>
        </div>

        <div class="setup-readiness">
          ${readiness.items.map((item) => `<article class="${item.ok ? 'ok' : item.warn ? 'warn' : 'bad'}">
            <span>${item.ok ? '✓' : item.warn ? '!' : '×'}</span>
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.detail)}</small>
            </div>
          </article>`).join('')}
        </div>

        ${setupFlowGuide(readiness)}

        <div class="setup-choice-grid">
          <article>
            <span>Свободное место</span>
            <strong>${escapeHtml(byteSize(diskFree))}</strong>
            <small>${diskFree && diskFree < 16 * 1024 * 1024 ? 'Мало места: выбирайте компактные geo и без бэкапов.' : 'Для слабых роутеров всё равно лучше держать запас.'}</small>
          </article>
          <article>
            <span>Режим перехвата</span>
            <strong>${escapeHtml(state.firewallRouterMode.toUpperCase())}</strong>
            <small>${state.firewallRouterMode === 'redirect' ? 'TCP-only режим, проще, но без UDP.' : 'TPROXY для TCP/UDP transparent proxy.'}</small>
          </article>
          <article>
            <span>Порты</span>
            <strong>${state.firewallPortMode === 'all' ? 'Все' : escapeHtml(firewallPorts().join(', ') || '80, 443')}</strong>
            <small>${state.firewallBlockQuic ? 'UDP/443 будет заблокирован.' : 'QUIC не блокируется.'}</small>
          </article>
        </div>

        <section class="setup-lan-dns">
          <div>
            <h3>LAN DNS / dnsmasq</h3>
            <p>Можно оставить OpenWrt DNS как есть, направить устройства в Xray DNS или указать внешний DNS/Pi-hole.</p>
          </div>
          <div class="segmented setup-dns-modes">
            ${[
              ['keep', 'Не трогать'],
              ['xray', 'Через Xray'],
              ['upstream', 'Внешний DNS']
            ].map(([mode, label]) => `<button type="button" class="${state.setupLanDnsMode === mode ? 'active' : ''}" data-setup-dns-mode="${mode}">${label}</button>`).join('')}
          </div>
          ${state.setupLanDnsMode === 'upstream' ? `<div class="form-row">
            <label>DNS / Pi-hole</label>
            <input id="setupLanDnsUpstream" value="${escapeHtml(state.setupLanDnsUpstream)}" placeholder="192.168.1.10 или 192.168.1.10:53" />
          </div>` : ''}
          <label class="toggle-row">
            <input id="setupRestartDnsmasq" type="checkbox" ${state.setupRestartDnsmasq ? 'checked' : ''} />
            <span>Перезапустить dnsmasq после изменения</span>
          </label>
        </section>

        <section class="setup-snapshot">
          <div>
            <h3>Откат мастера</h3>
            <p>${snapshot?.createdAt ? `Есть снимок от ${escapeHtml(new Date(snapshot.createdAt).toLocaleString('ru-RU'))}: конфигурация Xray, LAN DNS и nftables.` : 'Перед включением активного режима мастер сохранит снимок текущего состояния.'}</p>
          </div>
          <div class="split-actions">
            <button class="btn secondary" type="button" data-action="rollbackSetupWizard" ${snapshot && !state.setupApplying && !state.setupRollbacking ? '' : 'disabled'}>${state.setupRollbacking ? 'Откатываю...' : 'Откатить изменения мастера'}</button>
            <button class="btn secondary" type="button" data-action="clearSetupSnapshot" ${snapshot && !state.setupApplying && !state.setupRollbacking ? '' : 'disabled'}>Забыть снимок</button>
          </div>
        </section>

        ${result ? `<div class="setup-result ${result.ok ? 'ok' : 'bad'}">
          <strong>${result.ok ? 'Готово' : 'Нужна проверка'}</strong>
          ${result.error ? `<span>${escapeHtml(result.error)}</span>` : ''}
          <div class="setup-result-list">
            ${(result.steps || []).map((step) => `<article class="${step.ok ? 'ok' : 'bad'}">
              <span>${step.ok ? '✓' : '×'}</span>
              <div><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.detail || '')}</small></div>
            </article>`).join('')}
          </div>
        </div>` : ''}

        ${rollback ? `<div class="setup-result ${rollback.ok ? 'ok' : 'bad'}">
          <strong>${rollback.ok ? 'Откат выполнен' : 'Откат требует внимания'}</strong>
          ${rollback.error ? `<span>${escapeHtml(rollback.error)}</span>` : ''}
          <div class="setup-result-list">
            ${(rollback.steps || []).map((step) => `<article class="${step.ok ? 'ok' : 'bad'}">
              <span>${step.ok ? '✓' : '×'}</span>
              <div><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.detail || '')}</small></div>
            </article>`).join('')}
          </div>
        </div>` : ''}

        <div class="setup-actions">
          <button class="btn secondary" type="button" data-action="openInstallWizard">Установка Xray</button>
          <button class="btn secondary" type="button" data-tab-jump="geo">Geo-файлы</button>
          <button class="btn secondary" type="button" data-tab-jump="firewall">Перехват</button>
          <button class="btn" type="button" data-action="setupPrepareDraft" ${state.setupApplying ? 'disabled' : ''}>Подготовить черновик</button>
          <button class="btn warning" type="button" data-action="runSetupWizard" ${state.setupApplying || !readiness.canApply ? 'disabled' : ''}>${state.setupApplying ? 'Включаю...' : 'Включить активный режим'}</button>
        </div>
      </section>
    </div>
  `;
}

function installWizardDialog() {
  if (!state.installWizardOpen) return '';
  const plan = state.installPlan;
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const installing = state.coreUpdating || state.installStep === 'installing';
  const geoReady = Boolean(plan?.geo?.geoip?.exists && plan?.geo?.geosite?.exists);
  const canInstall = Boolean(plan?.installable) || !plan;
  const storage = plan?.storage || {};
  const installCommand = githubInstallCommand(false);
  const installWithXrayCommand = githubInstallCommand(true);
  return `
    <div class="modal-backdrop" data-action="closeInstallWizard">
      <section class="modal install-wizard" role="dialog" aria-modal="true" aria-labelledby="installWizardTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="installWizardTitle">Установка Xray на OpenWrt</h2>
            <p>Проверяем окружение роутера: пакетный менеджер, архитектуру, свободное место, geo-файлы и init-сервис.</p>
          </div>
          <button class="icon-btn" type="button" data-action="closeInstallWizard" aria-label="Закрыть">×</button>
        </div>
        <div class="install-steps">
          ${steps.length ? steps.map((step) => `<article class="${step.ok ? 'ok' : 'warn'}">
            <span>${step.ok ? '✓' : '!'}</span>
            <div>
              <strong>${escapeHtml(step.title)}</strong>
              <small>${escapeHtml(step.detail || '')}</small>
            </div>
          </article>`).join('') : '<p class="muted">Загружаю план установки...</p>'}
        </div>
        <div class="install-summary">
          <article><span>Пакетный менеджер</span><strong>${escapeHtml(plan?.packageManager || 'проверяем')}</strong></article>
          <article><span>Архитектура</span><strong>${escapeHtml(plan?.arch?.uname || plan?.arch?.goarch || 'проверяем')}</strong></article>
          <article><span>Свободно</span><strong>${escapeHtml(plan?.disk?.free ? byteSize(plan.disk.free) : 'проверяем')}</strong></article>
          <article><span>Geo-файлы</span><strong>${geoReady ? 'готовы' : 'после установки'}</strong></article>
        </div>
        <section class="install-command-card">
          <div>
            <strong>Установка одной командой с GitHub</strong>
            <span>Команда определит OpenWrt 24/25, пакетный менеджер, архитектуру, поставит зависимости TPROXY и скачает подходящий бинарник RuOpenRay.</span>
          </div>
          <label>
            Пароль панели
            <input id="installPassword" value="${escapeHtml(state.installPassword)}" autocomplete="new-password" />
          </label>
          <pre id="installCommandBasic" class="console compact">${escapeHtml(installCommand)}</pre>
          <pre id="installCommandWithXray" class="console compact">${escapeHtml(installWithXrayCommand)}</pre>
          <div class="split-actions">
            <button class="btn secondary" type="button" data-action="copyInstallCommand">Скопировать базовую</button>
            <button class="btn secondary" type="button" data-action="copyInstallWithXrayCommand">Скопировать с Xray</button>
            <small>Этот пароль уже встроен в обе команды как <code>RUOPENRAY_PASSWORD</code>. Вторая команда дополнительно ставит <code>xray-core</code>.</small>
          </div>
        </section>
        <div class="nand-plan ${storage.leanOk === false ? 'danger' : ''}">
          <div>
            <strong>NAND-friendly профиль</strong>
            <span>${escapeHtml(storage.recommendedMode || 'Без лишних бэкапов, компактные geo и контроль свободного места.')}</span>
          </div>
          <div class="nand-plan-grid">
            <article><span>Панель</span><strong>${escapeHtml(byteSize(storage.panelSize))}</strong></article>
            <article><span>Xray</span><strong>${escapeHtml(byteSize(storage.xraySize || 30 * 1024 * 1024))}</strong></article>
            <article><span>Geo сейчас</span><strong>${escapeHtml(byteSize(storage.geoCurrent))}</strong></article>
            <article><span>Бэкапы</span><strong>${escapeHtml(byteSize(storage.backupCurrent))}</strong></article>
            <article><span>Минимум нужно</span><strong>${escapeHtml(byteSize(storage.leanRequired))}</strong></article>
            <article><span>Полный geo</span><strong>${escapeHtml(byteSize(storage.fullRequired))}</strong></article>
          </div>
        </div>
        <div class="settings-warning">
          <strong>Порядок</strong>
          <span>Сначала ставим xray-core через пакетный менеджер OpenWrt. Затем обновляем geo-файлы, чтобы правила geosite/geoip проходили проверку конфигурации.</span>
        </div>
        <div class="toolbar">
          <button class="btn secondary" type="button" data-action="refreshInstallPlan" ${installing ? 'disabled' : ''}>Проверить заново</button>
          <button class="btn warning" type="button" data-action="installCorePackage" ${installing || !canInstall ? 'disabled' : ''}>${installing ? 'Устанавливаю...' : 'Установить Xray'}</button>
          <button class="btn secondary" type="button" data-tab-jump="geo">Geo-файлы</button>
        </div>
        ${state.coreUpdate ? `<div class="core-result">
          <strong>${state.coreUpdate.ok ? 'Готово' : 'Ошибка'} · ${escapeHtml(state.coreUpdate.packageManager || '')}</strong>
          <span>${escapeHtml(state.coreUpdate.after || state.coreUpdate.stderr || state.coreUpdate.stdout || '')}</span>
        </div>` : ''}
      </section>
    </div>
  `;
}

function coreUpdateDialog() {
  if (!state.coreDialogOpen) return '';
  const releases = filteredCoreReleases();
  const visibleReleases = releases.slice(0, 8);
  const info = coreUpdateInfo();
  const missing = !state.status?.core?.available;
  const selectedInstalled = !missing && state.selectedCoreVersion && info.current === state.selectedCoreVersion;
  const canInstallSelected = Boolean(state.selectedCoreVersion && !selectedInstalled);
  return `
    <div class="modal-backdrop" data-action="closeCoreDialog">
      <section class="modal core-dialog" role="dialog" aria-modal="true" aria-labelledby="coreDialogTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="coreDialogTitle">${missing ? 'Установка Xray' : 'Обновление ядра Xray'}</h2>
            <span>${escapeHtml(info.current || 'текущая версия не определена')} → ${escapeHtml(state.selectedCoreVersion || info.target?.tag || 'выберите релиз')}</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeCoreDialog" aria-label="Закрыть">×</button>
        </div>
        <div class="core-update-banner ${info.hasUpdate ? 'has-update' : ''}">
          <strong>${missing ? 'Xray не установлен' : info.hasUpdate ? 'Есть обновление' : 'Актуальная стабильная версия уже установлена'}</strong>
          <span>${missing ? 'Для OpenWrt проще начать с пакета xray-core из репозитория, а версии из GitHub оставить для ручного выбора.' : info.target ? `${info.target.prerelease ? 'Последний pre-release' : 'Последний stable'}: ${escapeHtml(info.target.tag)} · ${releaseDate(info.target)}` : 'Релизы пока не загружены'}</span>
        </div>
        <div class="core-arch-strip">
          <strong>Архитектура</strong>
          <span>${escapeHtml(coreArchitectureText())}</span>
        </div>
        ${missing ? `<div class="core-install-card">
          <div>
            <strong>Пакет OpenWrt</strong>
            <span>OpenWrt 25: <code>apk</code>, OpenWrt 24: <code>opkg</code>. Перед установкой backend сверит архитектуру системы и пакетного репозитория.</span>
          </div>
          <button class="btn" type="button" data-action="openInstallWizard" ${state.coreUpdating ? 'disabled' : ''}>${state.coreUpdating ? 'Устанавливаю...' : 'Открыть мастер'}</button>
        </div>` : ''}
        <div class="segmented core-filters" aria-label="Фильтр релизов">
          ${[
            ['stable', 'Stable'],
            ['pre', 'Pre-release']
          ].map(([value, label]) => `<button type="button" class="${state.coreReleaseFilter === value ? 'active' : ''}" data-core-filter="${value}">${label}</button>`).join('')}
        </div>
        <div class="core-dialog-list">
          ${visibleReleases.map((release) => `<button type="button" class="core-dialog-release ${state.selectedCoreVersion === release.tag ? 'active' : ''} ${release.prerelease ? 'is-pre' : ''}" data-core-version="${escapeHtml(release.tag)}" ${release.assetUrl ? '' : 'disabled'}>
            <div>
              <strong>${escapeHtml(release.tag)}</strong>
              <span>${escapeHtml(release.name || release.tag)} · ${releaseDate(release)}</span>
            </div>
            ${release.assetUrl ? '' : '<em class="core-release-missing">нет сборки</em>'}
          </button>`).join('') || '<p class="muted">Для выбранного фильтра релизов нет.</p>'}
          ${releases.length > visibleReleases.length ? `<p class="muted core-release-limit">Показаны последние ${visibleReleases.length} из ${releases.length} релизов в выбранном фильтре.</p>` : ''}
        </div>
        <div class="modal-actions">
          <div class="core-install-options">
            <p class="muted">Pre-release версии могут быть нестабильными. После установки RuOpenRay перезапустит Xray.</p>
            <label class="toggle-row">
              <input id="coreBackup" type="checkbox" ${state.coreBackup ? 'checked' : ''} />
              <span>Сохранить бэкап текущего бинарника Xray перед заменой</span>
            </label>
            <small class="muted">Бэкап занимает место примерно как сам бинарник Xray. На маленьком NAND лучше включать только перед рискованной установкой.</small>
          </div>
          <button class="btn warning" type="button" data-action="updateCore" ${state.coreUpdating || !canInstallSelected ? 'disabled' : ''}>${state.coreUpdating ? 'Устанавливаю...' : selectedInstalled ? 'Установлено' : 'Установить'}</button>
        </div>
        ${state.coreUpdate ? `<div class="core-result">
          <strong>${state.coreUpdate.ok ? 'Готово' : 'Ошибка'} · ${escapeHtml(state.coreUpdate.packageManager || 'пакетный менеджер')}</strong>
          <span>${escapeHtml(state.coreUpdate.before || 'до: неизвестно')} → ${escapeHtml(state.coreUpdate.after || 'после: неизвестно')}</span>
          ${state.coreUpdate.stdout || state.coreUpdate.stderr ? `<pre>${escapeHtml(state.coreUpdate.stdout || state.coreUpdate.stderr).slice(0, 1600)}</pre>` : ''}
        </div>` : ''}
      </section>
    </div>
  `;
}

function dashboard() {
  const s = state.status || {};
  const c = s.config || {};
  const routes = routeStats();
  const devices = deviceStats();
  const dns = dnsStats();
  const serviceRunning = Boolean(s.service?.running);
  const coreReady = Boolean(s.core?.available);
  const coreInfo = coreUpdateInfo();
  const activeConfig = s.config?.path || 'config.json';
  const proxyServers = proxyOutbounds();
  return `
    <section class="dash-hero ${serviceRunning ? 'is-ok' : 'is-warn'}">
      <div class="dash-status">
        <span class="eyebrow">Ресурсы роутера</span>
        ${dashboardSystemStats(s.system)}
        ${state.message ? `<p class="notice dash-notice">${escapeHtml(state.message)}</p>` : ''}
      </div>
      <div class="dash-actions">
        <button class="btn secondary" data-action="openSetupWizard">Мастер</button>
        <button class="btn" data-action="test">Проверить</button>
        <button class="btn warning" data-action="apply">Сохранить и применить</button>
      </div>
    </section>

    ${xrayCoreDashboard(s, coreReady, coreInfo)}

    <section class="flow-strip">
      ${flowStep('Устройства', deviceRules().length || state.leases.length, `${devices.proxy} через proxy`)}
      ${flowStep('Маршруты', c.routingRules ?? 0, `proxy ${routes.proxy} / direct ${routes.direct}`)}
      ${flowStep('Proxy', proxyServers.length, proxyServers[0] ? outboundAddress(proxyServers[0]) : 'не добавлен')}
      ${flowStep('DNS', dns.servers, dns.doh ? `${dns.doh} DoH` : 'системный')}
    </section>

    <div class="dashboard-layout">
      <div>
        <section class="panel">
          ${dashboardServerSwitch(proxyServers)}
        </section>
        <section class="panel config-panel ${state.configExpanded ? 'is-open' : ''}">
          <div class="panel-title">
            <div><h2>Активная конфигурация</h2><span>JSON-редактор остается под рукой, но больше не забирает главный экран на себя.</span></div>
            <div class="split-actions">
              <button class="btn secondary" data-action="toggleConfig">${state.configExpanded ? 'Свернуть' : 'Показать JSON'}</button>
              <button class="btn secondary" data-action="saveProfile">Сохранить профиль</button>
            </div>
          </div>
          ${state.configExpanded ? `<textarea id="jsonDraft" spellcheck="false">${escapeHtml(state.jsonDraft)}</textarea>` : `<p class="muted config-summary">${escapeHtml(activeConfig)} · ${c.inbounds ?? 0} входящих · ${c.outbounds ?? 0} исходящих · ${c.routingRules ?? 0} правил</p>`}
        </section>
      </div>
      <aside>
        ${logsPanel(true)}
      </aside>
    </div>
  `;
}

function stat(label, value, detail) {
  return `<article class="stat"><span>${label}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}

function dashboardSystemStats(system = {}) {
  const cpu = system.cpu || {};
  const memory = system.memory || {};
  const tcp = system.tcp || {};
  const conntrack = system.conntrack || {};
  const disk = system.disk || {};
  const traffic = system.traffic || {};
  const uptime = system.uptime || 0;
  const cpuValue = cpu.percent === null || cpu.percent === undefined ? (cpu.load1 || '—') : `${cpu.percent}%`;
  const cpuDetail = `load ${cpu.load1 || '—'} / ${cpu.load5 || '—'} / ${cpu.load15 || '—'}`;
  const memoryValue = memory.usedPercent || memory.usedPercent === 0 ? `${memory.usedPercent}%` : '—';
  const memoryDetail = `${byteSize(memory.available)} свободно`;
  const tcpValue = tcp.established || tcp.established === 0 ? tcp.established : '—';
  const sessionsValue = `${tcpValue}/${conntrack.ok ? (conntrack.udp || 0) : '—'}`;
  const sessionsDetail = `TCP активно / UDP conntrack`;
  const diskValue = disk.ok === false ? '—' : byteSize(disk.free);
  const diskDetail = disk.ok === false ? 'раздел не проверен' : `${disk.usedPercent || '—'} занято · ${disk.label || disk.path || '/'}`;
  return `
    <div class="router-health-metrics">
      ${metricStat('chip', 'CPU', cpuValue, cpuDetail)}
      ${metricStat('memory', 'RAM', memoryValue, memoryDetail)}
      ${metricStat('uptime', 'Аптайм', fmtUptime(uptime), 'роутер работает')}
      ${metricStat('storage', 'Место', diskValue, diskDetail)}
      ${metricStat('sessions', 'TCP/UDP', sessionsValue, sessionsDetail)}
      ${trafficMetricStat(traffic)}
    </div>
  `;
}

function trafficSeriesPath(samples, key, maxValue, width = 320, height = 104) {
  if (!samples.length || maxValue <= 0) return '';
  const step = samples.length > 1 ? width / (samples.length - 1) : width;
  return samples.map((sample, index) => {
    const x = Math.round(index * step * 10) / 10;
    const y = Math.round((height - (Math.min(maxValue, sample[key] || 0) / maxValue) * height) * 10) / 10;
    return `${index ? 'L' : 'M'}${x},${y}`;
  }).join(' ');
}

function trafficAreaPath(samples, key, maxValue, width = 320, height = 104) {
  const line = trafficSeriesPath(samples, key, maxValue, width, height);
  if (!line) return '';
  return `${line} L${width},${height} L0,${height} Z`;
}

function trafficMonitor(system = {}) {
  const traffic = system.traffic || {};
  const memory = system.memory || {};
  const conntrack = system.conntrack || {};
  const samples = state.trafficHistory.length ? state.trafficHistory : [{
    rxRate: numberValue(traffic.rxRate),
    txRate: numberValue(traffic.txRate)
  }];
  const maxRate = Math.max(1024, ...samples.map((sample) => Math.max(sample.rxRate || 0, sample.txRate || 0)));
  const yTicks = [maxRate, maxRate * 0.75, maxRate * 0.5, maxRate * 0.25, 0];
  const rxArea = trafficAreaPath(samples, 'rxRate', maxRate);
  const txLine = trafficSeriesPath(samples, 'txRate', maxRate);
  const rxLine = trafficSeriesPath(samples, 'rxRate', maxRate);
  const totalConnections = conntrack.ok ? conntrack.total : ((system.tcp?.total || 0) + (conntrack.udp || 0));
  return `
    <details class="traffic-monitor" open>
      <summary>
        <span>Монитор трафика</span>
        <strong>${escapeHtml(byteRate(traffic.rxRate))} прием · ${escapeHtml(byteRate(traffic.txRate))} отдача</strong>
      </summary>
      <div class="traffic-chart">
        <div class="traffic-y-axis">
          ${yTicks.map((tick) => `<span>${escapeHtml(byteRate(tick))}</span>`).join('')}
        </div>
        <svg viewBox="0 0 320 104" preserveAspectRatio="none" aria-label="График скорости трафика">
          <g class="traffic-grid">
            <path d="M0 0H320M0 26H320M0 52H320M0 78H320M0 104H320"></path>
          </g>
          ${rxArea ? `<path class="traffic-area-down" d="${rxArea}"></path>` : ''}
          ${rxLine ? `<path class="traffic-line-down" d="${rxLine}"></path>` : ''}
          ${txLine ? `<path class="traffic-line-up" d="${txLine}"></path>` : ''}
        </svg>
      </div>
      <div class="traffic-legend">
        <span><b class="down"></b>Скачивание</span>
        <span><b class="up"></b>Отдача</span>
      </div>
      <div class="traffic-details-grid">
        <article><span>Соединения</span><strong>${escapeHtml(totalConnections || '—')}</strong></article>
        <article><span>Память</span><strong>${escapeHtml(byteSize(memory.used))}</strong></article>
        <article><span>Скачано</span><strong>${escapeHtml(byteSize(traffic.rxBytes))}</strong></article>
        <article><span>Скачивание сейчас</span><strong>${escapeHtml(byteRate(traffic.rxRate))}</strong></article>
        <article><span>Отдано</span><strong>${escapeHtml(byteSize(traffic.txBytes))}</strong></article>
        <article><span>Отдача сейчас</span><strong>${escapeHtml(byteRate(traffic.txRate))}</strong></article>
      </div>
    </details>
  `;
}

function xrayStatsGroupLabel(key) {
  const labels = {
    proxy: 'Через proxy',
    direct: 'Напрямую',
    block: 'Блокировка',
    system: 'Системные',
    other: 'Другое'
  };
  return labels[key] || key;
}

function xrayStatsSeriesPath(samples, key, maxValue, width = 320, height = 92) {
  if (!samples.length || maxValue <= 0) return '';
  const step = samples.length > 1 ? width / (samples.length - 1) : width;
  return samples.map((sample, index) => {
    const x = Math.round(index * step * 10) / 10;
    const y = Math.round((height - (Math.min(maxValue, sample[key] || 0) / maxValue) * height) * 10) / 10;
    return `${index ? 'L' : 'M'}${x},${y}`;
  }).join(' ');
}

function xrayActiveStats(stats = {}) {
  const outbounds = Array.isArray(stats.outbounds) ? stats.outbounds : [];
  const active = state.activeServerTag || activeProxyTag();
  return outbounds.find((item) => item.tag === active) || outbounds.find((item) => item.kind === 'proxy') || null;
}

function xrayStatsOutboundConfig(tag) {
  return configOutbounds().find((outbound) => outbound?.tag === tag) || null;
}

function xrayStatsOutbound(tag, stats = state.status?.xrayStats || {}) {
  if (!stats.enabled || !Array.isArray(stats.outbounds)) return null;
  return stats.outbounds.find((item) => item.tag === tag) || null;
}

function xrayStatsTotals(stats = {}) {
  const outbounds = Array.isArray(stats.outbounds) ? stats.outbounds : [];
  const source = outbounds.length ? outbounds : Object.values(stats.groups || {});
  return source.reduce((total, item) => ({
    downlink: total.downlink + numberValue(item?.downlink),
    uplink: total.uplink + numberValue(item?.uplink),
    downRate: total.downRate + numberValue(item?.downRate),
    upRate: total.upRate + numberValue(item?.upRate)
  }), { downlink: 0, uplink: 0, downRate: 0, upRate: 0 });
}

function xrayStatsPeriodLabel() {
  if (state.xrayStatsResetAt) {
    return `с последнего сброса ${new Date(state.xrayStatsResetAt).toLocaleString('ru-RU')}`;
  }
  return 'с начала запуска Xray';
}

function xrayDashboardStats(stats = state.status?.xrayStats || {}) {
  if (stats.enabled !== true) return '';
  const totals = xrayStatsTotals(stats);
  const groups = stats.groups || {};
  const active = xrayActiveStats(stats);
  return `
    <section class="xray-dashboard-strip">
      <article>
        <span>Активный сервер</span>
        <strong>${escapeHtml(active?.tag || 'не выбран')}</strong>
        <small>${escapeHtml(active ? `прием ${byteRate(active.downRate)} · отдача ${byteRate(active.upRate)}` : 'нет данных')}</small>
      </article>
      <article>
        <span>Через proxy</span>
        <strong>${escapeHtml(byteSize(groups.proxy?.downlink))} принято</strong>
        <small>${escapeHtml(`прием ${byteRate(groups.proxy?.downRate)} · отдача ${byteRate(groups.proxy?.upRate)}`)}</small>
      </article>
      <article>
        <span>Напрямую / блокировка</span>
        <strong>${escapeHtml(byteSize(groups.direct?.downlink))} · ${escapeHtml(byteSize(groups.block?.downlink))}</strong>
        <small>${escapeHtml(`всего сейчас: прием ${byteRate(totals.downRate)} · отдача ${byteRate(totals.upRate)}`)}</small>
      </article>
      <article>
        <span>Период</span>
        <strong>${escapeHtml(byteSize(totals.downlink))} принято</strong>
        <small>${escapeHtml(xrayStatsPeriodLabel())}</small>
      </article>
    </section>
  `;
}

function xrayCoreDashboard(status = state.status || {}, available, info) {
  const detail = status.core?.version || 'xray не проверен';
  const latestText = info.target
    ? `${info.target.prerelease ? 'Последний pre-release' : 'Последний stable'}: ${escapeHtml(info.target.tag)} · ${releaseDate(info.target)}`
    : 'Список релизов не загружен';
  const coreStatus = !available ? 'Нужно установить' : info.hasUpdate ? 'Есть обновление' : 'Stable актуален';
  const stats = status.xrayStats || {};
  const statsEnabled = stats.enabled === true;
  const totals = xrayStatsTotals(stats);
  const groups = stats.groups || {};
  const active = xrayActiveStats(stats);
  const activeAddress = active?.tag ? outboundAddress(xrayStatsOutboundConfig(active.tag)) : '';
  const directBlockText = `${byteSize(groups.direct?.downlink)} напрямую · ${byteSize(groups.block?.downlink)} блокировка`;
  return `
    <section class="panel xray-core-card ${info.hasUpdate ? 'has-update' : ''}">
      <div class="xray-core-head">
        <div>
          <span class="eyebrow">Xray</span>
          <h2>${available ? labels.available : labels.missing}</h2>
          <p>${escapeHtml(detail)}</p>
        </div>
        <div class="core-stat-tools">
          ${info.target ? coreReleaseBadge(info.target) : ''}
          <button class="core-icon-action" type="button" data-action="${available ? 'openCoreDialog' : 'openInstallWizard'}" ${state.coreUpdating ? 'disabled' : ''} title="${available ? 'Выбрать версию Xray' : 'Установить Xray'}" aria-label="${available ? 'Выбрать версию Xray' : 'Установить Xray'}">⚙</button>
        </div>
      </div>
      <div class="xray-core-status">
        <strong>${escapeHtml(coreStatus)}</strong>
        <span>${latestText}</span>
      </div>
      ${state.coreUpdate ? `<small class="core-stat-result">${state.coreUpdate.ok ? 'Готово' : 'Ошибка'} · ${escapeHtml(state.coreUpdate.after || state.coreUpdate.stderr || '')}</small>` : ''}
      <div class="xray-core-metrics">
        <article>
          <span>Активный сервер</span>
          <strong>${escapeHtml(active?.tag || activeProxyTag() || 'не выбран')}</strong>
          <small>${escapeHtml(statsEnabled && active ? `${activeAddress || 'outbound'} · ${byteRate(active.downRate)} прием · ${byteRate(active.upRate)} отдача` : 'статистика Xray выключена')}</small>
        </article>
        <article>
          <span>Proxy-трафик</span>
          <strong>${escapeHtml(statsEnabled ? `${byteSize(groups.proxy?.downlink)} принято` : 'нет данных')}</strong>
          <small>${escapeHtml(statsEnabled ? `${byteRate(groups.proxy?.downRate)} прием · ${byteRate(groups.proxy?.upRate)} отдача` : 'включается в диагностике или кнопкой ниже')}</small>
        </article>
        <article>
          <span>Напрямую / блокировка</span>
          <strong>${escapeHtml(statsEnabled ? directBlockText : 'нет данных')}</strong>
          <small>${escapeHtml(statsEnabled ? `${byteRate(totals.downRate)} прием всего · ${byteRate(totals.upRate)} отдача всего` : 'без учета трафика по outbound')}</small>
        </article>
        <article>
          <span>Период</span>
          <strong>${escapeHtml(statsEnabled ? `${byteSize(totals.downlink)} принято` : 'учет выключен')}</strong>
          <small>${escapeHtml(statsEnabled ? xrayStatsPeriodLabel() : 'добавляет небольшую нагрузку на Xray')}</small>
        </article>
      </div>
      ${statsEnabled ? '' : `<div class="xray-core-foot"><button class="btn secondary" type="button" data-action="enableXrayStats">Включить статистику Xray</button></div>`}
    </section>
  `;
}

function serverTrafficView(tag, className = '') {
  const stats = state.status?.xrayStats || {};
  const traffic = xrayStatsOutbound(tag, stats);
  const share = traffic && Array.isArray(stats.outbounds)
    ? xrayStatsShare(traffic, stats.outbounds, 'downlink')
    : 0;
  return `<div class="server-traffic ${className} ${traffic ? '' : 'muted'}">
    ${traffic ? `
      <span>Статистика Xray</span>
      <strong>${escapeHtml(byteRate(traffic.downRate))} прием · ${escapeHtml(byteRate(traffic.upRate))} отдача</strong>
      <small>${escapeHtml(byteSize(traffic.downlink))} принято · ${escapeHtml(byteSize(traffic.uplink))} отправлено</small>
      <i class="xray-traffic-bar"><em style="width:${share}%"></em></i>
    ` : `
      <span>Статистика Xray</span>
      <strong>${stats.enabled === false ? 'учет выключен' : 'нет счетчика'}</strong>
      <small>${stats.enabled === false ? 'включается в диагностике' : 'ждем данные направления'}</small>
    `}
  </div>`;
}

function xrayStatsShare(item, outbounds, field) {
  const total = outbounds.reduce((sum, outbound) => sum + numberValue(outbound?.[field]), 0);
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((numberValue(item?.[field]) / total) * 100)));
}

function xrayActiveGraph(active) {
  if (!active) return '';
  const outbound = xrayStatsOutboundConfig(active.tag);
  const samples = state.xrayTrafficHistory.filter((item) => item.tag === active.tag);
  const fallback = [{ downRate: numberValue(active.downRate), upRate: numberValue(active.upRate) }];
  const series = samples.length ? samples : fallback;
  const maxRate = Math.max(1024, ...series.map((sample) => Math.max(sample.downRate || 0, sample.upRate || 0)));
  const downLine = xrayStatsSeriesPath(series, 'downRate', maxRate);
  const upLine = xrayStatsSeriesPath(series, 'upRate', maxRate);
  return `
    <article class="xray-active-graph">
      <div>
        <span>Активный сервер</span>
        <strong>${escapeHtml(active.tag)}</strong>
        <small>${escapeHtml(outboundAddress(outbound))}</small>
        <small>${escapeHtml(byteRate(active.downRate))} прием · ${escapeHtml(byteRate(active.upRate))} отдача</small>
      </div>
      <svg viewBox="0 0 320 92" preserveAspectRatio="none" aria-label="График активного сервера">
        <path class="traffic-grid" d="M0 0H320M0 23H320M0 46H320M0 69H320M0 92H320"></path>
        ${downLine ? `<path class="traffic-line-down" d="${downLine}"></path>` : ''}
        ${upLine ? `<path class="traffic-line-up" d="${upLine}"></path>` : ''}
      </svg>
    </article>
  `;
}

function xrayStatsPanel(stats = {}) {
  const enabled = stats.enabled === true;
  const settings = stats.settings || {};
  const groups = stats.groups || {};
  const outbounds = Array.isArray(stats.outbounds) ? stats.outbounds : [];
  const active = xrayActiveStats(stats);
  const totals = xrayStatsTotals(stats);
  const warning = stats.ok === false ? `<p class="settings-warning compact"><strong>Xray API</strong><span>${escapeHtml(stats.stderr || 'Не удалось прочитать статистику Xray')}</span></p>` : '';
  if (!enabled) {
    return `
      <section class="panel xray-stats-panel">
        <div class="panel-title">
          <div>
            <h2>Статистика Xray</h2>
            <span>Счетчики направлений выключены, чтобы не добавлять лишнюю нагрузку на слабые роутеры.</span>
          </div>
          <button class="btn warning" data-action="enableXrayStats">Включить статистику</button>
        </div>
        <p class="settings-warning compact"><strong>Нужен перезапуск Xray</strong><span>RuOpenRay добавит счетчики, policy и локальный StatsService API в активную конфигурацию.</span></p>
      </section>
    `;
  }
  return `
    <section class="panel xray-stats-panel">
      <div class="panel-title">
        <div>
          <h2>Статистика Xray</h2>
          <span>Трафик считается по направлениям с начала запуска Xray или последнего сброса.</span>
        </div>
        <div class="split-actions">
          <button class="btn secondary" data-action="resetXrayStats">Сбросить счетчики</button>
          <button class="btn secondary" data-action="disableXrayStats">Выключить</button>
        </div>
      </div>
      <div class="xray-stats-meta">
        <span>API: ${escapeHtml(settings.server || stats.server || '127.0.0.1:10085')}</span>
        <span>Период: ${escapeHtml(xrayStatsPeriodLabel())}</span>
        <span>${escapeHtml(stats.updatedAt ? new Date(stats.updatedAt).toLocaleTimeString('ru-RU') : 'ожидаем данные')}</span>
      </div>
      <p class="settings-warning compact"><strong>Дополнительная нагрузка</strong><span>Xray хранит счетчики направлений в памяти и обновляет их во время работы. На слабом роутере выключайте статистику, если она не нужна постоянно.</span></p>
      ${warning}
      <div class="xray-total-grid">
        <article>
          <span>Всего с запуска</span>
          <strong>${escapeHtml(byteSize(totals.downlink))} принято</strong>
          <small>${escapeHtml(byteSize(totals.uplink))} отправлено</small>
        </article>
        <article>
          <span>Скорость сейчас</span>
          <strong>${escapeHtml(byteRate(totals.downRate))} прием</strong>
          <small>${escapeHtml(byteRate(totals.upRate))} отдача</small>
        </article>
        <article>
          <span>Активный сервер</span>
          <strong>${escapeHtml(active?.tag || 'не выбран')}</strong>
          <small>${escapeHtml(active ? `прием ${byteRate(active.downRate)} · отдача ${byteRate(active.upRate)}` : 'нет данных')}</small>
        </article>
      </div>
      <div class="xray-group-grid">
        ${['proxy', 'direct', 'block'].map((key) => {
          const group = groups[key] || {};
          return `<article>
            <span>${escapeHtml(xrayStatsGroupLabel(key))}</span>
            <strong>${escapeHtml(byteSize(group.downlink))} принято</strong>
            <small>${escapeHtml(`прием ${byteRate(group.downRate)} · отдача ${byteRate(group.upRate)}`)}</small>
          </article>`;
        }).join('')}
      </div>
      ${xrayActiveGraph(active)}
      <div class="xray-outbound-list">
        ${outbounds.length ? outbounds.map((item) => {
          const outbound = xrayStatsOutboundConfig(item.tag);
          const share = xrayStatsShare(item, outbounds, 'downlink');
          return `<article class="${active?.tag === item.tag ? 'active' : ''}">
          <div>
            <strong>${escapeHtml(item.tag || 'outbound')}</strong>
            <span>${escapeHtml(outboundAddress(outbound))}</span>
            <small>${escapeHtml(item.protocol || item.kind || 'xray')} · ${escapeHtml(item.kind || 'proxy')}</small>
            <i class="xray-traffic-bar"><em style="width:${share}%"></em></i>
          </div>
          <div>
            <b>${escapeHtml(byteRate(item.downRate))}</b>
            <small>прием · ${escapeHtml(byteSize(item.downlink))}</small>
          </div>
          <div>
            <b>${escapeHtml(byteRate(item.upRate))}</b>
            <small>отдача · ${escapeHtml(byteSize(item.uplink))}</small>
          </div>
        </article>`;
        }).join('') : '<p class="muted">Счетчики пока пустые. Дайте Xray немного трафика или проверьте, что в конфигурации включена статистика направлений.</p>'}
      </div>
    </section>
  `;
}

function metricIcon(kind) {
  const icons = {
    chip: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"></rect><path d="M4 9h3M4 15h3M17 9h3M17 15h3M9 4v3M15 4v3M9 17v3M15 17v3"></path></svg>',
    memory: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12v10H6z"></path><path d="M8 3v4M12 3v4M16 3v4M8 17v4M12 17v4M16 17v4M3 9h3M3 15h3M18 9h3M18 15h3"></path></svg>',
    sessions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8a4 4 0 0 1 0 8h-2"></path><path d="M16 17H8a4 4 0 0 1 0-8h2"></path></svg>',
    uptime: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle><path d="M12 8v4l3 2"></path></svg>',
    storage: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7c0-1.1 3.1-2 7-2s7 .9 7 2-3.1 2-7 2-7-.9-7-2z"></path><path d="M5 7v5c0 1.1 3.1 2 7 2s7-.9 7-2V7"></path><path d="M5 12v5c0 1.1 3.1 2 7 2s7-.9 7-2v-5"></path></svg>',
    traffic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17V5"></path><path d="M4 8l3-3 3 3"></path><path d="M17 7v12"></path><path d="M14 16l3 3 3-3"></path></svg>'
  };
  return icons[kind] || icons.chip;
}

function metricStat(kind, label, value, detail) {
  return `<span class="metric-stat">
    <span class="metric-icon">${metricIcon(kind)}</span>
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  </span>`;
}

function trafficMetricStat(traffic = {}) {
  const iface = traffic.interface || 'WAN';
  return `<span class="metric-stat traffic-metric">
    <span class="metric-icon">${metricIcon('traffic')}</span>
    <div>
      <span>Трафик · ${escapeHtml(iface)}</span>
      <strong>${escapeHtml(byteSize(traffic.rxBytes))} принято</strong>
      <small>${escapeHtml(byteRate(traffic.rxRate))} прием</small>
      <strong>${escapeHtml(byteSize(traffic.txBytes))} отправлено</strong>
      <small>${escapeHtml(byteRate(traffic.txRate))} отдача</small>
    </div>
  </span>`;
}

function coreStat(available, detail, info) {
  const latestText = info.target
    ? `${info.target.prerelease ? 'Последний pre-release' : 'Последний stable'}: ${escapeHtml(info.target.tag)} · ${releaseDate(info.target)}`
    : 'Список релизов не загружен';
  const status = !available ? 'Нужно установить' : info.hasUpdate ? 'Есть обновление' : 'Stable актуален';
  return `
    <article class="stat core-stat ${info.hasUpdate ? 'has-update' : ''}">
      <div class="core-stat-head">
        <span>Ядро</span>
        <div class="core-stat-tools">
          ${info.target ? coreReleaseBadge(info.target) : ''}
          <button class="core-icon-action" type="button" data-action="${available ? 'openCoreDialog' : 'openInstallWizard'}" ${state.coreUpdating ? 'disabled' : ''} title="${available ? 'Выбрать версию Xray' : 'Установить Xray'}" aria-label="${available ? 'Выбрать версию Xray' : 'Установить Xray'}">⚙</button>
        </div>
      </div>
      <strong>${available ? labels.available : labels.missing}</strong>
      <small>${escapeHtml(detail)}</small>
      <div class="core-stat-meta">
        <b>${status}</b>
        <em>${latestText}</em>
      </div>
      ${state.coreUpdate ? `<small class="core-stat-result">${state.coreUpdate.ok ? 'Готово' : 'Ошибка'} · ${escapeHtml(state.coreUpdate.after || state.coreUpdate.stderr || '')}</small>` : ''}
    </article>
  `;
}

function flowStep(label, value, detail) {
  return `<article class="flow-step"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}

function quickAction(title, detail, tab) {
  return `
    <button class="quick-action" data-tab-jump="${tab}">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
    </button>
  `;
}

function isCheckingServer(tag) {
  return state.serverChecking && (!state.serverCheckingTags.length || state.serverCheckingTags.includes(tag));
}

function serverCheckButton(tag, extraClass = '') {
  const busy = isCheckingServer(tag);
  return `<button class="btn secondary ${extraClass}" data-server-check="${escapeHtml(tag)}" ${busy ? 'disabled' : ''}>${busy ? 'Проверяю...' : 'Проверить'}</button>`;
}

function checkModeLabel(mode) {
  return mode === 'endpoint' ? 'TCP-порт' : 'HTTP через прокси';
}

function operationProgressView() {
  if (state.configApplying) {
    return `
      <div class="operation-progress apply-progress" role="status">
        <span>Применяю конфигурацию</span>
        <strong>Проверка, запись и перезапуск Xray</strong>
        <i></i>
      </div>
    `;
  }
  if (state.configTesting) {
    return `
      <div class="operation-progress check-progress" role="status">
        <span>Проверяю конфигурацию</span>
        <strong>Xray читает временный config без применения</strong>
        <i></i>
      </div>
    `;
  }
  if (state.serverChecking) {
    const count = state.serverCheckingTags.length || proxyOutbounds().length;
    return `
      <div class="operation-progress server-progress" role="status">
        <span>Проверяю прокси</span>
        <strong>${escapeHtml(`${count} ${count === 1 ? 'сервер' : 'серверов'} через ${checkModeLabel(state.serverCheckMode)}`)}</strong>
        <i></i>
      </div>
    `;
  }
  return '';
}

function dashboardServerSwitch(servers) {
  const active = activeProxyTag();
  const summary = proxyDirectionSummary();
  if (!servers.length) {
    return `
      <div class="dashboard-action-block">
        <div class="dashboard-action-head">
          <div>
            <strong>Proxy-направления</strong>
            <span>Серверы пока не добавлены.</span>
          </div>
          <button class="btn secondary" data-import-dialog="choose">Добавить</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="dashboard-action-block">
      <div class="dashboard-action-head">
        <div>
          <strong>${escapeHtml(proxyDirectionTitle(summary))}</strong>
          <span>${escapeHtml(proxyDirectionDetail(summary))}</span>
        </div>
        <button class="btn secondary" data-import-dialog="choose">Добавить</button>
      </div>
      ${dashboardProxyDirectionCards(summary)}
      <div class="dashboard-server-switch">
        ${servers.slice(0, 5).map((outbound) => {
          const tag = outbound?.tag || '';
          const direction = summary.outbounds.get(tag);
          const activeServer = Boolean(direction) || (!summary.outbounds.size && !summary.balancers.size && tag === active);
          const check = checkForTag(tag);
          const ping = check?.ok ? checkLabel(check) : '';
          const stateLabel = activeServer ? (direction?.rules ? `${direction.rules} правил` : 'Текущий') : 'Сервер';
          const action = activeServer
            ? `<span class="server-state-pill active">${summary.outbounds.size > 1 || summary.balancers.size ? 'В маршрутах' : 'Активный'}</span>`
            : `<button class="btn warning compact-action" data-dashboard-connect="${escapeHtml(tag)}">Подключиться</button>`;
          return `<article class="dashboard-server-option ${activeServer ? 'active' : ''}">
            <button type="button" class="server-option-pick" ${activeServer ? '' : `data-dashboard-connect="${escapeHtml(tag)}"`}>
              <span class="server-option-state ${activeServer ? 'active' : ''}">${stateLabel}</span>
              <span class="server-option-main">
                <strong>${escapeHtml(tag || 'server')}</strong>
                <small>${escapeHtml(outboundAddress(outbound))}</small>
              </span>
              ${serverTrafficView(tag, 'dashboard-server-traffic')}
              <span class="server-option-side">
                ${ping ? `<span class="server-ping ok">${escapeHtml(ping)}</span>` : `<span class="server-ping ${check ? 'bad' : ''}">${escapeHtml(check ? checkLabel(check) : 'не проверен')}</span>`}
                <small>${escapeHtml([outboundTransport(outbound), check ? checkMethodLabel(check) : ''].filter(Boolean).join(' · '))}</small>
              </span>
            </button>
            <span class="server-option-actions">
              ${serverCheckButton(tag, 'compact-action')}
              ${action}
            </span>
          </article>`;
        }).join('')}
      </div>
    </div>
  `;
}

function importButton(title, detail, kind) {
  return `
    <button class="quick-action" data-import-dialog="${kind}">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
    </button>
  `;
}

function serverMini(outbound) {
  const tag = outbound?.tag || 'proxy';
  const check = checkForTag(tag);
  return `
    <div class="server-mini">
      <div class="server-mini-head">
        <span class="active-badge">активный</span>
        <span class="check-badge ${check?.ok ? 'ok' : check ? 'bad' : ''}">${escapeHtml(checkLabel(check))}</span>
      </div>
      <strong>${escapeHtml(tag)}</strong>
      <span>${escapeHtml(outbound?.protocol || 'protocol')} · ${escapeHtml(outboundTransport(outbound))}</span>
      <code>${escapeHtml(outboundAddress(outbound))}</code>
      <div class="server-mini-actions">
        <button class="btn secondary" data-tab-jump="servers">Серверы</button>
        ${serverCheckButton(tag)}
      </div>
    </div>
  `;
}

function emptyMini(title, detail, tab) {
  return `
    <div class="empty-mini">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
      <button class="btn secondary" data-tab-jump="${tab}">Перейти</button>
    </div>
  `;
}

function importDialog(kind) {
  if (!kind) return '';
  if (kind === 'choose') {
    return `
      <div class="modal-backdrop" data-action="closeImport">
        <section class="modal import-dialog" role="dialog" aria-modal="true" aria-labelledby="importDialogTitle" data-modal>
          <div class="modal-head">
            <div>
              <h2 id="importDialogTitle">Добавить сервер</h2>
              <span>Выберите источник: одиночную ссылку VLESS/VMess/Trojan или subscription URL.</span>
            </div>
            <button class="icon-btn" type="button" data-action="closeImport" aria-label="Закрыть">×</button>
          </div>
          <div class="import-choice import-choice-dialog">
            ${importButton('Сервер', 'Вставить одну ссылку, увидеть имя, протокол и адрес, затем подтвердить добавление.', 'server')}
            ${importButton('Подписка', 'Скачать subscription URL, проверить найденные серверы и добавить их в профиль.', 'subscription')}
          </div>
        </section>
      </div>
    `;
  }
  const isSubscription = kind === 'subscription';
  return `
    <div class="modal-backdrop" data-action="closeImport">
      <section class="modal import-dialog" role="dialog" aria-modal="true" aria-labelledby="importFormTitle" data-modal>
      <div class="panel-title">
        <div>
          <h2 id="importFormTitle">${isSubscription ? 'Добавить подписку' : 'Добавить сервер'}</h2>
          <span>${isSubscription ? 'Сначала покажем найденные серверы, затем импортируем их в профиль.' : 'Сначала распознаем ссылку, затем подтвердим добавление.'}</span>
        </div>
        <div class="split-actions">
          <button class="btn secondary" type="button" data-import-dialog="choose">Назад</button>
          <button class="btn secondary" type="button" data-action="closeImport">Закрыть</button>
        </div>
      </div>
      <div class="form-row">
        <label>Имя профиля</label>
        <input id="profileName" placeholder="Пусто = имя клиента" value="${escapeHtml(state.profileName)}" />
        <small class="muted">Если не задано, используем имя сервера или первого клиента из подписки.</small>
      </div>
      ${
        isSubscription
          ? `
            <div class="form-row">
              <label>URL подписки</label>
              <input id="subscriptionUrl" placeholder="https://..." value="${escapeHtml(state.subscriptionUrl)}" />
            </div>
            <label class="settings-check compact ${state.subscriptionAutoBalancer ? 'active' : ''}">
              <input id="subscriptionAutoBalancer" type="checkbox" ${state.subscriptionAutoBalancer ? 'checked' : ''} />
              <span><strong>Создать стабильную цель подписки</strong><em>В правилах останется один тег направления, а RuOpenRay сможет менять сервер внутри него при резервном переключении.</em></span>
            </label>
            ${state.subscriptionAutoBalancer ? `
              <div class="route-form subscription-balancer-options">
                <div class="form-row route-value">
                  <label>Имя outbound tag</label>
                  <input id="subscriptionBalancerTag" placeholder="${escapeHtml(suggestedSubscriptionBalancerTag())}" value="${escapeHtml(state.subscriptionBalancerTag)}" />
                </div>
              </div>
            ` : ''}
            <div class="toolbar">
              <button class="btn secondary" data-action="previewSubscription">Проверить подписку</button>
              <button class="btn" data-action="importSubscriptionToCurrent" ${state.subscriptionPreview?.outbounds?.length ? '' : 'disabled'}>В текущий профиль</button>
              <button class="btn warning" data-action="importSubscriptionActive" ${state.subscriptionPreview?.outbounds?.length ? '' : 'disabled'}>Добавить и выбрать</button>
              <button class="btn secondary" data-action="importSubscription">Отдельным профилем</button>
            </div>
            ${state.subscriptionPreview?.items?.length ? `<div class="preview-list">${state.subscriptionPreview.items.slice(0, 8).map(previewBox).join('')}</div>` : ''}
          `
          : `
            <div class="form-row">
              <label>Ссылка</label>
              <input id="importLink" placeholder="vless://..." value="${escapeHtml(state.importLink)}" />
            </div>
            <div class="form-row">
              <label>outboundTag</label>
              <input id="importOutboundTag" placeholder="Пусто = имя из ссылки" value="${escapeHtml(state.importOutboundTag)}" />
              <small class="muted">Тег используется в правилах, балансировщиках и статистике Xray.</small>
            </div>
            <div class="toolbar">
              <button class="btn secondary" data-action="previewImport">Распознать</button>
              <button class="btn" data-action="importToCurrent" ${state.importPreview?.outbound ? '' : 'disabled'}>В текущий профиль</button>
              <button class="btn warning" data-action="importActive" ${state.importPreview?.outbound ? '' : 'disabled'}>Добавить и выбрать</button>
              <button class="btn secondary" data-action="import">Отдельным профилем</button>
            </div>
            ${serverImportPreviewItem() ? previewBox(serverImportPreviewItem()) : ''}
          `
      }
      ${state.message ? `<p class="notice" style="margin-top: 14px">${escapeHtml(state.message)}</p>` : ''}
      </section>
    </div>
  `;
}

function previewBox(item) {
  return `<article class="preview-box">
    <strong>${escapeHtml(item.tag || 'server')}</strong>
    <span>${escapeHtml(item.protocol || '')} · ${escapeHtml([item.address, item.port].filter(Boolean).join(':'))}</span>
    <small>${escapeHtml(item.network || 'tcp')} / ${escapeHtml(item.security || 'none')}</small>
  </article>`;
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

function fileSize(size) {
  const n = Number(size || 0);
  if (!n) return 'нет файла';
  return n > 1024 * 1024 ? `${Math.round((n / 1024 / 1024) * 10) / 10} MB` : `${Math.round(n / 1024)} KB`;
}

function geoSelectedPresetIds() {
  const ids = [state.geoBasePreset, ...state.geoExtraPresets].filter(Boolean);
  return [...new Set(ids)];
}

function geoSelectedPresets() {
  const presets = state.geoStatus?.presets || [];
  const builtin = geoSelectedPresetIds().map((id) => presets.find((preset) => preset.id === id)).filter(Boolean);
  const custom = state.geoCustomSources
    .filter((source) => state.geoCustomSourceIds.includes(source.id))
    .map((source) => ({
      ...source,
      installable: source.enabled !== false,
      mode: source.kind === 'extra' ? 'extra-geosite' : 'replace',
      estimatedBytes: source.kind === 'extra' ? 512 * 1024 : 24 * 1024 * 1024
    }));
  return [...builtin, ...custom];
}

function geoRequiredSpace(selectedPresets, geo, withBackup = true) {
  const installable = selectedPresets.filter((preset) => preset?.installable);
  if (!installable.length) return 0;
  let required = 1024 * 1024;
  installable.forEach((preset) => {
    required += Number(preset.estimatedBytes || 0);
    if (!withBackup) return;
    if (preset.mode === 'extra-geosite') {
      required += Number((geo.extras || []).find((item) => item.id === preset.id)?.file?.size || 0);
    } else if (preset.mode === 'geoip-only') {
      required += Number(geo.geoip?.size || 0);
    } else {
      required += Number(geo.geoip?.size || 0) + Number(geo.geosite?.size || 0);
    }
  });
  return required;
}

function geoDiskWarning(selectedPresets, geo) {
  const disk = geo.disk || {};
  if (!disk.ok || !selectedPresets.some((preset) => preset?.installable)) return '';
  const required = geoRequiredSpace(selectedPresets, geo, state.geoBackup);
  const free = Number(disk.free || 0);
  const low = free < required;
  const tight = free < required + 8 * 1024 * 1024;
  if (!low && !tight) return '';
  return `
    <div class="geo-disk-warning ${low ? 'danger' : ''}">
      <strong>${low ? 'Места может не хватить' : 'Места почти впритык'}</strong>
      <span>Свободно ${fileSize(free)}, расчетно нужно около ${fileSize(required)}${state.geoBackup ? ' с учетом бэкапа' : ' без бэкапа'}. Каталог: ${escapeHtml(geo.dir || '')}</span>
    </div>
  `;
}

function selectedGeoPreset() {
  return (state.geoStatus?.presets || []).find((preset) => preset.id === state.geoBasePreset);
}

function geoActionLabel(preset) {
  if (state.geoUpdating) return 'Обновляю...';
  if (!preset || state.geoBasePreset === 'custom') return 'Обновить geo';
  if (!preset.installable) return 'Справочный источник';
  if (preset.mode === 'extra-geosite') return 'Поставить dat-файл';
  if (preset.mode === 'geoip-only') return 'Обновить geoip.dat';
  return 'Обновить geo';
}

function geoNandCard(geo, selectedPresets) {
  const storage = geo.storage || {};
  const disk = geo.disk || {};
  const requiredNoBackup = geoRequiredSpace(selectedPresets, geo, false);
  const requiredBackup = geoRequiredSpace(selectedPresets, geo, true);
  const extraCount = (geo.files || []).filter((file) => file.role === 'extra').length;
  return `
    <section class="panel nand-card">
      <div class="panel-title">
        <div>
          <h2>NAND-friendly режим</h2>
          <span>Экономный профиль для роутеров с 128 MB NAND: без бэкапов по умолчанию, компактные geo и удаление лишних dat-файлов.</span>
        </div>
        <button class="btn secondary" data-action="cleanupExtraGeoDat" ${extraCount ? '' : 'disabled'}>Удалить дополнительные dat</button>
      </div>
      <div class="nand-plan-grid">
        <article><span>Свободно</span><strong>${escapeHtml(fileSize(disk.free))}</strong><small>${escapeHtml(geo.dir || '')}</small></article>
        <article><span>Geo сейчас</span><strong>${escapeHtml(fileSize(storage.currentDatBytes))}</strong><small>geoip.dat + geosite.dat</small></article>
        <article><span>Бэкапы</span><strong>${escapeHtml(fileSize(storage.backupBytes))}</strong><small>можно очистить отдельно</small></article>
        <article><span>Компактный набор</span><strong>${escapeHtml(fileSize(storage.compactEstimate))}</strong><small>Nidelon / РФ блокировки</small></article>
        <article><span>С бэкапом</span><strong>${escapeHtml(fileSize(requiredBackup))}</strong><small>оценка выбранного обновления</small></article>
        <article><span>Без бэкапа</span><strong>${escapeHtml(fileSize(requiredNoBackup))}</strong><small>рекомендуется для малого NAND</small></article>
      </div>
      <p class="settings-warning compact"><strong>По умолчанию без бэкапа</strong><span>Перед рискованным обновлением можно включить бэкап вручную. Для обычного обновления geo на маленьком NAND лучше сначала удалить лишние dat-файлы.</span></p>
    </section>
  `;
}

function geoPurposeLabel(preset) {
  const purpose = String(preset?.purpose || preset?.compat || '').trim();
  const labels = {
    'база': 'универсальный набор',
    'база через CDN': 'универсальный набор через CDN',
    'РФ bypass': 'российские блокировки',
    'РФ блоки': 'российские блокировки',
    'CN rules': 'Китай и CDN',
    'Iran rules': 'Иран',
    'расширенный GeoIP': 'расширенный GeoIP',
    'официальный fallback': 'официальный набор',
    'официальный резерв': 'официальный набор'
  };
  return labels[purpose] || purpose;
}

function geoPanel() {
  const geo = state.geoStatus || {};
  const presets = geo.presets || [];
  const extras = geo.extras || [];
  const installedFiles = geo.files || [];
  const selected = selectedGeoPreset();
  const basePresets = presets.filter((preset) => preset.mode !== 'extra-geosite');
  const extraPresets = presets.filter((preset) => preset.mode === 'extra-geosite');
  const selectedPresets = geoSelectedPresets();
  const custom = state.geoBasePreset === 'custom';
  const customSelected = state.geoCustomSourceIds.length > 0;
  const canUpdate = custom || selected?.installable || customSelected;
  return `
    <section class="route-hero">
      <div>
        <h2>Geodata manager</h2>
        <p>Источники geoip.dat/geosite.dat, свои URL, дополнительные dat-файлы, обновление и расписание для правил <code>geoip:...</code>, <code>geosite:...</code> и <code>ext:</code>.</p>
      </div>
      <div class="route-score">
        <strong>${(geo.geoip?.exists ? 1 : 0) + (geo.geosite?.exists ? 1 : 0)}/2</strong>
        <span>файлов установлено</span>
      </div>
    </section>

    <section class="stats route-stats">
      ${stat('geoip.dat', fileSize(geo.geoip?.size), geo.geoip?.modifiedAt ? new Date(geo.geoip.modifiedAt).toLocaleString() : geo.geoip?.path || 'не найден')}
      ${stat('geosite.dat', fileSize(geo.geosite?.size), geo.geosite?.modifiedAt ? new Date(geo.geosite.modifiedAt).toLocaleString() : geo.geosite?.path || 'не найден')}
      ${stat('Каталог', geo.dir || '-', 'куда RuOpenRay кладет dat-файлы')}
      ${stat('Свободно', fileSize(geo.disk?.free), geo.disk?.ok ? `занято ${geo.disk.usedPercent || fileSize(geo.disk.used)}` : 'df/statfs недоступен')}
    </section>

    ${geoNandCard(geo, selectedPresets)}

    <section class="panel">
      <div class="panel-title">
        <div><h2>Установленные dat-файлы</h2><span>Обычные источники заменяют пару <code>geoip.dat</code>/<code>geosite.dat</code>. Источники geoip-only обновляют только <code>geoip.dat</code>. Дополнительные файлы могут лежать рядом и использоваться правилами <code>ext:"file.dat:list"</code>.</span></div>
      </div>
      <div class="geo-file-list">
        ${installedFiles.map((file) => `<article>
          <div>
            <strong>${escapeHtml(file.name || file.path)}</strong>
            <span>${file.exists === false ? 'не найден' : `${fileSize(file.size)} · ${file.modifiedAt ? new Date(file.modifiedAt).toLocaleString() : ''}`}</span>
            <code>${escapeHtml(file.path || '')}</code>
          </div>
          <button class="btn secondary" data-geo-delete="${escapeHtml(file.name || '')}" ${file.exists === false ? 'disabled' : ''}>Удалить</button>
        </article>`).join('') || '<p class="muted">dat-файлов пока нет. Установите базовый источник или дополнительный ext DAT.</p>'}
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <div><h2>Источники geodata</h2><span>Выберите один основной источник: пару geoip/geosite или отдельный geoip.dat. Дополнительные dat-файлы для ext-правил можно ставить вместе с ним.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-action="cleanupGeoBackups">Очистить geo-бэкапы</button>
          <button class="btn warning" data-action="updateGeo" ${state.geoUpdating || !canUpdate ? 'disabled' : ''}>${geoActionLabel(selected)}</button>
        </div>
      </div>
      <div class="geo-presets">
        ${basePresets.map((preset) => `<button class="${state.geoBasePreset === preset.id ? 'active' : ''} ${preset.installable ? '' : 'reference'}" data-geo-base="${escapeHtml(preset.id)}">
          <span class="geo-purpose">${escapeHtml(geoPurposeLabel(preset))}</span>
          <strong>${escapeHtml(preset.name)}</strong>
          <small>${escapeHtml(preset.compat || '')}</small>
          <span>${escapeHtml(preset.detail)}</span>
          ${preset.ruleHint ? `<code>${escapeHtml(preset.ruleHint)}</code>` : ''}
          ${preset.estimatedBytes ? `<small>примерно ${fileSize(preset.estimatedBytes)}</small>` : ''}
        </button>`).join('')}
        <button class="${custom ? 'active' : ''}" data-geo-base="custom">
          <span class="geo-purpose">свои ссылки</span>
          <strong>Свой источник</strong>
          <small>Xray DAT</small>
          <span>Вставьте прямые URL на geoip.dat и geosite.dat.</span>
        </button>
      </div>
      ${extraPresets.length ? `<div class="geo-group-title">Дополнительные DAT для ext-правил</div>
      <div class="geo-extra-select">
        ${extraPresets.map((preset) => `<label class="${state.geoExtraPresets.includes(preset.id) ? 'active' : ''}">
          <input type="checkbox" data-geo-extra="${escapeHtml(preset.id)}" ${state.geoExtraPresets.includes(preset.id) ? 'checked' : ''} />
          <span>
            <strong>${escapeHtml(preset.name)}</strong>
            <small>${escapeHtml(geoPurposeLabel(preset))}</small>
            <em>${escapeHtml(preset.detail)}</em>
            ${preset.ruleHint ? `<code>${escapeHtml(preset.ruleHint)}</code>` : ''}
          </span>
        </label>`).join('')}
      </div>` : ''}
      <div class="geo-options">
        <label class="toggle-row">
          <input id="geoBackup" type="checkbox" ${state.geoBackup ? 'checked' : ''} />
          <span>Сохранять бэкап перед заменой</span>
        </label>
        <small class="muted">Если места мало, бэкап можно выключить: текущий dat-файл будет заменен без копии.</small>
      </div>
      ${geoDiskWarning(selectedPresets, geo)}
      ${custom ? `<div class="geo-custom">
        <div class="geo-group-title">Свои URL</div>
        <div class="form-row">
          <label>geoip.dat URL</label>
          <input id="geoipUrl" value="${escapeHtml(state.geoipUrl)}" placeholder="https://example.com/geoip.dat" />
        </div>
        <div class="form-row">
          <label>geosite.dat URL</label>
          <input id="geositeUrl" value="${escapeHtml(state.geositeUrl)}" placeholder="https://example.com/geosite.dat" />
        </div>
      </div>` : ''}
      <div class="geo-manager">
        <div class="geo-group-title">Свои источники</div>
        <div class="geo-source-form">
          <div class="form-row">
            <label>Название</label>
            <input id="geoSourceName" value="${escapeHtml(state.geoSourceName)}" placeholder="Мой geosite / офисный список" />
          </div>
          <div class="form-row">
            <label>Тип</label>
            <select id="geoSourceKind">
              <option value="base" ${state.geoSourceKind === 'base' ? 'selected' : ''}>geoip.dat + geosite.dat</option>
              <option value="extra" ${state.geoSourceKind === 'extra' ? 'selected' : ''}>дополнительный ext dat</option>
            </select>
          </div>
          ${state.geoSourceKind === 'extra' ? `
            <div class="form-row">
              <label>Имя файла</label>
              <input id="geoSourceTarget" value="${escapeHtml(state.geoSourceTarget)}" placeholder="my-site.dat" />
            </div>
            <div class="form-row">
              <label>URL dat-файла</label>
              <input id="geoSourceUrl" value="${escapeHtml(state.geoSourceUrl)}" placeholder="https://example.com/my-site.dat" />
            </div>
          ` : `
            <div class="form-row">
              <label>geoip.dat URL</label>
              <input id="geoSourceGeoipUrl" value="${escapeHtml(state.geoSourceGeoipUrl)}" placeholder="https://example.com/geoip.dat" />
            </div>
            <div class="form-row">
              <label>geosite.dat URL</label>
              <input id="geoSourceGeositeUrl" value="${escapeHtml(state.geoSourceGeositeUrl)}" placeholder="https://example.com/geosite.dat" />
            </div>
          `}
          <button class="btn secondary" data-action="addGeoSource">Добавить источник</button>
        </div>
        <div class="geo-source-list">
          ${state.geoCustomSources.map((source) => `<article class="${state.geoCustomSourceIds.includes(source.id) ? 'active' : ''}">
            <label class="toggle-row">
              <input type="checkbox" data-geo-custom="${escapeHtml(source.id)}" ${state.geoCustomSourceIds.includes(source.id) ? 'checked' : ''} ${source.enabled === false ? 'disabled' : ''} />
              <span>Выбрать для обновления</span>
            </label>
            <div>
              <strong>${escapeHtml(source.name)}</strong>
              <span>${source.kind === 'extra' ? `ext dat · ${escapeHtml(source.target || 'file.dat')}` : 'geoip.dat + geosite.dat'}</span>
              <code>${escapeHtml(source.kind === 'extra' ? source.url : [source.geoipUrl, source.geositeUrl].filter(Boolean).join(' · '))}</code>
            </div>
            <div class="split-actions">
              <button class="btn secondary" data-geo-source-toggle="${escapeHtml(source.id)}">${source.enabled === false ? 'Включить' : 'Выключить'}</button>
              <button class="btn secondary" data-geo-source-delete="${escapeHtml(source.id)}">Удалить</button>
            </div>
          </article>`).join('') || '<p class="muted">Своих источников пока нет. Добавьте URL один раз, потом выбирайте его для ручного или scheduled обновления.</p>'}
        </div>
      </div>
      <div class="geo-schedule">
        <div class="geo-group-title">Расписание обновления</div>
        <label class="toggle-row">
          <input id="geoScheduleEnabled" type="checkbox" ${state.geoScheduleEnabled ? 'checked' : ''} />
          <span>Обновлять выбранные geo-файлы автоматически</span>
        </label>
        <div class="geo-schedule-grid">
          <div class="form-row">
            <label>Период</label>
            <select id="geoScheduleInterval">
              <option value="daily" ${state.geoScheduleInterval === 'daily' ? 'selected' : ''}>Ежедневно</option>
              <option value="weekly" ${state.geoScheduleInterval === 'weekly' ? 'selected' : ''}>Еженедельно</option>
            </select>
          </div>
          <div class="form-row">
            <label>День</label>
            <select id="geoScheduleWeekday" ${state.geoScheduleInterval === 'daily' ? 'disabled' : ''}>
              ${['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map((day, index) => `<option value="${index}" ${state.geoScheduleWeekday === String(index) ? 'selected' : ''}>${day}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <label>Время</label>
            <input id="geoScheduleTime" type="time" value="${escapeHtml(state.geoScheduleTime)}" />
          </div>
          <button class="btn secondary" data-action="saveGeoSchedule">Сохранить расписание</button>
        </div>
      </div>
      ${state.geoUpdate ? `<div class="core-result">
        <strong>${state.geoUpdate.ok ? 'Готово' : 'Ошибка'}</strong>
        ${state.geoUpdate.stdout || state.geoUpdate.stderr ? `<pre>${escapeHtml(state.geoUpdate.stdout || state.geoUpdate.stderr).slice(0, 1600)}</pre>` : ''}
      </div>` : '<p class="muted">Перед заменой существующие файлы сохраняются в backup-каталог. После успешного обновления Xray перезапускается.</p>'}
    </section>

    ${extras.length ? `<section class="panel">
      <div class="panel-title">
        <div><h2>Дополнительные dat-файлы</h2><span>Файлы для правил <code>ext:"file.dat:list"</code>, которые лежат рядом с geosite.dat.</span></div>
      </div>
      <div class="geo-extra-list">
        ${extras.map((item) => `<article>
          <strong>${escapeHtml(item.name)} · ${item.file?.exists ? fileSize(item.file.size) : 'не установлен'}</strong>
          <span>${escapeHtml(item.file?.path || '')}</span>
          ${item.ruleHint ? `<code>${escapeHtml(item.ruleHint)}</code>` : ''}
        </article>`).join('')}
      </div>
    </section>` : ''}
  `;
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

function dnsLeakChecklist(dns, stats) {
  const servers = dns.servers || [];
  const hasDns = servers.length > 0;
  const encrypted = stats.doh + stats.tcp;
  const hasPlain = servers.some((server) => {
    const address = typeof server === 'string' ? server : server?.address || '';
    const network = typeof server === 'object' ? server?.network : '';
    return address && !String(address).startsWith('https://') && network !== 'tcp';
  });
  const checked = Boolean(state.dnsCheckResult);
  const udpRule = routeRules().some((rule) => String(rule.network || '').includes('udp') && (rule.balancerTag || ['proxy', activeProxyTag(), 'block'].includes(rule.outboundTag)));
  const dnsInbound = configInbounds().some((item) => item?.tag === 'ruopenray_dns_in');
  const dnsRouting = routeRules().some((rule) => {
    const inbound = Array.isArray(rule.inboundTag) && rule.inboundTag.includes('ruopenray_dns_in');
    return inbound || String(rule.port || '') === '53' || rule.outboundTag === 'dns-out';
  });
  const items = [
    {
      ok: hasDns,
      title: 'DNS задан в Xray',
      detail: hasDns ? `${servers.length} серверов в dns.servers` : 'Добавьте DoH/TCP DNS, чтобы не полагаться на системный resolver.'
    },
    {
      ok: encrypted > 0,
      warn: encrypted === 0 && hasDns,
      title: 'Есть защищенный канал',
      detail: encrypted ? `${encrypted} DoH/TCP серверов` : 'UDP DNS может уходить наружу без шифрования.'
    },
    {
      ok: !hasPlain,
      warn: hasPlain,
      title: 'Обычный DNS без шифрования',
      detail: hasPlain ? 'Найден DNS по UDP/53. Такие запросы может видеть провайдер: оставляйте его только для локального DNS, Pi-hole или аварийного резерва.' : 'Обычный UDP DNS не найден: запросы идут через защищенный DNS или специальные маршруты.'
    },
    {
      ok: checked,
      warn: !checked,
      title: 'Резолв проверен',
      detail: checked ? `Последняя проверка: ${dnsAnswerText(state.dnsCheckResult)}` : 'Запустите проверку домена после изменения DNS.'
    },
    {
      ok: dnsInbound && dnsRouting,
      warn: dnsInbound || dnsRouting,
      title: 'DNS устройств перехватывается',
      detail: dnsInbound && dnsRouting
        ? 'Есть DNS inbound и правило на dns-out. Осталось направить dnsmasq на 127.0.0.1#5353.'
        : 'Для LAN-устройств нужен DNS inbound и маршрут на dns-out, иначе часть клиентов может обходить Xray DNS.',
      action: dnsInbound && dnsRouting ? '' : 'prepareDnsInbound',
      actionLabel: 'Подготовить inbound'
    },
    {
      ok: udpRule,
      warn: !udpRule,
      title: udpRule ? 'UDP/QUIC направлен правилами' : 'UDP/QUIC не закрыт',
      detail: udpRule ? 'В маршрутизации есть UDP-правило в proxy или block.' : 'Добавьте правило для UDP/443 или нужных UDP-диапазонов, чтобы трафик не обходил DNS-настройки через QUIC.',
      action: udpRule ? '' : 'dnsWizardStrict',
      actionLabel: 'Добавить UDP/443'
    }
  ];
  if (items[2]) {
    items[2].title = hasPlain ? 'Обычный UDP DNS как запасной вариант' : 'Обычный UDP DNS не используется';
    items[2].detail = hasPlain
      ? 'В списке есть DNS без шифрования. Оставляйте его для локального DNS, Pi-hole или аварийного резерва; основным лучше держать DoH/TCP.'
      : 'В основном DNS-пути нет обычного UDP/53, который легко увидеть провайдеру.';
  }
  if (items[4] && dnsInbound && dnsRouting) {
    items[4].detail = 'Xray готов принимать DNS на 127.0.0.1:5353. Если хотите вести LAN через него, откройте вкладку LAN DNS и примените режим DNS через Xray.';
  }
  return `
    <section class="panel dns-guard-panel">
      <div class="panel-title">
        <div><h2>Защита от утечек DNS</h2><span>Проверяем, куда пойдут DNS-запросы LAN-устройств и где может появиться открытый UDP/53.</span></div>
        <button class="btn secondary" data-action="checkDns">Проверить DNS</button>
      </div>
      <div class="dns-wizard">
        <button class="wizard-card" data-action="dnsWizardSecure">
          <strong>Защищенный DNS</strong>
          <span>Добавить DoH Google и AdGuard без изменения маршрутов.</span>
        </button>
        <button class="wizard-card" data-action="dnsWizardRu">
          <strong>RU-friendly DNS</strong>
          <span>Добавить Yandex DoH и AdGuard для российских сценариев.</span>
        </button>
        <button class="wizard-card" data-action="dnsWizardStrict">
          <strong>DoH + QUIC guard</strong>
          <span>Добавить DoH и правило UDP/443 через активный proxy.</span>
        </button>
      </div>
      <div class="guard-list">
        ${items.map((item) => `<article class="guard-item ${item.ok ? 'ok' : item.warn ? 'warn' : 'bad'}">
          <span>${item.ok ? '✓' : item.warn ? '!' : '×'}</span>
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.detail)}</small>
            ${item.action ? `<button class="guard-action" type="button" data-action="${escapeHtml(item.action)}">${escapeHtml(item.actionLabel)}</button>` : ''}
          </div>
        </article>`).join('')}
      </div>
    </section>
  `;
}

function dnsServersSection(dns) {
  const presets = [
    ['Cloudflare DoH', 'https://cloudflare-dns.com/dns-query'],
    ['Google DoH', 'https://dns.google:443/dns-query'],
    ['Quad9 DoH', 'https://dns.quad9.net/dns-query'],
    ['AdGuard DoH', 'https://dns.adguard-dns.com/dns-query'],
    ['Yandex DoH', 'https://common.dot.dns.yandex.net/dns-query'],
    ['OpenDNS DoH', 'https://doh.opendns.com/dns-query'],
    ['Cloudflare TCP', 'tcp://1.1.1.1:53'],
    ['Quad9 TCP', 'tcp://9.9.9.9:53'],
    ['Cloudflare UDP', '1.1.1.1'],
    ['Google UDP', '8.8.8.8']
  ];
  return `
    <section class="panel">
      <div class="panel-title">
        <div><h2>Добавить DNS</h2><span>Обычный IP, tcp:// или DoH URL. Пресеты ниже только подставляют адрес в поле.</span></div>
      </div>
      <div class="dns-form">
        <div class="form-row">
          <label>DNS-сервер</label>
          <input id="dnsAddress" value="${escapeHtml(state.dnsAddress)}" placeholder="https://dns.google:443/dns-query" />
        </div>
        <div class="form-row">
          <label>Только для доменов</label>
          <input id="dnsDomains" value="${escapeHtml(state.dnsDomains)}" placeholder="dns.google, dns.opendns.com" />
        </div>
        <button class="btn" data-action="addDns">Добавить DNS</button>
      </div>
      <div class="preset-grid dns-presets">
        ${presets.map(([name, address]) => `<button class="preset" type="button" data-dns-preset="${escapeHtml(address)}"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(address)}</span></button>`).join('')}
      </div>
      <div class="dns-inline-check">
        <div>
          <strong>Проверка DNS</strong>
          <span>Проверяет текущий адрес из поля DNS-сервера. Для IP без порта используется 53.</span>
        </div>
        <div class="dns-check">
          <input id="dnsCheckHost" value="${escapeHtml(state.dnsCheckHost)}" placeholder="ya.ru" />
          <button class="btn secondary" data-action="checkDns">Проверить DNS</button>
        </div>
        ${state.dnsCheckResult ? `<div class="notice dns-check-result">
          Ответ: ${escapeHtml(dnsAnswerText(state.dnsCheckResult))}
          ${state.dnsCheckResult.error ? `<br />Ошибка: ${escapeHtml(state.dnsCheckResult.error)}` : ''}
          ${(state.dnsCheckResult.warnings || []).length ? `<br />Предупреждение: ${escapeHtml(state.dnsCheckResult.warnings.join('; '))}` : ''}
        </div>` : ''}
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <div><h2>DNS-серверы</h2><span>Порядок важен: Xray обрабатывает список сверху вниз. Изменения остаются в черновике до применения.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-action="test">Проверить конфигурацию</button>
          <button class="btn warning" data-action="apply">Применить</button>
        </div>
      </div>
      <div class="dns-list">
        ${dns.servers
          .map((server, index) => {
            const info = describeDnsServer(server);
            return `<article class="dns-server-row">
              <div class="server-protocol">DNS</div>
              <div class="server-main">
                <strong>${escapeHtml(info.address)}</strong>
                <span>${escapeHtml(info.domains.length ? info.domains.join(', ') : 'для всех доменов')}</span>
              </div>
              <div class="server-meta">
                <span>${escapeHtml(info.network || (info.address.startsWith('https://') ? 'https' : 'udp/tcp'))}</span>
                <span>${escapeHtml(info.port ? `порт ${info.port}` : 'порт из адреса')}</span>
              </div>
              <button class="btn secondary" data-dns-delete="${index}">Удалить</button>
            </article>`;
          })
          .join('') || '<p class="muted">DNS-серверы пока не заданы.</p>'}
      </div>
    </section>
  `;
}

function dnsHostsSection(dns) {
  const hosts = Object.entries(dns.hosts || {});
  return `
    <section class="panel dns-host-panel">
      <div class="panel-title">
        <div><h2>Hosts</h2><span>Локальные подмены доменов из dns.hosts. Удобно для роутера, NAS, Pi-hole и домашних сервисов.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-action="test">Проверить конфигурацию</button>
          <button class="btn warning" data-action="apply">Применить</button>
        </div>
      </div>
      <div class="dns-host-form">
        <div class="form-row">
          <label>Домен</label>
          <input id="dnsHostName" value="${escapeHtml(state.dnsHostName)}" placeholder="example.lan" />
        </div>
        <div class="form-row">
          <label>Значение</label>
          <input id="dnsHostValue" value="${escapeHtml(state.dnsHostValue)}" placeholder="192.168.50.1 или domain:router.lan" />
        </div>
        <button class="btn secondary" data-action="saveDnsHost">${state.dnsHostName ? 'Сохранить host' : 'Добавить host'}</button>
      </div>
      <div class="dns-bootstrap-card">
        <div>
          <strong>Bootstrap для DoH</strong>
          <span>Чтобы Xray не пытался резолвить dns.google и dns.adguard-dns.com через них же, добавьте фиксированные hosts-записи.</span>
        </div>
        <button class="btn secondary" data-action="applyDnsBootstrapHosts">Добавить bootstrap</button>
      </div>
      <div class="dns-hosts">
        ${hosts
          .map(([host, value]) => `<article class="dns-row dns-host-row">
            <div class="dns-host-main">
              <strong>${escapeHtml(host)}</strong>
              <span>${escapeHtml(Array.isArray(value) ? value.join(', ') : value)}</span>
            </div>
            <span class="dns-host-actions">
              <button class="btn secondary" data-dns-host-edit="${escapeHtml(host)}">Править</button>
              <button class="btn secondary" data-dns-host-delete="${escapeHtml(host)}">Удалить</button>
            </span>
          </article>`)
          .join('') || '<p class="muted">Локальных host-подмен нет.</p>'}
      </div>
    </section>
  `;
}

function dnsCheckSection() {
  return `
    <section class="panel dns-check-panel">
      <div class="panel-title">
        <div><h2>Проверка DNS</h2><span>Проверьте, отвечает ли выбранный DNS-сервер на конкретный домен.</span></div>
      </div>
      <div class="dns-form dns-check-form">
        <div class="form-row">
          <label>DNS-сервер</label>
          <input id="dnsAddress" value="${escapeHtml(state.dnsAddress)}" placeholder="https://dns.google:443/dns-query" />
        </div>
        <div class="form-row">
          <label>Домен для проверки</label>
          <input id="dnsCheckHost" value="${escapeHtml(state.dnsCheckHost)}" placeholder="ya.ru" />
        </div>
        <button class="btn secondary" data-action="checkDns">Проверить DNS</button>
      </div>
      ${state.dnsCheckResult ? `<div class="notice dns-check-result">
        Ответ: ${escapeHtml(dnsAnswerText(state.dnsCheckResult))}
        ${state.dnsCheckResult.error ? `<br />Ошибка: ${escapeHtml(state.dnsCheckResult.error)}` : ''}
        ${(state.dnsCheckResult.warnings || []).length ? `<br />Предупреждение: ${escapeHtml(state.dnsCheckResult.warnings.join('; '))}` : ''}
      </div>` : '<p class="muted">Результат появится здесь после проверки.</p>'}
    </section>
  `;
}

function dnsAdvancedSection() {
  return `
    ${dnsModeSection()}
    <section class="panel dns-inbound-panel">
      <div class="panel-title">
        <div><h2>DNS inbound</h2><span>Xray принимает DNS на 127.0.0.1:5353, а dnsmasq можно направить на этот порт.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-action="prepareDnsInbound">Подготовить inbound</button>
          <button class="btn warning" data-action="test">Проверить конфигурацию</button>
        </div>
      </div>
      <div class="settings-warning">
        <strong>dnsmasq</strong>
        <span>После применения черновика выберите схему в блоке DNS для LAN: направить dnsmasq на Xray, внешний Pi-hole или вернуть стандартный OpenWrt resolver.</span>
      </div>
    </section>
  `;
}

function lanDnsSection() {
  const status = state.lanDnsStatus || {};
  const servers = Array.isArray(status.servers) ? status.servers : [];
  const readiness = status.readiness || {};
  const plan = state.lanDnsPreview || status.plan || null;
  const commands = Array.isArray(plan?.commands) ? plan.commands : [];
  const warnings = Array.isArray(plan?.warnings) ? plan.warnings : [];
  const xrayNeedsReadiness = state.lanDnsMode === 'xray';
  const xrayReady = !xrayNeedsReadiness || readiness.ready;
  const applyDisabled = state.lanDnsSaving || status.available === false || !plan || !xrayReady;
  const current = status.available === false
    ? 'UCI недоступен'
    : servers.length
      ? servers.join(', ')
      : (status.noresolv ? 'серверы не заданы' : 'системный resolv.conf');
  const routerLan = status.routerLan || '192.168.1.1';
  const xrayTarget = status.xrayTarget || '127.0.0.1#5353';
  return `
    <section class="panel settings-section lan-dns-panel">
      <div class="panel-title">
        <div>
          <h2>DNS для LAN</h2>
          <span>Настраивает, куда dnsmasq отправляет DNS-запросы домашних устройств. Это отдельный системный шаг после подготовки DNS inbound в Xray.</span>
        </div>
      </div>
      <div class="settings-info-grid">
        <article><span>Текущий режим</span><strong>${escapeHtml(lanDnsModeLabel(status.mode))}</strong></article>
        <article><span>Upstream dnsmasq</span><strong>${escapeHtml(current)}</strong></article>
        <article><span>Адрес роутера</span><strong>${escapeHtml(routerLan)}</strong></article>
        <article><span>Xray DNS inbound</span><strong>${escapeHtml(xrayTarget)}</strong></article>
      </div>
      <div class="advanced-grid three lan-dns-modes">
        <button type="button" class="advanced-card ${state.lanDnsMode === 'xray' ? 'active' : ''}" data-lan-dns-mode="xray">
          <strong>DNS через Xray</strong>
          <span>LAN → dnsmasq → 127.0.0.1#5353 → Xray DNS. Подходит, когда RuOpenRay управляет DNS-маршрутизацией.</span>
        </button>
        <button type="button" class="advanced-card ${state.lanDnsMode === 'upstream' ? 'active' : ''}" data-lan-dns-mode="upstream">
          <strong>Внешний DNS / Pi-hole</strong>
          <span>LAN → dnsmasq → Pi-hole или другой DNS. Укажите адрес ниже, порт 53 добавится автоматически.</span>
        </button>
        <button type="button" class="advanced-card ${state.lanDnsMode === 'system' ? 'active' : ''}" data-lan-dns-mode="system">
          <strong>Как в OpenWrt</strong>
          <span>Убрать переопределение server/noresolv и вернуть dnsmasq к системным настройкам WAN.</span>
        </button>
      </div>
      <div class="lan-dns-form">
        <div class="form-row">
          <label>Адрес внешнего DNS или Pi-hole</label>
          <input id="lanDnsUpstream" value="${escapeHtml(state.lanDnsUpstream)}" placeholder="192.168.1.10 или 192.168.1.10#53" ${state.lanDnsMode === 'upstream' ? '' : 'disabled'} />
        </div>
        <label class="settings-check compact ${state.lanDnsRestart ? 'active' : ''}">
          <input id="lanDnsRestart" type="checkbox" ${state.lanDnsRestart ? 'checked' : ''} />
          <span><strong>Перезапустить dnsmasq</strong><em>Изменения UCI начнут работать сразу после restart.</em></span>
        </label>
      </div>
      <div class="lan-dns-readiness">
        <article class="${readiness.inbound ? 'ok' : 'warn'}"><span>DNS inbound</span><strong>${readiness.inbound ? 'готов' : 'не найден'}</strong></article>
        <article class="${readiness.outbound ? 'ok' : 'warn'}"><span>dns-out</span><strong>${readiness.outbound ? 'готов' : 'не найден'}</strong></article>
        <article class="${readiness.rule ? 'ok' : 'warn'}"><span>Маршрут DNS</span><strong>${readiness.rule ? 'готов' : 'не найден'}</strong></article>
        <article class="${readiness.port ? 'ok' : 'warn'}"><span>Порт 5353</span><strong>${readiness.port ? 'слушает' : 'закрыт'}</strong></article>
      </div>
      ${commands.length ? `<div class="lan-dns-preview">
        <strong>Будет выполнено</strong>
        <pre>${escapeHtml(commands.join('\n'))}</pre>
      </div>` : '<p class="muted">Сначала нажмите «Проверить и показать команды»: RuOpenRay ничего не изменит, только покажет план.</p>'}
      ${warnings.length ? `<div class="settings-warning"><strong>Важно</strong><span>${escapeHtml(warnings.join(' '))}</span></div>` : ''}
      ${xrayNeedsReadiness && !readiness.ready ? `<div class="settings-warning"><strong>DNS через Xray пока не готов</strong><span>Сначала подготовьте DNS inbound, примените конфигурацию Xray и убедитесь, что порт 127.0.0.1:5353 слушает. Кнопка применения заблокирована, чтобы не оставить LAN без DNS.</span></div>` : ''}
      <div class="settings-warning">
        <strong>Если Pi-hole главный DNS</strong>
        <span>DHCP может выдавать клиентам Pi-hole напрямую. Тогда в Pi-hole upstream укажите ${escapeHtml(routerLan)}#5353, а Xray DNS inbound должен быть доступен с LAN-адреса роутера. Не делайте цепочку Pi-hole → роутер → Pi-hole.</span>
      </div>
      <div class="toolbar">
        <button class="btn secondary" data-action="previewLanDnsUpstream" ${state.lanDnsSaving || status.available === false ? 'disabled' : ''}>Проверить и показать команды</button>
        <button class="btn warning" data-action="applyLanDnsUpstream" ${applyDisabled ? 'disabled' : ''}>Применить LAN DNS</button>
        <button class="btn secondary" data-action="prepareDnsInbound">Подготовить DNS inbound</button>
      </div>
    </section>
  `;
}

function dnsPanel() {
  const dns = dnsConfig();
  const stats = dnsStats();
  const dnsTabs = [
    ['servers', 'Серверы'],
    ['hosts', 'Hosts'],
    ['lan', 'LAN DNS'],
    ['guard', 'Защита'],
    ['advanced', 'Режим']
  ];
  const view = dnsTabs.some(([value]) => value === state.dnsView) ? state.dnsView : 'servers';
  const views = {
    servers: () => dnsServersSection(dns),
    hosts: () => dnsHostsSection(dns),
    lan: lanDnsSection,
    guard: () => dnsLeakChecklist(dns, stats),
    advanced: dnsAdvancedSection
  };
  return `
    <section class="route-hero dns-hero">
      <div>
        <h2>DNS Xray</h2>
        <p>DNS-серверы, защита от утечек, проверка резолва и advanced-режимы разделены по вкладкам.</p>
      </div>
      <div class="route-score">
        <strong>${stats.servers}</strong>
        <span>DNS-серверов</span>
      </div>
    </section>

    <section class="stats route-stats">
      ${stat('DoH', stats.doh, 'HTTPS DNS-серверы')}
      ${stat('TCP DNS', stats.tcp, 'Серверы через TCP')}
      ${stat('Hosts', stats.hosts, 'Локальные подмены')}
      ${stat('Всего', stats.servers, 'Записи в dns.servers')}
    </section>

    <section class="routing-nav-panel dns-nav-panel">
      <div class="routing-subnav" role="tablist" aria-label="Подменю DNS">
        ${dnsTabs.map(([value, label]) => `<button type="button" class="${view === value ? 'active' : ''}" data-dns-view="${value}">${label}</button>`).join('')}
      </div>
    </section>

    ${views[view]()}
    ${state.message ? `<p class="notice dns-page-message">${escapeHtml(state.message)}</p>` : ''}
  `;
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

function domainMonitorStatusItems() {
  const monitor = state.domainMonitor || {};
  const sourcePath = String(monitor.sourcePath || '');
  const quality = domainMonitorDomainQuality();
  const transparent = configInbounds().find((item) => item?.tag === 'transparent_ipv4' || item?.streamSettings?.sockopt?.tproxy);
  const sniffing = transparent?.sniffing || {};
  const destOverride = Array.isArray(sniffing.destOverride) ? sniffing.destOverride : [];
  const snifferOk = Boolean(sniffing.enabled && (destOverride.includes('tls') || destOverride.includes('http') || destOverride.includes('quic')));
  const accessPath = state.loggingAccessPath || state.config?.log?.access || '';
  const accessConfigured = Boolean(state.loggingAccessLog || state.config?.log?.access);
  const sourceSeesAccess = Boolean((accessPath && sourcePath.includes(accessPath)) || sourcePath.includes('access') || monitor.source === 'b4sni');
  const dnsLog = Boolean(state.loggingDnsLog || state.config?.log?.dnsLog);
  const lanDns = state.lanDnsStatus || {};
  const lanDnsXray = Boolean(lanDns.mode === 'xray' && lanDns.readiness?.ready);
  const hasEvents = Number(monitor.stats?.total || 0) > 0 || quality.total > 0;
  const hasDomains = quality.hasDomains || Number(monitor.stats?.uniqueDomains || 0) > 0;
  const cards = [
    {
      tone: monitor.running ? 'ok' : 'bad',
      title: 'Монитор',
      value: monitor.running ? 'запущен' : 'остановлен',
      detail: monitor.running ? 'RuOpenRay читает access/DNS-логи Xray и b4sni-совместимые файлы.' : 'Нажмите «Запустить», чтобы начать читать события.'
    },
    {
      tone: accessConfigured && sourceSeesAccess ? 'ok' : accessConfigured ? 'warn' : 'bad',
      title: 'Источник',
      value: monitorSourceLabel(),
      detail: sourcePath ? sourcePath : 'Пока нет доступного access-log. Включите access-логирование Xray.'
    },
    {
      tone: lanDnsXray ? 'ok' : 'warn',
      title: 'DNS LAN',
      value: lanDnsXray ? 'через Xray' : lanDns.mode || 'system',
      detail: lanDnsXray ? 'dnsmasq отправляет запросы LAN в 127.0.0.1#5353.' : 'Если оставить системный DNS, Xray часто увидит только IP.'
    },
    {
      tone: dnsLog ? 'ok' : 'warn',
      title: 'DNS-лог',
      value: dnsLog ? 'включен' : 'выключен',
      detail: dnsLog ? 'DNS-запросы дают домены даже когда соединение идет к IP.' : 'Для доменов включите DNS logging в настройках логирования.'
    },
    {
      tone: snifferOk ? 'ok' : 'warn',
      title: 'Сниффер',
      value: snifferOk ? destOverride.join(' + ') : 'не помогает',
      detail: snifferOk ? 'TLS/HTTP SNI может дать домен без DNS-запроса.' : 'Включите HTTP + TLS в перехвате, чтобы ловить SNI.'
    },
    {
      tone: hasDomains ? 'ok' : hasEvents ? 'warn' : 'bad',
      title: 'Домены',
      value: hasDomains ? `${quality.domains || monitor.stats?.uniqueDomains || 0} найдено` : hasEvents ? 'только IP' : 'нет событий',
      detail: hasDomains ? `${quality.domainShare || 0}% live-событий сейчас с доменными именами, ${quality.ips || 0} событий только с IP.` : hasEvents ? 'Трафик есть, но клиент/приложение ходит по IP или DNS обходит Xray.' : 'Откройте сайт на LAN/Wi-Fi устройстве и обновите монитор.'
    }
  ];
  const tips = [];
  if (!monitor.running) tips.push('Запустите монитор кнопкой сверху.');
  if (!accessConfigured || !sourceSeesAccess) tips.push('Включите access-log Xray и убедитесь, что путь логов совпадает с активным config.');
  if (!lanDnsXray) tips.push('В DNS → LAN DNS направьте dnsmasq на Xray: 127.0.0.1#5353.');
  if (!dnsLog) tips.push('В настройках логирования включите DNS-лог, иначе DNS-запросы не попадут в монитор.');
  if (!snifferOk) tips.push('В перехвате включите сниффер HTTP + TLS, чтобы видеть SNI из HTTPS-соединений.');
  if (hasEvents && !hasDomains) tips.push('После изменения DNS на телефоне иногда нужно переподключить Wi-Fi или открыть новый домен без кэша.');
  if (!tips.length) {
    tips.push('Откройте новый сайт на Wi-Fi/LAN клиенте, затем смотрите вкладки «Домены», «Устройства» или «Live».');
    tips.push('Если видны только IP, приложение могло взять адрес из кэша, Private DNS/DoH или готового IP-соединения.');
    tips.push('Для чистой проверки переподключите Wi-Fi на клиенте или закройте приложение и откройте новый домен.');
  }
  return { cards, tips, quality };
}

function domainMonitorStatusPanel() {
  const { cards, tips } = domainMonitorStatusItems();
  return `
    <div class="domain-monitor-health">
      <div class="domain-monitor-health-grid">
        ${cards.map((item) => `<article class="${item.tone}">
          <span>${escapeHtml(item.title)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <small>${escapeHtml(item.detail)}</small>
        </article>`).join('')}
      </div>
      <div class="domain-monitor-help">
        <strong>Как увидеть домены</strong>
        <ol>
          ${tips.slice(0, 5).map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}
        </ol>
      </div>
    </div>
  `;
}

function diagnosticsDomainView() {
  const logRows = aggregateLogDomains();
  const accessRows = accessLogRows(state.logs).slice(0, 30);
  const rows = domainDiagnosticRows();
  return `
    <section class="panel">
      <div class="panel-title">
        <div><h2>По доменам</h2><span>Агрегация из live-логов: частые домены, устройства, протоколы и направления.</span></div>
        <button class="btn secondary" data-tab-jump="routing">Открыть маршруты</button>
      </div>
      ${accessLogTable(accessRows)}
      <div class="diagnostic-list">
        ${logRows.length ? logRows.map((item) => `<article class="diagnostic-row">
          <div>
            <strong>${escapeHtml(item.host)}</strong>
            <span>${item.devices.size || 'нет'} устройств · ${[...item.protocols].join('/') || 'protocol ?'} · ${[...item.outbound].join(', ') || 'направление ?'}</span>
          </div>
          <em>${item.hits} событий</em>
          <button class="btn secondary" data-domain-to-route="${escapeHtml(item.host)}">В правило</button>
        </article>`).join('') : rows.map(({ info, index }) => `<article class="diagnostic-row">
          <div>
            <strong>${escapeHtml(info.value)}</strong>
            <span>${escapeHtml(info.detail || 'domain rule')}</span>
          </div>
          <em>${escapeHtml(info.outbound)}</em>
          <button class="btn secondary" data-route-focus="${index}">Найти</button>
        </article>`).join('') || '<p class="muted">В логах и маршрутизации пока нет доменов. Включите access-логи или добавьте доменное правило.</p>'}
      </div>
    </section>
  `;
}

function domainMonitorFilterBar() {
  const counts = domainMonitorFilterCounts();
  const filters = [
    ['domains', 'Домены', counts.domains],
    ['ip', 'IP', counts.ip],
    ['dns', 'DNS', counts.dns],
    ['tcp', 'TCP', counts.tcp],
    ['udp', 'UDP', counts.udp],
    ['all', 'Все', counts.all]
  ];
  return `
    <div class="domain-monitor-filters" role="group" aria-label="Фильтр событий монитора">
      ${filters.map(([value, label, count]) => `<button type="button" class="${state.domainMonitorFilter === value ? 'active' : ''}" data-domain-filter="${value}">
        <span>${label}</span>
        <strong>${Number(count || 0).toLocaleString('ru-RU')}</strong>
      </button>`).join('')}
    </div>
  `;
}

function domainMonitorKind(host) {
  if (!host) return { label: 'EVENT', tone: 'muted' };
  if (isIpLiteral(host)) return { label: 'IP', tone: 'ip' };
  if (String(host).includes('dns') || String(host).includes('doh')) return { label: 'DNS', tone: 'dns' };
  return { label: 'DOMAIN', tone: 'domain' };
}

function domainMonitorMetaChips(item = {}) {
  const chips = [];
  const protocols = domainMonitorProtocols(item);
  if (protocols.length) chips.push(...protocols.slice(0, 3));
  const outbounds = Array.isArray(item.outbounds) ? item.outbounds : [item.outbound].filter(Boolean);
  if (outbounds.length) chips.push(...outbounds.slice(0, 2));
  if (item.destinationPort) chips.push(`:${item.destinationPort}`);
  return chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('');
}

function domainMonitorDeviceLine(item = {}) {
  const text = domainMonitorDevicesText(item);
  const samples = Array.isArray(item.samples) ? item.samples : [];
  const sample = samples[0] || item;
  const endpoint = [sample.sourceIp, sample.destinationIp ? `→ ${sample.destinationIp}${sample.destinationPort ? `:${sample.destinationPort}` : ''}` : '']
    .filter(Boolean)
    .join(' ');
  return [text, endpoint].filter(Boolean).join(' · ');
}

function domainProbeLine(part = {}, label) {
  if (part.skipped) {
    return `<span>${escapeHtml(label)}: пропущено</span>`;
  }
  const ok = part.ok === true;
  const latency = Number(part.latencyMs || 0);
  const suffix = latency ? ` · ${latency} мс` : '';
  const status = part.status ? ` HTTP ${part.status}` : '';
  return `<span class="${ok ? 'ok' : 'bad'}">${escapeHtml(label)}: ${ok ? 'да' : 'нет'}${escapeHtml(status + suffix)}</span>`;
}

function domainProbeStatusHtml(host) {
  const checking = state.domainProbeChecking === host;
  const result = state.domainProbeResults[host];
  if (checking) {
    return `<div class="domain-probe pending"><span>проверяю...</span></div>`;
  }
  if (!result) {
    return `<button class="btn secondary compact" data-domain-probe="${escapeHtml(host)}">Проверить</button>`;
  }
  if (result.ok === false) {
    return `<div class="domain-probe bad">
      <strong>ошибка</strong>
      <span>${escapeHtml(result.stderr || result.error || 'не удалось проверить')}</span>
      <button class="btn secondary compact" data-domain-probe="${escapeHtml(host)}">Повторить</button>
    </div>`;
  }
  const code = result.verdict?.code || '';
  const checks = result.checks || {};
  return `<div class="domain-probe ${escapeHtml(code)}">
    <strong>${escapeHtml(result.verdict?.label || 'проверено')}</strong>
    ${domainProbeLine(checks.ping, 'ping с роутера')}
    ${domainProbeLine(checks.tcpDirect, 'tcp напрямую')}
    ${domainProbeLine(checks.tcpProxy, `tcp через ${result.tag || 'proxy'}`)}
    ${domainProbeLine(checks.httpDirect || result.direct, 'http напрямую')}
    ${domainProbeLine(checks.httpProxy || result.proxy, `http через ${result.tag || 'proxy'}`)}
    <small>${escapeHtml(result.verdict?.detail || '')}</small>
    <button class="btn secondary compact" data-domain-probe="${escapeHtml(host)}">Повторить</button>
  </div>`;
}

function domainMonitorItemHtml(item, { event = false } = {}) {
  const host = domainMonitorHost(item) || 'unknown';
  const kind = domainMonitorKind(host);
  const hits = event ? 1 : Number(item.hits || 0);
  const time = event ? item.time : item.lastSeen;
  return `<article class="domain-monitor-item ${kind.tone}">
    <div class="domain-monitor-kind">${kind.label}</div>
    <div class="domain-monitor-main">
      <strong>${escapeHtml(host)}</strong>
      <small>${escapeHtml(domainMonitorDeviceLine(item))}</small>
    </div>
    <div class="domain-monitor-chips">${domainMonitorMetaChips(item)}</div>
    <div class="domain-monitor-count">
      <strong>${hits.toLocaleString('ru-RU')}</strong>
      <small>${escapeHtml(time || '')}</small>
    </div>
    ${domainProbeStatusHtml(host)}
    <button class="btn secondary" data-domain-to-route="${escapeHtml(host)}">В правило</button>
  </article>`;
}

function domainMonitorRowsHtml(monitored, fallbackRows, rows) {
  if (state.domainMonitorMode === 'devices') {
    const devices = monitoredDevices();
    return devices.slice(0, 80).map((item) => `<article class="domain-monitor-device">
      <div class="domain-monitor-kind">LAN</div>
      <div class="domain-monitor-main">
        <strong>${escapeHtml(item.name || item.ip || 'устройство')}</strong>
        <small>${escapeHtml(item.ip || '')}</small>
      </div>
      <div class="domain-monitor-device-domains">${(item.topDomains || []).slice(0, 4).map((domain) => `<span>${escapeHtml(domain.host)} <b>${domain.hits}</b></span>`).join('')}</div>
      <div class="domain-monitor-count"><strong>${Number(item.hits || 0).toLocaleString('ru-RU')}</strong><small>событий</small></div>
      <button class="btn secondary" data-device-ip="${escapeHtml(item.ip || '')}">Устройство</button>
    </article>`).join('') || '<p class="muted">Устройства пока не определены. Нужны access-логи или b4sni-совместимый лог.</p>';
  }
  if (state.domainMonitorMode === 'events') {
    const events = monitoredEvents();
    return events.slice(0, 160).map((item) => domainMonitorItemHtml(item, { event: true })).join('') || '<p class="muted">Живых событий пока нет. Нажмите Start и проверьте, что access-логирование включено.</p>';
  }
  return monitored.length ? monitored.slice(0, 80).map((item) => domainMonitorItemHtml(item)).join('') : fallbackRows.length && state.domainMonitorFilter === 'all' ? fallbackRows.map((item) => `<article class="diagnostic-row">
    <div>
      <strong>${escapeHtml(item.host)}</strong>
      <span>${item.devices.size || 'нет'} устройств · ${[...item.protocols].join('/') || 'protocol ?'} · ${[...item.outbound].join(', ') || 'направление ?'}</span>
    </div>
    <em>${item.hits} событий</em>
    <button class="btn secondary" data-domain-to-route="${escapeHtml(item.host)}">В правило</button>
  </article>`).join('') : rows.map(({ info, index }) => `<article class="diagnostic-row">
    <div>
      <strong>${escapeHtml(info.value)}</strong>
      <span>${escapeHtml(info.detail || 'domain rule')}</span>
    </div>
    <em>${escapeHtml(info.outbound)}</em>
    <button class="btn secondary" data-route-focus="${index}">Найти</button>
  </article>`).join('') || '<p class="muted">Домены пока не пойманы. Включите access-логи Xray или подключите b4sni-совместимый лог.</p>';
}

function diagnosticsDomainMonitorView() {
  const monitor = state.domainMonitor;
  const monitored = monitoredDomains();
  const stats = monitor?.stats || {};
  const fallbackRows = aggregateLogDomains();
  const rows = domainDiagnosticRows();
  const sourcePath = monitor?.sourcePath ? ` · ${monitor.sourcePath}` : '';
  const running = monitor?.running;
  const filterCounts = domainMonitorFilterCounts();
  const topRealDomain = domainMonitorRows()
    .filter((item) => domainMonitorMatchesFilter(item, 'domains'))
    .sort((a, b) => (b.hits || 0) - (a.hits || 0))[0];
  return `
    <section class="panel">
      <div class="panel-title">
        <div><h2>Мониторинг доменов</h2><span>SNI/домены как в B4SNI: живой поток, группировка по устройствам и быстрое добавление в маршрутизацию.</span></div>
        <div class="split-actions">
          ${running
            ? '<button class="btn danger" data-action="stopDomainMonitor">Остановить</button>'
            : '<button class="btn warning" data-action="startDomainMonitor">Запустить</button>'}
          <button class="btn secondary" data-action="clearDomainMonitor">Очистить</button>
          <button class="btn secondary" data-action="refreshDomainMonitor">Обновить</button>
          <button class="btn secondary" data-tab-jump="routing">Маршруты</button>
        </div>
      </div>
      <div class="domain-monitor-state ${running ? 'running' : 'stopped'}">
        <strong>${running ? 'SNI-монитор запущен' : 'SNI-монитор остановлен'}</strong>
        <span>${escapeHtml(monitor?.hint || 'Запуск включает сбор и чтение SNI/domain событий, остановка выключает мониторинг.')}</span>
      </div>
      ${domainMonitorStatusPanel()}
      <section class="stats route-stats domain-monitor-stats">
        ${stat('Источник', monitorSourceLabel(), `${monitor?.running ? 'монитор запущен' : 'лог-файл'}${sourcePath}`)}
        ${stat('События', stats.total || 0, `${stats.tcp || 0} TCP · ${stats.udp || 0} UDP`)}
        ${stat('Домены', filterCounts.domains || monitored.length || 0, topRealDomain ? `топ: ${topRealDomain.host} (${topRealDomain.hits})` : 'ожидаю доменные события')}
      </section>
      ${domainMonitorFilterBar()}
      <div class="domain-monitor-toolbar">
        <input id="domainMonitorQuery" value="${escapeHtml(state.domainMonitorQuery)}" placeholder="Найти домен, устройство или протокол" />
        <div class="segmented compact">
          ${[
            ['hits', 'По частоте'],
            ['last', 'По времени'],
            ['name', 'A-Z']
          ].map(([value, label]) => `<button type="button" class="${state.domainMonitorSort === value ? 'active' : ''}" data-domain-sort="${value}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="domain-monitor-mode segmented compact">
        ${[
          ['domains', 'Домены'],
          ['devices', 'Устройства'],
          ['events', 'События']
        ].map(([value, label]) => `<button type="button" class="${state.domainMonitorMode === value ? 'active' : ''}" data-domain-mode="${value}">${value === 'events' ? 'Live' : label}</button>`).join('')}
      </div>
      <div class="diagnostic-list domain-monitor-list">
        ${domainMonitorRowsHtml(monitored, fallbackRows, rows)}
      </div>
    </section>
  `;
}

function diagnosticsLiveView() {
  const checks = Object.values(state.serverChecks);
  return `
    <section class="stats route-stats">
      ${stat('Проверки', checks.length || '—', checks.length ? `${checks.filter((item) => item?.ok).length} доступно` : 'серверы еще не проверялись')}
      ${stat('Логи', state.logLive ? 'Live' : 'Пауза', `${state.logLines} строк · ${state.logSort === 'desc' ? 'новые сверху' : 'новые снизу'}`)}
      ${stat('Устройства', deviceRules().length, 'source-правила LAN')}
      ${stat('Домены', domainDiagnosticRows().length, 'доменные правила')}
    </section>
    ${logsPanel(false)}
  `;
}

function diagnosticsTrafficView() {
  const system = state.status?.system || {};
  const traffic = system.traffic || {};
  const conntrack = system.conntrack || {};
  const xrayStats = state.status?.xrayStats || {};
  const totals = xrayStatsTotals(xrayStats);
  const active = xrayActiveStats(xrayStats);
  const totalConnections = conntrack.ok ? conntrack.total : ((system.tcp?.total || 0) + (conntrack.udp || 0));
  return `
    <section class="traffic-overview-panel">
      <article class="traffic-overview-main">
        <span>Активный сервер Xray</span>
        <strong>${escapeHtml(active?.tag || 'статистика выключена')}</strong>
        <small>${escapeHtml(active ? `прием ${byteRate(active.downRate)} · отдача ${byteRate(active.upRate)}` : 'включите статистику Xray, чтобы видеть трафик по серверам')}</small>
      </article>
      <article>
        <span>Через proxy</span>
        <strong>${escapeHtml(byteRate(xrayStats.groups?.proxy?.downRate))} прием</strong>
        <small>${escapeHtml(`${byteSize(xrayStats.groups?.proxy?.downlink)} принято · ${byteSize(xrayStats.groups?.proxy?.uplink)} отправлено`)}</small>
      </article>
      <article>
        <span>WAN-интерфейс</span>
        <strong>${escapeHtml(traffic.interface || '—')}</strong>
        <small>${escapeHtml(traffic.interface ? `прием ${byteRate(traffic.rxRate)} · отдача ${byteRate(traffic.txRate)}` : 'системный счетчик пока пустой')}</small>
      </article>
      <article>
        <span>Соединения</span>
        <strong>${escapeHtml(totalConnections || totalConnections === 0 ? totalConnections : '—')}</strong>
        <small>${escapeHtml(conntrack.ok ? `${conntrack.tcp || 0} TCP · ${conntrack.udp || 0} UDP` : 'conntrack недоступен')}</small>
      </article>
    </section>
    ${xrayStatsPanel(xrayStats)}
    <section class="panel traffic-system-panel">
      <div class="panel-title">
        <div>
          <h2>Системный трафик интерфейса</h2>
          <span>WAN-график показывает общий трафик выбранного интерфейса. Для VPN смотрите статистику Xray выше.</span>
        </div>
        <span class="traffic-period-pill">Через Xray: ${escapeHtml(byteSize(totals.downlink))} принято · ${escapeHtml(byteSize(totals.uplink))} отправлено</span>
      </div>
      ${trafficMonitor(system)}
    </section>
  `;
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

function clientTrafficTestView() {
  const baseline = state.clientTrafficBaseline;
  const result = state.clientTrafficResult;
  return `
    <section class="panel client-traffic-test">
      <div class="panel-title">
        <div>
          <h2>Клиентский тест трафика</h2>
          <span>Самый честный тест transparent proxy: открыть URL с телефона/ПК в LAN и проверить, выросли ли nft/Xray счетчики.</span>
        </div>
        <div class="split-actions">
          <button class="btn secondary" type="button" data-action="startClientTrafficTest">Начать замер</button>
          <button class="btn warning" type="button" data-action="finishClientTrafficTest" ${baseline ? '' : 'disabled'}>Проверить после клиента</button>
        </div>
      </div>
      <div class="client-test-grid">
        <article>
          <strong>1. Начните замер</strong>
          <span>RuOpenRay запомнит текущие nftables и Xray stats.</span>
        </article>
        <article>
          <strong>2. Откройте с LAN-устройства</strong>
          <code>${escapeHtml(state.clientTrafficUrl)}</code>
        </article>
        <article>
          <strong>3. Проверьте результат</strong>
          <span>${baseline ? `точка отсчета: ${new Date(baseline.at).toLocaleTimeString('ru-RU')}` : 'сначала нажмите “Начать замер”'}</span>
        </article>
      </div>
      <div class="form-row">
        <label>URL для LAN-устройства</label>
        <input id="clientTrafficUrl" value="${escapeHtml(state.clientTrafficUrl)}" placeholder="https://www.gstatic.com/generate_204" />
      </div>
      ${result ? `<div class="setup-result ${result.ok ? 'ok' : 'bad'}">
        <strong>${result.ok ? 'Трафик идет через цепочку' : 'Рост счетчиков не найден'}</strong>
        <span>nft +${byteSize(result.nftDelta)} · Xray stats +${byteSize(result.statsDelta)}${result.statsEnabled ? '' : ' · учет Xray stats выключен'}${result.activeTag ? ` · активный proxy: ${escapeHtml(result.activeTag)}` : ''}</span>
      </div>` : '<p class="muted">Для проверки нужен реальный LAN-клиент. Запрос с самого роутера может идти другим путем и не доказывает работу перехвата.</p>'}
    </section>
  `;
}

function diagnosticsChainView() {
  const result = state.diagnosticsChainResult;
  const steps = result?.steps || [];
  return `
    <section class="panel chain-diagnostics">
      <div class="panel-title">
        <div>
          <h2>Проверка цепочки подключения</h2>
          <span>Проверяет Xray config, LAN DNS, dnsmasq, nftables, policy routing, запрос с роутера и Xray stats.</span>
        </div>
        <button class="btn" type="button" data-action="runConnectivityDiagnostics" ${state.diagnosticsChainRunning ? 'disabled' : ''}>${state.diagnosticsChainRunning ? 'Проверяю...' : 'Проверить цепочку'}</button>
      </div>
      <div class="chain-url-row">
        <div class="form-row">
          <label>URL для проверки с роутера</label>
          <input id="diagnosticsTestUrl" value="${escapeHtml(state.diagnosticsTestUrl)}" placeholder="https://www.gstatic.com/generate_204" />
        </div>
        <p>Запрос выполняет сам роутер. Так видно, растут ли nft-счетчики и статистика Xray после реального исходящего запроса.</p>
      </div>
      <div class="setup-result-list chain-result-list">
        ${steps.length ? steps.map((step) => `<article class="${step.ok ? 'ok' : step.tone === 'warn' ? 'warn' : 'bad'}">
          <span>${step.ok ? '✓' : step.tone === 'warn' ? '!' : '×'}</span>
          <div><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.detail || '')}</small></div>
        </article>`).join('') : '<p class="muted">Нажмите проверку: результат появится здесь по шагам.</p>'}
      </div>
    </section>
    ${clientTrafficTestView()}
  `;
}

function diagnosticsPanel() {
  const checks = Object.values(state.serverChecks);
  const alive = checks.filter((item) => item?.ok).length;
  const views = {
    live: diagnosticsLiveView,
    chain: diagnosticsChainView,
    traffic: diagnosticsTrafficView,
    sni: sniPanel,
    domains: diagnosticsDomainMonitorView
  };
  const activeView = views[state.diagnosticsView] ? state.diagnosticsView : 'live';
  return `
    <section class="route-hero diagnostics-hero">
      <div>
        <h2>Диагностика</h2>
        <p>SNI-поиск, логи в реальном времени, проверка цепочки и мониторинг доменов.</p>
      </div>
      <div class="route-score">
        <strong>${checks.length ? `${alive}/${checks.length}` : '—'}</strong>
        <span>последняя проверка серверов</span>
      </div>
    </section>

    <section class="panel diagnostic-switcher">
      <div class="segmented diagnostics-tabs" aria-label="Режим диагностики">
        ${[
          ['live', 'Live'],
          ['chain', 'Цепочка'],
          ['traffic', 'Трафик'],
          ['sni', 'SNI'],
          ['domains', 'Домены']
        ].map(([value, label]) => `<button type="button" class="${activeView === value ? 'active' : ''}" data-diagnostics-view="${value}">${label}</button>`).join('')}
      </div>
    </section>

    ${views[activeView]()}
  `;
}

function observatoryPanel() {
  const obs = observatoryConfig();
  const burst = burstObservatoryConfig();
  const burstPing = burst.pingConfig && typeof burst.pingConfig === 'object' ? burst.pingConfig : {};
  const probeURL = obs.probeURL || burstPing.destination || state.serverCheckUrl || 'https://www.gstatic.com/generate_204';
  const probeInterval = obs.probeInterval || burstPing.interval || state.observatoryInterval || '10s';
  const selectors = observatorySelectors();
  const burstSelectors = burstObservatorySelectors();
  const allSelectors = [...new Set([...selectors, ...burstSelectors])];
  const matched = allSelectors.length ? proxyOutbounds().filter((outbound) => outboundMatchesSelectors(outbound, allSelectors)) : [];
  const observedMatched = observatoryMatchedOutbounds();
  const burstMatched = burstSelectors.length ? proxyOutbounds().filter((outbound) => outboundMatchesSelectors(outbound, burstSelectors)) : [];
  const required = observatoryRequiredBalancers();
  const missing = required.filter((balancer) => {
    const balancerSelectors = Array.isArray(balancer.selector) ? balancer.selector : [];
    const requiredSelectors = strategyObserverType(balancer?.strategy?.type) === 'burstObservatory' ? burstSelectors : selectors;
    return !balancerSelectors.some((selector) => requiredSelectors.includes(selector));
  });
  const checkTags = matched.length ? matched.map((outbound) => outbound.tag).filter(Boolean) : proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean);
  return `
    <section class="panel observatory-panel">
      <div class="panel-title">
        <div><h2>Наблюдение Xray для балансировки</h2><span>Это настройки xray-core для групп серверов. Ручная проверка RuOpenRay остается в разделе Proxy и не меняет конфигурацию Xray.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-action="checkObservatoryTargets" ${checkTags.length ? '' : 'disabled'}>Проверить через RuOpenRay</button>
          <button class="btn" data-action="enableObservatoryForProxy">Включить для proxy</button>
        </div>
      </div>
      <div class="observatory-settings">
        <div class="form-row">
          <label>URL проверки</label>
          <input id="observatoryCheckUrl" value="${escapeHtml(probeURL)}" placeholder="https://www.gstatic.com/generate_204" />
        </div>
        <div class="form-row">
          <label>Интервал наблюдения</label>
          <input id="observatoryInterval" value="${escapeHtml(probeInterval)}" placeholder="10s, 30s, 1m" />
        </div>
        <p class="inline-help">Стратегия “меньший ping” использует Observatory. Стратегия “меньше нагрузка” использует Burst Observatory. “Случайно” и “по очереди” работают без наблюдения.</p>
      </div>
      <div class="manual-check-settings">
        <strong>Ручная проверка RuOpenRay</strong>
        <div class="manual-check-grid">
          <div class="form-row">
            <label>Метод</label>
            <select id="serverCheckMode">
              <option value="http" ${state.serverCheckMode === 'http' ? 'selected' : ''}>HTTP через proxy</option>
              <option value="endpoint" ${state.serverCheckMode === 'endpoint' ? 'selected' : ''}>TCP-порт</option>
            </select>
          </div>
          <div class="form-row">
            <label>Таймаут, мс</label>
            <input id="serverCheckTimeout" type="number" min="300" max="15000" step="100" value="${escapeHtml(state.serverCheckTimeout)}" />
          </div>
          <div class="form-row">
            <label>Попыток</label>
            <input id="serverCheckAttempts" type="number" min="1" max="5" step="1" value="${escapeHtml(state.serverCheckAttempts)}" />
          </div>
        </div>
        <span>Ручная проверка нужна для выбора прокси сейчас. Observatory — это уже настройка самого Xray для групп серверов.</span>
      </div>
      <div class="observatory-grid">
        <article>
          <span>Observatory</span>
          <strong>${observedMatched.length ? `${observedMatched.length} серверов` : 'не включен'}</strong>
        </article>
        <article>
          <span>Burst Observatory</span>
          <strong>${burstMatched.length ? `${burstMatched.length} серверов` : 'не включен'}</strong>
        </article>
        <article>
          <span>URL Xray</span>
          <strong>${escapeHtml(obs.probeURL || 'не применен')}</strong>
        </article>
        <article>
          <span>Burst URL</span>
          <strong>${escapeHtml(burstPing.destination || 'не применен')}</strong>
        </article>
        <article>
          <span>Интервал Xray</span>
          <strong>${escapeHtml(obs.probeInterval || burstPing.interval || 'не применен')}</strong>
        </article>
        <article class="${missing.length ? 'warn' : ''}">
          <span>Нужно для групп</span>
          <strong>${required.length}${missing.length ? `, ${missing.length} не включены` : ''}</strong>
        </article>
      </div>
      <div class="observatory-tags">
        ${allSelectors.length ? allSelectors.map((selector) => `<span>${escapeHtml(selector)}</span>`).join('') : '<span class="muted">серверы для Xray-наблюдения пока не выбраны</span>'}
      </div>
      ${matched.length ? `<div class="observatory-targets">
        ${matched.map((outbound) => {
          const check = checkForTag(outbound.tag);
          return `<article>
            <strong>${escapeHtml(outbound.tag)}</strong>
            <span>${escapeHtml(outboundAddress(outbound))}</span>
            <b class="check-badge ${check?.ok ? 'ok' : check ? 'bad' : ''}">${escapeHtml(checkLabel(check))}</b>
          </article>`;
        }).join('')}
      </div>` : ''}
      ${missing.length ? `<p class="settings-warning compact"><strong>Внимание</strong><span>Некоторые группы используют умную стратегию, но нужный Xray observer еще не покрывает их серверы.</span></p>` : ''}
    </section>
  `;
}

function routingRulesPanel() {
  const rules = routeRules();
  const stats = routeStats();
  const options = routeTargetOptions();
  const visibleRules = visibleRoutingRuleItems(80);

  return `
    <section class="panel routing-simple-panel">
      <div class="panel-title">
        <div><h2>Правила маршрутизации</h2><span>${rules.length} правил в текущем профиле. Xray читает их сверху вниз.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-action="test" ${state.configTesting || state.configApplying ? 'disabled' : ''}>${state.configTesting ? 'Проверяю...' : 'Проверить'}</button>
          <button class="btn warning" data-action="apply" ${state.configApplying || state.configTesting ? 'disabled' : ''}>${state.configApplying ? 'Применяю...' : 'Применить'}</button>
        </div>
      </div>
      ${operationProgressView()}
      <div class="routing-summary">
        ${routeSectionDefinitions(stats).map((item) => `<article class="routing-summary-card routing-summary-${item.id}">
          <span>${escapeHtml(item.title)}</span>
          <strong>${item.count}</strong>
          <small>${escapeHtml(item.detail)}</small>
        </article>`).join('')}
      </div>
      <div class="route-tools">
        <button class="btn" data-action="openRouteRuleDialog">Добавить правило</button>
        <input id="routeSearch" value="${escapeHtml(state.routeSearch)}" placeholder="Найти: youtube, 192.168, proxy, direct..." />
        <button class="btn secondary" data-action="disableVisibleRoutes" ${visibleRules.length ? '' : 'disabled'}>Отключить найденные</button>
        <span class="muted">${visibleRules.length} из ${rules.length}</span>
      </div>
      ${state.message ? `<p class="notice" style="margin-top: 14px">${escapeHtml(state.message)}</p>` : ''}
      <div class="route-table">
        ${orderedRouteList(visibleRules, options, rules.length)}
      </div>
      ${state.disabledRouteRules.length ? `<div class="disabled-routes">
        <div class="disabled-routes-head">
          <strong>Отключенные правила</strong>
          <span>${state.disabledRouteRules.length} сохранено вне активного Xray-конфига</span>
          <button class="btn secondary" data-action="restoreAllDisabledRoutes">Вернуть все</button>
        </div>
        ${state.disabledRouteRules.slice(0, 20).map((item) => {
          const info = describeRouteRule(item.rule);
          return `<article class="disabled-route-row">
            <div>
              <strong>${escapeHtml(item.name || routeRuleName(item.rule, info))}</strong>
              <span>${escapeHtml(info.value)} → ${escapeHtml(info.outbound)}</span>
            </div>
            <button class="btn secondary" data-route-restore="${escapeHtml(item.id)}">Вернуть</button>
            <button class="btn danger" data-route-disabled-delete="${escapeHtml(item.id)}">Удалить</button>
          </article>`;
        }).join('')}
      </div>` : ''}
    </section>

    <details class="panel route-advanced">
      <summary>
        <span>Дополнительно</span>
        <small>Импорт правил списком и проверка анализа</small>
      </summary>
      <div class="dsl-compact">
        <div class="panel-title">
          <div><h2>Импорт правил списком</h2><span><code>domain(domain:discord.com) -> proxy</code>, alias proxy сейчас ведет на <code>${escapeHtml(resolveRoutingAlias('proxy'))}</code>.</span></div>
          <div class="split-actions">
            <button class="btn secondary" data-action="previewRouteDsl">Предпросмотр</button>
            <button class="btn secondary" data-action="analyzeConfig">Проверить</button>
            <button class="btn secondary" data-action="appendRouteDsl">Добавить</button>
            <button class="btn warning" data-action="replaceRouteDsl">Заменить</button>
          </div>
        </div>
        <div class="form-row">
          <label>Название списка</label>
          <input id="routeDslName" value="${escapeHtml(state.routeDslName)}" placeholder="Например: Discord, YouTube, Игровые сервисы" />
        </div>
        <textarea id="routeDsl" class="dsl-editor" spellcheck="false" placeholder="default: direct&#10;domain(domain:discord.com) -> proxy&#10;network(udp) &amp;&amp; ip(104.16.0.0/12) -> proxy&#10;source(192.168.50.157) -> direct">${escapeHtml(state.routeDsl)}</textarea>
        ${state.routeDslPreview ? dslPreviewView(state.routeDslPreview) : ''}
        ${configAnalysisView()}
      </div>
    </details>
  `;
}

function routingScenariosPanel() {
  const presetEntries = builtinRoutePresetEntries();
  const customEntries = customRoutePresetEntries();
  return `
    <section class="panel routing-scenarios-panel">
      <div class="panel-title">
        <div><h2>Сценарии маршрутизации</h2><span>Подборки правил можно открыть в редакторе, сохранить как свои или добавить через окно “Подборки”.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-action="newRoutePreset">Добавить подборку</button>
        </div>
      </div>
      ${customEntries.length ? `
        <div class="scenario-section-title">Мои подборки</div>
        <div class="scenario-grid">
          ${customEntries.map(([key, preset]) => `<article class="scenario-card custom">
            <div>
              <strong>${escapeHtml(preset.title)}</strong>
              <span>${escapeHtml(preset.detail || 'Пользовательская подборка маршрутизации.')}</span>
            </div>
            <small>${ruleCountLabel(routePresetConditionCount(key))}</small>
            <span class="scenario-actions">
              <button class="btn secondary" data-route-preset-edit="${escapeHtml(key)}">Править</button>
              <button class="icon-btn danger" type="button" data-route-preset-delete="${escapeHtml(key)}" aria-label="Удалить подборку">×</button>
            </span>
          </article>`).join('')}
        </div>
      ` : ''}
      <div class="scenario-section-title">Подборки</div>
      <div class="scenario-grid">
        ${presetEntries.map(([key, preset]) => `<article class="scenario-card">
          <div>
            <strong>${escapeHtml(preset.title)}</strong>
            <span>${escapeHtml(preset.detail || 'Один набор условий для правила маршрутизации.')}</span>
          </div>
          <small>${ruleCountLabel(routePresetConditionCount(key))}</small>
          <button class="btn secondary" data-route-preset-edit="${escapeHtml(key)}">Править</button>
        </article>`).join('')}
      </div>
    </section>
  `;
}

function routingBalancersPanel() {
  const balancers = routeBalancers();
  return `
    ${observatoryPanel()}
    <section class="panel routing-balancers-panel">
      <div class="panel-title">
        <div><h2>Группы серверов</h2><span>Правило может вести не в один сервер, а в группу: случайно, по очереди, по меньшему ping или по меньшей нагрузке. Для ping нужен Observatory, для нагрузки — Burst Observatory.</span></div>
        <button class="btn warning" data-action="openRouteBalancerDialog">Добавить</button>
      </div>
      <div class="balancer-list wide">
        ${balancers.length ? balancers.map((balancer, index) => {
          const selectors = Array.isArray(balancer.selector) ? balancer.selector.join(', ') : '';
          const strategy = balancer.strategy?.type || 'random';
          const used = routeRules().filter((rule) => rule.balancerTag === balancer.tag).length;
          const matched = balancerSelectorMatches(selectors);
          const observer = balancerObserverSummary(balancer);
          return `<article class="balancer-row">
            <div>
              <div class="server-meta-chips balancer-meta-chips">
                <span class="server-chip ${used ? 'ok' : 'muted'}">${escapeHtml(ruleCountLabel(used))}</span>
                <span class="server-chip ${matched.length ? 'info' : 'muted'}">${escapeHtml(`${matched.length} серверов`)}</span>
                <span class="server-chip ${observer.tone}">${escapeHtml(observer.label)}</span>
              </div>
              <strong>${escapeHtml(balancer.tag || 'без имени')}</strong>
              <span>${escapeHtml(balancerStrategyLabel(strategy))} · выбор: ${escapeHtml(selectors || 'не задан')} · правил: ${used}${balancer.fallbackTag ? ` · резерв: ${balancer.fallbackTag}` : ''}</span>
              ${balancerMembersView(matched)}
            </div>
            <button class="btn secondary" type="button" data-route-balancer-edit="${index}">Править</button>
            <button class="btn danger" type="button" data-route-balancer-delete="${index}" ${used ? 'disabled' : ''}>Удалить</button>
          </article>`;
        }).join('') : `<p class="muted">Групп пока нет. Создайте группу, если хотите переключать серверы случайно, по очереди или по меньшей задержке.</p>`}
      </div>
    </section>
  `;
}

function interceptAdvancedSections() {
  const sniffer = currentSnifferSettings();
  const tfo = state.tcpFastOpen || {};
  const tfoDraft = tcpFastOpenDraftEnabled();
  const quicBlocked = state.firewallBlockQuic;
  const snifferWantsQuic = sniffer.mode === 'http-tls-quic';
  return `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Сниффер Xray</h2><span>Advanced-настройка для transparent proxy: Xray извлекает домен из HTTP/TLS/QUIC и использует его в правилах маршрутизации.</span></div>
      </div>
      <div class="advanced-grid">
        <div class="settings-field wide">
          <label>Режим</label>
          <div class="segmented settings-log-levels" aria-label="Режим сниффера">
            ${[
              ['off', 'Выключено'],
              ['http-tls', 'HTTP + TLS'],
              ['http-tls-quic', 'HTTP + TLS + QUIC']
            ].map(([value, label]) => `<button type="button" class="${sniffer.mode === value ? 'active' : ''}" data-sniffer-mode="${value}">${label}</button>`).join('')}
          </div>
          <small>${sniffer.targets ? `Будет применено к inbound: ${sniffer.targets}` : 'Inbound пока не найден. Подготовьте transparent proxy в разделе Перехват.'}</small>
        </div>
        <label class="settings-check compact ${sniffer.routeOnly ? 'active' : ''}">
          <input id="snifferRouteOnly" type="checkbox" ${sniffer.routeOnly ? 'checked' : ''} ${sniffer.mode === 'off' ? 'disabled' : ''} />
          <span><strong>Только для маршрутизации</strong><em>Безопасный режим: домен используется для правил, но destination не подменяется.</em></span>
        </label>
        <div class="settings-field wide">
          <label>Исключенные домены</label>
          <textarea id="snifferExcluded" rows="4" ${sniffer.mode === 'off' ? 'disabled' : ''} placeholder="bank.example.com&#10;*.local">${escapeHtml(sniffer.excluded)}</textarea>
          <small>Добавляйте банки, локальные сервисы, captive portal и устройства, которые плохо переносят sniffing.</small>
        </div>
      </div>
    </section>

    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>QUIC и HTTP/3</h2><span>Это общий переключатель для сниффера и firewall-перехвата: либо пропускаем QUIC в Xray, либо режем UDP/443 и заставляем браузеры перейти на TCP.</span></div>
      </div>
      <div class="advanced-grid two">
        <button type="button" class="advanced-card ${!quicBlocked ? 'active' : ''}" data-quic-policy="allow">
          <strong>Разрешить QUIC</strong>
          <span>Подходит для TPROXY и сниффера HTTP + TLS + QUIC. Xray увидит UDP/443, если transparent-схема готова.</span>
        </button>
        <button type="button" class="advanced-card ${quicBlocked ? 'active' : ''}" data-quic-policy="block">
          <strong>Блокировать QUIC</strong>
          <span>Firewall отбросит UDP/443 до Xray. Браузеры обычно откатываются на TCP, что полезно для REDIRECT и простого TCP-прокси.</span>
        </button>
      </div>
      ${quicBlocked && snifferWantsQuic ? `<div class="settings-warning"><strong>Конфликт</strong><span>В сниффере выбран QUIC, но Block QUIC его отрежет на firewall-уровне. Либо разрешите QUIC, либо переключите сниффер на HTTP + TLS.</span></div>` : ''}
      ${!quicBlocked && state.firewallRouterMode === 'redirect' ? `<div class="settings-warning"><strong>REDIRECT</strong><span>REDIRECT работает в основном с TCP. Если используете его как основной режим роутера, лучше включить блокировку QUIC.</span></div>` : ''}
    </section>

    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>TCP Fast Open</h2><span>Может ускорять установку TCP-соединений, если поддерживается ядром, провайдером и сервером. На слабых роутерах лучше включать осознанно.</span></div>
      </div>
      <div class="settings-info-grid">
        <article><span>Система OpenWrt</span><strong>${escapeHtml(tfo.available ? (tfo.enabled ? 'включено' : 'выключено') : 'недоступно')}</strong></article>
        <article><span>Значение sysctl</span><strong>${escapeHtml(tfo.value ?? '—')}</strong></article>
        <article><span>Черновик Xray</span><strong>${escapeHtml(tfoDraft ? 'включен' : 'выключен')}</strong></article>
        <article><span>Файл sysctl</span><strong>${escapeHtml(tfo.persistentPath || '/etc/sysctl.d/90-ruopenray-tcp-fastopen.conf')}</strong></article>
      </div>
      <div class="toolbar">
        <button class="btn secondary" data-action="enableTcpFastOpenSystem" ${state.tcpFastOpenSaving ? 'disabled' : ''}>Включить в системе</button>
        <button class="btn secondary" data-action="disableTcpFastOpenSystem" ${state.tcpFastOpenSaving ? 'disabled' : ''}>Выключить в системе</button>
        <button class="btn" data-action="enableTcpFastOpenDraft">Включить в Xray</button>
        <button class="btn secondary" data-action="disableTcpFastOpenDraft">Выключить в Xray</button>
        <button class="btn warning" data-action="test">Проверить конфигурацию</button>
        <button class="btn warning" data-action="apply">Применить</button>
      </div>
    </section>

  `;
}

function interceptAdvancedAccordion() {
  return `
    <details class="panel intercept-details">
      <summary>
        <span>
          <strong>Расширенные сетевые опции</strong>
          <em>Сниффер Xray, QUIC/HTTP3 и TCP Fast Open. Обычно это трогают после базовой настройки перехвата.</em>
        </span>
        <b>Открыть</b>
      </summary>
      <div class="intercept-details-body">
        ${interceptAdvancedSections()}
      </div>
    </details>
  `;
}

function dnsModeSection() {
  const dnsMode = currentDnsMode();
  return `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>DNS-режим</h2><span>Обычный DNS подходит большинству. FakeDNS помогает transparent proxy лучше сопоставлять IP с доменами, но требует аккуратной DNS/TProxy схемы.</span></div>
      </div>
      <div class="advanced-grid two">
        <button type="button" class="advanced-card ${dnsMode === 'normal' ? 'active' : ''}" data-dns-mode="normal">
          <strong>Обычный DNS</strong>
          <span>Без FakeDNS. Дефолтный и самый предсказуемый режим.</span>
        </button>
        <button type="button" class="advanced-card ${dnsMode === 'fakedns' ? 'active' : ''}" data-dns-mode="fakedns">
          <strong>FakeDNS для transparent proxy</strong>
          <span>Добавит fakeDNS pool, fakedns DNS-сервер и безопасный sniffing routeOnly.</span>
        </button>
      </div>
    </section>
  `;
}

function routingPanel() {
  const routingTabs = [
    ['rules', 'Правила'],
    ['scenarios', 'Сценарии'],
    ['intercept', 'Перехват'],
    ['geo', 'Geo']
  ];
  const view = routingTabs.some(([value]) => value === state.routingView) ? state.routingView : 'rules';
  const views = {
    rules: routingRulesPanel,
    scenarios: routingScenariosPanel,
    intercept: firewallPanel,
    geo: geoPanel
  };
  return `
    <section class="routing-nav-panel">
      <div class="routing-subnav" role="tablist" aria-label="Подменю маршрутизации">
        ${routingTabs.map(([value, label]) => `<button type="button" class="${view === value ? 'active' : ''}" data-routing-view="${value}">${label}</button>`).join('')}
      </div>
    </section>
    ${views[view]()}
  `;
}

function statusCard(title, ok, detail) {
  return `
    <article class="status-card ${ok ? 'ok' : 'warn'}">
      <span>${ok ? 'Готово' : 'Нужно проверить'}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function firewallPanel() {
  const info = firewallInfo();
  const preview = firewallPolicyPreview();
  const deviceChoices = firewallDeviceChoices();
  const selectedDevices = new Set(state.firewallSelectedDevices);
  const transparentRows = info.transparent.length
    ? info.transparent.map((item) => `${item.tag || 'transparent'} · ${item.protocol || 'inbound'} · порт ${item.port || 'не задан'}`).join('\n')
    : 'Transparent inbound пока не найден.';
  const dnsRows = info.dnsOut.length
    ? info.dnsOut.map((item) => `${item.tag || 'dns'} · ${item.protocol}`).join('\n')
    : 'DNS outbound пока не найден.';
  const sourceRows = info.sourceRules.length
    ? info.sourceRules.slice(0, 8).map((rule) => `${rule.source.join(', ')} -> ${rule.outboundTag}`).join('\n')
    : 'Отдельных правил для LAN-устройств пока нет.';

  return `
    <section class="route-hero firewall-hero intercept-hero">
      <div>
        <h2>Перехват трафика</h2>
        <p>Короткая настройка transparent proxy: кого перехватываем, какие порты берем и как рано отсеиваем direct/proxy трафик.</p>
      </div>
      <div class="route-score">
        <strong>${info.ready ? 'OK' : '3'}</strong>
        <span>${info.ready ? 'схема готова' : 'пункта готовности'}</span>
      </div>
    </section>

    <section class="panel intercept-start-panel">
      <div class="panel-title">
        <div><h2>Текущая схема</h2><span>Коротко: способ перехвата, политика до Xray и охват устройств.</span></div>
      </div>
      <div class="intercept-summary-grid">
        <article>
          <span>Способ</span>
          <strong>${escapeHtml(state.firewallRouterMode === 'redirect' ? 'REDIRECT' : 'TPROXY')}</strong>
          <small>${escapeHtml(state.firewallRouterMode === 'redirect' ? 'TCP-сценарий, QUIC лучше блокировать' : 'TCP+UDP, лучше для transparent proxy')}</small>
        </article>
        <article>
          <span>Политика</span>
          <strong>${escapeHtml(preview.policyName)}</strong>
          <small>${escapeHtml(preview.policy)}</small>
        </article>
        <article>
          <span>Охват</span>
          <strong>${escapeHtml(preview.traffic)}</strong>
          <small>${escapeHtml(`Порты: ${preview.ports}`)}</small>
        </article>
        <article>
          <span>Готовность</span>
          <strong>${escapeHtml(info.ready ? 'Можно применять' : 'Нужно проверить')}</strong>
          <small>${escapeHtml([
            info.transparent.length ? 'inbound найден' : 'нет transparent inbound',
            info.dnsOut.length ? 'dns-out найден' : 'нет dns-out',
            info.localBypass.length ? 'direct есть' : 'нет local bypass'
          ].join(' · '))}</small>
        </article>
      </div>
      ${preview.warnings.length ? `<div class="settings-warning compact"><strong>Проверить</strong><span>${escapeHtml(preview.warnings.join(' '))}</span></div>` : ''}
    </section>

    <section class="panel intercept-compact-panel">
      <div class="panel-title">
        <div><h2>Основной сценарий</h2><span>Выберите способ перехвата и сколько трафика отправлять в Xray.</span></div>
      </div>
      <div class="intercept-compact-grid">
        <div class="intercept-setting-card">
          <span class="intercept-label">Способ</span>
          <div class="segmented compact intercept-segmented" role="group" aria-label="Способ перехвата">
            <button type="button" class="${state.firewallRouterMode === 'tproxy' ? 'active' : ''}" data-firewall-router-mode="tproxy">TPROXY</button>
            <button type="button" class="${state.firewallRouterMode === 'redirect' ? 'active' : ''}" data-firewall-router-mode="redirect">REDIRECT</button>
          </div>
          <small>${state.firewallRouterMode === 'redirect' ? 'Проще для TCP. Для UDP/QUIC лучше включить блокировку QUIC.' : 'Рекомендуется: TCP+UDP, сохраняет исходное назначение.'}</small>
        </div>
        <div class="intercept-setting-card wide">
          <span class="intercept-label">Что отправляем в Xray</span>
          <div class="intercept-choice-list">
            <button type="button" class="${state.firewallBypassMode === 'off' ? 'active' : ''}" data-firewall-bypass-mode="off">
              <strong>Все выбранное</strong>
              <em>Xray сам решает по правилам: proxy, direct или block.</em>
            </button>
            <button type="button" class="${state.firewallBypassMode === 'bypass' ? 'active' : ''}" data-firewall-bypass-mode="bypass">
              <strong>Direct мимо Xray</strong>
              <em>Direct-адреса не нагружают Xray, остальное идет в правила.</em>
            </button>
            <button type="button" class="${state.firewallBypassMode === 'redirect' ? 'active' : ''}" data-firewall-bypass-mode="redirect">
              <strong>Только proxy</strong>
              <em>В Xray попадает только то, что заранее известно как proxy.</em>
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="panel intercept-compact-panel">
      <div class="panel-title">
        <div><h2>Охват</h2><span>Клиенты, порты и QUIC. Обычно достаточно «все LAN» и порты 80/443.</span></div>
      </div>
      <div class="intercept-compact-grid">
        <div class="intercept-setting-card wide">
          <span class="intercept-label">Клиенты</span>
          <div class="segmented compact intercept-segmented three" role="group" aria-label="Устройства">
            <button type="button" class="${state.firewallDeviceMode === 'all' ? 'active' : ''}" data-firewall-device-mode="all">Все LAN</button>
            <button type="button" class="${state.firewallDeviceMode === 'selected' ? 'active' : ''}" data-firewall-device-mode="selected">Только выбранные</button>
            <button type="button" class="${state.firewallDeviceMode === 'exclude' ? 'active' : ''}" data-firewall-device-mode="exclude">Исключить</button>
          </div>
          <small>${escapeHtml(preview.traffic)}</small>
        </div>
        <div class="intercept-setting-card">
          <span class="intercept-label">Порты</span>
          <div class="segmented compact intercept-segmented" role="group" aria-label="Режим портов">
            <button type="button" class="${state.firewallPortMode === 'all' ? 'active' : ''}" data-firewall-port-mode="all">Все</button>
            <button type="button" class="${state.firewallPortMode !== 'all' ? 'active' : ''}" data-firewall-port-mode="custom">Список</button>
          </div>
          ${state.firewallPortMode === 'all' ? '<small>Все TCP/UDP-порты в выбранной области клиентов.</small>' : `
            <input id="firewallPorts" value="${escapeHtml(state.firewallPorts)}" placeholder="80,443,50000-65535" />
          `}
        </div>
        <label class="settings-check compact intercept-quic-toggle ${state.firewallBlockQuic ? 'active' : ''}">
          <input id="firewallBlockQuic" type="checkbox" ${state.firewallBlockQuic ? 'checked' : ''} />
          <span><strong>Блокировать QUIC</strong><em>UDP/443 режется до Xray, браузеры переходят на TCP.</em></span>
        </label>
      </div>
      <div class="firewall-device-list">
        ${deviceChoices.length ? deviceChoices.slice(0, 16).map((device) => `<label class="firewall-device ${selectedDevices.has(device.ip) ? 'active' : ''}">
          <input type="checkbox" data-firewall-device="${escapeHtml(device.ip)}" ${selectedDevices.has(device.ip) ? 'checked' : ''} />
          <span><strong>${escapeHtml(device.name || device.ip)}</strong><em>${escapeHtml([device.ip, device.mac].filter(Boolean).join(' · '))}</em></span>
        </label>`).join('') : '<p class="muted">DHCP leases пока не найдены. Устройства можно добавить в разделе LAN-устройств, после этого они появятся здесь.</p>'}
      </div>
    </section>

    ${interceptAdvancedAccordion()}

    ${firewallApplyPanel()}

    <details class="panel intercept-details">
      <summary>
        <span>
          <strong>Техническая подготовка Xray</strong>
          <em>Что найдено в конфигурации и какие части можно добавить в черновик.</em>
        </span>
        <b>Открыть</b>
      </summary>
      <div class="intercept-details-body">
    <div class="route-layout firewall-layout">
      <section class="panel">
        <div class="panel-title">
          <div><h2>Что найдено в конфигурации</h2><span>Сводка по текущему Xray JSON без терминальных команд.</span></div>
        </div>
        <div class="firewall-facts">
          <div>
            <label>Transparent inbound</label>
            <pre class="mini-console">${escapeHtml(transparentRows)}</pre>
          </div>
          <div>
            <label>DNS outbound</label>
            <pre class="mini-console">${escapeHtml(dnsRows)}</pre>
          </div>
          <div>
            <label>LAN-устройства</label>
            <pre class="mini-console">${escapeHtml(sourceRows)}</pre>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">
          <div><h2>Подготовка Xray</h2><span>Добавляет недостающие inbound/outbound/routing в черновик.</span></div>
        </div>
        <div class="firewall-steps">
          <div><strong>1</strong><span>Transparent inbound принимает TCP/UDP после перехвата firewall.</span></div>
          <div><strong>2</strong><span>DNS-направление отдельно обрабатывает порт 53.</span></div>
          <div><strong>3</strong><span>Локальные адреса и LAN не уходят в прокси.</span></div>
        </div>
        <div class="toolbar">
          <button class="btn" data-action="prepareTransparent">Подготовить черновик</button>
          <button class="btn secondary" data-action="test">Проверить конфигурацию</button>
          <button class="btn warning" data-action="apply">Применить</button>
        </div>
        ${state.message ? `<p class="notice" style="margin-top: 14px">${escapeHtml(state.message)}</p>` : ''}
      </section>
    </div>
      </div>
    </details>

    <details class="panel intercept-details">
      <summary>
        <span>
          <strong>Команды для OpenWrt</strong>
          <em>Черновик nftables/TProxy для ручной проверки и копирования.</em>
        </span>
        <b>Открыть</b>
      </summary>
      <div class="intercept-details-body">
    <section class="panel intercept-command-panel">
      <div class="panel-title">
        <div><h2>Команды для OpenWrt</h2><span>Черновик nftables/TProxy. Перед применением проверьте интерфейсы, порты и правила автозапуска.</span></div>
        <button class="btn secondary" data-action="copyFirewall">Скопировать</button>
      </div>
      <pre class="console">${escapeHtml(firewallCommands())}</pre>
    </section>
      </div>
    </details>
  `;
}

function firewallApplyPanel() {
  const status = state.firewallStatus || {};
  const active = Boolean(status.active);
  const persistent = Boolean(status.persistent);
  const tproxyReady = status.routerMode !== 'tproxy' || (status.ipRule && status.ipRoute && status.hotplug);
  const available = status.available !== false;
  const summary = active
    ? persistent
      ? 'активен и сохранен'
      : 'активен до перезапуска'
    : persistent
      ? 'сохранен, но не активен'
      : 'не применен';
  return `
    <section class="panel firewall-preview-panel intercept-apply-panel">
      <div class="panel-title">
        <div><h2>Применение</h2><span>Сохраняет nftables и, для TPROXY, policy routing после перезапуска firewall.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-action="refreshFirewallStatus" ${state.firewallSaving ? 'disabled' : ''}>Обновить</button>
          <button class="btn warning" data-action="applyFirewall" ${state.firewallSaving || !available ? 'disabled' : ''}>${state.firewallSaving ? 'Применяю...' : 'Применить'}</button>
          <button class="btn secondary" data-action="disableFirewall" ${state.firewallSaving || (!active && !persistent) ? 'disabled' : ''}>Отключить</button>
        </div>
      </div>
      <div class="firewall-preview-grid">
        <article><span>Состояние</span><strong>${escapeHtml(summary)}</strong><small>${escapeHtml(status.routerMode || state.firewallRouterMode)}</small></article>
        <article><span>nftables</span><strong>${escapeHtml(active ? 'таблица активна' : 'таблица не активна')}</strong><small>${escapeHtml(status.nftPath || '/etc/nftables.d/ruopenray.nft')}</small></article>
        <article><span>TPROXY route</span><strong>${escapeHtml(tproxyReady ? 'готово' : 'нужно восстановить')}</strong><small>${escapeHtml(`ip rule: ${status.ipRule ? 'есть' : 'нет'} · route: ${status.ipRoute ? 'есть' : 'нет'} · hotplug: ${status.hotplug ? 'есть' : 'нет'}`)}</small></article>
        <article><span>Модули</span><strong>${escapeHtml(status.tproxyModules?.ok === false ? 'не все установлены' : 'готово')}</strong><small>${escapeHtml(status.tproxyModules?.detail || 'проверяется на роутере')}</small></article>
      </div>
      ${!available ? `<div class="settings-warning"><strong>Недоступно</strong><span>nftables не найден. Постоянный перехват можно применить только на OpenWrt с firewall4/nft.</span></div>` : ''}
      ${status.needsPolicyFix ? `<div class="settings-warning"><strong>TPROXY</strong><span>nft-таблица есть, но policy routing неполный. Нажмите «Применить перехват», чтобы восстановить ip rule, route и hotplug.</span></div>` : ''}
    </section>
  `;
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

function settingsPanel() {
  const logLevels = [
    ['none', 'Нет'],
    ['error', 'Ошибки'],
    ['warning', 'Предупреждения'],
    ['info', 'Инфо'],
    ['debug', 'Отладка']
  ];
  const accessSize = byteSize(state.loggingSettings?.accessSize || 0);
  const errorSize = byteSize(state.loggingSettings?.errorSize || 0);
  const settingsTabs = [
    ['logging', 'Логирование'],
    ['security', 'Панель'],
    ['service', 'Сервис'],
    ['updates', 'Обновление']
  ];
  const settingsView = settingsTabs.some(([value]) => value === state.settingsView) ? state.settingsView : 'logging';
  const loggingSections = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Логирование Xray</h2><span>Access, error и DNS-логи пишутся самим Xray. Для постоянной работы лучше держать уровень warning или error.</span></div>
      </div>
      <div class="settings-log-layout">
        <div class="settings-field wide">
          <label>Уровень логирования</label>
          <div class="segmented settings-log-levels" aria-label="Уровень логирования">
            ${logLevels.map(([value, label]) => `<button type="button" class="${state.loggingLevel === value ? 'active' : ''}" data-logging-level="${value}">${label}</button>`).join('')}
          </div>
          <small>Debug быстро раздувает файлы и может влиять на слабые роутеры.</small>
        </div>

        <label class="settings-check ${state.loggingAccessLog ? 'active' : ''}">
          <input id="loggingAccessLog" type="checkbox" ${state.loggingAccessLog ? 'checked' : ''} />
          <span><strong>Логи доступа</strong><em>Соединения, источник, назначение, inbound и outbound.</em></span>
          <b>${accessSize}</b>
        </label>
        <label class="settings-check ${state.loggingErrorLog ? 'active' : ''}">
          <input id="loggingErrorLog" type="checkbox" ${state.loggingErrorLog ? 'checked' : ''} />
          <span><strong>Логи ошибок</strong><em>Ошибки и предупреждения Xray для диагностики запуска и правил.</em></span>
          <b>${errorSize}</b>
        </label>
        <label class="settings-check ${state.loggingDnsLog ? 'active' : ''}">
          <input id="loggingDnsLog" type="checkbox" ${state.loggingDnsLog ? 'checked' : ''} />
          <span><strong>DNS-логи Xray</strong><em>Запросы встроенного DNS. Полезно для поиска DNS leak.</em></span>
          <b>dnsLog</b>
        </label>

        <div class="settings-field">
          <label>Файл access</label>
          <input id="loggingAccessPath" value="${escapeHtml(state.loggingAccessPath)}" ${state.loggingAccessLog ? '' : 'disabled'} />
        </div>
        <div class="settings-field">
          <label>Файл error</label>
          <input id="loggingErrorPath" value="${escapeHtml(state.loggingErrorPath)}" ${state.loggingErrorLog ? '' : 'disabled'} />
        </div>
      </div>
    </section>

    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Обслуживание логов</h2><span>RuOpenRay следит за размером файлов каждые 15 минут и перед рестартом Xray.</span></div>
      </div>
      <div class="settings-maintenance">
        <div class="settings-field">
          <label>Максимальный размер файла, MB</label>
          <input id="loggingMaxSizeMb" type="number" min="1" max="200" value="${escapeHtml(state.loggingMaxSizeMb)}" />
        </div>
        <div class="settings-field">
          <label>Хранить копий после ротации</label>
          <input id="loggingRotateCopies" type="number" min="0" max="5" value="${escapeHtml(state.loggingRotateCopies)}" />
        </div>
        <label class="settings-check compact ${state.loggingClearOnRestart ? 'active' : ''}">
          <input id="loggingClearOnRestart" type="checkbox" ${state.loggingClearOnRestart ? 'checked' : ''} />
          <span><strong>Очищать при перезапуске Xray</strong><em>Удобно для временной диагностики.</em></span>
        </label>
        <label class="settings-check compact ${state.loggingRestart ? 'active' : ''}">
          <input id="loggingRestart" type="checkbox" ${state.loggingRestart ? 'checked' : ''} />
          <span><strong>Перезапустить Xray после сохранения</strong><em>Новые пути и уровень применятся сразу.</em></span>
        </label>
      </div>
      <div class="settings-warning">
        <strong>Flash-память</strong>
        <span>Access-логи при активном трафике создают много записей. Для постоянного мониторинга лучше использовать временный каталог или внешний накопитель.</span>
      </div>
      <div class="toolbar">
        <button class="btn warning" data-action="saveLoggingSettings" ${state.loggingSaving ? 'disabled' : ''}>${state.loggingSaving ? 'Сохраняю...' : 'Сохранить логирование'}</button>
        <button class="btn secondary" data-action="clearLoggingFiles" ${state.loggingSaving ? 'disabled' : ''}>Очистить логи</button>
      </div>
    </section>
  `;
  const securitySection = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Пароль панели</h2><span>После смены активные сессии будут сброшены, нужно будет войти заново.</span></div>
      </div>
      <div class="settings-form">
        <div class="form-row">
          <label>Текущий пароль</label>
          <input id="settingsCurrentPassword" type="password" value="${escapeHtml(state.settingsCurrentPassword)}" autocomplete="current-password" />
        </div>
        <div class="form-row">
          <label>Новый пароль</label>
          <input id="settingsNewPassword" type="password" value="${escapeHtml(state.settingsNewPassword)}" autocomplete="new-password" placeholder="минимум 8 символов" />
        </div>
        <div class="form-row">
          <label>Повторите пароль</label>
          <input id="settingsConfirmPassword" type="password" value="${escapeHtml(state.settingsConfirmPassword)}" autocomplete="new-password" />
        </div>
      </div>
      <div class="toolbar">
        <button class="btn warning" data-action="changePanelPassword" ${state.settingsPasswordSaving ? 'disabled' : ''}>${state.settingsPasswordSaving ? 'Сохраняю...' : 'Сменить пароль'}</button>
      </div>
    </section>
  `;
  const appInfo = state.status?.app || {};
  const appRelease = state.appRelease || {};
  const appHasUpdate = Boolean(appRelease.update && appRelease.assetUrl);
  const appVersion = appInfo.version || 'dev';
  const appTarget = appRelease.tag || 'не загружен';
  const appAsset = appRelease.asset || appInfo.asset || '';
  const appUpdateSection = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Обновление RuOpenRay UI</h2><span>Панель может обновить собственный бинарник из релизов GitHub с учетом архитектуры роутера.</span></div>
      </div>
      <div class="settings-info-grid">
        <article><span>Установлено</span><strong>${escapeHtml(appVersion)}</strong></article>
        <article><span>Последний релиз</span><strong>${escapeHtml(appTarget)}</strong></article>
        <article><span>Архитектура</span><strong>${escapeHtml(appAsset || 'не определена')}</strong></article>
        <article><span>Размер</span><strong>${escapeHtml(appRelease.assetSize ? byteSize(appRelease.assetSize) : 'неизвестно')}</strong></article>
      </div>
      <div class="settings-maintenance">
        <label class="settings-check compact ${state.appBackup ? 'active' : ''}">
          <input id="appBackup" type="checkbox" ${state.appBackup ? 'checked' : ''} />
          <span><strong>Сохранить бэкап бинарника</strong><em>Выключайте на роутерах с малым NAND, если свободного места мало.</em></span>
        </label>
      </div>
      <div class="toolbar">
        <button class="btn secondary" data-action="checkAppUpdate" ${state.appReleaseChecking || state.appUpdating ? 'disabled' : ''}>${state.appReleaseChecking ? 'Проверяю...' : 'Проверить обновления'}</button>
        <button class="btn warning" data-action="updateApp" ${state.appUpdating || !appHasUpdate ? 'disabled' : ''}>${state.appUpdating ? 'Обновляю...' : appHasUpdate ? 'Обновить панель' : 'Актуальная версия'}</button>
      </div>
      ${state.appUpdate ? `<div class="core-result">
        <strong>${state.appUpdate.ok ? 'Готово' : 'Ошибка'}</strong>
        <span>${escapeHtml(state.appUpdate.stdout || state.appUpdate.stderr || '')}</span>
      </div>` : ''}
    </section>
  `;
  const serviceSection = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Сервис и пути</h2><span>Ключевые параметры окружения. Их меняет установщик или UCI, здесь показываем то, с чем сейчас работает панель.</span></div>
      </div>
      <div class="settings-info-grid">
        <article><span>Сервис Xray</span><strong>${escapeHtml(state.status?.service?.running ? 'работает' : 'остановлен')}</strong></article>
        <article><span>Активная конфигурация</span><strong>${escapeHtml(state.status?.config?.path || 'не определена')}</strong></article>
        <article><span>Версия ядра</span><strong>${escapeHtml(state.status?.core?.version || 'не найдена')}</strong></article>
        <article><span>Правил маршрутизации</span><strong>${escapeHtml(state.status?.config?.routingRules ?? 0)}</strong></article>
      </div>
      <div class="settings-maintenance">
        <div class="settings-field">
          <label>Задержка старта панели, сек</label>
          <input id="serviceStartupDelaySec" type="number" min="0" max="180" value="${escapeHtml(state.serviceStartupDelaySec)}" />
          <small>Полезно после загрузки роутера, когда сеть и storage просыпаются не сразу.</small>
        </div>
        <div class="settings-field">
          <label>Пауза перед перезапуском Xray, сек</label>
          <input id="serviceApplyDelaySec" type="number" min="0" max="60" value="${escapeHtml(state.serviceApplyDelaySec)}" />
          <small>Дает firewall/WAN/DNS успеть прийти в порядок перед start/restart.</small>
        </div>
        <div class="settings-field">
          <label>Лимит памяти панели</label>
          <input id="serviceGoMemLimit" value="${escapeHtml(state.serviceGoMemLimit)}" placeholder="48MiB" />
          <small>Передается в Go как GOMEMLIMIT после перезапуска RuOpenRay UI. Для 256 MB RAM обычно достаточно 32-48MiB.</small>
        </div>
        <div class="settings-field">
          <label>Агрессивность GC</label>
          <input id="serviceGoGC" type="number" min="20" max="200" value="${escapeHtml(state.serviceGoGC)}" />
          <small>GOGC: ниже значение — меньше RAM, но чуть больше CPU. Дефолт RuOpenRay: 60.</small>
        </div>
        <div class="settings-field">
          <label>Загрузка ядра и geo-файлов</label>
          <select id="serviceDownloadMirror">
            <option value="direct" ${state.serviceDownloadMirror !== 'custom' ? 'selected' : ''}>Напрямую</option>
            <option value="custom" ${state.serviceDownloadMirror === 'custom' ? 'selected' : ''}>Через зеркало</option>
          </select>
          <small>Для роутеров, у которых GitHub скачивается нестабильно.</small>
        </div>
        <div class="settings-field">
          <label>Префикс зеркала</label>
          <input id="serviceMirrorPrefix" value="${escapeHtml(state.serviceMirrorPrefix)}" ${state.serviceDownloadMirror === 'custom' ? '' : 'disabled'} placeholder="https://gh-proxy.example/?url={url}" />
          <small>Можно использовать {url}; без него RuOpenRay просто добавит исходную ссылку после префикса.</small>
        </div>
      </div>
      <div class="toolbar">
        <button class="btn warning" data-action="saveServiceSettings" ${state.serviceSettingsSaving ? 'disabled' : ''}>${state.serviceSettingsSaving ? 'Сохраняю...' : 'Сохранить сервис'}</button>
      </div>
    </section>
  `;
  const visibleSection = settingsView === 'security'
    ? securitySection
    : settingsView === 'updates'
      ? appUpdateSection
    : settingsView === 'service'
      ? serviceSection
      : loggingSections;
  return `
    <section class="settings-hero">
      <div>
        <h2>Параметры RuOpenRay</h2>
        <p>Параметры панели и Xray, которые влияют на работу сервиса на роутере.</p>
      </div>
      <div class="settings-hero-status">
        <strong>${escapeHtml(state.status?.core?.available ? 'Xray доступен' : 'Xray не найден')}</strong>
        <span>${escapeHtml(state.status?.core?.version || '')}</span>
      </div>
    </section>

    <div class="settings-subnav" role="tablist" aria-label="Подменю настроек">
      ${settingsTabs.map(([value, label]) => `<button type="button" class="${settingsView === value ? 'active' : ''}" data-settings-view="${value}">${label}</button>`).join('')}
    </div>

    ${visibleSection}

    <section class="settings-message">
      ${state.message ? `<p class="notice" style="margin-top: 14px">${escapeHtml(state.message)}</p>` : ''}
    </section>
  `;
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

function routeRuleDialog() {
  if (!state.routeRuleDialog) return '';
  const options = outboundOptions();
  const balancers = balancerOptions();
  const editing = state.routeRuleEditingIndex >= 0;
  const listMode = !editing && state.routeRuleMode === 'list';
  const presetsMode = !editing && state.routeRuleMode === 'presets';
  const selected = new Set(state.selectedRoutePresets);
  const customEntries = customRoutePresetEntries();
  return `
    <div class="modal-backdrop" data-action="closeRouteRuleDialog">
      <section class="modal route-rule-dialog" role="dialog" aria-modal="true" aria-labelledby="routeRuleTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="routeRuleTitle">${editing ? 'Редактирование правила' : presetsMode ? 'Добавить подборки' : 'Новое правило'}</h2>
            <span>${editing ? 'Измените условие, цель или название правила. Порядок в списке останется прежним.' : presetsMode ? 'Выберите одну или несколько подборок правил и добавьте их в черновик маршрутизации.' : listMode ? 'Вставьте несколько правил списком и добавьте их в черновик маршрутизации.' : 'Добавьте один сайт, IP, LAN-устройство, порт или inbound в черновик маршрутизации.'}</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeRouteRuleDialog" aria-label="Закрыть">×</button>
        </div>
        ${editing ? '' : `
        <div class="segmented route-dialog-mode" aria-label="Режим добавления правил">
          <button type="button" class="${!listMode && !presetsMode ? 'active' : ''}" data-route-rule-mode="single">Одно правило</button>
          <button type="button" class="${listMode ? 'active' : ''}" data-route-rule-mode="list">Список правил</button>
          <button type="button" class="${presetsMode ? 'active' : ''}" data-route-rule-mode="presets">Подборки</button>
        </div>
        `}
        ${presetsMode ? `
        <div class="preset-check-list route-dialog-presets">
          <button class="preset-create" type="button" data-action="newRoutePreset">Добавить свою подборку</button>
          ${customEntries.length ? `
            <div class="preset-group-title">Мои подборки</div>
            ${customEntries.map(([key, preset]) => `
              <label class="preset-check custom ${selected.has(key) ? 'active' : ''}">
                <input type="checkbox" data-route-preset-check="${key}" ${selected.has(key) ? 'checked' : ''} />
                <span class="checkmark"></span>
                <span>
                  <strong>${escapeHtml(preset.title)}</strong>
                  <small>${escapeHtml(preset.detail ? `${preset.detail} · ${ruleCountLabel(routePresetConditionCount(key))}` : ruleCountLabel(routePresetConditionCount(key)))}</small>
                </span>
                <span class="preset-check-actions">
                  <button class="preset-edit" type="button" data-route-preset-edit="${key}">Править</button>
                  <button class="preset-delete" type="button" data-route-preset-delete="${key}">Удалить</button>
                </span>
              </label>
            `).join('')}
          ` : ''}
          <div class="preset-group-title">Подборки</div>
          ${builtinRoutePresetEntries().map(([key, preset]) => `
            <label class="preset-check ${selected.has(key) ? 'active' : ''}">
              <input type="checkbox" data-route-preset-check="${key}" ${selected.has(key) ? 'checked' : ''} />
              <span class="checkmark"></span>
              <span>
                <strong>${escapeHtml(preset.title)}</strong>
                <small>${escapeHtml(`${preset.detail || describeRouteRule(preset.rule || routePresetRules(key)[0]).fullValue} · ${ruleCountLabel(routePresetConditionCount(key))}`)}</small>
              </span>
              <button class="preset-edit" type="button" data-route-preset-edit="${key}">Править</button>
            </label>
          `).join('')}
        </div>
        ` : listMode ? `
        <div class="route-form route-form-dialog route-list-form">
          <div class="form-row wide">
            <label>Название списка</label>
            <input id="routeDslName" value="${escapeHtml(state.routeDslName)}" placeholder="Например: Discord, YouTube, Игровые сервисы" />
          </div>
          <div class="form-row wide">
            <label>Правила списком</label>
            <textarea id="routeDsl" class="dsl-editor route-dialog-dsl" spellcheck="false" placeholder="default: direct&#10;domain(domain:discord.com) -> proxy&#10;network(udp) &amp;&amp; ip(104.16.0.0/12) -> proxy&#10;source(192.168.50.157) -> direct">${escapeHtml(state.routeDsl)}</textarea>
            <small>Поддерживается формат строк маршрутизации: <code>domain(...)</code>, <code>ip(...)</code>, <code>source(...)</code>, <code>network(udp)</code> и назначение через <code>-> proxy/direct/block</code>.</small>
          </div>
          ${state.routeDslPreview ? dslPreviewView(state.routeDslPreview) : ''}
        </div>
        ` : `
        <div class="route-form route-form-dialog">
          <div class="form-row route-value">
            <label>Название</label>
            <input id="routeName" value="${escapeHtml(state.routeName)}" placeholder="Например: Discord, ТВ напрямую, ChatGPT" />
          </div>
          <div class="form-row">
            <label>Что направляем</label>
            <select id="routeKind">
              ${Object.entries(routeKinds)
                .map(([key, title]) => `<option value="${key}" ${state.routeKind === key ? 'selected' : ''}>${title}</option>`)
                .join('')}
            </select>
          </div>
          <div class="form-row route-value">
            <label>Значение</label>
            <input id="routeValue" value="${escapeHtml(state.routeValue)}" placeholder="${escapeHtml(routePlaceholders[state.routeKind])}" />
          </div>
          ${routeLeasePicker()}
          <div class="form-row">
            <label>Тип цели</label>
            <div class="segmented route-target-switch" aria-label="Тип цели правила">
              <button type="button" class="${state.routeTargetType !== 'balancer' ? 'active' : ''}" data-route-target-type="outbound">Сервер</button>
              <button type="button" class="${state.routeTargetType === 'balancer' ? 'active' : ''}" data-route-target-type="balancer" ${balancers.length ? '' : 'disabled'}>Балансировщик</button>
            </div>
          </div>
          <div class="form-row">
            <label>Куда отправляем</label>
            ${state.routeTargetType === 'balancer' ? `
              <select id="routeBalancer">
                ${balancers.map((tag) => `<option value="${escapeHtml(tag)}" ${state.routeBalancer === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}
              </select>
            ` : `
              <select id="routeOutbound">
                ${options.map((tag) => `<option value="${escapeHtml(tag)}" ${state.routeOutbound === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}
              </select>
            `}
          </div>
        </div>
        `}
        ${state.message ? `<p class="notice route-dialog-notice">${escapeHtml(state.message)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn secondary" type="button" data-action="closeRouteRuleDialog">Отмена</button>
          ${presetsMode ? `
            <div class="split-actions">
              <button class="btn secondary" type="button" data-action="selectAllRoutePresets">Отметить все</button>
              <button class="btn secondary" type="button" data-action="clearRoutePresets">Снять выбор</button>
            </div>
            <button class="btn warning" type="button" data-action="applyRoutePresets" ${state.selectedRoutePresets.length ? '' : 'disabled'}>Добавить подборки</button>
          ` : listMode ? `
            <button class="btn secondary" type="button" data-action="previewRouteDsl">Проверить список</button>
            <button class="btn warning" type="button" data-action="appendRouteDslFromDialog">Добавить список</button>
          ` : `<button class="btn warning" type="button" data-action="${editing ? 'saveRouteEdit' : 'addRoute'}">${editing ? 'Сохранить правило' : 'Добавить правило'}</button>`}
        </div>
      </section>
    </div>
  `;
}

function routeBalancerDialog() {
  if (!state.routeBalancerDialog) return '';
  const balancers = routeBalancers();
  const targets = balancerTargetOptions();
  const selectedSelectors = new Set(splitRouteValues(state.routeBalancerSelectors));
  const selectorOrder = splitRouteValues(state.routeBalancerSelectors);
  const isRoundRobin = state.routeBalancerStrategy === 'roundRobin';
  const knownTargetTags = new Set(targets.map((target) => target.tag));
  const legacySelectors = [...selectedSelectors].filter((selector) => !knownTargetTags.has(selector));
  const orderedTargets = [...targets].sort((a, b) => {
    const aIndex = selectorOrder.indexOf(a.tag);
    const bIndex = selectorOrder.indexOf(b.tag);
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    return 0;
  });
  const fallbackTargets = [...targets];
  if (state.routeBalancerFallback && !fallbackTargets.some((target) => target.tag === state.routeBalancerFallback)) {
    fallbackTargets.push({ tag: state.routeBalancerFallback, kind: 'custom', title: state.routeBalancerFallback, detail: 'текущий резерв из конфигурации' });
  }
  const matches = balancerSelectorMatches(state.routeBalancerSelectors);
  const strategies = [
    ['random', 'Случайно'],
    ['roundRobin', 'По очереди'],
    ['leastPing', 'Меньший ping'],
    ['leastLoad', 'Меньше нагрузка']
  ];
  const advancedObserver = strategyObserverType(state.routeBalancerStrategy);
  const advancedStrategy = Boolean(advancedObserver);
  const advancedHelp = advancedObserver === 'burstObservatory'
    ? 'Для этой стратегии Xray включает Burst Observatory: проверяет серверы сериями и выбирает менее нагруженный доступный участник. Это advanced-режим.'
    : 'Для этой стратегии Xray включает Observatory: проверяет серверы HTTP-запросом и выбирает участника с меньшей задержкой. Ручная проверка RuOpenRay тут только помогает увидеть результат в UI.';
  return `
    <div class="modal-backdrop" data-action="closeRouteBalancerDialog">
      <section class="modal route-balancer-dialog" role="dialog" aria-modal="true" aria-labelledby="routeBalancerTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="routeBalancerTitle">Группа серверов</h2>
            <span>Создайте одну цель из нескольких серверов и выбирайте ее в правилах маршрутизации вместо конкретного сервера.</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeRouteBalancerDialog" aria-label="Закрыть">×</button>
        </div>

        <div class="balancer-layout">
          <section class="balancer-form">
            <div class="form-row">
              <label>Имя группы</label>
              <input id="routeBalancerTag" value="${escapeHtml(state.routeBalancerTag)}" placeholder="auto-proxy" />
            </div>
            <div class="form-row">
              <label>Стратегия</label>
              <select id="routeBalancerStrategy">
                ${strategies.map(([value, label]) => `<option value="${value}" ${state.routeBalancerStrategy === value ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </div>
            <div class="form-row wide">
              <label>Участники</label>
              <div class="balancer-target-list">
                ${orderedTargets.length ? orderedTargets.map((target) => {
                  const selected = selectedSelectors.has(target.tag);
                  const orderIndex = selectorOrder.indexOf(target.tag);
                  return `
                  <div class="balancer-target ${selected ? 'active' : ''}">
                    <input type="checkbox" data-balancer-selector="${escapeHtml(target.tag)}" ${selectedSelectors.has(target.tag) ? 'checked' : ''} />
                    <span class="balancer-kind">${target.kind === 'subscription' ? 'pool' : 'server'}</span>
                    <span>
                      <strong>${escapeHtml(target.title)}</strong>
                      <em>${escapeHtml(target.detail)}</em>
                    </span>
                    ${isRoundRobin && selected ? `
                      <span class="balancer-order-controls" aria-label="Порядок для round-robin">
                        <button type="button" data-balancer-selector-move="${escapeHtml(target.tag)}" data-direction="-1" ${orderIndex <= 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" data-balancer-selector-move="${escapeHtml(target.tag)}" data-direction="1" ${orderIndex < 0 || orderIndex >= selectorOrder.length - 1 ? 'disabled' : ''}>↓</button>
                      </span>
                    ` : ''}
                  </div>
                `; }).join('') : '<p class="muted">Сначала добавьте хотя бы один сервер или подписку.</p>'}
                ${legacySelectors.map((selector) => {
                  const orderIndex = selectorOrder.indexOf(selector);
                  return `
                  <div class="balancer-target active legacy">
                    <input type="checkbox" data-balancer-selector="${escapeHtml(selector)}" checked />
                    <span class="balancer-kind">selector</span>
                    <span>
                      <strong>${escapeHtml(selector)}</strong>
                      <em>Сохраненный selector из текущей конфигурации.</em>
                    </span>
                    ${isRoundRobin ? `
                      <span class="balancer-order-controls" aria-label="Порядок для round-robin">
                        <button type="button" data-balancer-selector-move="${escapeHtml(selector)}" data-direction="-1" ${orderIndex <= 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" data-balancer-selector-move="${escapeHtml(selector)}" data-direction="1" ${orderIndex < 0 || orderIndex >= selectorOrder.length - 1 ? 'disabled' : ''}>↓</button>
                      </span>
                    ` : ''}
                  </div>
                `; }).join('')}
              </div>
            </div>
            <div class="form-row">
              <label>Fallback</label>
              <select id="routeBalancerFallback">
                <option value="">Без резервного сервера</option>
                ${fallbackTargets.map((target) => `<option value="${escapeHtml(target.tag)}" ${state.routeBalancerFallback === target.tag ? 'selected' : ''}>${escapeHtml(target.title)}${target.kind === 'subscription' ? ' · подписка' : ''}</option>`).join('')}
              </select>
            </div>
            <div class="balancer-preview ${matches.length ? '' : 'empty'}">
              <strong>${matches.length ? `Подходит серверов: ${matches.length}` : 'Пока нет совпадений'}</strong>
              <span>${matches.length ? matches.join(', ') : 'Выберите серверы или подписки, которые уже есть в профиле.'}</span>
            </div>
            ${advancedStrategy ? `<p class="settings-warning compact"><strong>${escapeHtml(observerLabel(advancedObserver))}</strong><span>${escapeHtml(advancedHelp)}</span></p>` : ''}
          </section>

          <section class="balancer-list">
            ${balancers.length ? balancers.map((balancer, index) => {
              const selectors = Array.isArray(balancer.selector) ? balancer.selector.join(', ') : '';
              const strategy = balancer.strategy?.type || 'random';
              const used = routeRules().filter((rule) => rule.balancerTag === balancer.tag).length;
              return `<article class="balancer-row">
                <div>
                  <strong>${escapeHtml(balancer.tag || 'без имени')}</strong>
                  <span>${escapeHtml(balancerStrategyLabel(strategy))} · выбор: ${escapeHtml(selectors || 'не задан')} · правил: ${used}</span>
                </div>
                <button class="btn secondary" type="button" data-route-balancer-edit="${index}">Править</button>
                <button class="btn danger" type="button" data-route-balancer-delete="${index}" ${used ? 'disabled' : ''}>Удалить</button>
              </article>`;
            }).join('') : `<p class="muted">Групп пока нет. Создайте группу и затем выберите ее в правиле маршрутизации.</p>`}
          </section>
        </div>

        ${state.message ? `<p class="notice route-dialog-notice">${escapeHtml(state.message)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn secondary" type="button" data-action="closeRouteBalancerDialog">Отмена</button>
          <button class="btn warning" type="button" data-action="saveRouteBalancer">Сохранить</button>
        </div>
      </section>
    </div>
  `;
}

function routePresetDialog() {
  if (!state.routePresetDialog) return '';
  const editorOpen = Boolean(state.routePresetEditor);
  if (!editorOpen) return '';
  const editorPreview = state.routePresetEditPreview;
  const showCheckResult = state.routePresetEditChecked && editorPreview;
  return `
    <div class="modal-backdrop" data-action="closeRoutePresetDialog">
      <section class="modal preset-dialog" role="dialog" aria-modal="true" aria-labelledby="routePresetTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="routePresetTitle">Редактор подборки</h2>
            <span>Поправьте название, описание и строки правил перед добавлением в маршрутизацию.</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeRoutePresetDialog" aria-label="Закрыть">×</button>
        </div>
          <div class="preset-editor">
            <div class="preset-editor-grid">
              <label>
                <span>Название</span>
                <input id="routePresetEditTitle" value="${escapeHtml(state.routePresetEditTitle)}" placeholder="Например, YouTube через proxy" />
              </label>
              <label>
                <span>Описание</span>
                <input id="routePresetEditDetail" value="${escapeHtml(state.routePresetEditDetail)}" placeholder="Коротко, что делает подборка" />
              </label>
            </div>
            <label>
              <span>Правила</span>
              <textarea id="routePresetEditDsl" class="dsl-editor preset-editor-dsl" spellcheck="false" placeholder="domain(domain:...) -> proxy&#10;ip(.../24) -> proxy&#10;network(udp) &amp;&amp; ip(.../16) -> proxy&#10;source(192.168.1.50) -> direct">${escapeHtml(state.routePresetEditDsl)}</textarea>
            </label>
            ${showCheckResult ? routePresetCheckResultView(editorPreview) : '<div class="preset-editor-hint">Проверка покажет, сколько правил распознано, куда они направлены и какие строки требуют внимания.</div>'}
          </div>
          <div class="modal-actions">
            <button class="btn secondary" type="button" data-action="closeRoutePresetDialog">Отмена</button>
            <div class="split-actions">
              <button class="btn secondary" type="button" data-action="previewRoutePresetEdit">Проверить</button>
              <button class="btn secondary" type="button" data-action="saveRoutePresetEdit">Сохранить подборку</button>
              <button class="btn warning" type="button" data-action="applyRoutePresetEdit">Добавить в правила</button>
            </div>
          </div>
      </section>
    </div>
  `;
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
