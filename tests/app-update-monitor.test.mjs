import assert from 'node:assert/strict';
import test from 'node:test';
import { appUpdatePendingStorageKey, createAppUpdateMonitor } from '../cmd/ruopenray-ui/web/app-update-monitor.js';
import { createUpdatesActions } from '../cmd/ruopenray-ui/web/updates-actions.js';
import { createSettingsView } from '../cmd/ruopenray-ui/web/settings-view.js';
import { createSetupView } from '../cmd/ruopenray-ui/web/setup-view.js';

const sha = 'a'.repeat(64);
const oldSha = 'b'.repeat(64);

function harness({ responses = [], state = {}, storageValues = new Map(), canReload = false, confirmReload = () => false, updateId = 'attempt-current', now = () => Date.now() } = {}) {
  const jobs = [];
  const calls = [];
  const reloads = [];
  const renders = [];
  const storage = { getItem: (key) => storageValues.get(key), setItem: (key, value) => storageValues.set(key, value), removeItem: (key) => storageValues.delete(key) };
  const options = {
    state: { token: 'session', ...state },
    request: async (path) => { calls.push(path); const result = responses.shift(); if (result instanceof Error) throw result; if (typeof result?.then === 'function') return result; return result && !Object.hasOwn(result, 'updateId') ? { ...result, updateId } : result; },
    render: () => renders.push(true),
    canReloadApp: () => canReload,
    reloadApp: () => reloads.push(true),
    confirmReload,
    storage,
    now,
    createUpdateId: () => updateId,
    schedule: (fn) => { jobs.push(fn); return fn; },
    cancel: (fn) => { const index = jobs.indexOf(fn); if (index >= 0) jobs.splice(index, 1); }
  };
  const monitor = createAppUpdateMonitor(options);
  return { ...options, monitor, jobs, calls, reloads, renders, storageValues, next: async () => { assert.ok(jobs.length, 'expected scheduled status request'); await jobs.shift()(); } };
}

test('pending update remains busy and only matching terminal status reloads a clean interface', async () => {
  const h = harness({ canReload: true, responses: [
    { state: 'healthy', expectedSHA: oldSha },
    { state: 'pending', expectedSHA: sha },
    { state: 'healthy', expectedSHA: sha, ok: true }
  ] });
  h.monitor.prepare('v0.6.0');
  h.monitor.track({ ok: true, state: 'pending', sha256: sha });
  h.monitor.resume();
  h.monitor.resume();
  assert.equal(h.jobs.length, 1);
  for (let index = 0; index < 2; index++) {
    await h.next();
    assert.equal(h.state.appUpdating, true);
    assert.equal(h.state.appUpdate.state, 'pending');
    assert.equal(h.reloads.length, 0);
  }
  await h.next();
  assert.equal(h.state.appUpdating, false);
  assert.equal(h.state.appUpdate.state, 'healthy');
  assert.equal(h.reloads.length, 1);
  assert.equal(h.storageValues.has(appUpdatePendingStorageKey), false);
  assert.equal(h.jobs.length, 0);
});

test('pending marker survives process restart, loss of login and a new browser controller', async () => {
  const h = harness({ responses: [new Error('connection reset')] });
  h.monitor.prepare('v0.6.0', sha);
  h.monitor.resume();
  await h.next();
  assert.equal(h.state.appUpdating, true);
  h.state.token = '';
  await h.next();
  assert.equal(h.calls.length, 1);
  assert.equal(h.jobs.length, 0);
  const restarted = harness({ storageValues: h.storageValues, responses: [{ state: 'rolled_back', expectedSHA: sha, rollbackOK: true }] });
  restarted.monitor.resume();
  await restarted.next();
  assert.equal(restarted.state.appUpdate.ok, false);
  assert.match(restarted.state.appUpdate.stdout, /Восстановлена прежняя панель/);
  assert.equal(restarted.reloads.length, 0);
  assert.equal(restarted.state.appUpdating, false);
});

test('interrupted POST uses its attempt ID to adopt the checksum without accepting historical success', async () => {
  const h = harness({ responses: [
    { state: 'healthy', expectedSHA: oldSha, targetVersion: 'v0.5.0', updateId: 'attempt-previous' },
    { state: 'pending', expectedSHA: sha, targetVersion: 'v0.6.0' },
    { state: 'interrupted_rollback', expectedSHA: sha, ok: true }
  ] });
  h.monitor.prepare('v0.6.0');
  h.monitor.resume();
  await h.next();
  assert.equal(h.state.appUpdating, true);
  await h.next();
  assert.equal(JSON.parse(h.storageValues.get(appUpdatePendingStorageKey)).expectedSHA, sha);
  await h.next();
  assert.equal(h.state.appUpdate.ok, false);
  assert.match(h.state.appUpdate.stdout, /прервано/);
});

