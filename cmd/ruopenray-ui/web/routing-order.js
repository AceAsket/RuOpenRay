const preferenceKey = 'ruopenray_route_default_last';

export function loadRouteDefaultLast() {
  try { return localStorage.getItem(preferenceKey) !== 'false'; } catch { return true; }
}

export function saveRouteDefaultLast(enabled) {
  try { localStorage.setItem(preferenceKey, String(enabled)); } catch { /* Optional browser preference. */ }
}

// Only an unconditional field rule covering both TCP and UDP is a fallback.
// Unknown fields and protocol/device constraints must retain their priority.
export function isDefaultRoute(rule) {
  if (!rule || (rule.type && rule.type !== 'field') || !(rule.outboundTag || rule.balancerTag)) return false;
  const metadata = new Set(['type', 'ruleTag', 'outboundTag', 'balancerTag']);
  const emptyConditions = new Set(['domain', 'ip', 'source', 'sourceIP', 'inboundTag', 'protocol', 'user', 'sourcePort', 'attrs']);
  return Object.entries(rule).every(([key, value]) => {
    if (metadata.has(key)) return true;
    if (key === 'network') return !value || ['tcp,udp', 'udp,tcp'].includes(String(value).replace(/\s+/g, '').toLowerCase());
    if (key === 'port') return !value || String(value).trim() === '0-65535';
    return emptyConditions.has(key) && (value == null || value === '' || (Array.isArray(value) && value.length === 0));
  });
}

export function orderRoutingRules(rules, enabled = true, isManaged = () => false) {
  if (!enabled) return rules;
  const regular = [], defaults = [];
  for (const rule of rules) (isDefaultRoute(rule) && !isManaged(rule) ? defaults : regular).push(rule);
  const ordered = [...regular, ...defaults];
  return ordered.every((rule, index) => rule === rules[index]) ? rules : ordered;
}
