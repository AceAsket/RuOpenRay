import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeRuleImport, explainRoute, ipRange, ruleCovers, routeExplanationView } from '../cmd/ruopenray-ui/web/routing-insights.js';
import { assignRouteGroup, routeGroupId, migrateNamedRouteGroups } from '../cmd/ruopenray-ui/web/routing-group-identity.js';
import { createRoutingModel } from '../cmd/ruopenray-ui/web/routing-model.js';
import { createRoutingActions } from '../cmd/ruopenray-ui/web/routing-actions.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';

const domain = (value, target = 'proxy', rest = {}) => ({ type: 'field', domain: [value], outboundTag: target, ...rest });
const config = (rules, strategy = 'AsIs') => ({ routing: { rules, domainStrategy: strategy }, outbounds: [{ tag: 'fallback' }] });

test('duplicates ignore identity, include all conditions and preserve order', () => {
  const rules = [domain('domain:a.test', 'proxy', { source: ['192.0.2.1'] })];
  const incoming = [domain('domain:a.test'), { ...rules[0], ruleTag: 'other' }, domain('domain:a.test', 'direct')];
  assert.deepEqual(analyzeRuleImport(rules, incoming).map((x) => x.kind), ['', 'duplicate', 'shadow']);
  assert.deepEqual(analyzeRuleImport([], [incoming[0], incoming[0]], [0]).map((x) => x.kind), ['', '']);
});
test('shadow analysis proves domain/CIDR/port containment and all AND constraints', () => {
  assert.ok(ruleCovers(domain('domain:a.test'), domain('full:www.a.test')));
  assert.ok(!ruleCovers(domain('domain:a.test'), domain('domain:not-a.test')));
  assert.ok(!ruleCovers(domain('domain:a.test', 'proxy', { network: 'tcp' }), domain('domain:a.test')));
  assert.ok(ruleCovers({ ip: ['2001:db8::/32'] }, { ip: ['2001:db8:12::/48'] }));
  assert.ok(!ruleCovers({ ip: ['192.0.2.0/24'] }, { ip: ['192.0.0.0/16'] }));
  assert.ok(ruleCovers({ port: '100-200' }, { port: '150,170-190' }));
  assert.ok(!ruleCovers(domain('geosite:youtube'), domain('domain:youtube.com')));
  assert.ok(!ruleCovers({ attrs: { ':method': 'GET' } }, { port: 443 }));
  assert.ok(!ruleCovers({ sourcePort: '10' }, { sourcePort: '20' }));
});
test('IP parsing handles IPv6 compression, mapped IPv4, invalid prefixes and addresses', () => {
  assert.deepEqual(ipRange('::ffff:192.0.2.1'), ipRange('0:0:0:0:0:ffff:c000:201'));
  assert.equal(ipRange('0.0.0.0/0').end, 4294967295n);
  for (const raw of ['1::2::3', '1:2:3:4:5:6:7:8::', '256.0.0.1', '1.2.3.4/33', '::/129', '::/abc', '::/']) assert.equal(ipRange(raw), null, raw);
});
test('explanation selects first rule and stops after it, preserving target and balancer', () => {
  const result = explainRoute(config([domain('full:a.test', 'direct'), domain('domain:a.test')]), 'a.test');
  assert.equal(result.selected.index, 0);
  assert.equal(result.selected.destination, 'outbound:direct');
  assert.equal(result.trace.length, 1);
  const balanced = explainRoute(config([{ ip: ['2001:db8::/32'], balancerTag: 'pool' }]), '2001:db8::1');
  assert.equal(balanced.selected.destination, 'balancer:pool');
});
test('unknown earlier geo/regexp/connection conditions prevent false certainty', () => {
  for (const first of [domain('geosite:youtube'), domain('regexp:.*'), { port: 443 }, { protocol: ['tls'] }, { attrs: { ':method': 'GET' } }]) {
    const result = explainRoute(config([first, domain('domain:a.test')]), 'a.test');
    assert.equal(result.uncertain, true);
    assert.equal(result.selected.index, 1);
  }
  const result = explainRoute(config([domain('full:b.test', 'proxy', { port: '443' }), domain('domain:a.test')]), 'a.test');
  assert.equal(result.uncertain, false, 'a known false AND condition defeats unknown fields');
});
test('network, port, inbound and source allow resolving constrained rules', () => {
  const rules = [domain('domain:a.test', 'direct', { network: 'udp', port: '53,100-200', source: ['192.0.2.0/24'], inboundTag: ['lan'] }), { network: 'tcp,udp', outboundTag: 'proxy' }];
  assert.equal(explainRoute(config(rules), 'a.test', { network: 'udp', port: '53', source: '192.0.2.3', inbound: 'lan' }).selected.index, 0);
  assert.equal(explainRoute(config(rules), 'a.test', { network: 'tcp' }).selected.index, 1);
});
test('DNS strategy respects first pass before IPIfNonMatch and IPOnDemand uncertainty', () => {
  const rules = [{ ip: ['192.0.2.0/24'], outboundTag: 'direct' }, domain('domain:a.test')];
  assert.equal(explainRoute(config(rules, 'IPIfNonMatch'), 'a.test').uncertain, false);
  assert.equal(explainRoute(config(rules, 'IPOnDemand'), 'a.test').uncertain, true);
  const second = explainRoute(config(rules.slice(0, 1), 'IPIfNonMatch'), 'a.test');
  assert.equal(second.uncertain, true);
  assert.equal(second.trace[1].dnsPass, true);
  assert.equal(explainRoute(config([]), 'a.test').fallback, 'fallback');
});
test('input validation and rendered explanations escape imported values', () => {
  for (const input of ['', 'https://a.test/path', '192.0.2.0/24', '999.1.1.1']) assert.ok(explainRoute(config([]), input).error);
  assert.ok(explainRoute(config([]), 'a.test', { port: '99999' }).error);
  const html = routeExplanationView({ config: config([domain('domain:a.test', '<img onerror=x>')]), routeExplainInput: 'a.test' }, escapeHtml);
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
});
test('same-name groups remain separate across serialization, edits and reordering', () => {
  const state = { routeNames: {}, config: config([]), routeSearch: '', customRoutePresets: {}, routePresetSources: [] };
  const model = createRoutingModel({ state, managedRouteTags: {}, routePresets: {}, routeBundles: {}, routeKinds: {} });
  const a = [domain('domain:a.test'), domain('domain:b.test')];
  const b = [domain('domain:a.test'), domain('domain:b.test')];
  const first = assignRouteGroup(a, state.routeNames, model.routeRuleKey, 'Same');
  const second = assignRouteGroup(b, state.routeNames, model.routeRuleKey, 'Same');
  assert.notEqual(first, second);
  assert.equal(new Set([...a, ...b].map(model.routeRuleKey)).size, 4);
  state.config.routing.rules = JSON.parse(JSON.stringify([...a, ...b]));
  const actions = createRoutingActions({ state, ...model, render() {}, setRoutingDraft: (rules) => { state.config.routing.rules = rules; }, routePresets: {}, hiddenBuiltinRoutePresetKeys: new Set(), routeBundles: {} });
  const items = actions.visibleRoutingRuleItems();
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((x) => x.items.length), [2, 2]);
  actions.moveRoutingRuleRange(0, 2, 1);
  assert.equal(routeGroupId(state.config.routing.rules[0], state.routeNames), second);
  assert.equal(routeGroupId(state.config.routing.rules[2], state.routeNames), first);
  const edited = { ...a[0], outboundTag: 'direct', domain: ['full:changed.test'] };
  model.copyRouteRuleName(a[0], edited);
  assert.equal(model.routeRuleName(edited), 'Same');
  assert.equal(routeGroupId(edited, state.routeNames), first);
  assert.equal(routeGroupId(JSON.parse(JSON.stringify(b[1])), state.routeNames), second);
});
test('migration preserves old groups and user-provided rule tags', () => {
  const rules = [domain('domain:a.test'), domain('domain:b.test')];
  const key = (rule) => rule.ruleTag || JSON.stringify(rule);
  const names = Object.fromEntries(rules.map((rule) => [key(rule), 'Legacy']));
  assert.equal(migrateNamedRouteGroups(rules, names, key, () => false), true);
  const id = routeGroupId(rules[0], names);
  assert.equal(routeGroupId(rules[1], names), id);
  assert.equal(migrateNamedRouteGroups(rules, names, key, () => false), false);
  const custom = { ...rules[0], ruleTag: 'external-stats-tag' };
  assignRouteGroup([custom], names, key, 'External');
  assert.equal(custom.ruleTag, 'external-stats-tag');
});
