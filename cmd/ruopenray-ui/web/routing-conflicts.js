import { ipRange, routeDestination } from './routing-insights.js';

// Static sets only. Go regexp, geo databases and DNS are deliberately not evaluated.
const meta = new Set(['type', 'ruleTag', 'outboundTag', 'balancerTag', 'webhook']);
const ipFields = new Set(['ip', 'source', 'localIP']);
const portFields = new Set(['port', 'sourcePort', 'localPort', 'vlessRoute']);
const setFields = new Set(['network', 'inboundTag', 'protocol', 'user', 'localOS']);
const list = (v) => Array.isArray(v) ? v : v == null || v === '' ? [] : [v];
function canonical(v) {
  const normalize = (value) => {
    if (Array.isArray(value)) return [...new Map(value.map((item) => { const clean = normalize(item); return [JSON.stringify(clean), clean]; })).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, item]) => item);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
    return value;
  };
  return JSON.stringify(normalize(v));
}
const limitReached = Symbol('routing audit limit');

function domainTerm(raw) {
  const text = String(raw), colon = text.indexOf(':');
  const kind = colon < 0 ? 'keyword' : text.slice(0, colon), value = colon < 0 ? text : text.slice(colon + 1);
  const known = ['domain', 'full', 'keyword', 'dotless'].includes(kind) && value !== '' && !/[\s()<>]/.test(value);
  return { raw, kind, value, known, key: `${kind}:${value}` };
}
function domainContains(a, b) {
  if (a.key === b.key) return true;
  if (!a.known || !b.known) return false;
  if (a.kind === 'domain' && ['domain', 'full'].includes(b.kind)) return b.value === a.value || b.value.endsWith(`.${a.value}`);
  if (a.kind === 'keyword' && ['domain', 'full', 'keyword', 'dotless'].includes(b.kind)) return b.value.includes(a.value);
  if (a.kind === 'dotless' && ['dotless', 'full'].includes(b.kind)) return !b.value.includes('.') && b.value.includes(a.value);
  return false;
}
function domainIntersection(a, b) {
  if (!a.known || !b.known) return null;
  if (domainContains(a, b) || domainContains(b, a)) return true;
  if (a.kind === 'full' || b.kind === 'full') return false;
  if (a.kind === 'domain' && b.kind === 'domain') return false;
  if ((a.kind === 'dotless' && b.value.includes('.')) || (b.kind === 'dotless' && a.value.includes('.'))) return false;
  // Different keywords/suffixes can intersect, but do not invent a domain witness.
  return null;
}

