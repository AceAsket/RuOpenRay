import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createApplyOperationId, watchConfigApplyProgress, configApplyProgressStages } from '../cmd/ruopenray-ui/web/config-apply-progress.js';
import { createConfigActions } from '../cmd/ruopenray-ui/web/config-actions.js';
import { applyStageProgressView, applyStageProgressVisible } from '../cmd/ruopenray-ui/web/apply-progress-view.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };
const ids = ['validation', 'backup', 'write', 'baseline', 'restart', 'readiness', 'health', 'rollback'];
function snapshot(operationId, sequence, stage = 'validation', patch = {}) {
  const current = ids.indexOf(stage);
  return { operationId, sequence, stage, active: true, terminal: false, outcome: '',
    stages: ids.map((id, index) => ({ id, status: index < current ? 'done' : index === current ? 'running' : 'pending' })), ...patch };
}
function scheduler() {
  let serial = 0;
  const jobs = new Map();
  return { jobs, schedule(fn, milliseconds) { const id = ++serial; jobs.set(id, { fn, milliseconds }); return id; }, cancelSchedule(id) { jobs.delete(id); },
    next() { const [id, job] = jobs.entries().next().value; jobs.delete(id); job.fn(); } };
}

test('operation identifiers use crypto UUIDs or random UUID bytes without embedding configuration', () => {
  assert.equal(createApplyOperationId({ randomUUID: () => 'existing-uuid' }), 'existing-uuid');
  assert.equal(createApplyOperationId({ getRandomValues(bytes) { bytes.forEach((_, index) => { bytes[index] = index; }); return bytes; } }), '00010203-0405-4607-8809-0a0b0c0d0e0f');
  assert.match(createApplyOperationId({ randomUUID() { throw new Error('Unavailable'); }, getRandomValues(bytes) { return bytes.fill(1); } }), /^[0-9a-f-]{36}$/);
  assert.throws(() => createApplyOperationId({}), /идентификатор/);
});

test('progress polling is nonoverlapping, ID/sequence bound and stops at a terminal server history', async () => {
  const clock = scheduler();
  const calls = [], observed = [];
  const watcher = watchConfigApplyProgress({ operationId: 'current-id', ...clock, onProgress: (value) => observed.push(value),
    request(path, options) { const reply = deferred(); calls.push({ path, options, reply }); return reply.promise; } });
  assert.equal(calls.length, 1);
  assert.equal(clock.jobs.size, 1, 'only the request deadline exists while the first GET is pending');
  assert.equal([...clock.jobs.values()][0].milliseconds, 4000);
  calls[0].reply.resolve(snapshot('current-id', 1));
  await flush();
  assert.equal(observed.length, 1);
  assert.equal([...clock.jobs.values()][0].milliseconds, 500);
  clock.next();
  calls[1].reply.resolve(snapshot('other-id', 99, 'readiness'));
  await flush();
  assert.equal(observed.length, 1);
  clock.next();
  calls[2].reply.resolve(snapshot('current-id', 0, 'readiness'));
  await flush();
  assert.equal(observed.length, 1);
  clock.next();
  calls[3].reply.resolve(snapshot('current-id', 2, 'readiness'));
  await flush();
  assert.equal(observed.length, 2);
  clock.next();
  calls[4].reply.resolve(snapshot('current-id', 3, 'complete', { active: false, terminal: true, outcome: 'healthy', stages: ids.map((id) => ({ id, status: id === 'rollback' ? 'skipped' : 'done' })) }));
  await flush();
  assert.equal(observed.length, 3);
  assert.equal(clock.jobs.size, 0);
  assert.equal(calls[4].options.signal.aborted, true);
  assert.equal(watcher.observe(snapshot('current-id', 4)), false, 'a terminal history cannot become active again');
  assert.ok(calls.every((call) => call.path === '/api/config/apply-progress?operationId=current-id'));
  watcher.stop();
});

