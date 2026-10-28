import assert from 'node:assert/strict';
import test from 'node:test';
import { b4Panel } from '../cmd/ruopenray-ui/web/b4-view.js';
import { createCompatActions } from '../cmd/ruopenray-ui/web/compat-actions.js';
import { createRoutingModel } from '../cmd/ruopenray-ui/web/routing-model.js';
import { managedRouteTags } from '../cmd/ruopenray-ui/web/presets.js';

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

test('B4 is offered as a direct routing destination with an icon', () => {
  const model = createRoutingModel({ state: { config: { outbounds: [{ tag: 'direct-b4', protocol: 'freedom' }] } }, managedRouteTags, proxyOutbounds: () => [] });
  assert.equal(model.routeTargetOptions().find((option) => option.value === 'outbound:direct-b4').label, 'Напрямую через B4');
  assert.match(model.routeTargetFlagMarkup('outbound:direct-b4'), /<svg/);
  assert.equal(model.routeCategoryForRule({ outboundTag: 'direct-b4' }), 'direct');
});

test('B4 renders real engine, metrics, protected set revisions and safe admin links without secrets', () => {
  const state = { compatStatus: { b4: { directPrepared: true, api: { available: true, authenticated: true,
    url: 'http://127.0.0.1:7000', password: 'never-render-this', version: '1.85.0', engine: { state: 'failed' },
    engineFailure: { error: 'NFQUEUE <failed>' }, config: { skipSetup: true },
    metrics: { connections: 23, connections_in_sets: 5, uptime: '1m' },
    sets: [{ id: 'test', revision: 'r1', name: '<script>Test', enabled: false, domains: ['example.org'] }] } } } };
  const html = b4Panel({ state, escapeHtml: esc, pageUrl: 'http://192.168.50.117:9090/' });
  assert.match(html, /http:\/\/192\.168\.50\.117:7000\/sets/);
  assert.match(html, /Движок не запустился/);
  assert.match(html, /NFQUEUE &lt;failed>/);
  assert.match(html, /Внешние правила/);
  assert.match(html, /data-b4-revision="r1"/);
  assert.match(html, /Соединения/);
  assert.doesNotMatch(html, /never-render-this|<script>/);
  assert.doesNotMatch(html, /Обрабатывает трафик/);
});

test('B4 connection failure clears the password and does not report success', async () => {
  const state = { b4ApiPassword: 'private', compatStatus: { b4: { api: {} } } };
  const actions = createCompatActions({ state, render() {}, request: async () => ({ ok: false, message: 'Wrong password' }) });
  await assert.rejects(actions.b4Connect(), /Wrong password/);
  assert.equal(state.b4ApiPassword, '');
  assert.equal(state.message, undefined);
});

test('Preparing B4 creates a separate outbound draft and preserves direct, AWG, VPN and every route', () => {
  const original = { outbounds: [{ tag: 'direct', protocol: 'freedom' }, { tag: 'proxy', protocol: 'vless' }, { tag: 'out-amnezia', protocol: 'freedom', streamSettings: { sockopt: { mark: 20992 } } }], routing: { rules: [{ outboundTag: 'proxy' }] } };
  const state = { config: structuredClone(original) };
  const actions = createCompatActions({ state, render() {}, request() { throw new Error('Draft must not write to router'); }, syncConfig: (next) => { state.config = next; } });
  actions.b4PrepareDirect();
  assert.deepEqual(state.config.outbounds.slice(0,3), original.outbounds);
  assert.deepEqual(state.config.routing, original.routing);
  assert.equal(state.config.outbounds[3].streamSettings.sockopt.mark, 0x80000);
  actions.b4PrepareDirect();
  assert.equal(state.config.outbounds.length, 4);
});

test('Editing a set sends its revision and clears only its successful domain input', async () => {
  const calls = [];
  const state = { b4Domains: { test: 'example.org', other: 'keep.example' } };
  const actions = createCompatActions({ state, render() {}, request: async (path,options) => {
    if (options) calls.push([path,JSON.parse(options.body)]);
    return { ok: true, message: 'Updated' };
  } });
  await actions.b4Api({ dataset: { b4ApiAction: 'add-domain', b4SetId: 'test', b4Revision: 'r1' } });
  assert.equal(calls[0][1].revision, 'r1');
  assert.equal(calls[0][1].domain, 'example.org');
  assert.equal(state.b4Domains.test, '');
  assert.equal(state.b4Domains.other, 'keep.example');
});
