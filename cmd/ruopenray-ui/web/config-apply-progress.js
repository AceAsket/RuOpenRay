const serverStageLabels = {
  validation: 'Проверяю конфигурацию Xray',
  backup: 'Создаю резервную копию конфигурации',
  write: 'Записываю конфигурацию Xray',
  baseline: 'Проверяю исходное состояние Xray',
  restart: 'Перезапускаю Xray',
  readiness: 'Ожидаю запуска Xray',
  health: 'Проверяю работу Xray',
  rollback: 'Восстанавливаю предыдущую конфигурацию Xray'
};

export function createApplyOperationId(crypto = globalThis.crypto) {
  if (typeof crypto?.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch { /* getRandomValues also works in HTTP-only browser contexts */ }
  }
  if (typeof crypto?.getRandomValues !== 'function') throw new Error('Браузер не смог создать идентификатор применения. Обновите страницу и повторите попытку.');
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Observing progress never retries the mutation or changes its result.
export function watchConfigApplyProgress({ operationId, request, onProgress, isCurrent = () => true,
  interval = 500, requestTimeout = 4000, schedule = setTimeout, cancelSchedule = clearTimeout }) {
  let stopped = false;
  let terminal = false;
  let sequence = -1;
  let timer = null;
  let activeRequest = null;
  const current = () => !stopped && isCurrent();
  const abortRequest = () => {
    if (!activeRequest) return;
    if (activeRequest.deadline !== null) cancelSchedule(activeRequest.deadline);
    activeRequest.deadline = null;
    activeRequest.controller.abort();
  };
  const stop = () => {
    stopped = true;
    if (timer !== null) cancelSchedule(timer);
    timer = null;
    abortRequest();
  };
  const observe = (snapshot) => {
    if (!current() || snapshot?.operationId !== operationId || !Number.isSafeInteger(snapshot.sequence)
      || snapshot.sequence <= sequence || !Array.isArray(snapshot.stages) || (terminal && snapshot.terminal !== true)) return false;
    sequence = snapshot.sequence;
    terminal = snapshot.terminal === true;
    if (terminal) {
      if (timer !== null) cancelSchedule(timer);
      timer = null;
      abortRequest();
    }
    // A renderer failure must not turn a confirmed server apply into a retry.
    try { onProgress(snapshot); } catch { /* the final result owns operation errors */ }
    return true;
  };
  const poll = async () => {
    timer = null;
    if (!current() || terminal) return;
    const pending = { controller: new AbortController(), deadline: null };
    activeRequest = pending;
    let onAbort;
    const aborted = new Promise((_resolve, reject) => {
      onAbort = () => reject(Object.assign(new Error('Progress observation aborted'), { name: 'AbortError' }));
      pending.controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    pending.deadline = schedule(() => pending.controller.abort(), requestTimeout);
    try {
      const snapshot = await Promise.race([
        request(`/api/config/apply-progress?operationId=${encodeURIComponent(operationId)}`, { signal: pending.controller.signal }),
        aborted
      ]);
      observe(snapshot);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) stop();
      // A first 404 can precede POST registration; transport failures also do
      // not establish that the server-side operation has failed.
    } finally {
      if (pending.deadline !== null) cancelSchedule(pending.deadline);
      pending.controller.signal.removeEventListener('abort', onAbort);
      if (activeRequest === pending) activeRequest = null;
    }
    if (current() && !terminal) timer = schedule(poll, interval);
  };
  void poll();
  return { observe, stop };
}

export function configApplyProgressStages(snapshot) {
  const stages = Array.isArray(snapshot?.stages) ? snapshot.stages : [];
  const validation = stages.find((stage) => stage?.id === 'validation');
  const failed = stages.find((stage) => stage?.status === 'failed');
  const terminalFailure = snapshot?.terminal === true && (snapshot.stage === 'failed' || Boolean(failed));
  const checking = validation?.status !== 'done';
  const checkStatus = validation?.status === 'done' ? 'done'
    : terminalFailure ? 'error' : 'running';
  const applyStarted = stages.some((stage) => stage?.id !== 'validation' && ['running', 'done', 'failed'].includes(stage?.status));
  let applyStatus = applyStarted ? 'running' : 'pending';
  let applyLabel = serverStageLabels[snapshot?.stage] || 'Применяю конфигурацию Xray';
  if (terminalFailure && !checking) {
    applyStatus = 'error';
    applyLabel = `${serverStageLabels[failed?.id] || 'Применение Xray'}: ошибка`;
  } else if (snapshot?.terminal === true && !terminalFailure && !checking) {
    // Completion in a GET is observational. Only the POST response authorizes
    // accepting the revision and continuing with firewall changes.
    applyStatus = 'running';
    applyLabel = 'Получаю результат применения Xray';
  }
  return [
    { id: 'check-xray', status: checkStatus, label: checkStatus === 'done' ? 'Черновик Xray проверен' : checkStatus === 'error' ? 'Проверка Xray: ошибка' : serverStageLabels.validation },
    { id: 'apply-xray', status: applyStatus, label: applyLabel }
  ];
}