for (const failure of [Object.assign(new Error('Not found'), { status: 404 }), new TypeError('Failed to fetch')]) {
  test(`observational ${failure.message} never fails or retries the apply mutation`, async () => {
    const clock = scheduler();
    const observed = [];
    let count = 0;
    const watcher = watchConfigApplyProgress({ operationId: 'id', ...clock, onProgress: (value) => observed.push(value),
      request: async () => { if (++count === 1) throw failure; return snapshot('id', 1, 'restart'); } });
    await flush();
    assert.equal(clock.jobs.size, 1);
    clock.next();
    await flush();
    assert.equal(observed[0].stage, 'restart');
    watcher.stop();
    assert.equal(clock.jobs.size, 0);
  });
}

test('final POST history supersedes a pending older GET and disposal suppresses late responses', async () => {
  const reply = deferred();
  const observed = [];
  let signal;
  const watcher = watchConfigApplyProgress({ operationId: 'id', request(_path, options) { signal = options.signal; return reply.promise; }, onProgress: (value) => observed.push(value) });
  assert.equal(watcher.observe(snapshot('id', 5, 'complete', { active: false, terminal: true })), true);
  assert.equal(signal.aborted, true);
  watcher.stop();
  reply.resolve(snapshot('id', 3, 'readiness'));
  await flush();
  assert.equal(observed.length, 1);
});

test('session/core/generation invalidation discards a late progress reply', async () => {
  const reply = deferred();
  const clock = scheduler();
  const observed = [];
  let current = true;
  const watcher = watchConfigApplyProgress({ operationId: 'id', ...clock, request: () => reply.promise, isCurrent: () => current, onProgress: (value) => observed.push(value) });
  current = false;
  reply.resolve(snapshot('id', 1, 'restart'));
  await flush();
  assert.deepEqual(observed, []);
  assert.equal(clock.jobs.size, 0);
  watcher.stop();
});

test('an unauthorized progress response ends observation without changing the mutation result', async () => {
  const clock = scheduler();
  let signal;
  watchConfigApplyProgress({ operationId: 'id', ...clock, onProgress() { assert.fail('no progress was returned'); },
    request: async (_path, options) => { signal = options.signal; throw Object.assign(new Error('Unauthorized'), { status: 401 }); } });
  await flush();
  assert.equal(clock.jobs.size, 0);
  assert.equal(signal.aborted, true);
});

test('a hanging GET is aborted at its deadline and the next poll proceeds without waiting for its late response', async () => {
  const clock = scheduler();
  const calls = [], observed = [];
  const watcher = watchConfigApplyProgress({ operationId: 'id', ...clock, onProgress: (value) => observed.push(value),
    request(_path, options) { const reply = deferred(); calls.push({ signal: options.signal, reply }); return reply.promise; } });
  assert.equal(calls.length, 1);
  assert.equal([...clock.jobs.values()][0].milliseconds, 4000);
  clock.next();
  await flush();
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(calls.length, 1, 'the deadline aborts observation rather than retrying the POST');
  assert.equal([...clock.jobs.values()][0].milliseconds, 500);
  clock.next();
  calls[1].reply.resolve(snapshot('id', 2, 'readiness'));
  await flush();
  calls[0].reply.resolve(snapshot('id', 1, 'validation'));
  await flush();
  assert.deepEqual(observed.map(({ sequence }) => sequence), [2]);
  watcher.stop();
  assert.equal(clock.jobs.size, 0);
});

test('disposing a pending observer cancels its GET deadline and schedules no later poll', async () => {
  const clock = scheduler();
  let signal;
  const watcher = watchConfigApplyProgress({ operationId: 'id', ...clock, onProgress() { assert.fail('disposed observer'); },
    request(_path, options) { signal = options.signal; return new Promise(() => {}); } });
  assert.equal(clock.jobs.size, 1);
  watcher.stop();
  await flush();
  assert.equal(signal.aborted, true);
  assert.equal(clock.jobs.size, 0);
});

