export function createXrayDraftActions({
  state,
  render,
  syncConfig,
  advancedInbounds,
  currentSnifferSettings,
  proxyOutbounds,
  normalizeSetupRules,
  firewallCommands,
  githubInstallCommand
}) {
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
    const dnsPort = Number(state.lanDnsStatus?.dnsPortConflict ? state.lanDnsStatus?.suggestedXrayPort : 5353) || 5353;
    const dnsInbound = next.inbounds.find((item) => item?.tag === 'ruopenray_dns_in');

    if (!dnsInbound) {
      next.inbounds.push({
        tag: 'ruopenray_dns_in',
        listen: '127.0.0.1',
        port: dnsPort,
        protocol: 'dokodemo-door',
        settings: { address: '8.8.8.8', port: 53, network: 'tcp,udp' }
      });
    } else if (state.lanDnsStatus?.dnsPortConflict && Number(dnsInbound.port) === 5353) {
      dnsInbound.port = dnsPort;
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
    state.message = `DNS inbound подготовлен в черновике. После применения dnsmasq можно направить на 127.0.0.1#${dnsPort}.`;
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

  return {
    setSnifferDraft,
    setTcpFastOpenDraft,
    setDnsModeDraft,
    prepareTransparentDraft,
    prepareDnsInboundDraft,
    copyFirewallCommands,
    copyInstallCommand
  };
}
