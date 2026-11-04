import assert from 'node:assert/strict';
import test from 'node:test';
import { bindDiagnosticsControls } from '../cmd/ruopenray-ui/web/diagnostics-bindings.js';

test('monitor route buttons preserve IPv4/IPv6 targets and nested keyboard controls keep their own action', (t) => {
  const originalDocument = globalThis.document;
  t.after(() => { globalThis.document = originalDocument; });
  const handlers = new Map();
  globalThis.document = { addEventListener: (name, callback) => handlers.set(name, callback), querySelectorAll: () => [], querySelector: () => null };
  const state = {};
  let renders = 0;
  bindDiagnosticsControls({ state, render: () => renders++, activeProxyTag: () => 'selected-proxy' });
  for (const [host, kind, value] of [['203.0.113.7', 'ip', '203.0.113.7'], ['2001:db8::7', 'ip', '2001:db8::7'], ['[2001:db8::8]', 'ip', '2001:db8::8'], ['example.test', 'domain', 'domain:example.test']]) {
    const button = { dataset: { domainToRoute: host } };
    handlers.get('click')({ target: { closest: (selector) => selector === '[data-domain-to-route]' ? button : null }, preventDefault() {}, stopPropagation() {} });
    assert.equal(state.routeKind, kind);
    assert.equal(state.routeValue, value);
    assert.equal(state.routeOutbound, 'selected-proxy');
    assert.equal(state.routeRuleDialog, true);
  }
  assert.equal(renders, 4);
  const deviceCard = { dataset: { domainDeviceCard: '192.0.2.20' } };
  const childButton = { closest: (selector) => selector === '[data-domain-device-card]' ? deviceCard : childButton };
  let prevented = 0;
  handlers.get('keydown')({ target: childButton, key: 'Enter', preventDefault() { prevented++; } });
  assert.equal(prevented, 0, 'nested button receives its native keyboard activation');
  assert.equal(renders, 4);
  deviceCard.closest = () => deviceCard;
  handlers.get('keydown')({ target: deviceCard, key: 'Enter', preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.equal(state.domainMonitorDeviceFilter, '192.0.2.20');
  assert.equal(state.domainMonitorMode, 'events');
  assert.equal(renders, 5);
});
