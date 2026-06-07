function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) parent[key] = {};
  return parent[key];
}

function ensureArrayItem(parent, key, index = 0) {
  if (!Array.isArray(parent[key])) parent[key] = [];
  if (!parent[key][index] || typeof parent[key][index] !== 'object') parent[key][index] = {};
  return parent[key][index];
}

function primaryEndpoint(outbound = {}) {
  const protocol = outbound?.protocol;
  if (protocol === 'vless' || protocol === 'vmess') return outbound?.settings?.vnext?.[0] || {};
  if (protocol === 'trojan' || protocol === 'shadowsocks') return outbound?.settings?.servers?.[0] || {};
  return outbound?.settings || {};
}

function primaryUser(outbound = {}) {
  const protocol = outbound?.protocol;
  if (protocol === 'vless' || protocol === 'vmess') return outbound?.settings?.vnext?.[0]?.users?.[0] || {};
  if (protocol === 'trojan' || protocol === 'shadowsocks') return outbound?.settings?.servers?.[0] || {};
  return {};
}

function stream(outbound = {}) {
  return outbound?.streamSettings || {};
}

function securitySettings(outbound = {}) {
  const s = stream(outbound);
  return s.realitySettings || s.tlsSettings || {};
}

const fragmentOutboundTagPrefix = 'ruopenray-fragment-';

export const fragmentPresets = {
  off: { label: 'Выключено', length: '', interval: '', packets: 'tlshello' },
  soft: { label: 'Мягко', length: '120-220', interval: '0-8', packets: 'tlshello' },
  normal: { label: 'Обычно', length: '100-200', interval: '10-20', packets: 'tlshello' },
  hard: { label: 'Жестко', length: '50-120', interval: '20-40', packets: 'tlshello' },
  custom: { label: 'Вручную', length: '80-180', interval: '10-30', packets: 'tlshello' }
};

export const browserFingerprintOptions = [
  { value: '', label: 'Не задавать' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'safari', label: 'Safari' },
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'edge', label: 'Edge' },
  { value: '360', label: '360 Browser' },
  { value: 'qq', label: 'QQ Browser' },
  { value: 'random', label: 'Random' },
  { value: 'randomized', label: 'Randomized' }
];

