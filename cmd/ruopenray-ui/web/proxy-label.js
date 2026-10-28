import { serverLocation } from './server-location.js';

// Keep the original tag as the routing/API identifier. Only the visible name
// loses a flag prefix or its already corrupted replacement characters.
export function proxyDisplayName(tag) {
  return String(tag || '').trim()
    .replace(/^(?:[\u{1F1E6}-\u{1F1FF}]{2}|\?{4,}|\uFFFD{2,})\s*/u, '')
    .trim() || 'VPN без названия';
}

export function proxyOptionLabel(outbound, meta = {}) {
  const location = serverLocation(outbound, meta);
  const name = proxyDisplayName(outbound?.tag);
  return location.code ? `${location.code} · ${name}` : name;
}
