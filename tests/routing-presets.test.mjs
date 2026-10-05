import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutingActions } from '../cmd/ruopenray-ui/web/routing-actions.js';
import { createRoutingModel } from '../cmd/ruopenray-ui/web/routing-model.js';
import { createRoutingDsl } from '../cmd/ruopenray-ui/web/routing-dsl.js';
import { routeGroupId } from '../cmd/ruopenray-ui/web/routing-group-identity.js';
import { routeRuleConditionKey } from '../cmd/ruopenray-ui/web/routing-rule-helpers.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';

function fixture() {
  const state = { config: { routing: { rules: [] }, outbounds: [] }, routeNames: {}, routeSearch: '',
    customRoutePresets: {}, externalRoutePresets: {}, selectedRoutePresets: [], routePresetSources: [],
    routePresetEditTitle: '', routePresetEditDetail: '', routePresetEditIcon: '', routePresetEditTarget: 'outbound:proxy',
    routePresetEditDsl: '', routePresetEditor: 'custom:new', routeDslName: '', routeDslTarget: '', disabledRouteRules: [], selectedRouteRuleIndexes: [] };
  const routePresets = { overlap: { title: 'Overlap', rule: { type: 'field', domain: ['domain:ghcr.io'], outboundTag: 'proxy' } } };
  const model = createRoutingModel({ state, routePresets, routeBundles: {}, managedRouteTags: {}, routeKinds: {} });
  const dsl = createRoutingDsl({ state, escapeHtml, resolveRoutingAlias: (value) => value });
  const actions = createRoutingActions({ state, ...model, ...dsl, escapeHtml, render() {}, request: async () => ({ ok: true }),
    routePresets, routeBundles: {}, hiddenBuiltinRoutePresetKeys: new Set(), activeProxyTag: () => 'server-de',
    routeTargetOptions: () => [{ value: 'outbound:proxy', label: 'Proxy' }, { value: 'outbound:direct', label: 'Direct' }],
    setRoutingDraft: (rules) => { actions.migrateLegacyRouteGroups(rules); state.config.routing.rules = rules; } });
  return { state, model, actions };
}

test('presets save plain domain/IP/geo lists with a default or selected destination', () => {
  for (const target of ['outbound:proxy', 'outbound:direct', 'balancer:pool']) {
    const { state, actions } = fixture();
    state.routePresetEditTitle = 'Plain';
    state.routePresetEditTarget = target;
    state.routePresetEditDsl = 'ghcr.io\nlscr.io\n192.0.2.1\n2001:db8::/32\ngeosite:youtube';
    actions.saveRoutePresetEdit();
    const preset = Object.values(state.customRoutePresets)[0];
    assert.equal(preset.rules.length, 5);
    assert.equal(preset.preserveMixed, true);
    assert.ok(preset.rules.every((rule) => target === 'balancer:pool' ? rule.balancerTag === 'pool' : rule.outboundTag === target.slice(9)));
    assert.ok(!state.routePresetDialog);
  }
});

test('explicit destinations override the picker; malformed rows never partially save/apply', () => {
  const { state, actions } = fixture();
  state.routePresetEditDsl = 'ghcr.io\nlscr.io -> block';
  actions.saveRoutePresetEdit();
  assert.deepEqual(Object.values(state.customRoutePresets)[0].rules.map((r) => r.outboundTag), ['proxy', 'block']);
  const before = state.config.routing.rules;
  state.routePresetEditDsl = 'ghcr.io\nnot a valid rule';
  actions.applyRoutePresetEdit();
  actions.saveRoutePresetEdit();
  assert.equal(state.config.routing.rules, before);
  assert.equal(Object.keys(state.customRoutePresets).length, 1);
  assert.ok(state.routePresetEditPreview.errors.length);
});