test('healthy update preserves form and config drafts and requires explicit consent before manual reload', async () => {
  let allowConfirmation = false;
  const h = harness({ state: { jsonDraft: '{"unsaved":true}', settingsNewPassword: 'unsaved form' }, responses: [{ state: 'healthy', expectedSHA: sha }], confirmReload: () => allowConfirmation });
  h.monitor.prepare('v0.6.0', sha);
  h.monitor.resume();
  await h.next();
  assert.equal(h.state.appReloadRequired, true);
  assert.equal(h.reloads.length, 0);
  assert.equal(h.state.jsonDraft, '{"unsaved":true}');
  assert.equal(h.state.settingsNewPassword, 'unsaved form');
  h.monitor.reloadUpdatedApp();
  assert.equal(h.reloads.length, 0);
  allowConfirmation = true;
  h.monitor.reloadUpdatedApp();
  assert.equal(h.reloads.length, 1);
});

test('update action and actual settings view keep a pending watchdog result out of Done', async () => {
  const h = harness({ state: { settingsView: 'updates', appRelease: { tag: 'v0.6.0', update: true, assetUrl: 'release' } }, responses: [{ ok: true, state: 'pending', sha256: sha }] });
  const actions = createUpdatesActions({ ...h, geoSelectedPresetIds: () => [], refresh: async () => { throw new Error('must not overwrite forms during update'); }, updateMonitorOptions: { storage: h.storage, schedule: h.schedule, cancel: h.cancel } });
  await actions.updateApp();
  const html = createSettingsView({ state: h.state, byteSize: String, escapeHtml: (value) => String(value ?? '') }).settingsPanel();
  assert.equal(h.state.appUpdating, true);
  assert.match(html, /<strong>Проверяю обновление<\/strong>/);
  assert.doesNotMatch(html, /<strong>Готово<\/strong>/);
  assert.match(html, /data-action="updateApp"[^>]*disabled/);
});

test('missing core is routed to package wizard and Github install is not offered', async () => {
  const state = { status: { core: { available: false } }, coreDialogOpen: true, selectedCoreVersion: 'v26.10.21', coreReleases: [{ tag: 'v26.10.21', assetUrl: 'release' }], coreReleaseFilter: 'stable' };
  const calls = [];
  const actions = createUpdatesActions({ state, request: async (path) => { calls.push(path); return { ok: true, steps: [] }; }, render() {}, refresh: async () => {}, geoSelectedPresetIds: () => [] });
  const view = createSetupView({ state, shellQuote: String, escapeHtml: (value) => String(value ?? ''), byteSize: String });
  assert.doesNotMatch(view.coreUpdateDialog(), /data-action="updateCore"/);
  assert.match(view.coreUpdateDialog(), /data-action="openInstallWizard"/);
  await actions.updateCore();
  assert.deepEqual(calls, ['/api/install/plan']);
  assert.equal(state.installWizardOpen, true);
});

test('an HTTP rejection of the update request clears the marker and allows retry', async () => {
  const error = Object.assign(new Error('Выполняется другая операция'), { status: 409 });
  const h = harness({ state: { appRelease: { tag: 'v0.6.0' } }, responses: [error] });
  const actions = createUpdatesActions({ ...h, geoSelectedPresetIds: () => [], updateMonitorOptions: { storage: h.storage, schedule: h.schedule, cancel: h.cancel } });
  await actions.updateApp();
  assert.equal(h.state.appUpdating, false);
  assert.equal(h.state.appUpdate.ok, false);
  assert.equal(h.jobs.length, 0);
  assert.equal(h.storageValues.has(appUpdatePendingStorageKey), false);
});

test('retrying the same binary ignores the previous attempt terminal result even when checksum and version match', async () => {
  const h = harness({ responses: [
    { state: 'rolled_back', expectedSHA: sha, targetVersion: 'v0.6.0', updateId: 'attempt-previous' },
    { state: 'healthy', expectedSHA: sha, targetVersion: 'v0.6.0', updateId: 'attempt-current' }
  ] });
  h.monitor.prepare('v0.6.0', sha);
  h.monitor.resume();
  await h.next();
  assert.equal(h.state.appUpdating, true);
  assert.equal(h.state.appUpdate.state, 'pending');
  await h.next();
  assert.equal(h.state.appUpdate.state, 'healthy');
});

