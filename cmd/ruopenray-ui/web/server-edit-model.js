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

function fragmentPresetFor({ length, interval, packets }) {
  return Object.entries(fragmentPresets).find(([key, spec]) => key !== 'off' && key !== 'custom' && spec.length === length && spec.interval === interval && spec.packets === packets)?.[0] || 'custom';
}

function fragmentSpecFromDialerProxy(tag) {
  if (!String(tag || '').startsWith(fragmentOutboundTagPrefix)) {
    return null;
  }
  try {
    const raw = decodeRawUrlBase64(String(tag).slice(fragmentOutboundTagPrefix.length));
    const parts = raw.split(',');
    const length = parts[0]?.trim() || '100-200';
    const interval = parts[1]?.trim() || '10-20';
    const packets = parts.slice(2).join(',').trim() || 'tlshello';
    if (!/^\d+(?:-\d+)?$/.test(length) || !/^\d+(?:-\d+)?$/.test(interval) || !/^(?:tlshello|\d+(?:-\d+)?)$/.test(packets)) return { unsupported: true };
    const spec = { length, interval, packets };
    return { ...spec, preset: fragmentPresetFor(spec) };
  } catch {
    return { unsupported: true };
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fragmentState(outbound) {
  const off = { source: 'none', preset: 'off', length: '', interval: '', packets: 'tlshello', index: -1, readOnly: false, notice: '' };
  const unsupported = (notice) => ({ ...off, source: 'unsupported', preset: 'unsupported', readOnly: true, notice });
  const s = outbound?.streamSettings;
  if (s !== undefined && !isObject(s)) return unsupported('Нестандартный streamSettings: измените фрагментацию в расширенном JSON.');
  const legacy = fragmentSpecFromDialerProxy(s?.sockopt?.dialerProxy);
  if (legacy?.unsupported) return unsupported('Не удалось разобрать прежнюю фрагментацию. Настройки сохранены; измените их в расширенном JSON.');
  const mask = s?.finalmask;
  if (mask !== undefined && !isObject(mask)) return unsupported('Нестандартный finalmask: измените фрагментацию в расширенном JSON.');
  const tcp = mask?.tcp;
  if (tcp !== undefined && !Array.isArray(tcp)) return unsupported('Нестандартный finalmask.tcp: измените фрагментацию в расширенном JSON.');
  const fragments = (tcp || []).map((item, index) => ({ item, index }))
    .filter(({ item }) => String(item?.type || '').toLowerCase() === 'fragment');
  if (fragments.length > 1 || (fragments.length && legacy)) return unsupported('Найдено несколько способов фрагментации. Настройки сохранены; выберите один в расширенном JSON.');
  if (fragments.length) {
    const { item, index } = fragments[0];
    const settings = item.settings;
    if (item.type !== 'fragment' || !isObject(settings)) return unsupported('Нестандартная TCP-фрагментация: измените её в расширенном JSON.');
    if (['lengths', 'delays'].some((key) => settings[key] !== undefined && (!Array.isArray(settings[key]) || settings[key].length))) {
      return unsupported('Фрагментация использует lengths/delays. Списки имеют приоритет над полями ниже; измените их в расширенном JSON.');
    }
    const scalar = (value) => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
    if (!scalar(settings.length) || (settings.delay !== undefined && !scalar(settings.delay)) || (settings.packets !== undefined && typeof settings.packets !== 'string')) {
      return unsupported('Нестандартные параметры TCP-фрагментации: измените их в расширенном JSON.');
    }
    const spec = { length: String(settings.length), interval: String(settings.delay ?? '0'), packets: settings.packets ?? '' };
    return { ...off, ...spec, source: 'native', index, preset: fragmentPresetFor(spec) };
  }
  if (legacy) return { ...off, ...legacy, source: 'legacy', notice: 'Используется прежняя схема фрагментации. Изменение этих полей переведёт её в finalmask; остальные настройки сохранятся.' };
  return off;
}

function setFragmentSpec(outbound, spec) {
  const current = fragmentState(outbound);
  if (current.readOnly) throw new Error(current.notice);
  if ((!spec || spec.preset === 'off') && current.source === 'none') return outbound;
  const streamSettings = ensureObject(outbound, 'streamSettings');
  if (current.source === 'legacy') {
    delete streamSettings.sockopt.dialerProxy;
    if (!Object.keys(streamSettings.sockopt).length) delete streamSettings.sockopt;
  }
  if (!spec || spec.preset === 'off') {
    if (current.source === 'native') {
      streamSettings.finalmask.tcp.splice(current.index, 1);
      if (!streamSettings.finalmask.tcp.length) delete streamSettings.finalmask.tcp;
      if (!Object.keys(streamSettings.finalmask).length) delete streamSettings.finalmask;
    }
    return outbound;
  }
  const mask = ensureObject(streamSettings, 'finalmask');
  if (!Array.isArray(mask.tcp)) mask.tcp = [];
  const fragment = current.source === 'native' ? mask.tcp[current.index] : { type: 'fragment', settings: {} };
  Object.assign(fragment.settings, { packets: String(spec.packets ?? '').trim(), length: String(spec.length ?? '').trim(), delay: String(spec.interval ?? '').trim() });
  if (current.source !== 'native') mask.tcp.unshift(fragment);
  return outbound;
}

export function serverFragmentCompatibility(version) {
  const match = String(version || '').match(/\b(?:v)?(\d+)\.(\d+)\.(\d+)\b/i);
  const minimum = [26, 3, 27];
  let supported = false;
  if (match) {
    const parts = match.slice(1).map(Number);
    const difference = parts.findIndex((value, index) => value !== minimum[index]);
    supported = difference < 0 || parts[difference] > minimum[difference];
  }
  return {
    supported,
    notice: supported ? '' : match
      ? `Для включения и изменения фрагментации нужен Xray 26.3.27 или новее. Установлен ${match[0]}; существующую простую фрагментацию можно выключить.`
      : 'Версия Xray неизвестна. Для включения и изменения фрагментации подтвердите Xray 26.3.27 или новее; существующую простую фрагментацию можно выключить.'
  };
}

export function validateServerEditFragment(outbound) {
  const fragment = fragmentState(outbound);
  if (fragment.source !== 'native') return '';
  const range = (value, minimum) => {
    const match = String(value).trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!match) return false;
    const low = Number(match[1]);
    const high = Number(match[2] ?? match[1]);
    return low >= minimum && high >= low && high <= 2147483647;
  };
  if (!range(fragment.length, 1)) return 'Длина фрагмента должна быть целым числом или диапазоном от 1 до 2147483647, например 100-200.';
  if (!range(fragment.interval, 0)) return 'Задержка должна быть целым числом или диапазоном от 0 до 2147483647 мс, например 10-20.';
  if (fragment.packets !== '' && fragment.packets !== 'tlshello' && !range(fragment.packets, 1)) return 'Пакеты: tlshello, пустое значение для всех пакетов или положительный диапазон, например 1-2.';
  return '';
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
  const fragment = fragmentState(outbound);
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
    fragmentPackets: fragment.packets,
    fragmentSource: fragment.source,
    fragmentReadOnly: fragment.readOnly,
    fragmentNotice: fragment.notice
  };
}

