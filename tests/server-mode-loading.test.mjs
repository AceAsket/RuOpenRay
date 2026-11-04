import assert from 'node:assert/strict';
import test from 'node:test';
import { createServerModeActions } from '../cmd/ruopenray-ui/web/server-mode-actions.js';
import { createServerModeView } from '../cmd/ruopenray-ui/web/server-mode-view.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(request) {
  const state = { tab: 'dashboard', serverMode: null, serverModeDraft: null, busyAction: '', message: '', config: { outbounds: [] } };
  let renders = 0;
  const actions = createServerModeActions({ state, request, render: () => renders++ });
  const view = createServerModeView({ state, escapeHtml });
  return { state, actions, view, renders: () => renders };
}

test('server mode stays lazy, deduplicates its first entry fetch, and preserves edits when revisited', async () => {
  const response = deferred();
  const calls = [];
  const { state, actions, view, renders } = fixture((path) => { calls.push(path); return response.promise; });
  assert.deepEqual(calls, [], 'constructing actions does not request server-mode diagnostics');
  const loadingView = view.serverModePanel();
  assert.match(loadingView, /Загружаем настройки/);
  assert.doesNotMatch(loadingView, /data-action="applyServerMode"|data-action="saveServerMode"/);
  state.tab = 'serverMode';
  const first = actions.ensureServerModeLoaded();
  const second = actions.ensureServerModeLoaded();
  assert.equal(first, second);
  assert.deepEqual(calls, ['/api/server-mode']);
  const report = { config: { version: 1, enabled: false, xray: [], awg: [] }, preflight: { ok: true } };
  response.resolve(report);
  await first;
  assert.equal(state.serverMode, report);
  assert.notEqual(state.serverModeDraft, report.config);
  assert.equal(renders(), 1);
  state.serverModeDraft.enabled = true;
  state.serverModeDraft.xray.push({ id: 'unsaved', name: 'Мой черновик', clients: [] });
  state.serverModePreflight = { dirty: true };
  const draft = structuredClone(state.serverModeDraft);
  state.tab = 'dashboard';
  state.tab = 'serverMode';
  await actions.ensureServerModeLoaded();
  assert.equal(calls.length, 1);
  assert.deepEqual(state.serverModeDraft, draft);
  assert.deepEqual(state.serverModePreflight, { dirty: true });
  assert.equal(report.config.enabled, false, 'editing the draft does not mutate the fetched report');
});

test('failed initial server-mode loading shows an escaped retry state and can be retried', async () => {
  let calls = 0;
  const { state, actions, view } = fixture(async () => {
    calls++;
    if (calls === 1) throw new Error('API <недоступно>');
    return { config: { enabled: false, xray: [], awg: [] } };
  });
  state.tab = 'serverMode';
  await assert.rejects(actions.ensureServerModeLoaded(), /API/);
  assert.equal(state.serverMode, null);
  assert.equal(state.serverModeDraft, null);
  const failedView = view.serverModePanel();
  assert.match(failedView, /API &lt;недоступно&gt;/);
  assert.match(failedView, /data-action="refreshServerMode"/);
  assert.doesNotMatch(failedView, /data-action="applyServerMode"|data-action="saveServerMode"/);
  await actions.ensureServerModeLoaded();
  assert.equal(calls, 2);
  assert.equal(state.serverModeLoadError, '');
  assert.ok(state.serverModeDraft);
});

test('finishing server-mode loading after leaving the tab does not rerender the other section', async () => {
  const response = deferred();
  const { state, actions, renders } = fixture(() => response.promise);
  state.tab = 'serverMode';
  const first = actions.ensureServerModeLoaded();
  state.tab = 'dashboard';
  response.resolve({ config: { enabled: false, xray: [], awg: [] } });
  await first;
  assert.equal(renders(), 0);
  assert.ok(state.serverModeDraft, 'the completed initial fetch is retained for the next visit');
});
