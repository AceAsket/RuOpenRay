import assert from 'node:assert/strict';
import test from 'node:test';
import { createImportActions } from '../cmd/ruopenray-ui/web/import-actions.js';
import { createServerActions } from '../cmd/ruopenray-ui/web/server-actions.js';
import { createServerModel } from '../cmd/ruopenray-ui/web/server-model.js';

function fixture(rules, balancers = []) {
  const state = { activeServerTag: '', serverMeta: {}, config: {
    outbounds: ['new-provider', 'old-main', 'secondary'].map((tag) => ({ tag, protocol: 'vless' })),
    routing: { rules: structuredClone(rules), balancers: structuredClone(balancers) },
  } };
  state.config.outbounds.push({ tag: 'direct', protocol: 'freedom' });
  const routeRules = () => state.config.routing.rules;
  const configOutbounds = () => state.config.outbounds;
  const model = createServerModel({ state, routeRules, configOutbounds, routeBalancers: () => state.config.routing.balancers });
  const request = async () => { throw new Error('this routing test must not send network requests'); };
  const imports = createImportActions({ state, request, routeRules, activeProxyTag: model.activeProxyTag,
    setActiveServerTag: model.setActiveServerTag,
    setRoutingDraft: (nextRules) => { state.config.routing.rules = nextRules; },
  });
  const applies = [];
  const actions = createServerActions({ state, request, render() {}, configOutbounds,
    proxyOutbounds: model.proxyOutbounds, proxyRuleStrategyStats: model.proxyRuleStrategyStats,
    setActiveProxyDraft: imports.setActiveProxyDraft,
    applyConfig: async (options) => { applies.push(options); state.message = options.successMessage; },
  });
  return { state, model, imports, actions, applies };
}

test('Connect replaces the normalized direct default before it can shadow the selected provider', async () => {
  const rules = [
    ...Array.from({ length: 4 }, (_, i) => ({ type: 'field', ip: [`192.0.2.${i + 1}/32`], outboundTag: 'direct' })),
    ...Array.from({ length: 76 }, (_, i) => ({ type: 'field', domain: [`domain:main-${i}.example.test`], outboundTag: 'old-main' })),
    ...Array.from({ length: 3 }, (_, i) => ({ type: 'field', domain: [`domain:secondary-${i}.example.test`], outboundTag: 'secondary' })),
    { type: 'field', network: 'tcp,udp', outboundTag: 'direct', ruleTag: 'normalized-default', domainMatcher: 'hybrid' },
  ];
  const { state, actions, applies } = fixture(rules);
  const before = structuredClone(state.config);
  await actions.routeAllToOutbound('new-provider');
  assert.equal(applies.length, 1);
  assert.equal(state.config.routing.rules.length, rules.length);
  assert.deepEqual(state.config.routing.rules.slice(0, -1), before.routing.rules.slice(0, -1));
  assert.deepEqual(state.config.routing.rules.at(-1), { ...rules.at(-1), outboundTag: 'new-provider' });
  assert.deepEqual(state.config.outbounds, before.outbounds);
  assert.match(state.message, /Переключено существующих правил: 1; добавлено правил по умолчанию: 0/);
  assert.doesNotMatch(state.message, /правил: 76/);
});

test('all-protocol default variants retain their rule IDs and full-port constraints', () => {
  for (const network of ['tcp,udp', 'udp,tcp', ' TCP, UDP ']) {
    const rule = { type: 'field', network, port: '0-65535', outboundTag: 'direct', ruleTag: 'keep-me', domainMatcher: 'linear' };
    const { state, imports } = fixture([rule]);
    assert.deepEqual(imports.setActiveProxyDraft('new-provider'), { changedExisting: 1, addedCatchAll: 0 });
    assert.deepEqual(state.config.routing.rules, [{ ...rule, outboundTag: 'new-provider' }]);
    assert.deepEqual(imports.setActiveProxyDraft('new-provider'), { changedExisting: 0, addedCatchAll: 0 });
    assert.equal(state.config.routing.rules.length, 1);
  }
});