test('real stage histories drive validation/restart/rollback without claiming success from polling', () => {
  assert.deepEqual(configApplyProgressStages(snapshot('id', 1)).map(({ status }) => status), ['running', 'pending']);
  const checkingHealth = configApplyProgressStages(snapshot('id', 2, 'readiness'));
  assert.deepEqual(checkingHealth.map(({ status }) => status), ['done', 'running']);
  assert.match(checkingHealth[1].label, /Ожидаю запуска/);
  const rollback = snapshot('id', 3, 'rollback');
  rollback.stages.find(({ id }) => id === 'health').status = 'failed';
  assert.equal(configApplyProgressStages(rollback)[1].status, 'running');
  assert.match(configApplyProgressStages(rollback)[1].label, /Восстанавливаю/);
  rollback.terminal = true; rollback.active = false; rollback.stage = 'failed'; rollback.outcome = 'rolled_back';
  rollback.stages.find(({ id }) => id === 'rollback').status = 'done';
  assert.equal(configApplyProgressStages(rollback)[1].status, 'error');
  const complete = snapshot('id', 4, 'complete', { terminal: true, outcome: 'healthy', stages: ids.map((id) => ({ id, status: id === 'rollback' ? 'skipped' : 'done' })) });
  assert.equal(configApplyProgressStages(complete)[1].status, 'running');
  assert.match(configApplyProgressStages(complete)[1].label, /Получаю результат/);
});

function actionFixture(reply) {
  const state = { token: 'session-before', status: { core: { version: 'Xray 26.10.31' } }, jsonDraft: '{"outbounds":[]}', appliedConfigText: '{"old":true}', activeConfigRevision: 'active', serverDraftRevision: 'draft' };
  const calls = [], observed = [];
  let refreshes = 0, minimumWaits = 0;
  const actions = createConfigActions({ state, request(path, options) { calls.push({ path, options }); return reply(path, options); }, render() {},
    refresh: async () => { refreshes += 1; }, keepOperationVisible: async () => { minimumWaits += 1; } });
  return { state, calls, observed, actions, refreshes: () => refreshes, minimumWaits: () => minimumWaits };
}

test('apply observes real progress while POST is pending, accepts final POST history and skips only the requested local refresh', async () => {
  const post = deferred(), poll = deferred();
  const f = actionFixture((path) => path === '/api/config/apply' ? post.promise : poll.promise);
  const applying = f.actions.applyConfig({ onProgress: (value) => f.observed.push(value), refreshAfter: false });
  const operationId = JSON.parse(f.calls[0].options.body).operationId;
  assert.match(operationId, /^[0-9a-f-]{36}$/i);
  assert.equal(f.calls[1].path, `/api/config/apply-progress?operationId=${operationId}`);
  poll.resolve(snapshot(operationId, 1, 'readiness'));
  await flush();
  assert.equal(f.state.configApplying, true);
  assert.equal(f.state.appliedConfigText, '{"old":true}');
  assert.equal(f.observed[0].stage, 'readiness');
  post.resolve({ ok: true, progress: snapshot(operationId, 2, 'complete', { terminal: true }), draft: { exists: false, revision: 'next' } });
  await applying;
  assert.equal(f.observed.length, 2);
  assert.equal(f.refreshes(), 0);
  assert.equal(f.minimumWaits(), 0);
  assert.equal(f.state.configApplying, false);
  assert.equal(f.state.serverDraftRevision, 'next');
  assert.equal(f.calls.filter(({ path }) => path === '/api/config/apply').length, 1);
});

for (const change of ['session', 'core']) {
  test(`a ${change} change prevents the previous apply observer from rendering into the new context`, async () => {
    const post = deferred(), poll = deferred();
    const f = actionFixture((path) => path === '/api/config/apply' ? post.promise : poll.promise);
    const applying = f.actions.applyConfig({ onProgress: (value) => f.observed.push(value), refreshAfter: false });
    const operationId = JSON.parse(f.calls[0].options.body).operationId;
    if (change === 'session') f.state.token = 'session-after'; else f.state.status.core.version = 'Xray 26.11.4';
    poll.resolve(snapshot(operationId, 1, 'restart'));
    await flush();
    post.resolve({ ok: true, progress: snapshot(operationId, 2, 'complete', { terminal: true }) });
    await applying;
    assert.deepEqual(f.observed, []);
    assert.equal(f.state.configApplying, false);
  });
}

