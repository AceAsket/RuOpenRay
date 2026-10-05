import test from 'node:test';
import assert from 'node:assert/strict';
import { isDefaultRoute, orderRoutingRules, loadRouteDefaultLast, saveRouteDefaultLast } from '../cmd/ruopenray-ui/web/routing-order.js';
import { createRoutingModel } from '../cmd/ruopenray-ui/web/routing-model.js';
import { createRoutingDsl } from '../cmd/ruopenray-ui/web/routing-dsl.js';
import { createRoutingActions } from '../cmd/ruopenray-ui/web/routing-actions.js';
import { bindRoutingControls } from '../cmd/ruopenray-ui/web/routing-bindings.js';
import { routeGroupId } from '../cmd/ruopenray-ui/web/routing-group-identity.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';

const fallback = () => ({ type: 'field', network: 'tcp,udp', outboundTag: 'direct' });
const domain = (value) => ({ type: 'field', domain: [`domain:${value}`], outboundTag: 'proxy' });

function fixture(rules, enabled = true) {
  const state = { config: { routing: { rules } }, routeDefaultLast: enabled, routeNames: {}, routeSearch: '',
    routeDsl: 'first.test\nsecond.test', routeDslName: 'New', routeDslTarget: 'outbound:proxy',
    selectedRouteRuleIndexes: [], customRoutePresets: {}, externalRoutePresets: {}, disabledRouteRules: [],
    routePresetSources: [], selectedRoutePresets: [], routeKind: 'domain', routeValue: 'single.test',
    routeOutbound: 'proxy', routeName: '', routeTargetType: 'outbound' };
  const model = createRoutingModel({ state, routePresets: {}, routeBundles: {}, managedRouteTags: {}, routeKinds: {} });
  const dsl = createRoutingDsl({ state, escapeHtml, resolveRoutingAlias: (tag) => tag });
  const actions = createRoutingActions({ state, ...model, ...dsl, render() {}, escapeHtml, routePresets: {}, routeBundles: {},
    routeTargetOptions: () => [{ value: 'outbound:proxy', label: 'Proxy' }], activeProxyTag: () => 'proxy',
    hiddenBuiltinRoutePresetKeys: new Set(),
    setRoutingDraft(next) { state.config.routing.rules = orderRoutingRules(next, state.routeDefaultLast !== false, model.isRuOpenRayManagedRoute); } });
  return { state, model, actions };
}

test('only unconditional TCP/UDP field rules are pinned; advanced constraints keep their priority', () => {
  for (const rule of [fallback(), { outboundTag: 'direct' }, { balancerTag: 'pool', network: 'udp, tcp', ruleTag: 'custom' }]) assert.equal(isDefaultRoute(rule), true);
  for (const extra of [{ network: 'udp' }, { domain: 'example.com' }, { protocol: ['bittorrent'] }, { source: ['192.0.2.1'] },
    { inboundTag: ['lan'] }, { port: '443' }, { sourcePort: '5000' }, { attrs: { ':method': 'GET' } },
    { user: ['client'] }, { type: 'future' }, { unknown: true }]) assert.equal(isDefaultRoute({ ...fallback(), ...extra }), false);
  const managed = { outboundTag: 'dns-out' }, first = domain('first.test'), last = domain('last.test'), a = fallback(), b = { balancerTag: 'pool' };
  const original = [managed, first, a, last, b];
  const before = JSON.stringify(original);
  assert.deepEqual(orderRoutingRules(original, true, (r) => r === managed), [managed, first, last, a, b]);
  assert.equal(JSON.stringify(original), before);
  assert.equal(orderRoutingRules(original, false), original);
});

test('appending a list places it before the fallback, keeps membership and previews actual precedence', () => {
  const old = domain('existing.test'), tail = fallback();
  const { state, actions } = fixture([old, tail]);
  actions.previewRoutingDsl();
  assert.ok(state.routeDslPreview.analysis.every((row) => !row.kind), 'a pinned tail cannot shadow imported domains');
  actions.applyRoutingDsl('append');
  assert.equal(state.config.routing.rules.at(-1), tail);
  assert.deepEqual(state.config.routing.rules.map((r) => r.domain?.[0] || 'fallback'), ['domain:existing.test', 'domain:first.test', 'domain:second.test', 'fallback']);
  assert.ok(routeGroupId(state.config.routing.rules[1], state.routeNames));
  assert.equal(routeGroupId(state.config.routing.rules[1], state.routeNames), routeGroupId(state.config.routing.rules[2], state.routeNames));
  assert.equal(routeGroupId(tail, state.routeNames), '');
});

test('manual mode preserves deliberate catch-all priority and its shadow warning', () => {
  const tail = fallback();
  const { state, actions } = fixture([tail], false);
  actions.previewRoutingDsl();
  assert.equal(state.routeDslPreview.analysis[0].kind, 'shadow');
  actions.applyRoutingDsl('append');
  assert.equal(state.config.routing.rules[0], tail);
  assert.equal(state.config.routing.rules.length, 3);
});

test('single rules preserve the last fallback; disabling permits manual movement', async () => {
  const tail = fallback(), existing = domain('existing.test');
  const { state, actions } = fixture([existing, tail]);
  await actions.addRoutingRule();
  assert.equal(state.config.routing.rules.at(-1), tail);
  actions.reorderRoutingRuleRange(2, 3, 0);
  assert.equal(state.config.routing.rules.at(-1), tail);
  assert.match(state.message, /закреплён/);
  actions.setRouteDefaultLast(false);
  actions.reorderRoutingRuleRange(2, 3, 0);
  assert.equal(state.config.routing.rules[0], tail);
  state.selectedRouteRuleIndexes = [1];
  actions.setRouteDefaultLast(true);
  assert.equal(state.config.routing.rules.at(-1), tail);
  assert.deepEqual(state.selectedRouteRuleIndexes, []);
  assert.match(state.message, /черновика/);
});

test('the option persists per browser, defaults on, and tolerates unavailable storage', () => {
  const previous = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
  try {
    assert.equal(loadRouteDefaultLast(), true);
    saveRouteDefaultLast(false);
    assert.equal(loadRouteDefaultLast(), false);
    saveRouteDefaultLast(true);
    assert.equal(loadRouteDefaultLast(), true);
    globalThis.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
    assert.equal(loadRouteDefaultLast(), true);
    assert.doesNotThrow(() => saveRouteDefaultLast(false));
  } finally { globalThis.localStorage = previous; }
});

test('option binding changes the preference without applying the running configuration', () => {
  const previous = globalThis.document;
  let change, selected;
  globalThis.document = { querySelectorAll: () => [], querySelector: (s) => s === '[data-route-default-last]' ? { addEventListener: (_e, fn) => { change = fn; } } : null };
  try {
    bindRoutingControls({ state: {}, setRouteDefaultLast: (value) => { selected = value; } });
    change({ target: { checked: false } });
    assert.equal(selected, false);
    change({ target: { checked: true } });
    assert.equal(selected, true);
  } finally { globalThis.document = previous; }
});