test('legacy boot result after observed current pending stops for manual verification across controller restart', async () => {
  const h = harness({ responses: [{ state: 'pending', expectedSHA: sha }] });
  h.monitor.prepare('v0.6.0', sha);
  h.monitor.resume();
  await h.next();
  assert.equal(JSON.parse(h.storageValues.get(appUpdatePendingStorageKey)).observedPending, true);
  const resumed = harness({ storageValues: h.storageValues, canReload: true,
    responses: [{ ok: true, state: 'interrupted_rollback', expectedSHA: sha, updateId: '' }] });
  resumed.monitor.resume();
  await resumed.next();
  assert.equal(resumed.state.appUpdate.state, 'verification_required');
  assert.equal(resumed.state.appUpdate.verificationReason, 'legacy-helper');
  assert.equal(resumed.state.appUpdate.ok, false);
  assert.equal(resumed.state.appUpdating, false);
  assert.equal(resumed.state.appReloadRequired, false);
  assert.equal(resumed.reloads.length, 0);
  assert.equal(resumed.jobs.length, 0);
  assert.equal(resumed.storageValues.has(appUpdatePendingStorageKey), false);
  assert.match(resumed.state.message, /ручной проверки/);
  assert.doesNotMatch(resumed.state.message, /Восстановлена прежняя панель/);
  const html = createSettingsView({ state: { ...resumed.state, settingsView: 'updates' }, byteSize: String, escapeHtml: (value) => String(value ?? '') }).settingsPanel();
  assert.match(html, /<strong>Требуется проверка<\/strong>/);
  assert.doesNotMatch(html, /<strong>Готово<\/strong>|Выполнен откат/);
});

test('historical legacy result with same checksum cannot end an attempt before current pending was observed', async () => {
  let time = 1000;
  const legacy = { state: 'interrupted_rollback', expectedSHA: sha, updateId: '' };
  const h = harness({ now: () => time, responses: [legacy, legacy] });
  h.monitor.prepare('v0.6.0', sha);
  h.monitor.resume();
  await h.next();
  assert.equal(h.state.appUpdating, true);
  assert.equal(h.state.appUpdate.state, 'pending');
  time += 180001;
  await h.next();
  assert.equal(h.state.appUpdate.state, 'verification_required');
  assert.equal(h.state.appUpdate.verificationReason, 'timeout');
  assert.equal(h.state.appUpdating, false);
  assert.equal(h.jobs.length, 0);
});

for (const [name, result] of [
  ['unknown', { state: 'unknown' }],
  ['mismatched attempt', { state: 'healthy', expectedSHA: sha, updateId: 'previous-attempt' }],
  ['stalled current pending', { state: 'pending', expectedSHA: sha }],
  ['transport failure', new Error('connection reset')]
]) {
  test(`unconfirmed ${name} has a bounded wait without claiming success`, async () => {
    let time = 1000;
    const h = harness({ now: () => time, responses: [result], canReload: true });
    h.monitor.prepare('v0.6.0', sha);
    h.monitor.resume();
    time += 180001;
    await h.next();
    assert.equal(h.state.appUpdate.state, 'verification_required');
    assert.equal(h.state.appUpdating, false);
    assert.equal(h.state.appUpdate.ok, false);
    assert.equal(h.reloads.length, 0);
    assert.equal(h.jobs.length, 0);
  });
}

test('a matching terminal result takes precedence at the timeout boundary', async () => {
  let time = 1000;
  const h = harness({ now: () => time, responses: [{ state: 'healthy', expectedSHA: sha }] });
  h.monitor.prepare('v0.6.0', sha);
  h.monitor.resume();
  time += 180001;
  await h.next();
  assert.equal(h.state.appUpdate.state, 'healthy');
});

test('late status rejection from a previous login does not overwrite the new session message or render', async () => {
  let rejectStatus;
  const response = new Promise((_resolve, reject) => { rejectStatus = reject; });
  const h = harness({ responses: [response] });
  h.monitor.prepare('v0.6.0', sha);
  h.monitor.resume();
  const checking = h.next();
  await Promise.resolve();
  h.state.token = 'new-session';
  h.state.message = 'Новая сессия';
  rejectStatus(new Error('old request failed'));
  await checking;
  assert.equal(h.state.message, 'Новая сессия');
  assert.equal(h.renders.length, 0);
  assert.equal(h.state.appUpdating, true);
});
