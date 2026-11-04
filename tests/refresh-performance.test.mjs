import assert from 'node:assert/strict';
import test from 'node:test';
import { createRefreshTimers, loadAppSnapshot } from '../cmd/ruopenray-ui/web/refresh.js';
import { createRuntimeController } from '../cmd/ruopenray-ui/web/runtime-controller.js';
import { createInitialState } from '../cmd/ruopenray-ui/web/state.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function fakeIntervals(t) {
  const originals = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, document: globalThis.document, window: globalThis.window, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage };
  const callbacks = new Map();
  let next = 0;
  globalThis.setInterval = (callback) => { callbacks.set(++next, callback); return next; };
  globalThis.clearInterval = (id) => callbacks.delete(id);
  globalThis.window = {};
  const data = new Map();
  globalThis.localStorage = globalThis.sessionStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
  const consoleNode = { textContent: 'previous logs' };
  globalThis.document = {
    visibilityState: 'visible',
    querySelector: () => null,
    querySelectorAll: (selector) => selector === '.log-console' ? [consoleNode] : [],
  };
  t.after(() => Object.assign(globalThis, originals));
  return {
    callbacks, consoleNode,
    tick: (id) => { assert.ok(callbacks.has(id), `timer ${id} exists`); return callbacks.get(id)(); },
  };
}

function timerFixture(overrides = {}) {
  const state = { token: 'session-a', tab: 'dashboard', logLive: true, logIntervalSec: 2, ...overrides.state };
  const events = { statuses: [], renders: 0, auth: 0, messages: [], requests: [] };
  const timers = createRefreshTimers({
    state,
    request: async (path) => { events.requests.push(path); return { ok: true }; },
    refreshLogs: async () => {}, refreshDomainMonitor: async () => {},
    recordStatus: (status) => events.statuses.push(status),
    backgroundRender: () => events.renders++,
    clearAuth: () => { events.auth++; state.token = ''; },
    setMessage: (message) => events.messages.push(message),
    ...overrides,
    state,
  });
  return { state, events, timers };
}

function runtimeFixture(request, text) {
  const state = createInitialState();
  Object.assign(state, { token: 'session-a', logFollow: false, logSort: 'desc' });
  const runtime = createRuntimeController({
    state, request, api: { text }, render: () => {}, numberValue: (value) => Number(value || 0),
    activeProxyTag: () => '', proxyOutbounds: () => state.config.outbounds || [],
    setActiveServerTag: (tag) => { state.activeServerTag = tag; }, inferredActiveProxyTag: () => '',
    syncConfig: (config) => { state.config = config; },
    syncLanDnsStatus: () => {}, syncLoggingSettings: () => {}, syncServiceSettings: () => {},
    clearAuth: () => { state.token = ''; },
  });
  return { state, runtime };
}

test('initial snapshot limits router requests to four and retains every endpoint result in its field', async () => {
  const pending = [];
  const calls = [];
  let active = 0, peak = 0;
  function acquire(path, isText = false) {
    const response = deferred();
    calls.push(path);
    active++;
    peak = Math.max(peak, active);
    pending.push(() => response.resolve(isText ? 'router logs' : { path }));
    return response.promise.finally(() => active--);
  }
  let snapshot;
  const loading = loadAppSnapshot({ request: (path) => acquire(path), text: (path) => acquire(path, true), logsUrl: () => '/api/logs?lines=240', appChannel: 'test' }).then((result) => { snapshot = result; });
  await flush();
  assert.equal(active, 4);
  for (let wave = 0; wave < 12 && !snapshot; wave++) {
    pending.splice(0).forEach((release) => release());
    await flush();
    assert.ok(active <= 4, `only four router requests may overlap, got ${active}`);
  }
  await loading;
  const expected = {
    status: '/api/status', profiles: '/api/profiles', config: '/api/config', configDraft: '/api/config/draft',
    leases: '/api/dhcp/leases', releases: '/api/core/releases', appRelease: '/api/app/releases?channel=test',
    geo: '/api/geo/status', domainMonitor: '/api/domain-monitor?limit=1200', logging: '/api/settings/logging',
    serviceSettings: '/api/settings/service', storageReport: '/api/storage/report', tcpFastOpen: '/api/network/tcp-fast-open',
    lanDns: '/api/dns/lan-upstream', firewallStatus: '/api/firewall/status', subscriptions: '/api/subscriptions',
    disabledRoutes: '/api/routing/disabled', routeNames: '/api/routing/names', routePresets: '/api/routing/presets', serverMeta: '/api/server-meta',
  };
  assert.equal(peak, 4);
  assert.equal(calls.length, 21);
  assert.equal(new Set(calls).size, 21);
  assert.equal(snapshot.logs, 'router logs');
  for (const [field, path] of Object.entries(expected)) assert.deepEqual(snapshot[field], { path }, field);
});