test('protocol, user, attributes, source ports and unknown criteria never turn into a global default', () => {
  for (const condition of [
    { protocol: ['bittorrent'] }, { user: ['synthetic-user'] }, { attrs: { ':method': 'GET' } },
    { sourcePort: '1024-2048' }, { source: ['192.0.2.2/32'] }, { inboundTag: ['custom-inbound'] },
    { domain: ['domain:example.test'] }, { ip: ['192.0.2.3/32'] }, { port: '443' },
    { network: 'tcp' }, { network: 'udp' }, { futureMatchingField: false },
  ]) {
    const rule = { type: 'field', network: 'tcp,udp', outboundTag: 'old-main', ...condition };
    const { state, imports } = fixture([rule]);
    assert.deepEqual(imports.setActiveProxyDraft('new-provider'), { changedExisting: 0, addedCatchAll: 1 });
    assert.deepEqual(state.config.routing.rules[0], rule);
    assert.deepEqual(state.config.routing.rules[1], { type: 'field', network: 'tcp,udp', outboundTag: 'new-provider' });
  }
});

test('default balancer replacement preserves group definitions and unrelated balancer routes', () => {
  const groups = [{ tag: 'vpn-group', selector: ['old-main', 'secondary'], strategy: { type: 'random' } }];
  const rules = [
    { type: 'field', domain: ['domain:group.example.test'], balancerTag: 'vpn-group', ruleTag: 'pinned-group' },
    { type: 'field', network: 'tcp,udp', balancerTag: 'vpn-group', ruleTag: 'main-group' },
  ];
  const { state, imports } = fixture(rules, groups);
  assert.deepEqual(imports.setActiveProxyDraft('new-provider'), { changedExisting: 1, addedCatchAll: 0 });
  assert.deepEqual(state.config.routing.balancers, groups);
  assert.deepEqual(state.config.routing.rules[0], rules[0]);
  assert.deepEqual(state.config.routing.rules[1], { type: 'field', network: 'tcp,udp', outboundTag: 'new-provider', ruleTag: 'main-group' });
});

test('transparent main and proxy aliases retain their conditions and metadata', () => {
  const rules = [
    { type: 'field', network: 'tcp,udp', inboundTag: ['transparent_ipv4'], outboundTag: 'old-main', ruleTag: 'transparent-main' },
    { type: 'field', network: 'tcp', protocol: ['tls'], port: '443', attrs: { host: 'example.test' }, outboundTag: 'proxy', ruleTag: 'proxy-alias' },
    { type: 'field', network: 'tcp,udp', inboundTag: ['transparent_ipv4', 'custom-inbound'], outboundTag: 'secondary', ruleTag: 'specific-inbounds' },
  ];
  const { state, imports } = fixture(rules);
  assert.deepEqual(imports.setActiveProxyDraft('new-provider'), { changedExisting: 2, addedCatchAll: 0 });
  assert.deepEqual(state.config.routing.rules[0], { ...rules[0], outboundTag: 'new-provider' });
  assert.deepEqual(state.config.routing.rules[1], { ...rules[1], outboundTag: 'new-provider' });
  assert.deepEqual(state.config.routing.rules[2], rules[2]);
});

test('creating a default is reported separately and switching it repeatedly never appends a shadowed rule', async () => {
  const pinned = { type: 'field', domain: ['domain:old.example.test'], outboundTag: 'old-main' };
  const { state, actions } = fixture([pinned]);
  await actions.routeAllToOutbound('new-provider', { apply: false });
  assert.match(state.message, /существующих правил: 0; добавлено правил по умолчанию: 1/);
  await actions.routeAllToOutbound('secondary', { apply: false });
  assert.match(state.message, /существующих правил: 1; добавлено правил по умолчанию: 0/);
  await actions.routeAllToOutbound('secondary', { apply: false });
  assert.match(state.message, /существующих правил: 0; добавлено правил по умолчанию: 0/);
  assert.equal(state.config.routing.rules.length, 2);
  assert.deepEqual(state.config.routing.rules[0], pinned);
  assert.equal(state.config.routing.rules[1].outboundTag, 'secondary');
});

test('duplicate defaults already targeting the chosen server are a truthful no-op', () => {
  const defaults = [{ type: 'field', network: 'tcp,udp', outboundTag: 'new-provider' }, { type: 'field', outboundTag: 'new-provider', ruleTag: 'second-default' }];
  const { state, imports } = fixture(defaults);
  assert.deepEqual(imports.setActiveProxyDraft('new-provider'), { changedExisting: 0, addedCatchAll: 0 });
  assert.deepEqual(state.config.routing.rules, defaults);
});