export function patchServerEditField(outbound, field, value) {
  const next = clone(outbound);
  const raw = String(value ?? '').trim();
  const protocol = field === 'protocol' ? raw : (next.protocol || 'vless');

  if (field === 'tag') next.tag = raw;
  if (field === 'protocol') next.protocol = raw || 'vless';

  if (['address', 'port', 'id', 'password', 'userSecurity', 'flow'].includes(field)) {
    const settings = ensureObject(next, 'settings');
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
    if (current.fragmentReadOnly) throw new Error(current.fragmentNotice);
    const preset = field === 'fragmentPreset' ? raw : current.fragmentPreset;
    if (preset === 'off') {
      setFragmentSpec(next, { preset: 'off' });
    } else {
      const presetSpec = fragmentPresets[preset] || fragmentPresets.custom;
      setFragmentSpec(next, {
        preset,
        length: field === 'fragmentLength' ? raw : (preset === 'custom' && current.fragmentPreset !== 'off' ? current.fragmentLength : presetSpec.length),
        interval: field === 'fragmentInterval' ? raw : (preset === 'custom' && current.fragmentPreset !== 'off' ? current.fragmentInterval : presetSpec.interval),
        packets: field === 'fragmentPackets' ? raw : (preset === 'custom' && current.fragmentPreset !== 'off' ? current.fragmentPackets : presetSpec.packets)
      });
    }
  }

  return next;
}

export function stringifyServerEditOutbound(outbound) {
  return JSON.stringify(outbound || {}, null, 2);
}