test('status polling does not overlap, pauses for hidden pages and full refreshes, then resumes', async (t) => {
  const clock = fakeIntervals(t);
  const response = deferred();
  let calls = 0, refreshing = false;
  const { state, events, timers } = timerFixture({
    request: () => { calls++; return calls === 1 ? response.promise : Promise.resolve({ count: calls }); },
    isRefreshing: () => refreshing,
  });
  timers.configureStatusTimer();
  const timer = state.statusTimer;
  const first = clock.tick(timer);
  await clock.tick(timer);
  assert.equal(calls, 1);
  response.resolve({ count: 1 });
  await first;
  globalThis.document.visibilityState = 'hidden';
  await clock.tick(timer);
  assert.equal(calls, 1);
  globalThis.document.visibilityState = 'visible';
  refreshing = true;
  await clock.tick(timer);
  assert.equal(calls, 1);
  refreshing = false;
  await clock.tick(timer);
  assert.equal(calls, 2);
  assert.deepEqual(events.statuses, [{ count: 1 }, { count: 2 }]);
});

test('reconfigured status polling ignores an old response and stops both timers after authentication fails', async (t) => {
  const clock = fakeIntervals(t);
  const stale = deferred();
  let calls = 0;
  const { state, events, timers } = timerFixture({ request: () => { calls++; return calls === 1 ? stale.promise : Promise.reject(new Error('Требуется авторизация')); } });
  timers.configureStatusTimer();
  const previousTimer = state.statusTimer;
  const oldRequest = clock.tick(previousTimer);
  timers.configureStatusTimer();
  assert.equal(clock.callbacks.has(previousTimer), false);
  const currentTimer = state.statusTimer;
  await clock.tick(currentTimer);
  assert.equal(calls, 1, 'reconfiguration does not launch another request while the old one is running');
  stale.resolve({ stale: true });
  await oldRequest;
  assert.deepEqual(events.statuses, []);
  await clock.tick(currentTimer);
  assert.equal(events.auth, 1);
  assert.equal(state.statusTimer, null);
  assert.equal(state.logTimer, undefined);
  assert.equal(clock.callbacks.size, 0);
});

test('log and domain timers discard stale responses before changing runtime state or the log DOM', async (t) => {
  const clock = fakeIntervals(t);
  const logResult = deferred(), monitorResult = deferred();
  let logCalls = 0, monitorCalls = 0;
  const { state, runtime } = runtimeFixture(
    () => { monitorCalls++; return monitorResult.promise; },
    () => { logCalls++; return logResult.promise; },
  );
  state.tab = 'diagnostics';
  state.diagnosticsView = 'live';
  state.logs = 'current logs';
  runtime.configureLogTimer();
  const oldLogs = clock.tick(state.logTimer);
  await clock.tick(state.logTimer);
  assert.equal(logCalls, 1);
  state.diagnosticsView = 'domains';
  runtime.configureLogTimer();
  logResult.resolve('stale logs');
  await oldLogs;
  assert.equal(state.logs, 'current logs');
  assert.equal(clock.consoleNode.textContent, 'previous logs');
  const currentMonitor = { current: true };
  state.domainMonitor = currentMonitor;
  const oldMonitor = clock.tick(state.logTimer);
  await clock.tick(state.logTimer);
  assert.equal(monitorCalls, 1);
  state.token = 'session-b';
  runtime.configureLogTimer();
  monitorResult.resolve({ stale: true });
  await oldMonitor;
  assert.equal(state.domainMonitor, currentMonitor);
});

