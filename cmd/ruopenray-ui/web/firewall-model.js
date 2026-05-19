export function createFirewallModel({ state, configInbounds, configOutbounds, routeRules, splitRouteValues, deviceRules, routeRuleName, describeRouteRule }) {
  function firewallInfo() {
    const transparent = configInbounds().filter((item) => {
      const tag = String(item?.tag || '');
      const tproxy = String(item?.streamSettings?.sockopt?.tproxy || '');
      const followRedirect = item?.settings?.followRedirect === true;
      return tag.includes('transparent') || followRedirect || tproxy === 'tproxy' || tproxy === 'redirect';
    });
    const dnsIn = configInbounds().filter((item) => item?.tag === 'ruopenray_dns_in');
    const dnsOut = configOutbounds().filter((item) => item?.protocol === 'dns' || String(item?.tag || '').includes('dns'));
    const localBypass = routeRules().filter((rule) => {
      const ips = Array.isArray(rule.ip) ? rule.ip.join(' ') : '';
      return rule.outboundTag === 'direct' && /geoip:private|127\.0\.0\.1|192\.168|10\.0\.0|172\.16|::1/.test(ips);
    });
    const sourceRules = routeRules().filter((rule) => Array.isArray(rule.source) && rule.source.length);
    const transparentPort = transparent.find((item) => item?.streamSettings?.sockopt?.tproxy)?.port || transparent[0]?.port || 52345;

    return {
      transparent,
      dnsIn,
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

  function firewallKillSwitchTargets() {
    const values = splitRouteValues(state.firewallKillSwitchTargets);
    const ips = [];
    const domains = [];
    const invalid = [];
    for (const value of values) {
      const clean = String(value || '').trim();
      if (!clean) continue;
      const domain = clean.replace(/^\*\./, '');
      if (/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(clean)) {
        ips.push(clean);
      } else if (/^[a-z0-9_.-]+(\.[a-z0-9_-]+)+$/i.test(domain)) {
        domains.push(domain);
      } else {
        invalid.push(clean);
      }
    }
    return { ips: [...new Set(ips)], domains: [...new Set(domains)], invalid };
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
    const info = firewallInfo();
    const devices = firewallSelectedDevices();
    const ports = firewallPorts();
    const guard = firewallKillSwitchTargets();
    const traffic = state.firewallDeviceMode === 'selected'
      ? `только выбранные устройства (${devices.length})`
      : state.firewallDeviceMode === 'exclude'
        ? `все LAN, кроме выбранных устройств (${devices.length})`
        : 'все LAN-устройства';
    const router = state.firewallRouterMode === 'redirect'
      ? 'REDIRECT: проще, только TCP, QUIC лучше блокировать'
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
    if (!info.transparent.length) warnings.push('Нет transparent inbound: firewall будет отправлять LAN-трафик в Xray, но Xray не слушает порт перехвата. Нажмите «Подготовить черновик».');
    if (info.dnsIn.length && !info.transparent.length) warnings.push('DNS inbound найден, но он обрабатывает только DNS. Для сайтов и приложений LAN-клиентов нужен transparent inbound.');
    if (!info.dnsOut.length) warnings.push('Не найден dns-out: перехват DNS не сможет отправлять запросы через Xray DNS.');
    if (!info.localBypass.length) warnings.push('Не найден local bypass: приватные адреса LAN лучше явно оставить напрямую.');
    if (state.firewallRouterMode === 'redirect' && !state.firewallBlockQuic) warnings.push('REDIRECT не обрабатывает UDP/QUIC надежно. Лучше включить блокировку QUIC или выбрать TPROXY.');
    if (state.firewallDeviceMode !== 'all' && !devices.length) warnings.push('Выбран режим по устройствам, но устройства не отмечены.');
    if (state.firewallPortMode !== 'all' && !ports.length) warnings.push('Выбран режим портов, но порты не заданы.');
    if (!state.firewallDnsIntercept) warnings.push('Перехват DNS выключен: клиенты смогут отправлять UDP/TCP 53 напрямую наружу, если не используют DNS роутера.');
    if (state.firewallKillSwitchEnabled && !guard.ips.length && !guard.domains.length) warnings.push('Kill switch включен, но цели защиты не указаны.');
    if (state.firewallKillSwitchEnabled && guard.domains.length) warnings.push('Домены в kill switch требуют DNS через RuOpenRay/nftset. Сейчас firewall применяет только IP и подсети.');
    if (state.firewallKillSwitchEnabled && guard.invalid.length) warnings.push(`Некоторые цели kill switch не распознаны: ${guard.invalid.slice(0, 3).join(', ')}`);
    return {
      router,
      traffic,
      policyName,
      policy,
      ports: state.firewallPortMode === 'all' ? 'все порты' : ports.join(', ') || 'не заданы',
      quic: state.firewallBlockQuic ? 'UDP/443 будет заблокирован до Xray' : 'UDP/443 не блокируется',
      dns: state.firewallDnsIntercept ? 'DNS/53 перехватывается отдельно' : 'DNS/53 не перехватывается firewall',
      warnings,
      guard
    };
  }

  function firewallCommands() {
    const info = firewallInfo();
    const port = info.transparentPort || 52345;
    const excludedDeviceReturn = state.firewallDeviceMode === 'exclude' ? firewallDeviceExpression().trim() : '';
    const packageCommand = state.firewallRouterMode === 'tproxy'
      ? 'if command -v apk >/dev/null 2>&1; then apk update && apk add kmod-nf-tproxy kmod-nft-tproxy kmod-nft-socket; else opkg update && opkg install kmod-nf-tproxy kmod-nft-tproxy kmod-nft-socket; fi'
      : '# REDIRECT-режиму kmod-nft-tproxy не нужен';
    const scopedDeviceExpr = state.firewallDeviceMode === 'selected' ? firewallDeviceExpression() : '';
    const blockQuicRule = state.firewallBlockQuic ? `nft add rule inet ruopenray prerouting iifname "br-lan" ${scopedDeviceExpr}udp dport 443 drop # Block QUIC/HTTP3` : '';
    const dnsInterceptRules = [];
    if (state.firewallDnsIntercept && state.firewallPortMode !== 'all' && !firewallPorts().some((item) => {
      const [start, end = start] = String(item).split('-').map((part) => Number(part.trim()));
      return Number.isFinite(start) && Number.isFinite(end) && start <= 53 && 53 <= end;
    })) {
      if (state.firewallRouterMode === 'redirect') {
        dnsInterceptRules.push(`nft add rule inet ruopenray prerouting iifname "br-lan" ${scopedDeviceExpr}meta l4proto tcp tcp dport 53 redirect to :${port} comment "RuOpenRay DNS Intercept"`);
        dnsInterceptRules.push(`nft add rule inet ruopenray prerouting iifname "br-lan" ${scopedDeviceExpr}meta l4proto udp udp dport 53 drop comment "RuOpenRay DNS UDP guard"`);
      } else {
        dnsInterceptRules.push(`nft add rule inet ruopenray prerouting iifname "br-lan" ${scopedDeviceExpr}meta l4proto { tcp, udp } th dport 53 counter tproxy to :${port} meta mark set 1 comment "RuOpenRay DNS Intercept"`);
      }
    }
    const guard = firewallKillSwitchTargets();
    const killSwitchRules = [];
    if (state.firewallKillSwitchEnabled && guard.ips.length) {
      killSwitchRules.push(`nft add set inet ruopenray killswitch4 { type ipv4_addr \\; flags interval \\; elements = { ${guard.ips.join(', ')} } \\; }`);
      if (state.firewallRouterMode === 'redirect') {
        killSwitchRules.push(`nft add rule inet ruopenray prerouting iifname "br-lan" ip daddr @killswitch4 meta l4proto tcp redirect to :${port} comment "RuOpenRay Kill Switch"`);
        killSwitchRules.push('nft add rule inet ruopenray prerouting iifname "br-lan" ip daddr @killswitch4 meta l4proto udp drop comment "RuOpenRay Kill Switch UDP guard"');
      } else {
        killSwitchRules.push(`nft add rule inet ruopenray prerouting iifname "br-lan" ip daddr @killswitch4 meta l4proto { tcp, udp } counter tproxy to :${port} meta mark set 1 comment "RuOpenRay Kill Switch"`);
      }
    }
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
      excludedDeviceReturn ? `nft add rule inet ruopenray prerouting ${excludedDeviceReturn}` : '',
      ...killSwitchRules,
      'nft add rule inet ruopenray prerouting ip daddr { 10.0.0.0/8, 127.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 } return',
      ...dnsInterceptRules,
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
        '# Позже сюда можно подключить dnsmasq/nftset для direct-доменов из правил.',
        firewallTargetRule(port)
      ].join('\n');
    }
    if (state.firewallBypassMode === 'redirect') {
      return [
        ...common,
        '# REDIRECT: в Xray идут только адреса из proxy4. Direct-трафик не заходит в Xray.',
        'nft add set inet ruopenray proxy4 { type ipv4_addr \\; flags interval \\; }',
        '# Заполняйте proxy4 из доменов/geo-правил через dnsmasq/nftset или отдельный updater.',
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
    const guard = firewallKillSwitchTargets();
    return {
      routerMode: state.firewallRouterMode,
      bypassMode: state.firewallBypassMode,
      deviceMode: state.firewallDeviceMode,
      devices: firewallSelectedDevices().map((device) => device.ip),
      portMode: state.firewallPortMode,
      ports: firewallPorts(),
      blockQuic: state.firewallBlockQuic,
      dnsIntercept: state.firewallDnsIntercept,
      killSwitch: state.firewallKillSwitchEnabled,
      killSwitchIps: guard.ips,
      killSwitchDomains: guard.domains,
      transparentPort: Number(info.transparentPort || 52345),
      lanInterface: 'br-lan'
    };
  }

  function firewallReadyStatus(status) {
    if (!status?.active || !status?.persistent) return false;
    const expectedRouterMode = state.firewallRouterMode || 'tproxy';
    if (status.routerMode && status.routerMode !== expectedRouterMode) return false;
    if (expectedRouterMode === 'tproxy' && (!status.ipRule || !status.ipRoute)) return false;
    if (status.bypassMode && status.bypassMode !== (state.firewallBypassMode || 'off')) return false;
    if (status.deviceMode && status.deviceMode !== (state.firewallDeviceMode || 'all')) return false;
    if (status.portMode && status.portMode !== (state.firewallPortMode || 'custom')) return false;
    if (status.portMode === 'custom' && !sameStringSet(status.ports || [], firewallPorts())) return false;
    if (typeof status.dnsIntercept === 'boolean' && status.dnsIntercept !== Boolean(state.firewallDnsIntercept)) return false;
    if (typeof status.blockQuic === 'boolean' && status.blockQuic !== Boolean(state.firewallBlockQuic)) return false;
    return true;
  }

  function sameStringSet(left, right) {
    const normalize = (items) => [...new Set((Array.isArray(items) ? items : []).map((item) => String(item).trim()).filter(Boolean))].sort();
    const a = normalize(left);
    const b = normalize(right);
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }

  return {
    firewallInfo,
    firewallPorts,
    firewallDeviceChoices,
    firewallSelectedDevices,
    firewallKillSwitchTargets,
    nftList,
    firewallDeviceExpression,
    firewallPortExpression,
    firewallTargetRule,
    firewallPolicyPreview,
    firewallCommands,
    firewallPayload,
    firewallReadyStatus
  };
}
