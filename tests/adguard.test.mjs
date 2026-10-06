import assert from 'node:assert/strict';
import test from 'node:test';
import { adguardSection } from '../cmd/ruopenray-ui/web/adguard-view.js';
import { createAdguardActions } from '../cmd/ruopenray-ui/web/adguard-actions.js';

const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

test('AdGuard controls reflect protection and never render credentials', () => {
  const html = adguardSection({ adguardStatus: { configured: true, ok: true, running: true, protectionEnabled: true, filteringEnabled: true, queries: 10, blocked: 2, enabled: true }, adguardPassword: 'secret-never-render' }, escapeHtml);
  assert.match(html, /Выключить фильтрацию/);
  assert.match(html, /Синхронизировать сейчас/);
  assert.doesNotMatch(html, /secret-never-render/);
  assert.match(html, /type="password"/);
  assert.match(html, /не входит в экспорт профилей/);
});

test('Unconfigured or unavailable AdGuard disables filtering writes', () => {
  for (const adguardStatus of [{}, { configured: true, ok: false, error: '<script>broken</script>' }]) {
    const html = adguardSection({ adguardStatus }, escapeHtml);
    assert.match(html, /data-action="adguardExceptionAdd" disabled/);
    assert.doesNotMatch(html, /<script>/);
  }
});

test('Connecting AdGuard clears the secret and refreshes actual status', async () => {
  const calls = [];
  const state = { adguardPassword: 'private', adguardUrl: 'http://127.0.0.1:3001', adguardUsername: 'admin', adguardSyncEnabled: true };
  const actions = createAdguardActions({ state, render() {}, syncLanDnsStatus() {}, request: async (path, opts) => {
    calls.push({ path, payload: opts?.body ? JSON.parse(opts.body) : null });
    return { ok: true, configured: true };
  } });
  await actions.adguardConfigure();
  assert.equal(calls[0].payload.password, 'private');
  assert.equal(calls[0].payload.enabled, true);
  assert.equal(state.adguardPassword, '');
  assert.deepEqual(calls.map((call) => call.path), ['/api/dns/adguard', '/api/dns/adguard', '/api/dns/lan-upstream']);
});

test('Failed connection clears the secret and does not report success', async () => {
  const state = { adguardPassword: 'private' };
  const actions = createAdguardActions({ state, render() {}, syncLanDnsStatus() {}, request: async () => { throw new Error('auth failed'); } });
  await assert.rejects(actions.adguardConfigure(), /auth failed/);
  assert.equal(state.adguardPassword, '');
  assert.equal(state.message, undefined);
});
