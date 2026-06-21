export const amneziaInterfaceFields = [
  { key: 'PrivateKey', label: 'PrivateKey', placeholder: 'base64 private key' },
  { key: 'Address', label: 'Address', placeholder: '10.8.0.2/32' },
  { key: 'DNS', label: 'DNS', placeholder: '1.1.1.1, 8.8.8.8' },
  { key: 'MTU', label: 'MTU', placeholder: '1280' }
];

export const amneziaPeerFields = [
  { key: 'PublicKey', label: 'PublicKey', placeholder: 'base64 public key' },
  { key: 'PresharedKey', label: 'PresharedKey', placeholder: 'optional base64 key' },
  { key: 'Endpoint', label: 'Endpoint', placeholder: 'host:port' },
  { key: 'AllowedIPs', label: 'AllowedIPs', placeholder: '0.0.0.0/0' },
  { key: 'PersistentKeepalive', label: 'PersistentKeepalive', placeholder: '25' }
];

const fieldMap = {
  interface: new Map(amneziaInterfaceFields.map((field) => [field.key.toLowerCase(), field.key])),
  peer: new Map(amneziaPeerFields.map((field) => [field.key.toLowerCase(), field.key]))
};

function normalizeSection(value) {
  const clean = String(value || '').trim().toLowerCase();
  return clean === 'peer' ? 'peer' : 'interface';
}

function parseLine(line) {
  const index = String(line || '').indexOf('=');
  if (index < 0) return null;
  const key = line.slice(0, index).trim();
  if (!key) return null;
  return { key, value: line.slice(index + 1).trim() };
}

export function parseAmneziaConfigText(text = '') {
  const model = {
    interface: {},
    peer: {},
    interfaceExtra: [],
    peerExtra: []
  };
  let section = '';
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('[') && line.includes(']')) {
      section = normalizeSection(line.slice(1, line.indexOf(']')));
      continue;
    }
    if (section !== 'interface' && section !== 'peer') continue;
    const parsed = parseLine(line);
    if (!parsed) {
      model[`${section}Extra`].push(rawLine);
      continue;
    }
    const canonical = fieldMap[section].get(parsed.key.toLowerCase());
    if (canonical) model[section][canonical] = parsed.value;
    else model[`${section}Extra`].push(`${parsed.key} = ${parsed.value}`);
  }
  return model;
}

function appendKnownFields(lines, fields, values) {
  for (const field of fields) {
    const value = String(values[field.key] || '').trim();
    if (value) lines.push(`${field.key} = ${value}`);
  }
}

function appendExtraFields(lines, value) {
  for (const rawLine of String(value || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line) lines.push(line);
  }
}

export function buildAmneziaConfigText(model = {}) {
  const lines = ['[Interface]'];
  appendKnownFields(lines, amneziaInterfaceFields, model.interface || {});
  appendExtraFields(lines, Array.isArray(model.interfaceExtra) ? model.interfaceExtra.join('\n') : model.interfaceExtra);
  lines.push('', '[Peer]');
  appendKnownFields(lines, amneziaPeerFields, model.peer || {});
  appendExtraFields(lines, Array.isArray(model.peerExtra) ? model.peerExtra.join('\n') : model.peerExtra);
  return `${lines.join('\n').trim()}\n`;
}

export function setAmneziaConfigField(text, section, key, value) {
  const cleanSection = normalizeSection(section);
  const model = parseAmneziaConfigText(text);
  const canonical = fieldMap[cleanSection].get(String(key || '').toLowerCase());
  if (!canonical) return String(text || '');
  model[cleanSection][canonical] = String(value || '').trim();
  return buildAmneziaConfigText(model);
}

export function setAmneziaConfigExtra(text, section, value) {
  const cleanSection = normalizeSection(section);
  const model = parseAmneziaConfigText(text);
  model[`${cleanSection}Extra`] = String(value || '');
  return buildAmneziaConfigText(model);
}
