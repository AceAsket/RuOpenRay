import { isDefaultRoute } from './routing-order.js';

const metadata = new Set(['type', 'ruleTag', 'outboundTag', 'balancerTag']);
const list = (value) => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
const populated = (value) => list(value).length > 0;
const stable = (value) => JSON.stringify(canonical(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
export function routeDestination(rule) {
  return rule.balancerTag ? `balancer:${rule.balancerTag}` : `outbound:${rule.outboundTag || ''}`;
}

export function ipRange(raw) {
  const [address, prefix, extra] = String(raw).split('/');
  if (extra !== undefined || prefix === '') return null;
  let bits, value;
  if (address.includes(':')) {
    let normalized = address;
    if (address.includes('.')) {
      const tail = address.slice(address.lastIndexOf(':') + 1);
      const ipv4 = ipRange(tail);
      if (!ipv4 || ipv4.bits !== 32) return null;
      normalized = address.slice(0, address.lastIndexOf(':') + 1) + `${(ipv4.start >> 16n).toString(16)}:${(ipv4.start & 65535n).toString(16)}`;
    }
    if (!/^[0-9a-f:]+$/i.test(normalized)) return null;
    const halves = normalized.split('::');
    if (halves.length > 2) return null;
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
    const words = halves.length === 1 ? left : [...left, ...Array(missing).fill('0'), ...right];
    if (words.some((word) => !/^[0-9a-f]{1,4}$/i.test(word))) return null;
    bits = 128;
    value = words.reduce((result, word) => (result << 16n) + BigInt(`0x${word}`), 0n);
  } else {
    const words = address.split('.');
    if (words.length !== 4 || words.some((word) => !/^(0|[1-9][0-9]{0,2})$/.test(word) || Number(word) > 255)) return null;
    bits = 32;
    value = words.reduce((result, word) => (result << 8n) + BigInt(word), 0n);
  }
  if (prefix !== undefined && !/^\d+$/.test(prefix)) return null;
  const size = prefix === undefined ? bits : Number(prefix);
  if (size < 0 || size > bits) return null;
  const shift = BigInt(bits - size);
  const start = (value >> shift) << shift;
  return { bits, start, end: start + (1n << shift) - 1n };
}

function domainParts(value) {
  const text = String(value);
  const colon = text.indexOf(':');
  return colon < 0 ? ['keyword', text] : [text.slice(0, colon), text.slice(colon + 1)];
}
function domainCovers(outer, inner) {
  if (outer === inner) return true;
  const [a, x] = domainParts(outer), [b, y] = domainParts(inner);
  if (a === 'domain' && ['domain', 'full'].includes(b)) return y === x || y.endsWith(`.${x}`);
  if (a === 'keyword' && ['keyword', 'full', 'domain'].includes(b)) return y.includes(x);
  return false;
}
function portRanges(value) {
  return String(value).split(',').map((part) => {
    if (!/^\d+(?:-\d+)?$/.test(part.trim())) return null;
    const [a, b = a] = part.trim().split('-').map(Number);
    return a >= 0 && b >= a && b <= 65535 ? [a, b] : null;
  });
}
function fieldCovers(field, outer, inner) {
  if (stable(outer) === stable(inner)) return true;
  if (!populated(inner)) return false;
  if (['domain', 'ip', 'source', 'sourceIP'].includes(field)) {
    return list(inner).every((value) => list(outer).some((parent) => {
      if (field === 'domain') return domainCovers(parent, value);
      const a = ipRange(parent), b = ipRange(value);
      return a && b && a.bits === b.bits && a.start <= b.start && a.end >= b.end;
    }));
  }
  if (['network', 'inboundTag', 'protocol', 'user'].includes(field)) {
    const values = (v) => field === 'network' ? String(v).split(',').map((x) => x.trim()) : list(v);
    return values(inner).every((v) => values(outer).includes(v));
  }
  if (['port', 'sourcePort'].includes(field)) {
    return portRanges(inner).every((b) => b && portRanges(outer).some((a) => a && a[0] <= b[0] && a[1] >= b[1]));
  }
  return false;
}
function conditions(rule) {
  return Object.fromEntries(Object.entries(rule).filter(([key, value]) => !metadata.has(key) && populated(value)));
}
export function ruleCovers(earlier, later) {
  if (earlier.type && earlier.type !== 'field') return false;
  if (isDefaultRoute(earlier)) return true;
  return Object.entries(conditions(earlier)).every(([field, value]) => fieldCovers(field, value, later[field]));
}

export function analyzeRuleImport(existing, incoming, excluded = [], { isPinnedLast = () => false } = {}) {
  const skipped = new Set(excluded);
  const earlier = existing.map((rule, index) => ({ rule, location: `текущее правило №${index + 1}` }));
  return incoming.map((rule, index) => {
    const duplicate = earlier.find((item) => stable(conditions(item.rule)) === stable(conditions(rule)) && routeDestination(item.rule) === routeDestination(rule));
    const shadow = earlier.find((item) => (!isPinnedLast(item.rule) || isPinnedLast(rule)) && ruleCovers(item.rule, rule));
    const match = duplicate || shadow;
    const result = { index, kind: duplicate ? 'duplicate' : shadow ? 'shadow' : '', earlier: match?.location || '', destination: routeDestination(rule) };
    if (!skipped.has(index)) earlier.push({ rule, location: `правило списка №${index + 1}` });
    return result;
  });
}

function anyMatch(values, match) {
  const results = list(values).map(match);
  return results.includes(true) ? true : results.includes(null) ? null : false;
}
function domainMatch(pattern, domain) {
  const [kind, value] = domainParts(pattern);
  if (kind === 'domain') return domain === value || domain.endsWith(`.${value}`);
  if (kind === 'full') return domain === value;
  if (kind === 'keyword') return domain.includes(value);
  if (kind === 'dotless') return !domain.includes('.') && domain.includes(value);
  // Go regexp and geo databases cannot be faithfully evaluated in the browser.
  return null;
}
function matchRule(rule, input, strategy, dnsPass) {
  const results = [], missing = [];
  for (const [field, value] of Object.entries(conditions(rule))) {
    let result = null, reason = `условие ${field}`;
    if (field === 'domain') {
      result = input.domain ? anyMatch(value, (v) => domainMatch(v, input.domain)) : null;
      reason = input.domain ? 'содержимое geosite/ext или regexp ядра' : 'домен из sniffing';
    } else if (['ip', 'source', 'sourceIP'].includes(field)) {
      const address = field === 'ip' ? input.ip : input.source;
      if (address) result = anyMatch(value, (v) => {
        const a = ipRange(v), b = ipRange(address);
        return a && b ? a.bits === b.bits && b.start >= a.start && b.end <= a.end : null;
      });
      else if (field === 'ip' && input.domain && !dnsPass && strategy !== 'IPOnDemand') result = false;
      reason = field === 'ip' ? address ? 'содержимое geoip/ext или обратной IP-маски' : 'IP назначения / результат DNS' : 'IP устройства / geoip';
    } else if (field === 'network') {
      const networks = String(value).split(',').map((v) => v.trim());
      result = input.network ? networks.includes(input.network) : networks.includes('tcp') && networks.includes('udp') ? true : null;
      reason = 'протокол TCP/UDP';
    } else if (field === 'port') {
      result = input.port ? anyMatch(portRanges(value), (range) => range ? Number(input.port) >= range[0] && Number(input.port) <= range[1] : null) : null;
      reason = 'порт назначения';
    } else if (field === 'inboundTag') {
      result = input.inbound ? list(value).includes(input.inbound) : null;
      reason = 'входящее подключение (inbound)';
    }
    results.push(result);
    if (result === null) missing.push(reason);
  }
  if (rule.type && rule.type !== 'field') { results.push(null); missing.push('неизвестный тип правила'); }
  return { status: results.includes(false) ? 'miss' : results.includes(null) ? 'unknown' : 'match', missing };
}

export function explainRoute(config, raw, context = {}) {
  const text = String(raw || '').trim();
  const ip = !text.includes('/') && ipRange(text);
  let domain = '';
  if (!ip) {
    if (!text || /[\s/:?#@]/.test(text)) return { error: 'Введите домен или один IP-адрес, без URL и подсети.' };
    try { domain = new URL(`http://${text}`).hostname.replace(/\.$/, '').toLowerCase(); } catch { return { error: 'Некорректный домен или IP-адрес.' }; }
    if (!domain || /^\d+(\.\d+)*$/.test(domain)) return { error: 'Некорректный IP-адрес.' };
  }
  if (context.port && (!/^\d+$/.test(context.port) || Number(context.port) < 1 || Number(context.port) > 65535)) return { error: 'Порт должен быть от 1 до 65535.' };
  if (context.source && (context.source.includes('/') || !ipRange(context.source))) return { error: 'Укажите IP устройства без подсети.' };
  const input = { ...context, domain, ip: ip ? text : '' };
  const strategy = config.routing?.domainStrategy || 'AsIs';
  const rules = config.routing?.rules || [];
  const trace = [];
  let uncertain = false, selected = null;
  const scan = (dnsPass) => {
    for (let index = 0; index < rules.length; index++) {
      const result = matchRule(rules[index], input, strategy, dnsPass);
      trace.push({ index, ...result, destination: routeDestination(rules[index]), dnsPass });
      if (result.status === 'unknown') uncertain = true;
      if (result.status === 'match') { selected = { index, destination: routeDestination(rules[index]) }; return; }
    }
  };
  scan(false);
  if (!selected && domain && strategy === 'IPIfNonMatch') scan(true);
  return { trace, selected, uncertain, strategy, fallback: config.outbounds?.[0]?.tag || '', domain };
}

export function routeExplanationView(state, escapeHtml) {
  const result = state.routeExplainInput ? explainRoute(state.config || {}, state.routeExplainInput, state.routeExplainContext || {}) : null;
  const label = (target) => target.replace(/^outbound:/, '').replace(/^balancer:/, 'Балансировщик · ');
  const context = state.routeExplainContext || {};
  return `<details class="panel route-explanation" data-details-key="routing:explain">
    <summary>Почему выбран этот маршрут?</summary>
    <p class="muted">Анализ черновика Xray сверху вниз. DNS-запросы не выполняются. AWG policy routing, firewall и фактический sniffing здесь не моделируются.</p>
    <label class="form-row">Домен или IP<input id="routeExplainInput" value="${escapeHtml(state.routeExplainInput || '')}" placeholder="example.com или 192.0.2.1" /></label>
    <div class="form-grid">
      <label class="form-row">Протокол<select data-route-explain-context="network"><option value="">Неизвестен</option>${['tcp', 'udp'].map((v) => `<option ${context.network === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${[['port', 'Порт назначения'], ['source', 'IP устройства'], ['inbound', 'Входящий тег (inbound)']].map(([key, title]) => `<label class="form-row">${title}<input data-route-explain-context="${key}" value="${escapeHtml(context[key] || '')}" /></label>`).join('')}
    </div>
    <button type="button" class="btn secondary" data-route-explain>Показать маршрут</button>
    ${result ? result.error ? `<p role="alert">${escapeHtml(result.error)}</p>` : `
      <p><strong>${result.uncertain ? 'Маршрут нельзя определить однозначно: выше есть правила, для которых не хватает данных.' : result.selected ? 'Найдено первое совпадение.' : 'Совпадений нет.'}</strong></p>
      <p>${result.selected ? `${result.uncertain ? 'Первое подтверждённое совпадение' : 'Правило'} №${result.selected.index + 1} → ${escapeHtml(label(result.selected.destination))}` : `${result.uncertain ? 'Если неопределённые правила не совпадут' : 'По умолчанию'} → ${escapeHtml(result.fallback || 'первый outbound не задан')}`}</p>
      <small>Номера включают служебные правила. Стратегия DNS: ${escapeHtml(result.strategy)}. Балансировщик выбирает конкретный сервер во время соединения.</small>
      <ol class="route-explain-trace">${result.trace.map((row) => `<li>№${row.index + 1}${row.dnsPass ? ' (повтор с DNS)' : ''}: ${row.status === 'match' ? 'совпадает' : row.status === 'miss' ? 'не совпадает' : `нужны данные: ${escapeHtml(row.missing.join(', '))}`} → ${escapeHtml(label(row.destination))}</li>`).join('')}</ol>` : ''}
  </details>`;
}
