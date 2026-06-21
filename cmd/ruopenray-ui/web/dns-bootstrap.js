export const builtInDohBootstrapHosts = Object.freeze({
  'cloudflare-dns.com': ['1.1.1.1', '1.0.0.1'],
  'dns.google': ['8.8.8.8', '8.8.4.4'],
  'dns.quad9.net': ['9.9.9.9', '149.112.112.112'],
  'dns.adguard-dns.com': ['94.140.14.14', '94.140.15.15'],
  'common.dot.dns.yandex.net': ['77.88.8.8', '77.88.8.1'],
  'doh.opendns.com': ['208.67.222.222', '208.67.220.220']
});

export function isIpLiteral(value) {
  const clean = String(value || '').trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!clean) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(clean)) return clean.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
  return /^[0-9a-f:]+$/i.test(clean) && clean.includes(':');
}

export function dnsHostsObject(config) {
  config.dns = config.dns && typeof config.dns === 'object' ? config.dns : {};
  config.dns.hosts = config.dns.hosts && typeof config.dns.hosts === 'object' && !Array.isArray(config.dns.hosts) ? config.dns.hosts : {};
  return config.dns.hosts;
}

export function knownDohBootstrapIps(host) {
  const clean = String(host || '').trim().toLowerCase();
  return Array.isArray(builtInDohBootstrapHosts[clean]) ? [...builtInDohBootstrapHosts[clean]] : [];
}

export function ensureKnownDohBootstrapHosts(config) {
  const hosts = dnsHostsObject(config);
  for (const [host, ips] of Object.entries(builtInDohBootstrapHosts)) {
    if (!hosts[host]) hosts[host] = [...ips];
  }
  return hosts;
}

export function dohBootstrapHostFromAddress(address) {
  try {
    const url = new URL(String(address || '').trim());
    if (url.protocol !== 'https:') return '';
    const host = String(url.hostname || '').trim().toLowerCase();
    return host && !isIpLiteral(host) ? host : '';
  } catch {
    return '';
  }
}

export function bootstrapHostValues(value) {
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map((item) => String(item || '').trim()).filter(Boolean))];
}

export function saveDnsBootstrapHost(config, host, ips) {
  const cleanHost = String(host || '').trim().toLowerCase();
  const cleanIps = bootstrapHostValues(ips).filter(isIpLiteral);
  if (!cleanHost || !cleanIps.length) return [];
  const hosts = dnsHostsObject(config);
  hosts[cleanHost] = cleanIps;
  return cleanIps;
}