function mergeRanges(ranges) {
  const result = [];
  for (const range of [...ranges].sort((a, b) => a.bits - b.bits || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))) {
    const last = result.at(-1);
    if (last && last.bits === range.bits && range.start <= last.end + 1n) last.end = last.end > range.end ? last.end : range.end;
    else result.push({ ...range });
  }
  return result;
}
function portRange(raw) {
  if (!/^\d+(?:-\d+)?$/.test(String(raw).trim())) return null;
  const [a, b = a] = String(raw).trim().split('-').map(Number);
  return a >= 0 && a <= b && b <= 65535 ? { bits: 16, start: BigInt(a), end: BigInt(b) } : null;
}
function field(field, value) {
  const raw = field === 'network' || portFields.has(field) ? String(value).split(',').map((v) => v.trim()) : list(value);
  if (field === 'domain') return { kind: 'domain', raw, terms: raw.map(domainTerm), key: canonical(raw.map((v) => domainTerm(v).key)) };
  if (ipFields.has(field) || portFields.has(field)) {
    const terms = raw.map((v) => ({ raw: v, range: ipFields.has(field) ? ipRange(v) : portRange(v) }));
    return { kind: 'range', raw, terms, ranges: mergeRanges(terms.flatMap((t) => t.range ? [t.range] : [])), unknown: terms.some((t) => !t.range), key: canonical(raw) };
  }
  if (setFields.has(field)) return { kind: 'set', raw, key: canonical(raw), unknown: field === 'user' && raw.some((v) => String(v).startsWith('regexp:')) };
  return { kind: 'unknown', raw: [], key: canonical(value), unknown: true };
}
export function compileRoutingRule(rule) {
  const source = { ...rule };
  // These aliases have precedence in the core, rather than being additional AND fields.
  if (source.domains != null) source.domain = source.domains;
  if (source.sourceIP != null) source.source = source.sourceIP;
  delete source.domains;
  delete source.sourceIP;
  const fields = Object.fromEntries(Object.entries(source).filter(([k, v]) => !meta.has(k) && list(v).length > 0).map(([k, v]) => [k, field(k, v)]));
  // Explicit TCP+UDP and full port range are universal constraints.
  if (fields.network && !fields.network.unknown && fields.network.raw.length === 2 && ['tcp', 'udp'].every((v) => fields.network.raw.includes(v))) delete fields.network;
  for (const k of ['port', 'sourcePort', 'localPort']) {
    const f = fields[k];
    if (f && !f.unknown && f.ranges.length === 1 && f.ranges[0].start === 0n && f.ranges[0].end === 65535n) delete fields[k];
  }
  const supportedType = (!rule.type || rule.type === 'field') && Boolean(rule.outboundTag || rule.balancerTag);
  return { rule, fields, key: canonical(Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.key]))), supportedType,
    action: canonical({ destination: rule.outboundTag ? `outbound:${rule.outboundTag}` : routeDestination(rule), webhook: rule.webhook || null }) };
}
function spend(budget) {
  if (budget && ++budget.work > budget.maxWork) throw limitReached;
}
function contains(a, b, budget) {
  if (!a) return true;
  if (!b) return false;
  if (a.key === b.key) return true;
  if (a.kind === 'domain') return b.terms.every((v) => a.terms.some((p) => { spend(budget); return domainContains(p, v); }));
  if (a.kind === 'range') return !b.unknown && b.ranges.every((v) => a.ranges.some((p) => { spend(budget); return p.bits === v.bits && p.start <= v.start && p.end >= v.end; }));
  if (a.kind === 'set') return !a.unknown && !b.unknown && b.raw.every((v) => { spend(budget); return a.raw.includes(v); });
  return false;
}
function intersection(a, b, budget) {
  if (!a || !b) {
    const f = a || b;
    if (!f) return true;
    if (f.kind === 'unknown' || f.kind === 'domain' && !f.terms.some((t) => t.known) || f.kind === 'range' && !f.ranges.length || f.kind === 'set' && f.unknown) return null;
    return true;
  }
  if (a.kind === 'domain') {
    let unknown = false;
    for (const x of a.terms) for (const y of b.terms) {
      spend(budget);
      const match = domainIntersection(x, y);
      if (match === true) return true;
      if (match === null) unknown = true;
    }
    return unknown ? null : false;
  }
  if (a.kind === 'range') {
    for (const x of a.ranges) for (const y of b.ranges) {
      spend(budget);
      if (x.bits === y.bits && x.start <= y.end && y.start <= x.end) return true;
    }
    return a.unknown || b.unknown ? null : false;
  }
  if (a.kind === 'set') {
    for (const x of a.raw) { spend(budget); if (b.raw.includes(x) && !(a.unknown && String(x).startsWith('regexp:'))) return true; }
    return a.unknown || b.unknown ? null : false;
  }
  return null;
}
export function compareRoutingConditions(earlier, later, budget) {
  if (!earlier.supportedType || !later.supportedType) return { covers: false, overlap: null, fields: [] };
  const keys = [...new Set([...Object.keys(earlier.fields), ...Object.keys(later.fields)])];
  const covers = keys.every((k) => contains(earlier.fields[k], later.fields[k], budget));
  if (covers) return { covers: true, overlap: true, fields: keys };
  const matches = keys.map((k) => intersection(earlier.fields[k], later.fields[k], budget));
  // A disjoint AND field defeats unknown geo, regexp or connection attributes.
  const overlap = matches.includes(false) ? false : matches.includes(null) ? null : true;
  const domainAndIP = keys.includes('domain') && keys.includes('ip');
  return { covers: false, overlap: overlap === true && domainAndIP ? null : overlap, fields: keys.filter((k) => earlier.fields[k] && later.fields[k]) };
}

function overlapExamples(a, b, budget) {
  const examples = [];
  for (const [name, left] of Object.entries(a.fields)) {
    const right = b.fields[name];
    if (!right) continue;
    let example = '';
    for (const x of left.raw) {
      for (const y of right.raw) {
        spend(budget);
        if (intersection(field(name, [x]), field(name, [y]), budget) === true) { example = `${name}: ${x} ↔ ${y}`; break; }
      }
      if (example) break;
    }
    if (example) examples.push(example);
    if (examples.length === 3) break;
  }
  return examples;
}

