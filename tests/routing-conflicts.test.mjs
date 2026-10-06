import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRoutingRules, bindRoutingAudit, compileRoutingRule, compareRoutingConditions, routingAuditView } from '../cmd/ruopenray-ui/web/routing-conflicts.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';

const rule = (conditions = {}, outboundTag = 'proxy') => ({ type: 'field', ...conditions, outboundTag });
const domain = (values, target = 'proxy', extra = {}) => rule({ domain: Array.isArray(values) ? values : [values], ...extra }, target);
const pair = (a, b) => analyzeRoutingRules([a, b]);
const rows = (report, kind) => report.findings.filter((r) => r.kind === kind);
const viewDeps = { describeRouteRule: () => ({}), routeRuleName: (r) => r.ruleTag || 'Импортированное правило' };

test('full-list duplicates ignore identity and array order, but preserve AND and actions', () => {
  const first = domain(['domain:a.test', 'full:b.test'], 'proxy', { inboundTag: ['lan'], ruleTag: 'first' });
  const second = domain(['full:b.test', 'domain:a.test', 'domain:a.test'], 'proxy', { inboundTag: ['lan'], ruleTag: 'second' });
  const input = [first, second], before = JSON.stringify(input);
  const report = analyzeRoutingRules(input);
  assert.deepEqual(rows(report, 'duplicate').map((r) => [r.earlierIndex, r.index]), [[0, 1]]);
  assert.equal(rows(report, 'values')[0].repeated, 1);
  assert.equal(JSON.stringify(input), before, 'analysis cannot mutate rules, group identity or order');
  assert.equal(rows(pair(first, { ...second, outboundTag: 'direct' }), 'shadow')[0].sameAction, false);
  assert.equal(rows(pair(first, { ...second, webhook: { url: 'https://example.test/hook' } }), 'shadow')[0].sameAction, false);
  assert.equal(rows(pair(first, { ...second, inboundTag: ['other'] }), 'duplicate').length, 0);
});

test('outbound takes precedence over balancer, and balancers remain distinct actions', () => {
  const a = rule({ domain: ['domain:a.test'], balancerTag: 'pool' });
  assert.equal(rows(pair(a, rule({ domain: ['domain:a.test'] })), 'duplicate').length, 1);
  const b = { type: 'field', domain: ['domain:a.test'], balancerTag: 'pool' };
  assert.equal(rows(pair(a, b), 'shadow')[0].sameAction, false);
});

test('domains respect label boundaries; keyword, full and dotless have distinct scopes', () => {
  assert.equal(rows(pair(domain('domain:a.test'), domain('full:www.a.test')), 'shadow').length, 1);
  assert.equal(pair(domain('domain:a.test'), domain('domain:not-a.test')).findings.length, 0);
  assert.equal(rows(pair(domain('a.test'), domain('domain:a.test')), 'shadow').length, 1);
  assert.equal(rows(pair(domain('full:a.test'), domain('domain:a.test')), 'overlap').length, 1);
  assert.equal(pair(domain('dotless:printer'), domain('domain:a.test')).findings.length, 0);
  assert.equal(rows(pair(domain('dotless:printer'), domain('full:printer-home')), 'shadow').length, 1);
  assert.equal(rows(pair(domain('domain:a.test'), domain(['domain:a.test', 'domain:b.test'])), 'overlap').length, 1);
});

test('IPv4/IPv6 ranges support partial intersection and unions covering a later subnet', () => {
  const a = rule({ ip: ['192.0.2.0/25', '192.0.2.128/25'] });
  const b = rule({ ip: ['192.0.2.99/24'] });
  assert.equal(rows(pair(a, b), 'shadow').length, 1);
  assert.equal(rows(pair(rule({ ip: ['2001:db8::/32'] }), rule({ ip: ['2001:db8:12::/48'] })), 'shadow').length, 1);
  assert.equal(rows(pair(rule({ ip: ['::ffff:192.0.2.1'] }), rule({ ip: ['0:0:0:0:0:ffff:c000:201'] })), 'shadow').length, 1);
  assert.equal(rows(pair(rule({ ip: ['192.0.2.0/24'] }), rule({ ip: ['192.0.0.0/16'] })), 'overlap').length, 1);
  assert.equal(pair(rule({ ip: ['192.0.2.0/24'] }), rule({ ip: ['2001:db8::/32'] })).findings.length, 0);
});

