import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutingActions } from '../cmd/ruopenray-ui/web/routing-actions.js';
import { createRoutingModel } from '../cmd/ruopenray-ui/web/routing-model.js';
import { createRoutingView } from '../cmd/ruopenray-ui/web/routing-view.js';
import { bindRoutingControls } from '../cmd/ruopenray-ui/web/routing-bindings.js';
import { assignRouteGroup } from '../cmd/ruopenray-ui/web/routing-group-identity.js';
import { routeDisplayDefaults, routeDisplayLeaves, routeDisplayMatches, projectRoutingItems, loadRouteDisplay } from '../cmd/ruopenray-ui/web/routing-display.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';

const domain = (host, target = 'vpn-a') => ({ type: 'field', domain: [`domain:${host}`], outboundTag: target });
function fixture() {
  const group = [domain('one.example'), { type: 'field', ip: ['192.0.2.0/24'], outboundTag: 'direct' }, domain('two.example')];
  const state = { ...routeDisplayDefaults, routeSearch: '', routeNames: {}, selectedRouteRuleIndexes: [], disabledRouteRules: [],
    customRoutePresets: {}, externalRoutePresets: {}, routePresetSources: [], routeDsl: '',
    config: { outbounds: [{ tag: 'vpn-a', protocol: 'vless' }, { tag: 'direct', protocol: 'freedom' }],
      routing: { rules: [{ type: 'field', outboundTag: 'dns-out', inboundTag: ['ruopenray_dns_in'] }, ...group, domain('three.example'), { type: 'field', network: 'tcp,udp', outboundTag: 'direct' }] } } };
  const model = createRoutingModel({ state, managedRouteTags: {}, routePresets: {}, routeBundles: {}, routeKinds: { domain: 'Домен', ip: 'IP' }, proxyOutbounds: () => [{ tag: 'vpn-a' }] });
  assignRouteGroup(group, state.routeNames, model.routeRuleKey, 'Моя группа');
  const options = [{ value: 'outbound:vpn-a', label: 'VPN A' }, { value: 'outbound:direct', label: 'Direct' }];
  const actions = createRoutingActions({ state, ...model, escapeHtml, render() {}, routeKinds: {}, routePresets: {}, routeBundles: {},
    hiddenBuiltinRoutePresetKeys: new Set(), routeTargetOptions: () => options,
    setRoutingDraft: (rules) => { state.config.routing.rules = rules; }, saveDisabledRouteRules() {}, saveRouteNames() {} });
  return { state, model, actions, options };
}

test('a filter inside a mixed group returns only matching rules with original indices and no range actions', () => {
  const { state, actions, options } = fixture();
  const before = JSON.stringify([state.config, state.routeNames]);
  state.routeFilterTarget = 'outbound:vpn-a';
  const items = actions.visibleRoutingRuleItems();
  assert.deepEqual(routeDisplayLeaves(items).map((x) => x.index), [1, 3, 4]);
  assert.equal(items[0].partial, true);
  assert.equal(items[0].rangeEnd, 4);
  const html = actions.orderedRouteList(items, options, 6, []);
  assert.match(html, /Совпало 2 из 3 правил/);
  assert.ok(!html.includes('data-route-group-delete-start'));
  assert.ok(!html.includes('data-route-range-start'));
  assert.ok(!html.includes('draggable="true"'));
  assert.match(html, /data-route-edit="3"/);
  assert.match(html, /<span>4<\/span>/);
  assert.equal(JSON.stringify([state.config, state.routeNames]), before);
});

test('disabling displayed matches never disables hidden siblings or other destinations', () => {
  const { state, actions } = fixture();
  state.routeSearch = 'two.example';
  actions.disableVisibleRoutingRules();
  assert.equal(state.disabledRouteRules.length, 1);
  assert.equal(state.disabledRouteRules[0].rule.domain[0], 'domain:two.example');
  assert.ok(state.config.routing.rules.some((r) => r.domain?.includes('domain:one.example')));
  assert.ok(state.config.routing.rules.some((r) => r.ip?.length));
});

