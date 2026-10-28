import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoutingDsl, routingListTargetPicker } from '../cmd/ruopenray-ui/web/routing-dsl.js';
import { createRoutingActions } from '../cmd/ruopenray-ui/web/routing-actions.js';
import { bindRoutingControls } from '../cmd/ruopenray-ui/web/routing-bindings.js';

const targets = [
  { value: 'outbound:server-de', label: 'Germany' },
  { value: 'outbound:direct', label: 'Direct' },
  { value: 'outbound:block', label: 'Block' },
  { value: 'balancer:pool', label: 'Pool' },
  { value: 'outbound:ruopenray-amnezia-direct:home', label: 'AWG policy' },
];

function fixture() {
  const state = { routeDsl: 'example.com\n192.0.2.1', routeDslTarget: 'outbound:server-de', routeDslName: 'Services', routeRuleDialog: true };
  const dsl = createRoutingDsl({ state, escapeHtml: String, resolveRoutingAlias: (value) => value });
  let rules = [{ type: 'field', domain: ['domain:existing.example'], outboundTag: 'direct' }];
  const names = [];
  const actions = createRoutingActions({
    state, render() {}, ...dsl,
    routeTargetOptions: () => targets,
    routeRules: () => rules,
    setRoutingDraft: (next) => { rules = next; },
    setRouteRuleName: (rule, name) => names.push(name),
    saveRouteNames: () => names.push(...Object.entries(state.routeNames).filter(([key]) => !key.startsWith('@group:')).map(([, name]) => name)),
    routeRuleKey: (rule) => rule.ruleTag || JSON.stringify(rule),
  });
  return { state, actions, rules: () => rules, names };
}

test('preview and append use the current selection and retain list names', () => {
  const f = fixture();
  f.actions.previewRoutingDsl();
  assert.ok(f.state.routeDslPreview.rules.every((rule) => rule.outboundTag === 'server-de'));
  f.state.routeDslTarget = 'balancer:pool';
  f.actions.applyRoutingDsl('append', true);
  assert.equal(f.rules().length, 1, 'changed target requires a fresh preview');
  f.actions.applyRoutingDsl('append', true);
  assert.equal(f.rules().length, 3);
  assert.equal(f.rules()[0].outboundTag, 'direct');
  assert.ok(f.rules().slice(1).every((rule) => rule.balancerTag === 'pool' && !rule.outboundTag));
  assert.deepEqual(f.names, ['Services', 'Services']);
  assert.equal(f.state.routeRuleDialog, false);
});

test('invalid rows, missing targets and removed targets leave the draft untouched', () => {
  for (const update of [
    { routeDsl: 'example.com\nbad input' },
    { routeDslTarget: '' },
    { routeDslTarget: 'outbound:deleted-server' },
    { routeDslTarget: 'outbound:ruopenray-amnezia-direct:home' },
  ]) {
    const f = fixture();
    Object.assign(f.state, update);
    const before = f.rules();
    f.actions.applyRoutingDsl('replace', true);
    assert.equal(f.rules(), before);
    assert.equal(f.state.routeRuleDialog, true);
    assert.match(f.state.message, /Список не добавлен/);
  }
});

test('destination dropdown includes server, direct, block and balancer destinations', () => {
  const html = routingListTargetPicker({ routeDslTarget: 'balancer:pool' }, targets, String);
  for (const value of ['outbound:server-de', 'outbound:direct', 'outbound:block', 'balancer:pool']) assert.ok(html.includes(value));
  assert.match(html, /value="balancer:pool" selected/);
  assert.ok(!html.includes('ruopenray-amnezia-direct'));
});

test('import requires review and removes only explicitly excluded rules', () => {
  const f = fixture();
  f.state.routeDsl = 'example.com\nexample.com\n192.0.2.1';
  f.actions.applyRoutingDsl('append');
  assert.equal(f.rules().length, 1);
  assert.equal(f.state.routeDslPreview.analysis[1].kind, 'duplicate');
  f.state.routeDslExcluded = [1];
  f.actions.applyRoutingDsl('append');
  assert.equal(f.rules().length, 3);
  assert.equal(f.rules()[1].domain[0], 'domain:example.com');
  assert.equal(f.rules()[2].ip[0], '192.0.2.1');
});

test('exclusions reset when input or existing rules change; replacement uses its own preview', () => {
  const f = fixture();
  f.actions.previewRoutingDsl();
  f.state.routeDslExcluded = [0];
  f.state.routeDsl += '\nnew.example';
  f.actions.applyRoutingDsl('append');
  assert.deepEqual(f.state.routeDslExcluded, []);
  f.actions.applyRoutingDsl('replace');
  assert.equal(f.rules().length, 1);
  assert.equal(f.state.routeDslPreview.mode, 'replace');
  f.actions.applyRoutingDsl('replace');
  assert.equal(f.rules().length, 3);
});

test('changing the dropdown updates state and clears the stale preview', () => {
  const previousDocument = globalThis.document;
  let onChange;
  const element = { addEventListener: (event, handler) => { if (event === 'change') onChange = handler; } };
  globalThis.document = {
    querySelectorAll: (selector) => selector === '[data-route-dsl-target]' ? [element] : [],
    querySelector: () => null,
  };
  try {
    const state = { routeDsl: 'example.com', routeDslPreview: { rules: [] }, message: 'old result' };
    let renders = 0;
    bindRoutingControls({ state, render: () => { renders += 1; } });
    onChange({ target: { value: 'outbound:block' } });
    assert.equal(state.routeDslTarget, 'outbound:block');
    assert.equal(state.routeDslPreview, null);
    assert.equal(state.routeDsl, 'example.com');
    assert.equal(state.message, '');
    assert.equal(renders, 1);
  } finally {
    globalThis.document = previousDocument;
  }
});