test('ports merge adjacent ranges, preserve source/local/vless fields and avoid disjoint matches', () => {
  assert.equal(rows(pair(rule({ port: '100-150,151-200' }), rule({ port: '120-180' })), 'shadow').length, 1);
  assert.equal(rows(pair(rule({ port: '100-150' }), rule({ port: '120-180' })), 'overlap').length, 1);
  for (const key of ['port', 'sourcePort', 'localPort', 'vlessRoute']) {
    assert.equal(pair(rule({ [key]: 80 }), rule({ [key]: 443 })).findings.length, 0, key);
  }
  assert.equal(rows(pair(rule({ port: '0-65535' }), domain('domain:a.test')), 'shadow').length, 1);
  assert.equal(pair(rule({ sourcePort: '1-65535' }), rule({ sourcePort: 0 })).findings.length, 0);
});

test('AND constraints stop false duplicates and overlaps across networks, devices and inbounds', () => {
  for (const [key, left, right] of [['network', 'tcp', 'udp'], ['inboundTag', ['lan'], ['socks']], ['source', ['192.0.2.1'], ['192.0.2.2']], ['protocol', ['tls'], ['http']], ['user', ['a'], ['b']], ['port', '80', '443']]) {
    assert.equal(pair(domain('domain:a.test', 'proxy', { [key]: left }), domain('domain:a.test', 'direct', { [key]: right })).findings.length, 0, key);
  }
  const narrow = domain('domain:a.test', 'proxy', { network: 'tcp', source: ['192.0.2.0/24'] });
  assert.equal(rows(pair(narrow, domain('domain:a.test')), 'overlap').length, 1);
  assert.equal(rows(pair(narrow, domain('domain:a.test')), 'shadow').length, 0);
  assert.equal(rows(pair(domain('domain:a.test'), narrow), 'shadow').length, 1);
});

test('sourceIP and domains aliases follow core precedence and do not add invented constraints', () => {
  const a = rule({ domains: ['domain:a.test'], domain: ['domain:ignored.test'], sourceIP: ['192.0.2.1'], source: ['198.51.100.1'] });
  const b = domain('domain:a.test', 'proxy', { source: ['192.0.2.1'] });
  assert.equal(rows(pair(a, b), 'duplicate').length, 1);
});

test('normal fallback does not flood the report, but an early fallback shadows later rules', () => {
  const tail = rule({ network: 'tcp,udp' }, 'direct');
  assert.equal(pair(domain('domain:a.test'), tail).findings.length, 0);
  assert.equal(rows(pair(tail, domain('domain:a.test')), 'shadow').length, 1);
  assert.equal(rows(pair(tail, rule({ network: 'udp,tcp' }, 'direct')), 'duplicate').length, 1);
  assert.equal(rows(pair(rule({ inboundTag: ['lan'], network: 'tcp,udp' }), domain('domain:a.test')), 'shadow').length, 0);
});

test('geo, regexp, inverse IP, unknown fields and mixed domain/IP do not imply false certainty', () => {
  for (const a of [domain('geosite:youtube'), domain('regexp:.*'), rule({ ip: ['!192.0.2.0/24'] }), rule({ attrs: { ':method': 'GET' } }), rule({ process: ['curl'] })]) {
    const b = domain('domain:a.test');
    const report = pair(a, b);
    assert.equal(rows(report, 'shadow').length, 0);
    assert.equal(rows(report, 'overlap').length, 0);
    assert.ok(report.limitedRules.length > 0);
    assert.ok(report.unknownPairs > 0);
    assert.equal(rows(pair(a, { ...a, ruleTag: 'new' }), 'duplicate').length, 1, 'identical conditions can still be compared');
  }
  assert.equal(pair(domain('geosite:youtube', 'proxy', { network: 'tcp' }), domain('domain:a.test', 'proxy', { network: 'udp' })).unknownPairs, 0);
  assert.equal(pair(domain('domain:a.test'), rule({ ip: ['192.0.2.1'] })).unknownPairs, 1);
  assert.equal(rows(pair(rule({}), rule({ ip: ['192.0.2.1'] })), 'shadow').length, 1);
  assert.equal(rows(pair({ future: true }, domain('domain:a.test')), 'shadow').length, 0);
});