test('direct callers retain the previous refresh behavior and do not poll or alter their request contract', async () => {
  const f = actionFixture(async () => ({ ok: true }));
  await f.actions.applyConfig();
  assert.equal(f.refreshes(), 1);
  assert.equal(f.minimumWaits(), 1);
  assert.deepEqual(f.calls.map(({ path }) => path), ['/api/config/apply']);
  assert.equal(JSON.parse(f.calls[0].options.body).operationId, undefined);
});

test('a lost POST response disposes its pending observer without retrying or accepting the submitted draft', async () => {
  const post = deferred(), poll = deferred();
  const f = actionFixture((path) => path === '/api/config/apply' ? post.promise : poll.promise);
  const before = f.state.jsonDraft;
  const applying = f.actions.applyConfig({ onProgress: (value) => f.observed.push(value), refreshAfter: false });
  post.reject(new TypeError('Failed to fetch'));
  await assert.rejects(applying, /Не получен результат применения/);
  assert.equal(f.calls[1].options.signal.aborted, true);
  poll.resolve(snapshot(JSON.parse(f.calls[0].options.body).operationId, 5, 'complete', { terminal: true }));
  await flush();
  assert.deepEqual(f.observed, []);
  assert.equal(f.state.jsonDraft, before);
  assert.equal(f.state.appliedConfigText, '{"old":true}');
  assert.equal(f.calls.filter(({ path }) => path === '/api/config/apply').length, 1);
});

test('a new apply generation cannot receive old progress or have its observer stopped by an old finally', async () => {
  const posts = [], polls = [];
  const f = actionFixture((path, options) => {
    const reply = deferred();
    (path === '/api/config/apply' ? posts : polls).push({ reply, options });
    return reply.promise;
  });
  const first = f.actions.applyConfig({ onProgress: (value) => f.observed.push({ owner: 'old', value }), refreshAfter: false });
  const second = f.actions.applyConfig({ onProgress: (value) => f.observed.push({ owner: 'new', value }), refreshAfter: false });
  const firstId = JSON.parse(posts[0].options.body).operationId;
  const secondId = JSON.parse(posts[1].options.body).operationId;
  assert.notEqual(firstId, secondId);
  assert.equal(polls[0].options.signal.aborted, true);
  posts[0].reply.resolve({ ok: true, progress: snapshot(firstId, 5, 'complete', { terminal: true }) });
  await first;
  assert.equal(polls[1].options.signal.aborted, false);
  polls[0].reply.resolve(snapshot(firstId, 3, 'restart'));
  polls[1].reply.resolve(snapshot(secondId, 1, 'readiness'));
  await flush();
  assert.deepEqual(f.observed.map(({ owner }) => owner), ['new']);
  posts[1].reply.resolve({ ok: true, progress: snapshot(secondId, 2, 'complete', { terminal: true }) });
  await second;
  assert.deepEqual(f.observed.map(({ owner }) => owner), ['new', 'new']);
});

const appSource = readFileSync(new URL('../cmd/ruopenray-ui/web/app.js', import.meta.url), 'utf8');
const pipelineSource = appSource.slice(appSource.indexOf('async function applyConfigAndFirewall() {'), appSource.indexOf('async function discardPendingChanges() {'));
const createPipeline = new Function('state', 'configHasUnappliedChanges', 'firewallHasUnappliedChanges', 'render', 'applyConfig', 'applyFirewall', 'refresh', 'firewallReadyStatus', 'configApplyProgressStages', `${pipelineSource}\nreturn applyConfigAndFirewall;`);
function pipelineFixture({ firewall = true, config = true } = {}) {
  const state = { jsonDraft: 'submitted-draft', applySteps: [], firewallStatus: { ready: true } };
  const post = deferred(), firewallReply = deferred(), refreshed = deferred();
  const calls = [];
  let options;
  const apply = createPipeline(state, () => config, () => firewall, () => {},
    (value) => { options = value; calls.push('xray'); return post.promise; },
    async () => { calls.push('firewall'); const result = await firewallReply.promise; state.busyAction = ''; return result; },
    () => { calls.push('refresh'); return refreshed.promise; }, (status) => status?.ready === true, configApplyProgressStages);
  return { state, apply, post, firewallReply, refreshed, calls, options: () => options };
}