test('view grouping can combine nonadjacent matches without changing execution order or group identity', () => {
  const { state, actions, options } = fixture();
  const before = JSON.stringify(state.config);
  for (const mode of ['target', 'kind', 'origin']) {
    state.routeGrouping = mode;
    const groups = actions.visibleRoutingRuleItems();
    const indices = routeDisplayLeaves(groups).map((x) => x.index);
    assert.deepEqual([...indices].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
    assert.equal(new Set(indices).size, 5);
    const html = actions.orderedRouteList(groups, options, 6, []);
    assert.match(html, /Группировка для просмотра/);
    assert.ok(!html.includes('data-route-range-start'));
    assert.ok(!html.includes('data-route-group-target-start'));
    assert.equal(JSON.stringify(state.config), before);
  }
});

test('search includes long rule values and combines with type, origin, target and disabled state', () => {
  const { state, actions } = fixture();
  state.config.routing.rules[1].domain.push(...Array.from({ length: 100 }, (_, n) => `domain:${n}.example`));
  state.routeSearch = '99.example моя';
  state.routeFilterKind = 'domain'; state.routeFilterOrigin = 'customGroup'; state.routeFilterTarget = 'category:proxy';
  assert.deepEqual(routeDisplayLeaves(actions.visibleRoutingRuleItems()).map((x) => x.index), [1]);
  const disabled = { rule: domain('disabled.example'), disabled: true, name: 'Disabled', category: 'proxy' };
  assert.ok(routeDisplayMatches(disabled, { routeFilterStatus: 'disabled', routeFilterTarget: 'category:proxy' }));
  assert.ok(!routeDisplayMatches(disabled, { routeFilterStatus: 'enabled' }));
  assert.ok(!routeDisplayMatches(disabled, { routeFilterTarget: 'outbound:direct' }));
});

test('pagination exposes the tail, keeps groups intact, and counts rules rather than headings', () => {
  const items = Array.from({ length: 165 }, (_, index) => ({ kind: 'rule', index, rule: domain(`${index}.example`) }));
  assert.equal(routeDisplayLeaves(projectRoutingItems(items, {}, 80)).length, 80);
  assert.equal(routeDisplayLeaves(projectRoutingItems(items, {}, Infinity)).length, 165);
  assert.equal(routeDisplayLeaves(projectRoutingItems(items, { routeGrouping: 'target' }, 160)).length, 160);
  assert.deepEqual(routeDisplayLeaves(projectRoutingItems(items, { routeSearch: '164.example' }, 80)).map((x) => x.index), [164]);
});

test('two independent groups with identical names remain separate in the grouped view', () => {
  const groups = [0, 1].map((n) => ({ kind: 'customGroup', key: `group:${n}`, title: 'Same', index: n,
    items: [{ rule: domain(`${n}.example`), index: n }] }));
  assert.equal(projectRoutingItems(groups, { routeGrouping: 'origin' }).length, 2);
});

test('the rules panel offers filters, reset and more results, including filtered disabled rules', () => {
  const { state, model, actions, options } = fixture();
  state.config.routing.rules.push(...Array.from({ length: 100 }, (_, n) => domain(`${n}.example`)));
  state.disabledRouteRules = [{ id: 'old', rule: domain('disabled.example'), name: '<img onerror=x>' }];
  const view = createRoutingView({ state, ...model, ...actions, routeTargetOptions: () => options, escapeHtml, operationProgressView: () => '', configAnalysisView: () => '' });
  const html = view.routingRulesPanel();
  assert.match(html, /data-route-display="routeFilterTarget"/);
  assert.match(html, /data-route-show-more/);
  assert.match(html, /data-route-display-reset/);
  assert.ok(html.includes('&lt;img onerror=x&gt;'));
  state.routeFilterStatus = 'disabled'; state.routeSearch = 'disabled.example';
  const disabled = view.routingRulesPanel();
  assert.match(disabled, /data-route-restore="old"/);
  assert.ok(!disabled.includes('data-route-edit='));
  assert.ok(!disabled.includes('data-action="restoreAllDisabledRoutes"'));
});

test('display controls preserve only browser preferences, clear hidden selection, and never mutate config', () => {
  const previousDocument = globalThis.document, previousStorage = globalThis.localStorage;
  const listeners = {}, select = { dataset: { routeDisplay: 'routeGrouping' }, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const storage = new Map();
  globalThis.localStorage = { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  globalThis.document = { querySelectorAll: (s) => s === '[data-route-display]' ? [select] : [], querySelector: () => null };
  try {
    const state = { selectedRouteRuleIndexes: [4], routeVisibleLimit: 160, config: { routing: { rules: [domain('safe.example')] } } };
    const before = JSON.stringify(state.config); let renders = 0;
    bindRoutingControls({ state, render: () => { renders++; } });
    listeners.change({ target: { value: 'target' } });
    assert.equal(state.routeGrouping, 'target');
    assert.equal(loadRouteDisplay().routeGrouping, 'target');
    assert.deepEqual(state.selectedRouteRuleIndexes, []);
    assert.equal(state.routeVisibleLimit, 80);
    assert.equal(JSON.stringify(state.config), before);
    assert.equal(renders, 1);
  } finally { globalThis.document = previousDocument; globalThis.localStorage = previousStorage; }
});