function internalFindings(compiled, index, budget) {
  const result = [];
  for (const [name, f] of Object.entries(compiled.fields)) {
    const seen = new Set(), repeated = [], covered = [];
    for (let i = 0; i < f.raw.length; i++) {
      spend(budget);
      const term = f.terms?.[i];
      const key = term?.range ? `${term.range.bits}:${term.range.start}:${term.range.end}` : term?.key || canonical(f.raw[i]);
      if (seen.has(key)) repeated.push(String(f.raw[i]));
      else if ((f.kind === 'domain' || f.kind === 'range') && f.raw.some((v, j) => {
        if (i === j) return false;
        spend(budget);
        if (f.kind === 'domain') return f.terms[j].key !== term.key && domainContains(f.terms[j], term);
        const a = f.terms[j].range, b = term.range;
        return a && b && a.bits === b.bits && a.start <= b.start && a.end >= b.end && (a.start !== b.start || a.end !== b.end);
      })) covered.push(String(f.raw[i]));
      seen.add(key);
    }
    if (repeated.length || covered.length) result.push({ kind: 'values', index, field: name, repeated: repeated.length, covered: covered.length, examples: [...repeated, ...covered].slice(0, 5) });
    if (name === 'domain') {
      const examples = f.raw.filter((v) => /->|→|^(?:domain|full):(?:domain|ip|source)\(/.test(String(v)));
      if (examples.length) result.push({ kind: 'format', index, field: name, examples: examples.slice(0, 5) });
    }
  }
  return result;
}
export function* routingAuditSteps(rules, { isManaged = () => false, maxWork = 500000, maxPairs = 100000, maxFindings = 1000, maxScopeFindings = 250 } = {}) {
  const compiled = rules.map(compileRoutingRule);
  const result = { findings: [], counts: { duplicate: 0, shadow: 0, overlap: 0, scope: 0, values: 0, format: 0 }, unknownPairs: 0, limitedRules: [], complete: true, storedAll: true, checkedPairs: 0, totalRules: rules.length, storageLimit: maxFindings, scopeStorageLimit: maxScopeFindings };
  const budget = { work: 0, maxWork };
  let storedMain = 0, storedScope = 0;
  const add = (row) => {
    if (row.kind === 'scope' ? storedScope < maxScopeFindings : storedMain < maxFindings) {
      result.findings.push({ ...row, examples: row.examples || (row.earlierIndex == null ? [] : overlapExamples(compiled[row.earlierIndex], compiled[row.index], budget)), managed: isManaged(rules[row.index]), earlierManaged: row.earlierIndex == null ? false : isManaged(rules[row.earlierIndex]) });
      if (row.kind === 'scope') storedScope++; else storedMain++;
    }
    else result.storedAll = false;
    result.counts[row.kind]++;
  };
  try {
    for (let index = 0; index < rules.length; index++) {
      const b = compiled[index];
      const unknownFields = Object.entries(b.fields).filter(([, f]) => f.kind === 'unknown' || f.unknown || f.kind === 'domain' && f.terms.some((t) => !t.known)).map(([k]) => k);
      if (!b.supportedType) unknownFields.push('type');
      if (unknownFields.length) result.limitedRules.push({ index, fields: unknownFields });
      internalFindings(b, index, budget).forEach(add);
      let full = null;
      const partial = [];
      for (let earlierIndex = 0; earlierIndex < index; earlierIndex++) {
        if (result.checkedPairs >= maxPairs) throw limitReached;
        result.checkedPairs++;
        const a = compiled[earlierIndex];
        const sameAction = a.action === b.action;
        const relation = compareRoutingConditions(a, b, budget);
        if (relation.covers) {
          const duplicate = a.key === b.key && sameAction;
          const row = { index, earlierIndex, kind: duplicate ? 'duplicate' : 'shadow', sameAction, fields: relation.fields };
          if (!full || duplicate && full.kind !== 'duplicate') full = row;
        } else if (Object.keys(b.fields).length > 0) {
          // A final fallback naturally intersects earlier specific rules, so do not flag it.
          if (relation.overlap === true) partial.push({ index, earlierIndex, kind: relation.fields.length ? 'overlap' : 'scope', sameAction, fields: relation.fields });
          else if (relation.overlap === null) result.unknownPairs++;
        }
        if (result.checkedPairs % 100 === 0) yield;
      }
      if (full) add(full); else partial.forEach(add);
      yield;
    }
  } catch (error) {
    if (error !== limitReached) throw error;
    result.complete = false;
  }
  return result;
}
export function analyzeRoutingRules(rules, options) {
  const steps = routingAuditSteps(rules, options);
  let next;
  do { next = steps.next(); } while (!next.done);
  return next.value;
}

export function routingAuditView(state, escapeHtml, { describeRouteRule, routeRuleName }) {
  if (!state.routeAudit) return '';
  const rules = state.config?.routing?.rules || [];
  if (state.routeAudit.signature !== JSON.stringify(rules)) return `<section class="panel routing-audit" aria-label="Проверка дублей и пересечений"><p role="status">Правила изменились. Повторите проверку дублей и пересечений.</p><button class="btn secondary" data-route-audit>Проверить снова</button></section>`;
  const report = state.routeAudit.report;
  const title = (i) => `№${i + 1} · ${routeRuleName(rules[i], describeRouteRule(rules[i]))}`;
  const destination = (i) => rules[i].outboundTag || `Балансировщик: ${rules[i].balancerTag || ''}`;
  const labels = { duplicate: 'Дубль', shadow: 'Полностью перекрыто', overlap: 'Частичное пересечение', values: 'Повторы внутри правила', format: 'Проверьте формат', scope: 'Разные условия' };
  const filter = state.routeAuditFilter || 'all';
  const rows = report.findings.filter((r) => filter === 'all' ? r.kind !== 'scope' : r.kind === filter);
  const shown = rows.slice(0, state.routeAuditVisible || 30);
  return `<section class="panel routing-audit" aria-label="Проверка дублей и пересечений">
    <div class="panel-title"><div><h2>Дубли и пересечения</h2><span>Проверено правил: ${report.totalRules}. Номера включают служебные правила и соответствуют полному списку.</span></div><button class="btn secondary compact" data-route-audit-close>Скрыть</button></div>
    <p class="muted">Проверяется текущий набор правил, включая черновик. Выше = раньше. Разные поля должны совпасть одновременно. Общий маршрут в конце — ожидаемое пересечение.</p>
    <div class="routing-audit-filters" role="group" aria-label="Тип находки">${[['all', 'Основные находки'], ...Object.entries(labels)].map(([kind, label]) => `<button class="btn secondary compact ${filter === kind ? 'active' : ''}" data-route-audit-filter="${kind}" aria-pressed="${filter === kind}">${label}${kind === 'all' ? '' : ` · ${report.counts[kind]}`}</button>`).join('')}</div>
    ${filter === 'scope' ? '<p class="muted">Эти правила проверяют разные условия, например устройство и домен. Они могут действовать на одно соединение. Обычно это намеренный приоритет, а не дубль.</p>' : ''}
    ${!report.complete ? '<p class="settings-warning" role="status">Достигнут предел объёма проверки. Отчёт частичный; отсутствие находок не означает отсутствие пересечений.</p>' : ''}
    ${!report.storedAll ? `<p class="muted">Показаны до ${report.storageLimit} основных находок и до ${report.scopeStorageLimit} сочетаний разных условий; счётчики включают остальные.</p>` : ''}
    <div class="routing-audit-results">${shown.map((row) => {
      const cause = row.kind === 'duplicate' ? 'Те же условия и действия. Раньше срабатывает первое правило.' : row.kind === 'shadow' ? 'Все условия этого правила уже покрывает более раннее. Это правило не получит совпавший трафик.' : row.kind === 'overlap' ? 'Часть условий совпадает. Для общего трафика приоритет имеет более раннее правило; это не всегда ошибка.' : row.kind === 'scope' ? 'Разные ограничения совместимы. Если соединение удовлетворяет обоим, раньше срабатывает первое правило.' : row.kind === 'values' ? `${row.field}: повторов ${row.repeated}, вложенных значений ${row.covered}.` : 'Похоже, готовое правило вставлено как буквальный домен. Такая строка не становится условием regexp.';
      return `<article class="routing-audit-finding routing-audit-${row.kind}"><div class="routing-audit-finding-head"><strong>${labels[row.kind]}</strong>${row.earlierIndex != null ? `<span>${row.sameAction ? 'Одинаковое назначение и действия' : 'Назначения или действия отличаются'}</span>` : ''}</div>
        <p><strong>${escapeHtml(title(row.index))}</strong> → ${escapeHtml(destination(row.index))}${row.managed ? ' · служебное' : ''}</p>
        ${row.earlierIndex != null ? `<p class="muted">Раньше: ${escapeHtml(title(row.earlierIndex))} → ${escapeHtml(destination(row.earlierIndex))}${row.earlierManaged ? ' · служебное' : ''}</p>` : ''}
        <p>${escapeHtml(cause)}</p>${row.fields?.length ? `<small>Условия: ${escapeHtml(row.fields.join(', '))}</small>` : ''}
        ${row.examples?.length ? `<ul>${row.examples.map((v) => `<li><code>${escapeHtml(v)}</code></li>`).join('')}</ul>` : ''}
        ${!row.managed ? `<div class="split-actions"><button class="btn secondary compact" data-route-audit-edit="${row.index}">Открыть правило №${row.index + 1}</button>${['duplicate', 'shadow'].includes(row.kind) ? `<button class="btn warning compact" data-route-audit-disable="${row.index}">Отключить в черновике</button>` : ''}</div>` : '<small>Служебное правило настраивается в DNS, перехвате или диагностике.</small>'}
      </article>`;
    }).join('')}</div>
    ${!rows.length ? `<p role="status">${report.complete ? filter === 'all' ? 'Дублей, полного перекрытия и пересечений по одинаковым полям не найдено.' : 'Находок этого типа нет.' : 'В проверенной части находок этого типа нет.'}</p>` : ''}
    ${shown.length < rows.length ? `<button class="btn secondary" data-route-audit-more>Показать ещё (${rows.length - shown.length})</button>` : ''}
    <p class="muted">Правил с условиями, требующими дополнительных данных или не поддержанными анализатором: ${report.limitedRules.length}; неопределённых пар: ${report.unknownPairs}. DNS, geo/ext, regexp Xray и фактический sniffing не проверяются. Отсутствие находки не гарантирует отсутствие пересечения.</p>
    ${report.limitedRules.length ? `<details data-details-key="routing:audit-limits"><summary>Условия, которые не удалось проверить</summary><ul>${report.limitedRules.slice(0, 30).map((r) => `<li>${escapeHtml(title(r.index))}: ${escapeHtml(r.fields.join(', '))}</li>`).join('')}</ul>${report.limitedRules.length > 30 ? '<small>Показаны первые 30 правил.</small>' : ''}</details>` : ''}
    <small>Ничего не удаляется автоматически. Отключение сохраняет правило вне активного набора; изменение маршрутизации требует применения черновика.</small>
  </section>`;
}

export function bindRoutingAudit({ state, render, routeRules, isRuOpenRayManagedRoute, openRoutingRuleEditor, disableRoutingRule }) {
  document.querySelectorAll('[data-route-audit]').forEach((button) => button.addEventListener('click', async () => {
    if (state.routeAuditRunning) return;
    const rules = routeRules(), signature = JSON.stringify(rules);
    state.routeAudit = null;
    state.routeAuditRunning = true;
    render();
    try {
      const steps = routingAuditSteps(JSON.parse(signature), { isManaged: isRuOpenRayManagedRoute });
      let next;
      do { next = steps.next(); if (!next.done) await new Promise((resolve) => setTimeout(resolve, 0)); } while (!next.done);
      if (signature === JSON.stringify(routeRules())) {
        state.routeAudit = { signature, report: next.value };
        state.routeAuditFilter = 'all';
        state.routeAuditVisible = 30;
      } else state.message = 'Правила изменились во время проверки. Повторите проверку.';
    } catch {
      state.message = 'Не удалось завершить проверку. Проверьте формат конфигурации и повторите.';
    } finally { state.routeAuditRunning = false; render(); }
  }));
  document.querySelectorAll('[data-route-audit-filter]').forEach((button) => button.addEventListener('click', () => { state.routeAuditFilter = button.dataset.routeAuditFilter; state.routeAuditVisible = 30; render(); }));
  document.querySelector('[data-route-audit-close]')?.addEventListener('click', () => { state.routeAudit = null; render(); });
  document.querySelector('[data-route-audit-more]')?.addEventListener('click', () => { state.routeAuditVisible = (state.routeAuditVisible || 30) + 30; render(); });
  const fresh = (index) => Number.isInteger(index) && state.routeAudit?.signature === JSON.stringify(routeRules()) && routeRules()[index] && !isRuOpenRayManagedRoute(routeRules()[index]);
  document.querySelectorAll('[data-route-audit-edit]').forEach((button) => button.addEventListener('click', () => { const i = Number(button.dataset.routeAuditEdit); if (fresh(i)) openRoutingRuleEditor(i); }));
  document.querySelectorAll('[data-route-audit-disable]').forEach((button) => button.addEventListener('click', () => {
    const i = Number(button.dataset.routeAuditDisable);
    if (fresh(i) && state.routeAudit.report.findings.some((r) => r.index === i && ['duplicate', 'shadow'].includes(r.kind))) disableRoutingRule(i);
  }));
}