test('a response completed after the page becomes hidden is not recorded', async (t) => {
  const clock = fakeIntervals(t);
  const response = deferred();
  const { state, events, timers } = timerFixture({ request: () => response.promise });
  timers.configureStatusTimer();
  const request = clock.tick(state.statusTimer);
  globalThis.document.visibilityState = 'hidden';
  response.resolve({ hidden: true });
  await request;
  assert.deepEqual(events.statuses, []);
  assert.equal(events.renders, 0);
});

test('runtime full refresh blocks its polling requests until the complete snapshot has loaded', async (t) => {
  const clock = fakeIntervals(t);
  const initialStatus = deferred();
  let statusCalls = 0;
  const { state, runtime } = runtimeFixture(async (path) => {
    if (path === '/api/status') {
      statusCalls++;
      return statusCalls === 1 ? initialStatus.promise : { core: {}, service: {} };
    }
    if (path === '/api/config') return { outbounds: [], routing: { rules: [] } };
    if (path === '/api/profiles') return [];
    if (path === '/api/core/releases') return { releases: [] };
    return {};
  }, async () => 'logs');
  runtime.configureStatusTimer();
  const loading = runtime.refresh({ renderAfter: false });
  await flush();
  await clock.tick(state.statusTimer);
  assert.equal(statusCalls, 1, 'polling does not duplicate the full refresh status request');
  initialStatus.resolve({ core: {}, service: {} });
  await loading;
  assert.equal(state.message, '', 'the test snapshot was applied without an unexpected refresh error');
  await clock.tick(state.statusTimer);
  assert.equal(statusCalls, 2, 'polling resumes after the full refresh finishes');
});

function snapshotReply(path, marker = 'current') {
  if (path === '/api/status') return { core: {}, service: {}, marker };
  if (path === '/api/config') return { outbounds: [{ tag: marker, protocol: 'vless' }], routing: { rules: [] } };
  if (path === '/api/profiles') return [{ name: marker }];
  if (path === '/api/core/releases') return { releases: [] };
  return {};
}

test('a slower previous full refresh cannot replace a newer status, config or profiles', async (t) => {
  fakeIntervals(t);
  const oldStatus = deferred();
  let statusCalls = 0;
  const { state, runtime } = runtimeFixture(async (path) => {
    if (path === '/api/status' && ++statusCalls === 1) return oldStatus.promise;
    return snapshotReply(path, 'newer');
  }, async () => 'new logs');
  const old = runtime.refresh({ renderAfter: false });
  await flush();
  await runtime.refresh({ renderAfter: false });
  assert.equal(state.status.marker, 'newer');
  oldStatus.resolve(snapshotReply('/api/status', 'stale'));
  await old;
  assert.equal(state.status.marker, 'newer');
  assert.equal(state.config.outbounds[0].tag, 'newer');
  assert.deepEqual(state.profiles, [{ name: 'newer' }]);
});

test('full refresh responses and errors from a previous login leave the current session untouched', async (t) => {
  fakeIntervals(t);
  for (const fail of [false, true]) {
    const pendingStatus = deferred();
    const { state, runtime } = runtimeFixture((path) => path === '/api/status' ? pendingStatus.promise : Promise.resolve(snapshotReply(path)), async () => 'old logs');
    const previous = state.status;
    const loading = runtime.refresh({ renderAfter: false });
    await flush();
    state.token = 'new-session';
    state.message = 'new session message';
    if (fail) pendingStatus.reject(new Error('Требуется авторизация'));
    else pendingStatus.resolve(snapshotReply('/api/status', 'stale'));
    await loading;
    assert.equal(state.token, 'new-session');
    assert.equal(state.status, previous);
    assert.equal(state.message, 'new session message');
  }
});

