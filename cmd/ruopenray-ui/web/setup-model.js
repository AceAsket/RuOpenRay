import { ensureKnownDohBootstrapHosts, isIpLiteral } from './dns-bootstrap.js';
import { isServiceOutbound } from './outbound-tags.js';

export function setupSelectionSignature(state) {
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  };
  let draft = state.jsonDraft || state.config;
  try { draft = JSON.parse(draft); } catch {}
  const firewallKeys = ['firewallRouterMode', 'firewallBypassMode', 'firewallDeviceMode', 'firewallSelectedDevices',
    'firewallKillSwitchDeviceMode', 'firewallKillSwitchSelectedDevices', 'firewallPortMode', 'firewallPorts',
    'firewallBlockQuic', 'firewallDnsIntercept', 'firewallKillSwitchEnabled', 'firewallKillSwitchTargets', 'firewallKillSwitchDomainMode'];
  return JSON.stringify(normalize({ config: state.config, draft, activeServerTag: state.activeServerTag,
    fallbackMode: state.setupFallbackMode, dnsMode: state.setupLanDnsMode, dnsUpstream: state.setupLanDnsUpstream,
    restartDnsmasq: state.setupRestartDnsmasq, firewall: Object.fromEntries(firewallKeys.map((key) => [key, state[key]])) }));
}

export function validateSetupSnapshot(snapshot) {
  if (!snapshot?.config || typeof snapshot.config !== 'object' || Array.isArray(snapshot.config)) {
    throw new Error('Не удалось сохранить конфигурацию Xray для отката. Настройки не применены.');
  }
  const firewall = snapshot.firewall;
  if (!firewall || firewall.ok !== true || !firewall.status || typeof firewall.nftBody !== 'string'
    || typeof firewall.hotplugBody !== 'string' || (firewall.status.active && !firewall.nftBody.trim())) {
    throw new Error('Не удалось сохранить полный снимок firewall для отката. Настройки не применены.');
  }
  if (!snapshot.lanDns || snapshot.lanDns.ok === false || !snapshot.lanDns.mode) {
    throw new Error('Не удалось сохранить состояние LAN DNS для отката. Настройки не применены.');
  }
}

function transparentInboundTag(config) {
  const inbounds = Array.isArray(config?.inbounds) ? config.inbounds : [];
  return inbounds.find((item) => item?.tag === 'transparent_ipv4' || item?.streamSettings?.sockopt?.tproxy)?.tag || 'transparent_ipv4';
}

function transparentCatchAllRoute(config) {
  const rules = Array.isArray(config?.routing?.rules) ? config.routing.rules : [];
  const transparentTag = transparentInboundTag(config);
  for (const rule of rules) {
    const inbound = Array.isArray(rule?.inboundTag) ? rule.inboundTag : [];
    if (!inbound.includes(transparentTag)) continue;
    if (['domain', 'ip', 'source'].some((key) => Array.isArray(rule?.[key]) && rule[key].length)) continue;
    const network = String(rule?.network || '').replace(/\s+/g, '').toLowerCase();
    const port = String(rule?.port || '').trim();
    if (network && network !== 'tcp,udp' && network !== 'udp,tcp') continue;
    if (port && port !== '0-65535') continue;
    const target = String(rule?.outboundTag || rule?.balancerTag || '');
    if (target.trim()) return { target, rule };
  }
  return { target: '', rule: null };
}

export function setupTrafficTarget(state, config = state.config) {
  const outbounds = Array.isArray(config?.outbounds) ? config.outbounds : [];
  const proxies = outbounds.filter((outbound) => !isServiceOutbound(outbound) && outbound?.tag);
  const current = transparentCatchAllRoute(config);
  if (current.rule?.outboundTag && proxies.some((outbound) => outbound.tag === current.rule.outboundTag)) {
    return { kind: 'outbound', tag: current.rule.outboundTag };
  }
  const balancers = Array.isArray(config?.routing?.balancers) ? config.routing.balancers : [];
  if (!current.rule?.outboundTag && current.rule?.balancerTag && balancers.some((item) => item?.tag === current.rule.balancerTag)) {
    return { kind: 'balancer', tag: current.rule.balancerTag };
  }
  const selected = proxies.find((outbound) => outbound.tag === state.activeServerTag) || proxies[0];
  return selected ? { kind: 'outbound', tag: selected.tag } : null;
}

