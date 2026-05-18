export function createDnsActions({
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
}) {
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


  return {
    addDnsServer,
    saveDnsHost,
    editDnsHost,
    removeDnsHost,
    applyDnsGuardPreset,
    removeDnsServer,
    checkDnsServer,
    applyLanDnsUpstream,
    applyDnsBootstrapHosts,
    previewLanDnsUpstream,
    dnsHostValueFromInput,
    dnsHostValueToInput,
    ensureDnsServer
  };
}
