import { serverLocation } from './server-location.js';

// Keep the original tag as the routing/API identifier. Only the visible name
// loses a flag prefix or its already corrupted replacement characters.
export function proxyDisplayName(tag, meta = {}) {
  const configured = String(meta?.label || '').trim();
  return String(configured || tag || '').trim()
    .replace(/^(?:[\u{1F1E6}-\u{1F1FF}]{2}|\?{4,}|\uFFFD{2,})\s*/u, '')
    .trim() || 'VPN без названия';
}

export function proxyOptionLabel(outbound, meta = {}) {
  const location = serverLocation(outbound, meta);
  const name = proxyDisplayName(outbound?.tag, meta);
  return location.code ? `${location.code} · ${name}` : name;
}

// Repair only known damaged names inside human messages. The original message,
// config, API result and identifiers remain available to editors and requests.
export function proxyDisplayText(value, state = {}) {
  let text = String(value ?? '');
  if (!/\?{4,}|\uFFFD{2,}|[\u{1F1E6}-\u{1F1FF}]{2}/u.test(text)) return text;
  const array = (value) => Array.isArray(value) ? value : [];
  const tags = new Set(Object.keys(state.serverMeta || {}));
  const add = (tag) => { if (typeof tag === 'string' && tag) tags.add(tag); };
  const addConfig = (config) => {
    array(config?.outbounds).forEach((item) => add(item?.tag));
    array(config?.routing?.rules).forEach((rule) => { add(rule?.outboundTag); add(rule?.balancerTag); });
    array(config?.routing?.balancers).forEach((item) => { add(item?.tag); add(item?.fallbackTag); array(item?.selector).forEach(add); });
  };
  addConfig(state.config);
  if (state.jsonDraft) { try { addConfig(JSON.parse(state.jsonDraft)); } catch { /* A partial editor draft is not a name source. */ } }
  array(state.subscriptionPools).forEach((pool) => {
    add(pool?.tag);
    [pool?.activeCandidate, pool?.missingCandidate, ...array(pool?.candidates)].forEach((item) => { add(item?.tag); add(item?.displayTag); });
  });
  Object.values(state.serverMeta || {}).forEach((meta) => add(meta?.label));
  Object.keys(state.serverChecks || {}).forEach(add);
  [state.activeServerTag, state.pendingServerTag, state.routeOutbound, state.routeBalancer, state.importOutboundTag, state.importPreview?.outbound?.tag].forEach(add);
  const boundary = '[\\p{L}\\p{N}_./:@+?~\\-]';
  for (const tag of [...tags].sort((a, b) => b.length - a.length)) {
    if (proxyDisplayName(tag) === tag) continue;
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^${boundary.slice(1, -1)}])${escaped}(?=$|[^${boundary.slice(1, -1)}])`, 'gu');
    text = text.replace(pattern, (_, prefix) => prefix + proxyDisplayName(tag, state.serverMeta?.[tag]));
  }
  return text;
}
