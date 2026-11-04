export const appUpdatePendingStorageKey = 'ruopenray_app_update_pending';

const terminalStates = new Set(['healthy', 'rolled_back', 'interrupted_rollback', 'rollback_failed', 'superseded']);

export function appUpdateResultMessage(result = {}) {
  switch (result.state) {
    case 'healthy': return 'Панель обновлена и прошла проверку готовности.';
    case 'rolled_back': return result.rollbackOK === false
      ? 'Прежний бинарник восстановлен, но готовность панели не подтверждена. Проверьте сервис и журнал обновления.'
      : 'Новая версия не прошла проверку. Восстановлена прежняя панель.';
    case 'interrupted_rollback': return 'Обновление было прервано. При запуске восстановлена прежняя панель.';
    case 'rollback_failed': return 'Автоматический откат не удался. Требуется восстановление панели; резервная копия и журнал сохранены.';
    case 'superseded': return 'Бинарник изменён другой операцией. Автоматический откат отменён; проверьте установленную версию.';
    default: return 'Ожидаю перезапуска панели и окончательной проверки обновления…';
  }
}

export function createAppUpdateMonitor({
  state, request, render,
  canReloadApp = () => false,
  reloadApp = () => globalThis.location?.reload(),
  confirmReload = (message) => globalThis.confirm?.(message) === true,
  storage = globalThis.sessionStorage,
  now = () => Date.now(),
  verificationTimeoutMs = 180000,
  createUpdateId = () => globalThis.crypto?.randomUUID?.() || `update-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (timer) => clearTimeout(timer)
}) {
  let pending = null;
  let timer = null;
  let inFlight = false;

  function load() {
    if (pending) return pending;
    try {
      const saved = JSON.parse(storage?.getItem(appUpdatePendingStorageKey) || 'null');
      if (saved && typeof saved.target === 'string' && saved.target) {
        pending = { ...saved, startedAt: Number.isFinite(saved.startedAt) ? saved.startedAt : now() };
      }
    } catch {}
    return pending;
  }

  function save(value) {
    pending = value;
    try {
      if (value) storage?.setItem(appUpdatePendingStorageKey, JSON.stringify(value));
      else storage?.removeItem(appUpdatePendingStorageKey);
    } catch {}
  }

  function authenticated() {
    return !Object.hasOwn(state, 'token') || Boolean(state.token);
  }

  function enqueue(ms = 2000) {
    if (timer !== null || !pending || !authenticated()) return;
    timer = schedule(() => {
      timer = null;
      return poll();
    }, ms);
  }

  function prepare(target, expectedSHA = '') {
    save({ target, expectedSHA, updateId: createUpdateId(), startedAt: now() });
    state.appUpdating = true;
    state.appReloadRequired = false;
    state.appUpdate = { ok: true, state: 'pending', targetVersion: target };
    return pending;
  }

  function track(result = {}) {
    const item = load();
    if (!item) return;
    save({ ...item, expectedSHA: result.sha256 || result.expectedSHA || item.expectedSHA, updateId: result.updateId || '',
      startedAt: now(), observedPending: Boolean(result.state === 'pending' && result.updateId && result.updateId === item.updateId) });
    state.appUpdating = true;
    state.appUpdate = { ...result, state: 'pending', stdout: appUpdateResultMessage() };
    state.message = state.appUpdate.stdout;
    enqueue();
  }

  function stop() {
    if (timer !== null) cancel(timer);
    timer = null;
    save(null);
    state.appUpdating = false;
  }

  function needsVerification(reason) {
    const message = reason === 'legacy-helper'
      ? 'Восстановитель прежней версии не передал ID операции. Обновление требует ручной проверки: проверьте установленную версию и журнал обновления.'
      : 'За три минуты не удалось подтвердить окончательный результат обновления. Проверьте установленную версию панели и журнал обновления перед повторной попыткой.';
    stop();
    state.appUpdate = { ok: false, state: 'verification_required', verificationReason: reason, stdout: message };
    state.appReloadRequired = false;
    state.message = message;
  }

  function resume() {
    if (!load() || !authenticated()) return;
    state.appUpdating = true;
    if (!terminalStates.has(state.appUpdate?.state)) {
      state.appUpdate = { ok: true, state: 'pending', targetVersion: pending.target, stdout: appUpdateResultMessage() };
    }
    enqueue(0);
  }

  async function poll() {
    if (!load() || inFlight || !authenticated()) return;
    const item = pending;
    const token = state.token;
    const expired = () => now() - item.startedAt >= verificationTimeoutMs;
    inFlight = true;
    let changed = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const result = await request('/api/app/update-status', { signal: controller.signal });
      if (pending !== item || token !== state.token) return;
      // Never mistake the terminal result of an older update for this attempt.
      const matches = item.updateId
        ? result.updateId === item.updateId && (!item.expectedSHA || result.expectedSHA === item.expectedSHA)
        : item.expectedSHA ? result.expectedSHA === item.expectedSHA : result.targetVersion === item.target;
      if (matches && result.expectedSHA && !item.expectedSHA) {
        item.expectedSHA = result.expectedSHA;
        save(item);
      }
      if (matches && item.updateId && result.state === 'pending' && !item.observedPending) {
        item.observedPending = true;
        save(item);
      }
      // Older boot helpers cannot identify the attempt. A matching checksum is
      // only evidence for manual review after this attempt was observed pending.
      if (result.state === 'interrupted_rollback' && !result.updateId) {
        if (item.observedPending && item.expectedSHA && result.expectedSHA === item.expectedSHA) {
          needsVerification('legacy-helper');
          changed = true;
        } else if (expired()) {
          needsVerification('timeout');
          changed = true;
        }
        return;
      }
      if (!matches || !terminalStates.has(result.state)) {
        if (expired()) {
          needsVerification('timeout');
          changed = true;
        }
        return;
      }
      stop();
      state.appUpdate = { ...result, ok: result.state === 'healthy', stdout: appUpdateResultMessage(result) };
      state.message = state.appUpdate.stdout;
      state.appReloadRequired = result.state === 'healthy';
      changed = true;
      if (state.appReloadRequired && canReloadApp()) {
        reloadApp();
      } else if (state.appReloadRequired) {
        state.message += ' Сохраните введённые данные и перезагрузите интерфейс, чтобы загрузить новую версию.';
      }
    } catch {
      if (pending === item && token === state.token && authenticated()) {
        if (expired()) {
          needsVerification('timeout');
          changed = true;
          return;
        }
        const message = 'Связь с панелью восстанавливается. Окончательный результат обновления ещё проверяется.';
        changed = state.message !== message;
        state.message = message;
      }
    } finally {
      clearTimeout(timeout);
      inFlight = false;
      if (changed && token === state.token) render();
      enqueue();
    }
  }

  function reloadUpdatedApp() {
    if (!state.appReloadRequired) return;
    if (!canReloadApp() && !confirmReload('Перезагрузить интерфейс? Несохранённый ввод в формах будет потерян. Сохраните нужные изменения перед перезагрузкой.')) return;
    reloadApp();
  }

  return { prepare, track, stop, resume, reloadUpdatedApp };
}