test('critical operations can require refresh success and cannot succeed after session replacement', async (t) => {
  fakeIntervals(t);
  const { runtime } = runtimeFixture(async () => { throw new Error('Router unavailable'); }, async () => '');
  await assert.rejects(runtime.refresh({ renderAfter: false, throwOnError: true }), /Router unavailable/);
  const pendingStatus = deferred();
  const fixture = runtimeFixture((path) => path === '/api/status' ? pendingStatus.promise : Promise.resolve(snapshotReply(path)), async () => '');
  const loading = fixture.runtime.refresh({ renderAfter: false, throwOnError: true });
  const rejected = assert.rejects(loading, /Состояние панели изменилось/);
  fixture.state.token = 'another-session';
  pendingStatus.resolve(snapshotReply('/api/status'));
  await rejected;
});

test('manual log filter requests keep the newest result even when replies arrive out of order', async (t) => {
  const clock = fakeIntervals(t);
  const first = deferred(), second = deferred();
  let calls = 0;
  const { state, runtime } = runtimeFixture(async () => ({}), () => ++calls === 1 ? first.promise : second.promise);
  state.logQuery = 'first-filter';
  const old = runtime.refreshLogs(true, true);
  state.logQuery = 'second-filter';
  const current = runtime.refreshLogs(true, true);
  second.resolve('matching second filter');
  await current;
  first.resolve('matching first filter');
  await old;
  assert.equal(state.logs, 'matching second filter');
  assert.equal(clock.consoleNode.textContent, 'matching second filter');
});

test('a log result or failure after a filter/session change is discarded without updating the console', async (t) => {
  const clock = fakeIntervals(t);
  for (const fail of [false, true]) {
    const pending = deferred();
    const { state, runtime } = runtimeFixture(async () => ({}), () => pending.promise);
    state.logs = 'existing';
    const loading = runtime.refreshLogs(true, true);
    state.logQuery = 'new filter';
    if (fail) pending.reject(new Error('old request failed'));
    else pending.resolve('old result');
    await loading;
    assert.equal(state.logs, 'existing');
    assert.equal(clock.consoleNode.textContent, 'previous logs');
  }
});

test('a full refresh cannot replace logs returned by a newer manual request', async (t) => {
  fakeIntervals(t);
  const pendingStatus = deferred();
  let logCalls = 0;
  const { state, runtime } = runtimeFixture((path) => path === '/api/status' ? pendingStatus.promise : Promise.resolve(snapshotReply(path)), async () => ++logCalls === 1 ? 'snapshot logs' : 'manual logs');
  const loading = runtime.refresh({ renderAfter: false });
  await flush();
  await runtime.refreshLogs(false);
  pendingStatus.resolve(snapshotReply('/api/status'));
  await loading;
  assert.equal(state.logs, 'manual logs');
});

test('a status poll started before a full refresh cannot overwrite the refreshed status', async (t) => {
  const clock = fakeIntervals(t);
  const pendingStatus = deferred();
  let calls = 0;
  const { state, runtime } = runtimeFixture(async (path) => {
    if (path === '/api/status' && ++calls === 1) return pendingStatus.promise;
    return snapshotReply(path, 'fresh');
  }, async () => 'logs');
  state.tab = 'dashboard';
  runtime.configureStatusTimer();
  const polling = clock.tick(state.statusTimer);
  await runtime.refresh({ renderAfter: false });
  pendingStatus.resolve(snapshotReply('/api/status', 'old poll'));
  await polling;
  assert.equal(state.status.marker, 'fresh');
});

test('a domain-monitor reply arriving after Pause keeps the visible snapshot unchanged', async (t) => {
  fakeIntervals(t);
  const pending = deferred();
  const { state, runtime } = runtimeFixture(() => pending.promise, async () => '');
  const snapshot = { events: ['before pause'] };
  state.domainMonitor = snapshot;
  const loading = runtime.refreshDomainMonitor(false);
  state.domainMonitorPaused = true;
  pending.resolve({ events: ['after pause'] });
  await loading;
  assert.equal(state.domainMonitor, snapshot);
});
