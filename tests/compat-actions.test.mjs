import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompatActions } from '../cmd/ruopenray-ui/web/compat-actions.js';
import { bindNavigationControls } from '../cmd/ruopenray-ui/web/navigation-bindings.js';

test('Refreshing integrations reads both component detection and actual AdGuard filtering without writes', async () => {
  const paths = [];
  const state = { status: {}, lanDnsStatus: {}, busyAction: '' };
  const adguard = { configured: true, ok: true, running: true, protectionEnabled: false, filteringEnabled: true };
  let renders = 0;
  const actions = createCompatActions({ state, render: () => { renders++; }, request: async (path, options) => {
    assert.equal(options, undefined);
    paths.push(path);
    return path === '/api/dns/adguard' ? adguard : { adguardHome: { running: true } };
  } });
  await actions.refreshCompatibility({ silent: true });
  assert.deepEqual(paths.sort(), ['/api/compat/status', '/api/dns/adguard']);
  assert.equal(state.adguardStatus, adguard);
  assert.equal(state.lanDnsStatus.adguardHome.running, true);
  assert.equal(renders, 1);
  assert.equal(state.busyAction, '');
  assert.equal(state.message, undefined);
});

test('AdGuard API failure clears its successful state while retaining the admin address and other integrations', async () => {
  const state = { adguardStatus: { configured: true, ok: true, url: 'http://127.0.0.1:3001', protectionEnabled: true } };
  const actions = createCompatActions({ state, render() {}, request: async (path) => {
    if (path === '/api/dns/adguard') throw new Error('AdGuard API offline');
    return { b4: { available: true } };
  } });
  await actions.refreshCompatibility();
  assert.equal(state.adguardStatus.ok, false);
  assert.equal(state.adguardStatus.url, 'http://127.0.0.1:3001');
  assert.equal(state.adguardStatus.error, 'AdGuard API offline');
  assert.equal(state.compatStatus.b4.available, true);
  assert.equal(state.busyAction, '');
});

test('Integration navigation refreshes on entry and jumps directly to AdGuard settings without applying config', () => {
  const previousDocument = globalThis.document;
  const button = (dataset) => ({ dataset, addEventListener(_, callback) { this.click = callback; } });
  const integrations = button({ tab: 'compat' });
  const adguard = button({ tabJump: 'dns', dnsViewJump: 'adguard' });
  globalThis.document = { querySelectorAll: (selector) => selector === '[data-tab]' ? [integrations] : selector === '[data-tab-jump]' ? [adguard] : [] };
  try {
    const state = { tab: 'dashboard', dnsView: 'servers', mobileNavOpen: true, config: { routing: { rules: [{}] } } };
    const config = JSON.stringify(state.config);
    const navigated = [];
    bindNavigationControls({ state, render() {}, onTabChange: (tab) => navigated.push([tab, state.dnsView]) });
    integrations.click();
    assert.equal(state.tab, 'compat');
    adguard.click();
    assert.deepEqual(navigated, [['compat', 'servers'], ['dns', 'adguard']]);
    assert.equal(state.mobileNavOpen, false);
    assert.equal(JSON.stringify(state.config), config);
  } finally {
    globalThis.document = previousDocument;
  }
});
