function decodeBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function parseShareLink(link) {
  const trimmed = String(link || '').trim();
  if (!trimmed) throw new Error('Пустая ссылка для импорта');
  const url = new URL(trimmed);
  if (url.protocol === 'vmess:') {
    const raw = JSON.parse(decodeBase64Url(url.pathname));
    return {
      tag: raw.ps || raw.add || 'vmess-out',
      protocol: 'vmess',
      settings: {
        vnext: [
          {
            address: raw.add,
            port: Number(raw.port),
            users: [{ id: raw.id, alterId: Number(raw.aid || 0), security: raw.scy || 'auto' }]
          }
        ]
      },
      streamSettings: { network: raw.net || 'tcp', security: raw.tls || 'none' }
    };
  }

  const protocol = url.protocol.replace(':', '');
  if (!['vless', 'trojan', 'ss'].includes(protocol)) {
    throw new Error(`Неподдерживаемый протокол ссылки: ${protocol}`);
  }

  const tag = decodeURIComponent(url.hash.replace(/^#/, '')) || `${protocol}-out`;
  const address = url.hostname.replace(/^\[|\]$/g, '');
  const port = Number(url.port || 443);
  const query = Object.fromEntries(url.searchParams.entries());
  for (const key of ['allowInsecure', 'insecure']) {
    for (const value of url.searchParams.getAll(key)) {
      if (!/^(true|false|1|0)$/i.test(value)) throw new Error(`${key} должен быть true/false или 1/0`);
      if (/^(true|1)$/i.test(value)) throw new Error('allowInsecure=true удалён из Xray; нужен действительный сертификат сервера и правильный SNI');
    }
  }
  for (const key of ['extra', 'ech', 'echConfigList', 'fm', 'pcs', 'vcn']) {
    if (query[key]) throw new Error(`Параметр ${key} пока не поддерживается импортом; используйте проверенный JSON-конфиг`);
  }
  const network = query.type || 'tcp';
  const security = query.security || (protocol === 'trojan' ? 'tls' : 'none');
  const streamSettings = { network, security };
  const serverName = query.sni || query.peer || address;
  if (security === 'tls') {
    const tls = { serverName };
    if (query.fp) tls.fingerprint = query.fp;
    const alpn = (query.alpn || '').split(',').map((value) => value.trim()).filter(Boolean);
    if (!alpn.length && network === 'grpc') alpn.push('h2');
    if (alpn.length) tls.alpn = alpn;
    const insecure = query.allowInsecure || query.insecure;
    if (/^(true|false|1|0)$/i.test(insecure || '')) tls.allowInsecure = /^(true|1)$/i.test(insecure);
    streamSettings.tlsSettings = tls;
  }
  if (security === 'reality') {
    streamSettings.realitySettings = { serverName, publicKey: query.pbk || '', shortId: query.sid || '' };
    if (query.fp) streamSettings.realitySettings.fingerprint = query.fp;
    if (query.spx) streamSettings.realitySettings.spiderX = query.spx;
  }
  if (network === 'grpc') {
    streamSettings.grpcSettings = { serviceName: query.serviceName || '', multiMode: query.mode === 'multi' };
    if (query.authority) streamSettings.grpcSettings.authority = query.authority;
  }
  if (network === 'ws') {
    streamSettings.wsSettings = { path: query.path || '/' };
    if (query.host) streamSettings.wsSettings.headers = { Host: query.host };
  }
  if (network === 'xhttp' || network === 'splithttp') {
    streamSettings.xhttpSettings = { path: query.path || '/', mode: query.mode || 'auto' };
    if (query.host) streamSettings.xhttpSettings.host = query.host;
  }


  if (protocol === 'trojan') {
    return {
      tag,
      protocol,
      settings: { servers: [{ address, port, password: decodeURIComponent(url.username + (url.password ? `:${url.password}` : '')) }] },
      streamSettings
    };
  }

  if (protocol === 'ss') {
    return {
      tag,
      protocol: 'shadowsocks',
      settings: {
        servers: [{ address, port, method: query.method || '2022-blake3-aes-128-gcm', password: decodeURIComponent(url.username) }]
      }
    };
  }

  return {
    tag,
    protocol,
    settings: {
      vnext: [
        {
          address,
          port,
          users: [{ id: decodeURIComponent(url.username), encryption: query.encryption || 'none', flow: query.flow || undefined }]
        }
      ]
    },
    streamSettings
  };
}

