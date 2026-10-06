import assert from 'node:assert/strict';
import test from 'node:test';
import { adguardAdminUrl, adguardSection } from '../cmd/ruopenray-ui/web/adguard-view.js';
import { createAdguardActions } from '../cmd/ruopenray-ui/web/adguard-actions.js';

const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

test('AdGuard admin link uses the router host and preserves its own protocol and port', () => {
  assert.equal(adguardAdminUrl('http://127.0.0.1:3001', 'http://192.168.50.117:9090/'), 'http://192.168.50.117:3001/');
  assert.equal(adguardAdminUrl('https://[::1]:3443/', 'http://[2001:db8::1]:9090/'), 'https://[2001:db8::1]:3443/');
  assert.equal(adguardAdminUrl('http://127.0.0.1', 'https://router.example:8443/'), 'http://router.example/');
  const html = adguardSection({ adguardStatus: { configured: true, ok: false, url: 'http://127.0.0.1:3001' } }, escapeHtml, 'http://192.168.50.117:9090/');
  assert.match(html, /href="http:\/\/192\.168\.50\.117:3001\/" target="_blank" rel="noopener noreferrer">Открыть AdGuard Home/);
  const unconfigured = adguardSection({ adguardStatus: { url: 'http://127.0.0.1:3001' } }, escapeHtml, 'http://192.168.50.117:9090/');
  assert.doesNotMatch(unconfigured, /Открыть AdGuard Home/);
  for (const invalid of ['', 'javascript:alert(1)', 'http://user:secret@127.0.0.1:3001', 'http://127.0.0.1:3001/?token=secret', 'http://outside.example:3001']) {
    assert.equal(adguardAdminUrl(invalid, 'http://192.168.50.117:9090/'), '');
  }
});

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

test('Domain check explains blocking and exceptions without trusting API text as HTML', () => {
  const render = (reason, rules = []) => adguardSection({ adguardCheckResult: { domain: 'example.com', result: { reason, rules } } }, escapeHtml);
  assert.match(render('FilteredBlackList'), /Заблокирован фильтром/);
  assert.match(render('NotFilteredWhiteList'), /Разрешён исключением/);
  assert.match(render('NotFilteredError'), /Ошибка проверки фильтра/);
  const paused = adguardSection({ adguardStatus: { configured: true, protectionEnabled: false }, adguardCheckResult: { domain: 'example.com', result: { reason: 'FilteredBlackList' } } }, escapeHtml);
  assert.match(paused, /Защита AdGuard сейчас выключена; блокировки не применяются/);
  const unknown = render('<script>unexpected</script>', [{ text: '<img src=x>' }]);
  assert.match(unknown, /Неизвестный результат AdGuard/);
  assert.doesNotMatch(unknown, /<script>|<img/);
  assert.doesNotMatch(unknown, /Разрешён исключением/);
});

test('Connecting AdGuard clears the secret and refreshes actual status', async () => {
  const calls = [];
  const state = { adguardPassword: 'private', adguardUrl: 'http://127.0.0.1:3001', adguardUsername: 'admin', adguardSyncEnabled: true, adguardCheckResult: { domain: 'old.example.com', result: { reason: 'FilteredBlackList' } } };
  const actions = createAdguardActions({ state, render() {}, syncLanDnsStatus() {}, request: async (path, opts) => {
    calls.push({ path, payload: opts?.body ? JSON.parse(opts.body) : null });
    return { ok: true, configured: true };
  } });
  await actions.adguardConfigure();
  assert.equal(calls[0].payload.password, 'private');
  assert.equal(calls[0].payload.enabled, true);
  assert.equal(state.adguardPassword, '');
  assert.equal(state.adguardCheckResult, null);
  assert.deepEqual(calls.map((call) => call.path), ['/api/dns/adguard', '/api/dns/adguard', '/api/dns/lan-upstream']);
});

test('Failed connection clears the secret and does not report success', async () => {
  const state = { adguardPassword: 'private' };
  const actions = createAdguardActions({ state, render() {}, syncLanDnsStatus() {}, request: async () => { throw new Error('auth failed'); } });
  await assert.rejects(actions.adguardConfigure(), /auth failed/);
  assert.equal(state.adguardPassword, '');
  assert.equal(state.message, undefined);
});
