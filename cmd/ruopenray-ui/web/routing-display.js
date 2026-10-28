import { isDefaultRoute } from './routing-order.js';

const storageKey = 'ruopenray_route_display';
export const routeDisplayDefaults = {
  routeFilterTarget: '', routeFilterKind: '', routeFilterOrigin: '',
  routeFilterStatus: 'all', routeGrouping: 'order',
};
export const routeKindFilters = [
  ['domain', 'Домены'], ['ip', 'IP и подсети'], ['source', 'Устройства / источник'],
  ['inboundTag', 'Входящий поток'], ['port', 'Порты'], ['network', 'TCP / UDP'],
  ['protocol', 'Протокол'], ['default', 'Остальной трафик'], ['other', 'Другие условия'],
];
export const routeOriginFilters = [['customGroup', 'Мои группы'], ['presetGroup', 'Подборки'], ['single', 'Отдельные правила']];

export function loadRouteDisplay() {
  try { return normalizeRouteDisplay(JSON.parse(localStorage.getItem(storageKey) || '{}')); }
  catch { return { ...routeDisplayDefaults }; }
}
export function normalizeRouteDisplay(state = {}) {
  const result = { ...routeDisplayDefaults };
  for (const key of Object.keys(result)) if (typeof state?.[key] === 'string') result[key] = state[key];
  if (!routeKindFilters.some(([key]) => key === result.routeFilterKind)) result.routeFilterKind = '';
  if (!routeOriginFilters.some(([key]) => key === result.routeFilterOrigin)) result.routeFilterOrigin = '';
  if (!['all', 'enabled', 'disabled'].includes(result.routeFilterStatus)) result.routeFilterStatus = 'all';
  if (!['order', 'target', 'kind', 'origin'].includes(result.routeGrouping)) result.routeGrouping = 'order';
  return result;
}
export function saveRouteDisplay(state) {
  try { localStorage.setItem(storageKey, JSON.stringify(normalizeRouteDisplay(state))); } catch { /* Browser preference only. */ }
}
export function routeDisplayRestricted(state) {
  const s = normalizeRouteDisplay(state);
  return Boolean(String(state.routeSearch || '').trim() || s.routeFilterTarget || s.routeFilterKind || s.routeFilterOrigin || s.routeFilterStatus !== 'all' || s.routeGrouping !== 'order');
}
export function routeDisplayLeaves(items) {
  return items.flatMap((item) => item.items ? routeDisplayLeaves(item.items) : [item]);
}
function populated(value) { return Array.isArray(value) ? value.length > 0 : value != null && value !== ''; }
export function routeDisplayKind(rule = {}) {
  if (isDefaultRoute(rule)) return 'default';
  return routeKindFilters.find(([key]) => key !== 'default' && populated(rule[key]))?.[0] || 'other';
}
export function routeDisplayTarget(rule = {}) {
  return rule.balancerTag ? `balancer:${rule.balancerTag}` : `outbound:${rule.outboundTag || 'proxy'}`;
}
export function routeDisplayMatches(item, state, context = {}) {
  const s = normalizeRouteDisplay(state), rule = item.rule || {};
  if (s.routeFilterStatus === (item.disabled ? 'enabled' : 'disabled')) return false;
  if (s.routeFilterTarget) {
    if (s.routeFilterTarget.startsWith('category:')) {
      const category = rule.balancerTag ? 'balancer' : item.category;
      if (category !== s.routeFilterTarget.slice(9)) return false;
    } else if (routeDisplayTarget(rule) !== s.routeFilterTarget) return false;
  }
  if (s.routeFilterKind && (s.routeFilterKind === 'default' || s.routeFilterKind === 'other'
    ? routeDisplayKind(rule) !== s.routeFilterKind : isDefaultRoute(rule) || !populated(rule[s.routeFilterKind]))) return false;
  if (s.routeFilterOrigin && (context.kind || 'single') !== s.routeFilterOrigin) return false;
  const text = [item.name, item.source, item.info?.kind, item.info?.value, item.info?.outbound, item.info?.detail,
    context.title, context.detail, ...(item.presets || []).map((p) => p.title), JSON.stringify(rule)].join(' ').toLocaleLowerCase();
  return String(state.routeSearch || '').trim().toLocaleLowerCase().split(/\s+/).every((word) => text.includes(word));
}

// Keep original rule indices and full group boundaries. Filtering must never
// turn a subset into a contiguous range used by edit/delete/target operations.
export function projectRoutingItems(items, state, limit = Infinity) {
  const filtered = items.flatMap((item) => {
    if (!item.items) return routeDisplayMatches(item, state) ? [item] : [];
    const children = item.items.filter((child) => routeDisplayMatches(child, state, { kind: item.origin || item.kind, title: item.title, detail: item.preset?.detail }));
    return children.length ? [{ ...item, items: children, totalItems: item.items.length, partial: children.length !== item.items.length,
      rangeEnd: item.index + item.items.length }] : [];
  });
  const grouping = normalizeRouteDisplay(state).routeGrouping;
  if (grouping === 'order') {
    const page = []; let count = 0;
    for (const item of filtered) {
      if (count >= limit) break;
      page.push(item); count += item.items?.length || 1;
    }
    return page;
  }
  const flat = filtered.flatMap((item) => item.items ? item.items.map((child) => ({ ...child,
    nested: true, nestedEditable: item.kind === 'customGroup', groupStart: item.index, groupEnd: item.rangeEnd,
    source: child.source || item.title, displayOrigin: item.origin || item.kind, displayOriginKey: item.key, displayOriginTitle: item.title,
  })) : [{ ...item, displayOrigin: 'single', displayOriginTitle: 'Отдельные правила' }]).slice(0, limit);
  const sections = new Map();
  for (const item of flat) {
    const key = grouping === 'target' ? routeDisplayTarget(item.rule) : grouping === 'kind' ? routeDisplayKind(item.rule) : `${item.displayOrigin}:${item.displayOriginKey || 'single'}`;
    const title = grouping === 'target' ? item.info?.outbound || key : grouping === 'kind'
      ? routeKindFilters.find(([kind]) => key === kind)?.[1] || 'Другие условия' : item.displayOriginTitle;
    if (!sections.has(key)) sections.set(key, { kind: 'displayGroup', key, title, items: [] });
    sections.get(key).items.push(item);
  }
  return [...sections.values()];
}