test('inside-rule duplicates, covered values and malformed pasted syntax have separate findings', () => {
  const report = analyzeRoutingRules([domain(['domain:a.test', 'full:www.a.test', 'domain:a.test', 'domain:domain(regexp:x) -> proxy']), rule({ ip: ['192.0.2.0/24', '192.0.2.1', '192.0.2.99/24'] })]);
  const values = rows(report, 'values');
  assert.deepEqual(values.map((v) => [v.repeated, v.covered]), [[1, 1], [1, 1]]);
  assert.equal(rows(report, 'format').length, 1);
});

test('prefer an exact duplicate over an earlier broad shadow; track one full finding per later rule', () => {
  const report = analyzeRoutingRules([domain('domain:a.test'), domain('full:www.a.test'), domain('full:www.a.test')]);
  assert.deepEqual(rows(report, 'duplicate').map((r) => [r.earlierIndex, r.index]), [[1, 2]]);
  assert.equal(rows(report, 'shadow').length, 1);
});

test('limits are explicit and counters include findings omitted from storage', () => {
  const input = [domain('domain:a.test'), domain('domain:a.test'), domain('domain:a.test')];
  assert.equal(analyzeRoutingRules(input, { maxWork: 0 }).complete, false);
  assert.equal(analyzeRoutingRules(input, { maxPairs: 0 }).complete, false);
  const report = analyzeRoutingRules(input, { maxFindings: 1 });
  assert.equal(report.complete, true);
  assert.equal(report.storedAll, false);
  assert.equal(report.counts.duplicate, 2);
  assert.equal(report.findings.length, 1);
});