test('the actual Apply pipeline advances from server validation to restart, firewall and an awaited refresh', async () => {
  const f = pipelineFixture();
  const applying = f.apply();
  assert.equal(f.options().refreshAfter, false);
  f.options().onProgress(snapshot('id', 1, 'readiness'));
  assert.deepEqual(f.state.applySteps.map(({ status }) => status), ['done', 'running', 'pending', 'pending']);
  assert.match(applyStageProgressView(f.state.applySteps, escapeHtml), /Ожидаю запуска Xray/);
  f.options().onProgress(snapshot('id', 2, 'complete', { terminal: true, outcome: 'healthy', stages: ids.map((id) => ({ id, status: id === 'rollback' ? 'skipped' : 'done' })) }));
  assert.deepEqual(f.calls, ['xray'], 'a terminal GET cannot start firewall before the POST result');
  assert.equal(f.state.applySteps[1].status, 'running');
  f.post.resolve({ ok: true });
  await flush();
  assert.deepEqual(f.state.applySteps.map(({ status }) => status), ['done', 'done', 'running', 'pending']);
  f.firewallReply.resolve({ ok: true, status: { ready: true } });
  await flush();
  assert.deepEqual(f.state.applySteps.map(({ status }) => status), ['done', 'done', 'done', 'running']);
  assert.equal(applyStageProgressVisible(f.state), true, 'the aggregator retains the rail after the nested firewall action releases its busy flag');
  assert.deepEqual(f.calls, ['xray', 'firewall', 'refresh']);
  f.refreshed.resolve();
  await applying;
  assert.ok(f.state.applySteps.every(({ status }) => status === 'done'));
});

for (const result of [{ ok: false, error: 'Firewall rejected' }, { ok: true, status: { ready: false }, error: 'Firewall not ready' }, { ok: false, needsConfirmation: true }]) {
  test(`firewall ${result.needsConfirmation ? 'confirmation' : result.error} cannot complete the stage or start refresh`, async () => {
    const f = pipelineFixture({ config: false });
    const applying = f.apply();
    f.firewallReply.resolve(result);
    if (result.needsConfirmation) await applying;
    else await assert.rejects(applying, /Firewall/);
    assert.equal(f.state.applySteps[0].status, result.needsConfirmation ? 'pending' : 'error');
    assert.equal(f.state.applySteps[1].status, 'pending');
    assert.deepEqual(f.calls, ['firewall']);
  });
}

test('a reported rollback failure stays on Xray and never marks the waiting firewall as failed', async () => {
  const f = pipelineFixture();
  const applying = f.apply();
  const failed = snapshot('id', 2, 'failed', { terminal: true, outcome: 'rolled_back' });
  failed.stages = ids.map((id) => ({ id, status: id === 'health' ? 'failed' : id === 'rollback' || id === 'validation' ? 'done' : 'skipped' }));
  f.options().onProgress(failed);
  f.post.reject(Object.assign(new Error('Xray failed'), { payload: { test: { ok: true } } }));
  await assert.rejects(applying, /Xray failed/);
  assert.deepEqual(f.state.applySteps.map(({ status }) => status), ['done', 'error', 'pending', 'pending']);
  assert.deepEqual(f.calls, ['xray']);
});

test('a refresh failure is attached to the actual refresh stage after confirmed Xray success', async () => {
  const f = pipelineFixture({ firewall: false });
  const applying = f.apply();
  f.post.resolve({ ok: true });
  await flush();
  f.refreshed.reject(new Error('Refresh failed'));
  await assert.rejects(applying, /Refresh failed/);
  assert.deepEqual(f.state.applySteps.map(({ status }) => status), ['done', 'done', 'error']);
});
