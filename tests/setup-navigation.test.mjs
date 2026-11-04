import assert from 'node:assert/strict';
import test from 'node:test';
import { createSetupNavigation } from '../cmd/ruopenray-ui/web/setup-navigation.js';
import { bindNavigationControls } from '../cmd/ruopenray-ui/web/navigation-bindings.js';
import { createSetupView, setupWizardStepIds } from '../cmd/ruopenray-ui/web/setup-view.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';

function fixture() {
  const state = { tab: 'setup', setupStep: 'connection', setupFallbackMode: 'proxy', activeServerTag: 'example-selected',
    config: { outbounds: [{ tag: 'example-selected', protocol: 'vless' }], routing: { rules: [] } }, jsonDraft: 'unchanged example draft' };
  const gates = [];
  const blocked = new Set();
  let renders = 0;
  const navigation = createSetupNavigation({ state, render() { renders++; }, stepIds: setupWizardStepIds,
    stepGate(step) { gates.push(step); return { ok: !blocked.has(step), notice: { step, level: blocked.has(step) ? 'bad' : 'ok', title: `${step} readiness` } }; } });
  return { state, gates, blocked, navigation, renders: () => renders };
}

test('direct rail jumps validate all forward prerequisites while back preserves the complete draft', () => {
  const f = fixture();
  const before = structuredClone({ config: f.state.config, draft: f.state.jsonDraft, selected: f.state.activeServerTag, mode: f.state.setupFallbackMode });
  assert.equal(f.navigation.selectSetupStep('launch'), true);
  assert.deepEqual(f.gates, ['connection', 'scenarios']);
  assert.equal(f.state.setupStepNotice.step, 'launch');
  f.gates.length = 0;
  f.blocked.add('connection');
  assert.equal(f.navigation.setupStepBack(), true);
  assert.equal(f.state.setupStep, 'scenarios');
  assert.deepEqual(f.gates, []);
  assert.equal(f.state.setupStepNotice, null);
  assert.deepEqual({ config: f.state.config, draft: f.state.jsonDraft, selected: f.state.activeServerTag, mode: f.state.setupFallbackMode }, before);
});

test('rail and Next use the same denied gate with a notice visible on the current step', () => {
  const f = fixture();
  f.blocked.add('scenarios');
  assert.equal(f.navigation.selectSetupStep('launch'), false);
  assert.equal(f.state.setupStep, 'connection');
  assert.equal(f.state.setupStepNotice.step, 'connection');
  assert.equal(f.state.setupStepNotice.title, 'scenarios readiness');
  assert.equal(f.navigation.setupStepNext(), true);
  assert.equal(f.state.setupStep, 'scenarios');
  assert.equal(f.navigation.setupStepNext(), false);
  assert.equal(f.state.setupStepNotice.step, 'scenarios');
  assert.equal(f.navigation.selectSetupStep('legacy-unknown-step'), false);
  assert.equal(f.state.setupStep, 'scenarios');
});

test('apply and rollback block every wizard navigation entry point', () => {
  for (const busy of ['setupApplying', 'setupRollbacking']) {
    const f = fixture();
    f.state.setupStep = 'scenarios';
    f.state[busy] = true;
    assert.equal(f.navigation.selectSetupStep('launch'), false);
    assert.equal(f.navigation.setupStepNext(), false);
    assert.equal(f.navigation.setupStepBack(), false);
    assert.equal(f.state.setupStep, 'scenarios');
    assert.equal(f.renders(), 0);
    assert.deepEqual(f.gates, []);
  }
});

test('actual menu bindings route rail clicks through gates and keep wizard choices across linked pages and import dialogs', (t) => {
  const f = fixture();
  function button(dataset) {
    let click;
    return { dataset, addEventListener(type, callback) { if (type === 'click') click = callback; }, click() { click(); } };
  }
  const rail = button({ setupStep: 'launch' });
  const scenarios = button({ tabJump: 'routing', routingViewJump: 'scenarios' });
  const servers = button({ tabJump: 'servers' });
  const back = button({ tab: 'setup' });
  const imported = button({ importDialog: 'server' });
  const previous = globalThis.document;
  globalThis.document = { querySelectorAll: (selector) => ({ '[data-setup-step]': [rail], '[data-tab-jump]': [scenarios, servers], '[data-tab]': [back], '[data-import-dialog]': [imported] }[selector] || []) };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  bindNavigationControls({ state: f.state, render() {}, onSetupStepChange: f.navigation.selectSetupStep });
  f.blocked.add('scenarios'); rail.click();
  assert.equal(f.state.setupStep, 'connection');
  f.blocked.clear(); rail.click();
  assert.equal(f.state.setupStep, 'launch');
  scenarios.click();
  assert.equal(f.state.tab, 'routing'); assert.equal(f.state.routingView, 'scenarios');
  back.click();
  assert.equal(f.state.tab, 'setup'); assert.equal(f.state.setupStep, 'launch');
  servers.click(); back.click(); imported.click();
  assert.equal(f.state.importDialog, 'server');
  assert.equal(f.state.setupStep, 'launch');
  assert.equal(f.state.activeServerTag, 'example-selected');
  assert.equal(f.state.setupFallbackMode, 'proxy');
  assert.equal(f.state.jsonDraft, 'unchanged example draft');
});

test('the three actual step views expose reachable connection, scenario and safe DNS controls', () => {
  const f = fixture();
  Object.assign(f.state, { status: { core: { available: true } }, setupLanDnsMode: 'xray' });
  const view = createSetupView({ state: f.state, escapeHtml, byteSize: String, setupReadiness: () => ({ canApply: true, proxyRuleCount: 1, items: [] }), loadSetupSnapshot: () => null });
  let html = view.setupPage();
  assert.match(html, /data-import-dialog="server"/);
  assert.match(html, /data-import-dialog="subscription"/);
  assert.match(html, /data-tab-jump="servers"/);
  f.state.setupStep = 'scenarios'; html = view.setupPage();
  assert.match(html, /data-action="openRouteRuleDialog"/);
  assert.match(html, /data-routing-view-jump="scenarios"/);
  assert.match(html, /data-routing-view-jump="rules"/);
  f.state.setupStep = 'launch'; html = view.setupPage();
  assert.match(html, /data-setup-dns-mode="keep"/);
  assert.match(html, /id="setupRestartDnsmasq"/);
  assert.match(html, /class="setup-step-summary-count"/);
});