test('read-only managed findings, escaped text, correct full indexes, and stale reports', () => {
  const input = [rule({ inboundTag: ['dns'] }, 'dns-out'), domain('domain:a.test'), domain('domain:a.test', 'proxy', { ruleTag: '<img onerror=x>' })];
  const report = analyzeRoutingRules(input, { isManaged: (r) => r.ruleTag?.startsWith('<') });
  const state = { config: { routing: { rules: input } }, routeAudit: { signature: JSON.stringify(input), report } };
  const html = routingAuditView(state, escapeHtml, viewDeps);
  assert.ok(html.includes('№3'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('data-route-audit-disable='));
  input.reverse();
  const stale = routingAuditView(state, escapeHtml, viewDeps);
  assert.ok(stale.includes('Правила изменились'));
  assert.ok(!stale.includes('data-route-audit-edit='));
});

function bindingsFixture(input) {
  const elements = new Map();
  function element(selector, dataset = {}) {
    const el = { dataset, events: {}, addEventListener(name, fn) { this.events[name] = fn; } };
    elements.set(selector, [el]);
    return el;
  }
  const state = { config: { routing: { rules: input } } };
  const calls = { disable: [], edit: [], renders: 0 };
  const previous = globalThis.document;
  globalThis.document = { querySelectorAll: (selector) => elements.get(selector) || [], querySelector: (selector) => elements.get(selector)?.[0] };
  const deps = { state, render: () => calls.renders++, routeRules: () => state.config.routing.rules, isRuOpenRayManagedRoute: (r) => r.outboundTag === 'dns-out', openRoutingRuleEditor: (i) => calls.edit.push(i), disableRoutingRule: (i) => calls.disable.push(i) };
  return { state, calls, element, bind: () => bindRoutingAudit(deps), cleanup: () => { globalThis.document = previous; } };
}

test('scan binding only reads rules and stale or managed findings cannot disable the wrong index', async () => {
  const f = bindingsFixture([domain('domain:a.test'), domain('domain:a.test')]);
  try {
    const scan = f.element('[data-route-audit]');
    const disable = f.element('[data-route-audit-disable]', { routeAuditDisable: '1' });
    const edit = f.element('[data-route-audit-edit]', { routeAuditEdit: '1' });
    f.bind();
    await scan.events.click();
    assert.equal(f.state.routeAudit.report.counts.duplicate, 1);
    assert.deepEqual(f.calls.disable, []);
    assert.equal(f.state.config.routing.rules.length, 2);
    edit.events.click();
    disable.events.click();
    assert.deepEqual(f.calls.edit, [1]);
    assert.deepEqual(f.calls.disable, [1]);
    f.state.config.routing.rules.reverse();
    f.state.config.routing.rules[0] = domain('domain:different.test');
    disable.events.click();
    assert.deepEqual(f.calls.disable, [1]);
    f.state.config.routing.rules[1].outboundTag = 'dns-out';
    f.state.routeAudit.signature = JSON.stringify(f.state.config.routing.rules);
    disable.events.click();
    assert.deepEqual(f.calls.disable, [1]);
  } finally { f.cleanup(); }
});

test('changes made during a cooperative scan discard the stale result', async () => {
  const f = bindingsFixture([domain('domain:a.test'), domain('domain:a.test')]);
  try {
    const scan = f.element('[data-route-audit]');
    f.bind();
    const running = scan.events.click();
    f.state.config.routing.rules.push(domain('domain:b.test'));
    await running;
    assert.equal(f.state.routeAudit, null);
    assert.match(f.state.message, /изменились/);
    assert.equal(f.state.routeAuditRunning, false);
  } finally { f.cleanup(); }
});

test('all original AND constraints survive preparation', () => {
  const a = compileRoutingRule(domain('domain:a.test', 'proxy', { source: ['192.0.2.0/24'], port: '443' }));
  const b = compileRoutingRule(domain('domain:a.test', 'proxy', { source: ['198.51.100.1'], port: '443' }));
  assert.equal(compareRoutingConditions(a, b).overlap, false);
});

test('findings include concrete overlapping domain or range values', () => {
  const a = domain('domain:a.test'), b = domain('full:www.a.test');
  assert.deepEqual(rows(pair(a, b), 'shadow')[0].examples, ['domain: domain:a.test ↔ full:www.a.test']);
  const report = pair(rule({ ip: ['192.0.2.0/24'] }), rule({ ip: ['192.0.0.0/16'] }));
  assert.ok(rows(report, 'overlap')[0].examples[0].includes('192.0.2.0/24'));
});

test('different dimensions such as a device and a domain are separate from primary overlap findings', () => {
  const input = [rule({ source: ['192.0.2.1'] }, 'direct'), domain('domain:a.test')];
  const report = analyzeRoutingRules(input);
  assert.equal(report.counts.scope, 1);
  assert.equal(report.counts.overlap, 0);
  const state = { config: { routing: { rules: input } }, routeAudit: { signature: JSON.stringify(input), report } };
  assert.ok(!routingAuditView(state, escapeHtml, viewDeps).includes('routing-audit-finding-head'));
  state.routeAuditFilter = 'scope';
  assert.ok(routingAuditView(state, escapeHtml, viewDeps).includes('routing-audit-finding-head'));
});

test('many cross-dimension combinations cannot crowd exact duplicates out of the stored report', () => {
  const input = [rule({ source: ['192.0.2.1'] }), domain('domain:a.test'), domain('domain:b.test'), domain('domain:b.test')];
  const report = analyzeRoutingRules(input, { maxScopeFindings: 1, maxFindings: 1 });
  assert.equal(report.storedAll, false);
  assert.equal(rows(report, 'scope').length, 1);
  assert.equal(rows(report, 'duplicate').length, 1);
});