function decodeRawUrlBase64(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`;
  return atob(padded);
}

function encodeRawUrlBase64(value) {
  return btoa(String(value || '')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fragmentSpecFromDialerProxy(tag) {
  if (!String(tag || '').startsWith(fragmentOutboundTagPrefix)) {
    return { enabled: false, preset: 'off', length: '', interval: '', packets: 'tlshello', raw: '' };
  }
  try {
    const raw = decodeRawUrlBase64(String(tag).slice(fragmentOutboundTagPrefix.length));
    const [length = '100-200', interval = '10-20', packets = 'tlshello'] = raw.split(',').map((item) => item.trim()).filter(Boolean);
    const preset = Object.entries(fragmentPresets).find(([key, spec]) => key !== 'off' && key !== 'custom' && spec.length === length && spec.interval === interval && spec.packets === packets)?.[0] || 'custom';
    return { enabled: true, preset, length, interval, packets, raw };
  } catch {
    return { enabled: true, preset: 'custom', length: '100-200', interval: '10-20', packets: 'tlshello', raw: '' };
  }
}

function fragmentTagFromSpec({ length, interval, packets }) {
  const cleanLength = String(length || '100-200').trim();
  const cleanInterval = String(interval || '10-20').trim();
  const cleanPackets = String(packets || 'tlshello').trim();
  return `${fragmentOutboundTagPrefix}${encodeRawUrlBase64(`${cleanLength},${cleanInterval},${cleanPackets}`)}`;
}

function setFragmentSpec(outbound, spec) {
  const next = outbound;
  const streamSettings = ensureObject(next, 'streamSettings');
  const sockopt = ensureObject(streamSettings, 'sockopt');
  if (!spec || spec.preset === 'off') {
    delete sockopt.dialerProxy;
    if (Object.keys(sockopt).length === 0) delete streamSettings.sockopt;
    return next;
  }
  sockopt.dialerProxy = fragmentTagFromSpec(spec);
  return next;
}

export function parseServerEditJson(json) {
  try {
    const outbound = JSON.parse(json || '{}');
    if (!outbound || typeof outbound !== 'object' || Array.isArray(outbound)) {
      return { outbound: null, error: 'Outbound должен быть JSON-объектом' };
    }
    return { outbound, error: '' };
  } catch (error) {
    return { outbound: null, error: `JSON не разобран: ${error.message}` };
  }
}

export function serverEditFields(outbound = {}) {
  const endpoint = primaryEndpoint(outbound);
  const user = primaryUser(outbound);
  const s = stream(outbound);
  const sec = securitySettings(outbound);
  const fragment = fragmentSpecFromDialerProxy(s?.sockopt?.dialerProxy || '');
  return {
    tag: outbound?.tag || '',
    protocol: outbound?.protocol || 'vless',
    address: endpoint?.address || outbound?.settings?.address || '',
    port: endpoint?.port ?? outbound?.settings?.port ?? '',
    id: user?.id || '',
    password: user?.password || '',
    userSecurity: user?.security || user?.encryption || user?.method || '',
    flow: user?.flow || '',
    network: s?.network || 'tcp',
    security: s?.security || 'none',
    sni: sec?.serverName || '',
    fingerprint: sec?.fingerprint || '',
    publicKey: sec?.publicKey || '',
    shortId: Array.isArray(sec?.shortId) ? sec.shortId.join(', ') : (sec?.shortId || ''),
    spiderX: sec?.spiderX || '',
    path: s?.wsSettings?.path || s?.httpSettings?.path || s?.grpcSettings?.serviceName || '',
    fragmentPreset: fragment.preset,
    fragmentLength: fragment.length,
    fragmentInterval: fragment.interval,
    fragmentPackets: fragment.packets
  };
}

export function patchServerEditField(outbound, field, value) {
  const next = clone(outbound);
  const raw = String(value ?? '').trim();
  const protocol = field === 'protocol' ? raw : (next.protocol || 'vless');
  const settings = ensureObject(next, 'settings');

  if (field === 'tag') next.tag = raw;
  if (field === 'protocol') next.protocol = raw || 'vless';

  if (['address', 'port', 'id', 'password', 'userSecurity', 'flow'].includes(field)) {
    if (protocol === 'trojan' || protocol === 'shadowsocks') {
      delete settings.vnext;
      const server = ensureArrayItem(settings, 'servers');
      if (field === 'address') server.address = raw;
      if (field === 'port') server.port = Number(raw) || raw;
      if (field === 'password') server.password = raw;
      if (field === 'userSecurity') server.method = raw;
    } else {
      delete settings.servers;
      const vnext = ensureArrayItem(settings, 'vnext');
      const user = ensureArrayItem(vnext, 'users');
      if (field === 'address') vnext.address = raw;
      if (field === 'port') vnext.port = Number(raw) || raw;
      if (field === 'id') user.id = raw;
      if (field === 'password') user.password = raw;
      if (field === 'userSecurity') {
        if (protocol === 'vmess') user.security = raw;
        else user.encryption = raw || 'none';
      }
      if (field === 'flow') {
        if (raw) user.flow = raw;
        else delete user.flow;
      }
    }
  }

  if (['network', 'security', 'sni', 'fingerprint', 'publicKey', 'shortId', 'spiderX', 'path'].includes(field)) {
    const streamSettings = ensureObject(next, 'streamSettings');
    if (field === 'network') streamSettings.network = raw || 'tcp';
    if (field === 'security') {
      if (!raw || raw === 'none') delete streamSettings.security;
      else streamSettings.security = raw;
      if (raw === 'reality') ensureObject(streamSettings, 'realitySettings');
      if (raw === 'tls') ensureObject(streamSettings, 'tlsSettings');
    }
    const secKey = (streamSettings.security || '') === 'reality' ? 'realitySettings' : 'tlsSettings';
    const sec = ensureObject(streamSettings, secKey);
    if (field === 'sni') {
      if (raw) sec.serverName = raw;
      else delete sec.serverName;
    }
    if (field === 'fingerprint') {
      if (raw) sec.fingerprint = raw;
      else delete sec.fingerprint;
    }
    if (field === 'publicKey') {
      if (raw) sec.publicKey = raw;
      else delete sec.publicKey;
    }
    if (field === 'shortId') {
      if (raw) sec.shortId = raw.includes(',') ? raw.split(',').map((item) => item.trim()).filter(Boolean) : raw;
      else delete sec.shortId;
    }
    if (field === 'spiderX') {
      if (raw) sec.spiderX = raw;
      else delete sec.spiderX;
    }
    if (field === 'path') {
      if ((streamSettings.network || '') === 'grpc') {
        const grpc = ensureObject(streamSettings, 'grpcSettings');
        if (raw) grpc.serviceName = raw;
        else delete grpc.serviceName;
      } else if ((streamSettings.network || '') === 'http') {
        const http = ensureObject(streamSettings, 'httpSettings');
        if (raw) http.path = raw;
        else delete http.path;
      } else {
        const ws = ensureObject(streamSettings, 'wsSettings');
        if (raw) ws.path = raw;
        else delete ws.path;
      }
    }
  }

  if (['fragmentPreset', 'fragmentLength', 'fragmentInterval', 'fragmentPackets'].includes(field)) {
    const current = serverEditFields(next);
    const preset = field === 'fragmentPreset' ? raw : current.fragmentPreset;
    if (preset === 'off') {
      setFragmentSpec(next, { preset: 'off' });
    } else {
      const presetSpec = fragmentPresets[preset] || fragmentPresets.custom;
      setFragmentSpec(next, {
        preset,
        length: field === 'fragmentLength' ? raw : (field === 'fragmentPreset' ? presetSpec.length : (preset === 'custom' ? current.fragmentLength : presetSpec.length)),
        interval: field === 'fragmentInterval' ? raw : (field === 'fragmentPreset' ? presetSpec.interval : (preset === 'custom' ? current.fragmentInterval : presetSpec.interval)),
        packets: field === 'fragmentPackets' ? raw : (field === 'fragmentPreset' ? presetSpec.packets : (preset === 'custom' ? current.fragmentPackets : presetSpec.packets))
      });
    }
  }

  return next;
}

export function stringifyServerEditOutbound(outbound) {
  return JSON.stringify(outbound || {}, null, 2);
}