export function createSetupModel({
  state,
  byteSize,
  firewallInfo,
  firewallReadyStatus,
  proxyOutbounds,
  request,
  syncConfig,
  ensureDnsServer
}) {
  let snapshotLoadFlight = null;
  let snapshotLoadToken;
  function setupReadiness() {
    const status = state.status || {};
    const geo = state.geoStatus || {};
    const firewall = state.firewallStatus || {};
    const lanDns = state.lanDnsStatus || {};
    const transparent = firewallInfo();
    const dnsReadiness = lanDns.readiness || {};
    const proxyCount = proxyOutbounds().length;
    const config = state.config || {};
    const defaultRoute = transparentCatchAllRoute(config);
    const bootstrapDomains = serverBootstrapDomains(config);
    const proxyTags = new Set(proxyOutbounds().map((item) => String(item?.tag || '').trim()).filter(Boolean));
    const userRules = (Array.isArray(config?.routing?.rules) ? config.routing.rules : [])
      .filter((rule) => !isSetupManagedRule(rule, bootstrapDomains));
    const balancerTags = new Set((Array.isArray(config.routing?.balancers) ? config.routing.balancers : []).map((item) => item?.tag).filter(Boolean));
    const proxyRuleCount = userRules.filter((rule) =>
      (!rule?.outboundTag && balancerTags.has(rule?.balancerTag))
      || proxyTags.has(String(rule?.outboundTag || '').trim())
    ).length;
    const firewallMatchesSelection = typeof firewallReadyStatus === 'function'
      ? firewallReadyStatus(firewall)
      : Boolean(firewall.active && firewall.persistent && !firewall.needsPolicyFix);
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
        title: 'Прокси-сервер добавлен',
        detail: proxyCount ? `${proxyCount} прокси-направлений в конфигурации` : 'Добавьте VLESS/Vmess/Trojan/SS-сервер или подписку.'
      },
      {
        key: 'transparent',
        ok: Boolean(transparent.ready),
        warn: Boolean(transparent.transparent.length),
        title: 'Входящий поток перехвата',
        detail: transparent.ready
          ? `Порт ${transparent.transparentPort}, DNS-выход и локальные исключения найдены`
          : 'Мастер подготовит входящий поток transparent_ipv4, DNS-выход и базовые исключения.'
      },
      {
        key: 'defaultRoute',
        ok: Boolean(defaultRoute.target),
        warn: proxyCount > 0,
        title: 'Остальной трафик',
        detail: defaultRoute.target
          ? `Unmatched LAN-трафик пойдет в ${defaultRoute.target}.`
          : 'Мастер добавит финальное правило transparent_ipv4 для трафика, который не совпал с правилами выше.'
      },
      {
        key: 'firewall',
        ok: firewallMatchesSelection,
        warn: Boolean(firewall.active),
        title: 'Защита nftables',
        detail: firewall.active && !firewallMatchesSelection
          ? 'nftables активен, но примененная схема отличается от выбранной сейчас.'
          : firewall.active
          ? `${firewall.routerMode || state.firewallRouterMode} · ${firewall.persistent ? 'сохранен' : 'только до перезапуска'}`
          : 'Нужно применить nftables и правила маршрутизации RuOpenRay.'
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
    const required = items.filter((item) => ['core', 'geo', 'servers', 'transparent', 'defaultRoute', 'firewall'].includes(item.key));
    return {
      items,
      ready: required.every((item) => item.ok),
      canApply: Boolean(status.core?.available && proxyCount > 0),
      proxyCount,
      userRuleCount: userRules.length,
      proxyRuleCount,
      defaultRouteTarget: defaultRoute.target
    };
  }

  function loadSetupSnapshot() {
    if (state.setupSnapshot) return state.setupSnapshot;
    return null;
  }

  function saveSetupSnapshot(snapshot) {
    state.setupSnapshot = snapshot;
  }

  function restoreSetupSnapshot() {
    const token = state.token;
    if (snapshotLoadFlight && snapshotLoadToken === token) return snapshotLoadFlight;
    snapshotLoadToken = token;
    const flight = (async () => {
      const result = await request('/api/setup/snapshot');
      if (token !== state.token) throw new Error('Сессия изменилась. Откройте мастер заново.');
      if (result.ok !== true) throw new Error(result.error || 'Не удалось загрузить точку отката мастера.');
      if (result.exists) validateSetupSnapshot(result.snapshot);
      state.setupSnapshotRevision = result.revision || '';
      state.setupSnapshotLoaded = true;
      state.setupSnapshotToken = token;
      state.setupSnapshot = result.exists ? result.snapshot : null;
      return state.setupSnapshot;
    })();
    snapshotLoadFlight = flight;
    flight.finally(() => { if (snapshotLoadFlight === flight) snapshotLoadFlight = null; }).catch(() => {});
    return flight;
  }

  async function persistSetupSnapshot(snapshot) {
    validateSetupSnapshot(snapshot);
    const token = state.token;
    const result = await request('/api/setup/snapshot', {
      method: 'POST', body: JSON.stringify({ snapshot, expectedRevision: state.setupSnapshotRevision || '' })
    });
    if (token !== state.token) throw new Error('Сессия изменилась. Точка отката сохранена на роутере.');
    if (result.ok !== true) throw new Error(result.error || 'Не удалось сохранить точку отката. Настройки не применены.');
    state.setupSnapshotRevision = result.revision;
    state.setupSnapshotLoaded = true;
    state.setupSnapshotToken = token;
    Object.assign(snapshot, result.snapshot);
    saveSetupSnapshot(snapshot);
    return snapshot;
  }

  async function clearSetupSnapshot({ force = false } = {}) {
    if (!force && (state.setupApplying || state.setupRollbacking)) return;
    if (!state.setupSnapshotLoaded || state.setupSnapshotToken !== state.token) await restoreSetupSnapshot();
    const token = state.token;
    const result = await request('/api/setup/snapshot', {
      method: 'DELETE', body: JSON.stringify({ expectedRevision: state.setupSnapshotRevision || '' })
    });
    if (token !== state.token) throw new Error('Сессия изменилась. Откройте мастер заново.');
    if (result.ok !== true) throw new Error(result.error || 'Не удалось удалить точку отката.');
    state.setupSnapshot = null;
    state.setupSnapshotRevision = '';
    state.setupRollbackResult = null;
  }

  async function captureSetupSnapshot() {
    if (!state.setupSnapshotLoaded || state.setupSnapshotToken !== state.token) await restoreSetupSnapshot();
    if (state.setupSnapshot?.recoveryPending) return state.setupSnapshot;
    const token = state.token;
    const [config, firewall, lanDns] = await Promise.all([
      request('/api/config'),
      request('/api/firewall/snapshot'),
      request('/api/dns/lan-upstream')
    ]);
    if (token !== state.token) throw new Error('Сессия изменилась. Запустите мастер заново.');
    const snapshot = {
      createdAt: new Date().toISOString(),
      config,
      firewall,
      lanDns,
      dnsMutationAttempted: false,
      recoveryPending: false
    };
    validateSetupSnapshot(snapshot);
    if (state.setupLanDnsMode !== 'keep') lanDnsRestorePayload(lanDns);
    return await persistSetupSnapshot(snapshot);
  }

  function lanDnsRestorePayload(lanDns) {
    const mode = lanDns?.mode;
    const servers = Array.isArray(lanDns?.servers) ? lanDns.servers : [];
    if (mode === 'xray') return { mode: 'xray', restart: true };
    if (mode === 'upstream' && servers.length === 1) return { mode: 'upstream', upstream: servers[0], restart: true };
    if (mode === 'system' && !servers.length) return { mode: 'system', restart: true };
    throw new Error('Текущий LAN DNS нельзя полностью восстановить автоматически. Выберите «Не трогать» DNS перед запуском мастера.');
  }

  function privateBypassCidrs() {
    return ['10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16', '224.0.0.0/3', '::1/128', 'fc00::/7', 'fe80::/10'];
  }

  function isPrivateBypassRule(rule, ips, domains, sources, inbound, transparentTag) {
    const allowed = new Set(privateBypassCidrs());
    allowed.add('geoip:private');
    return rule?.outboundTag === 'direct' &&
      inbound.includes(transparentTag) &&
      ips.length > 0 &&
      !domains.length &&
      !sources.length &&
      !rule?.port &&
      !rule?.balancerTag &&
      ips.every((item) => allowed.has(String(item || '').trim().toLowerCase()));
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
    ensureKnownDohBootstrapHosts(config);
  }

  function firstProxyOutboundTag(config) {
    const outbounds = Array.isArray(config?.outbounds) ? config.outbounds : [];
    for (const outbound of outbounds) {
      const tag = String(outbound?.tag || '').trim();
      if (!tag || isServiceOutbound(outbound)) continue;
      return tag;
    }
    return '';
  }

  function setupFallbackModeFromConfig(config = state.config || {}) {
    const current = transparentCatchAllRoute(config);
    const selected = setupTrafficTarget(state, config);
    return selected && current.target === selected.tag ? 'proxy' : 'direct';
  }

  function isSetupManagedRule(rule, bootstrapDomains = [], transparentTag = transparentInboundTag(state.config)) {
    const inbound = Array.isArray(rule?.inboundTag) ? rule.inboundTag : [];
    const ips = Array.isArray(rule?.ip) ? rule.ip : [];
    const domains = Array.isArray(rule?.domain) ? rule.domain : [];
    const sources = Array.isArray(rule?.source) ? rule.source : [];
    const network = String(rule?.network || '').replace(/\s+/g, '').toLowerCase();
    const port = String(rule?.port || '').trim();
    const transparentCatchAll = inbound.includes(transparentTag) &&
      !ips.length &&
      !domains.length &&
      !sources.length &&
      (!network || network === 'tcp,udp' || network === 'udp,tcp') &&
      (!port || port === '0-65535');
    if (transparentCatchAll) return true;
    if (isPrivateBypassRule(rule, ips, domains, sources, inbound, transparentTag)) return true;
    if (rule?.outboundTag === 'dns-out' && inbound.includes('ruopenray_dns_in')) return true;
    if (rule?.outboundTag === 'dns-out' && String(rule?.port || '') === '53') return true;
    if (rule?.outboundTag === 'direct' && domains.length && domains.every((item) => bootstrapDomains.includes(item))) return true;
    return false;
  }

  function normalizeSetupRules(config) {
    ensureDnsBootstrapHosts(config);
    config.routing = config.routing && typeof config.routing === 'object' ? config.routing : {};
    const rules = Array.isArray(config.routing.rules) ? config.routing.rules : [];
    const bootstrapDomains = serverBootstrapDomains(config);
    const target = setupTrafficTarget(state, config);
    const transparentTag = transparentInboundTag(config);
    const managedRules = [
      { type: 'field', outboundTag: 'direct', inboundTag: [transparentTag], ip: privateBypassCidrs() },
      ...(bootstrapDomains.length ? [{ type: 'field', outboundTag: 'direct', domain: bootstrapDomains }] : []),
      { type: 'field', inboundTag: ['ruopenray_dns_in'], outboundTag: 'dns-out' },
      { type: 'field', outboundTag: 'dns-out', port: '53' }
    ];
    const fallback = state.setupFallbackMode === 'proxy' ? target && { [`${target.kind}Tag`]: target.tag } : { outboundTag: 'direct' };
    const catchAllRules = fallback
      ? [{ type: 'field', inboundTag: [transparentTag], ...fallback, network: 'tcp,udp' }]
      : [];
    const seen = new Set();
    const keptRules = [];
    for (const rule of rules) {
      if (isSetupManagedRule(rule, bootstrapDomains, transparentTag)) continue;
      const signature = setupRuleSignature(rule);
      if (seen.has(signature)) continue;
      seen.add(signature);
      keptRules.push(rule);
    }
    config.routing.rules = [...managedRules, ...keptRules, ...catchAllRules];
  }

  function prepareSetupDraft({ message = true, persist = true } = {}) {
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
      if (!transparentInbound.tag) transparentInbound.tag = 'transparent_ipv4';
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
    const manualPort = Number(state.dnsInboundPort);
    const suggestedPort = Number(state.lanDnsStatus?.suggestedXrayPort || 10535) || 10535;
    const dnsPort = manualPort > 0 && manualPort < 65536 ? manualPort : suggestedPort;
    state.dnsInboundPort = String(dnsPort);
    const dnsInbound = next.inbounds.find((item) => item?.tag === 'ruopenray_dns_in');
    if (!dnsInbound) {
      next.inbounds.push({
        tag: 'ruopenray_dns_in',
        listen: '127.0.0.1',
        port: dnsPort,
        protocol: 'dokodemo-door',
        settings: { address: '8.8.8.8', port: 53, network: 'tcp,udp' }
      });
    } else if (Number(dnsInbound.port) !== dnsPort) {
      dnsInbound.port = dnsPort;
    }
    ensureDnsServer(next, 'https://dns.google:443/dns-query');
    ensureDnsServer(next, 'https://dns.adguard-dns.com/dns-query');
  
    normalizeSetupRules(next);
  
    syncConfig(next, { persist });
    if (message) state.message = 'Черновик активного режима подготовлен: входящий поток перехвата, DNS-вход Xray, DNS-выход и базовые правила добавлены.';
  }

  return {
    setupReadiness,
    loadSetupSnapshot,
    saveSetupSnapshot,
    restoreSetupSnapshot,
    persistSetupSnapshot,
    clearSetupSnapshot,
    captureSetupSnapshot,
    lanDnsRestorePayload,
    privateBypassCidrs,
    setupRuleSignature,
    isIpLiteral,
    hostnameFromUrl,
    serverBootstrapDomains,
    ensureDnsBootstrapHosts,
    firstProxyOutboundTag,
    transparentCatchAllRoute,
    setupFallbackModeFromConfig,
    isSetupManagedRule,
    normalizeSetupRules,
    prepareSetupDraft
  };
}