test('installed preset remains one group when conditions overlap another preset or destinations change', () => {
  const { state, actions } = fixture();
  state.customRoutePresets.unraid = { title: 'unraid', preserveMixed: true, rules: ['ghcr.io', 'lscr.io', ...Array.from({ length: 11 }, (_, i) => `service${i}.test`)].map((domain) => ({ type: 'field', domain: [`domain:${domain}`], outboundTag: 'proxy' })) };
  state.selectedRoutePresets = ['custom:unraid'];
  actions.applySelectedRoutingPresets();
  const group = actions.visibleRoutingRuleItems();
  assert.equal(group.length, 1);
  assert.equal(group[0].items.length, 13);
  assert.equal(group[0].title, 'unraid');
  assert.equal(state.routeNames[`@group-source:${routeGroupId(state.config.routing.rules[0], state.routeNames)}`], 'custom:unraid');
  actions.updateRoutingTargetRange(0, 2, 'outbound:direct');
  assert.equal(actions.visibleRoutingRuleItems()[0].items.length, 13);
  state.config.routing.rules[0].domain = ['full:edited.example'];
  assert.equal(actions.visibleRoutingRuleItems()[0].items.length, 13);
});

test('an overlapping template does not split an existing named group', () => {
  const { state, actions, model } = fixture();
  state.config.routing.rules = ['ghcr.io', 'lscr.io', 'third.example'].map((domain) => ({ type: 'field', domain: [`domain:${domain}`], outboundTag: 'proxy' }));
  state.config.routing.rules.forEach((rule) => { state.routeNames[model.routeRuleKey(rule)] = 'unraid'; });
  const items = actions.visibleRoutingRuleItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'unraid');
  assert.equal(items[0].items.length, 3);
});

test('complex AND conditions and array alternatives round-trip without flattening', () => {
  const { state, actions } = fixture();
  const rule = { type: 'field', domain: ['domain:a.test', 'full:b.test'], source: ['192.0.2.1', '192.0.2.2'], port: '443', network: 'tcp', outboundTag: 'direct' };
  state.customRoutePresets.complex = { title: 'Complex', preserveMixed: true, rules: [rule] };
  actions.editRoutingPreset('custom:complex');
  assert.ok(!state.routePresetEditDsl.includes('->'));
  actions.saveRoutePresetEdit();
  assert.deepEqual(state.customRoutePresets.complex.rules, [rule]);
  state.customRoutePresets.advanced = { title: 'Advanced', preserveMixed: true, rules: [{ ...rule, sourcePort: '5000', attrs: { ':method': 'GET' } }] };
  actions.editRoutingPreset('custom:advanced');
  actions.saveRoutePresetEdit();
  assert.equal(state.customRoutePresets.advanced.rules[0].sourcePort, '5000');
  assert.deepEqual(state.customRoutePresets.advanced.rules[0].attrs, { ':method': 'GET' });
  assert.notEqual(routeRuleConditionKey(rule), routeRuleConditionKey({ ...rule, sourcePort: '5000' }));
});

test('legacy unraid rows preceding an explicitly named group are rendered together without reordering', () => {
  const { state, actions, model } = fixture();
  const rules = ['ghcr.io', 'lscr.io', ...Array.from({ length: 11 }, (_, i) => `service${i}.test`)].map((name) => ({ type: 'field', domain: [`domain:${name}`], outboundTag: 'proxy' }));
  state.customRoutePresets.unraid = { title: 'unraid', preserveMixed: true, rules };
  state.config.routing.rules = structuredClone(rules);
  state.config.routing.rules.slice(2).forEach((rule) => { state.routeNames[model.routeRuleKey(rule)] = 'unraid'; });
  const before = JSON.stringify(state.config);
  const items = actions.visibleRoutingRuleItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].items.length, 13);
  assert.equal(items[0].title, 'unraid');
  assert.equal(JSON.stringify(state.config), before, 'repairing display must not alter Xray order');
  actions.updateRoutingTargetRange(0, 2, 'outbound:direct');
  const groupID = routeGroupId(state.config.routing.rules[0], state.routeNames);
  assert.ok(groupID);
  assert.ok(state.config.routing.rules.every((rule) => routeGroupId(rule, state.routeNames) === groupID));
  state.config.routing.rules[0].domain = ['full:edited.example'];
  assert.equal(actions.visibleRoutingRuleItems()[0].items.length, 13, 'first draft edit must preserve recovered membership');
});
