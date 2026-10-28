import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoutingModel } from '../cmd/ruopenray-ui/web/routing-model.js';

function model(state) {
  return createRoutingModel({
    state, managedRouteTags: new Set(), routeBundles: {}, routeKinds: {}, routePresets: {},
    proxyOutbounds: () => state.config.outbounds, checkForTag() {}, checkLabel() {},
    outboundAddress() {}, persistRouteNames() {},
  });
}

test('merged routing picker retains a legacy AWG client and its exact profile identifier', () => {
  const state = {
    config: { outbounds: [], routing: { rules: [], balancers: [] } },
    amneziaStatus: { clientConfig: { exists: true, name: 'Legacy AWG', profiles: { activeId: 'home' }, peer: { endpoint: 'vpn.example.com:51820' } } },
  };
  const before = structuredClone(state);
  const options = model(state).routeTargetOptions();
  assert.ok(options.some(x => x.value === 'outbound:ruopenray-amnezia-direct:home' && x.label.includes('Legacy AWG')));
  assert.deepEqual(state, before);
});

test('merged routing picker repairs damaged labels while preserving tag values and SVG flags', () => {
  const tag = '????fin_server';
  const state = {
    config: { outbounds: [{ tag, protocol: 'vless', settings: { vnext: [{ address: 'vpn.example.com', port: 443 }] } }], routing: { rules: [], balancers: [] } },
    serverMeta: { [tag]: { country: 'FI' } },
  };
  const before = structuredClone(state);
  const routing = model(state);
  const option = routing.routeTargetOptions().find(x => x.value === `outbound:${tag}`);
  assert.ok(option);
  assert.ok(!option.label.includes('????'));
  assert.match(option.label, /vpn\.example\.com/);
  assert.match(routing.routeTargetFlagMarkup(option.value), /<svg/);
  assert.deepEqual(state, before);
});
