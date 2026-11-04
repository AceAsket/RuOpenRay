import { setupSelectionSignature, setupTrafficTarget, validateSetupSnapshot } from './setup-model.js';

export function createSetupActions({
  state,
  request,
  render,
  refresh,
  syncLanDnsStatus,
  lanDnsModeLabel,
  setupReadiness,
  loadSetupSnapshot,
  restoreSetupSnapshot,
  persistSetupSnapshot,
  captureSetupSnapshot,
  clearSetupSnapshot,
  lanDnsRestorePayload,
  setupFallbackModeFromConfig,
  prepareSetupDraft,
  applyFirewallWithRetry,
  firewallReadyStatus
}) {
  let installPlanFlight = null;

  function fetchInstallPlan() {
    if (!installPlanFlight) {
      installPlanFlight = request('/api/install/plan').then((plan) => {
        state.installPlan = plan;
        if (state.tab === 'setup' || state.installWizardOpen) render();
        return plan;
      }).finally(() => { installPlanFlight = null; });
    }
    return installPlanFlight;
  }

  async function openInstallWizard() {
    state.coreDialogOpen = false;
    state.installWizardOpen = true;
    state.installStep = 'plan';
    state.message = '';
    render();
    try {
      await fetchInstallPlan();
    } catch (error) {
      state.installPlan = { ok: false, error: error.message, steps: [] };
    }
    render();
  }

  async function openSetupWizard() {
    if (state.setupApplying || state.setupRollbacking) {
      state.setupWizardOpen = false;
      state.tab = 'setup';
      render();
      return;
    }
    if (!['tproxy', 'redirect'].includes(state.firewallRouterMode) && ['tproxy', 'redirect'].includes(state.firewallStatus?.routerMode)) {
      state.firewallRouterMode = state.firewallStatus.routerMode;
    }
    state.setupWizardOpen = false;
    state.tab = 'setup';
    if (!['connection', 'scenarios', 'launch'].includes(state.setupStep)) state.setupStep = 'connection';
    if (!['direct', 'proxy'].includes(state.setupFallbackMode)) {
      state.setupFallbackMode = typeof setupFallbackModeFromConfig === 'function' ? setupFallbackModeFromConfig() : 'direct';
    }
    state.setupStepNotice = null;
    state.message = '';
    try {
      await restoreSetupSnapshot();
    } catch (error) {
      state.message = error.message;
    }
    if (!state.installPlan) {
      fetchInstallPlan().catch(() => {});
    }
    render();
  }

  function setupPrepareDraft() {
    if (state.setupApplying || state.setupRollbacking) return;
    prepareSetupDraft();
    state.setupStepNotice = {
      step: state.setupStep || 'routing',
      level: 'ok',
      title: 'Черновик подготовлен',
      detail: 'Служебные входящие потоки, DNS и базовые правила добавлены в черновик. Перед применением мастер еще раз проверит конфигурацию.'
    };
    render();
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForLanDnsReadiness({ mode = state.setupLanDnsMode, ensureCurrent = () => {} } = {}) {
    let latest = state.lanDnsStatus;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      ensureCurrent();
      latest = await request('/api/dns/lan-upstream').catch(() => latest);
      ensureCurrent();
      if (latest) syncLanDnsStatus(latest);
      if (mode !== 'xray' || latest?.readiness?.ready) return latest;
      await delay(1000);
    }
    return latest;
  }

  async function runSetupWizard() {
    if (state.setupApplying || state.setupRollbacking) return;
    const expectedConfigRevision = state.activeConfigRevision || '';
    const expectedDraftRevision = state.serverDraftRevision || '';
    const token = state.token;
    const dns = { mode: state.setupLanDnsMode, upstream: state.setupLanDnsUpstream, restart: state.setupRestartDnsmasq };
    let selection;
    const ensureCurrent = () => {
      if (state.token !== token) throw new Error('Сессия изменилась. Запустите мастер заново.');
      if (state.activeConfigConflict) throw new Error('Действующая конфигурация изменилась. Обновите состояние перед повторным запуском.');
      if (selection !== setupSelectionSignature(state)) throw new Error('Настройки изменились во время запуска. Проверьте черновик и повторите запуск.');
    };
    const readiness = setupReadiness();
    if (!readiness.canApply) {
      state.setupResult = { ok: false, steps: [{ ok: false, title: 'Не хватает основы', detail: 'Сначала установите Xray и добавьте хотя бы один proxy-сервер.' }] };
      render();
      return;
    }
    if (state.setupFallbackMode !== 'proxy' && readiness.proxyRuleCount < 1) {
      state.setupResult = { ok: false, steps: [{ ok: false, title: 'Не выбраны сценарии', detail: 'Выберите готовый сценарий, добавьте своё правило или направьте весь интернет через подключение.' }] };
      state.setupStep = 'scenarios';
      render();
      return;
    }
    state.setupApplying = true;
    state.setupStepNotice = null;
    state.setupRollbackResult = null;
    state.setupResult = { ok: false, phase: 'running', steps: [] };
    render();
    const steps = [];
    const pushStep = (ok, title, detail = '') => {
      steps.push({ ok, title, detail });
      state.setupResult = { ok: false, phase: 'running', steps };
      render();
    };
    try {
      selection = setupSelectionSignature(state);
      const snapshot = await captureSetupSnapshot();
      ensureCurrent();
      validateSetupSnapshot(snapshot);
      if (dns.mode !== 'keep') lanDnsRestorePayload(snapshot.lanDns);
      pushStep(true, 'Точка восстановления', snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString('ru-RU') : '');

      prepareSetupDraft({ message: false, persist: false });
      const config = JSON.parse(state.jsonDraft);
      let signature = setupSelectionSignature(state);
      const choiceSignature = setupSelectionSignature({ ...state, config: null, jsonDraft: '' });
      selection = signature;
      const test = await request('/api/config/test', { method: 'POST', body: JSON.stringify({ config }) });
      ensureCurrent();
      pushStep(Boolean(test.ok), 'Проверка настроек', test.stdout || test.stderr || '');
      if (!test.ok) throw new Error(test.stderr || 'Конфигурация Xray не прошла проверку');

      snapshot.recoveryPending = true;
      await persistSetupSnapshot(snapshot);
      ensureCurrent();
      const apply = await request('/api/config/apply', { method: 'POST', body: JSON.stringify({ config, expectedConfigRevision, expectedDraftRevision }) });
      if (state.token !== token) throw new Error('Сессия изменилась. Запустите мастер заново.');
      pushStep(Boolean(apply.ok), 'Запуск подключения', apply.restart?.stdout || apply.test?.stdout || '');
      if (!apply.ok) throw new Error(apply.restart?.stderr || apply.test?.stderr || 'Не удалось применить конфигурацию Xray');
      const health = apply.restart?.health;
      const target = setupTrafficTarget(state, config);
      const connectionVerified = target?.kind === 'outbound' && health?.state === 'healthy'
        && health.after?.checks?.[`vpn:${target.tag}`]?.ok === true;
      const appliedRevision = apply.draft?.activeRevision;
      if (typeof appliedRevision === 'string') state.activeConfigRevision = appliedRevision;
      ensureCurrent();

      if (dns.mode !== 'keep') {
        const readiness = await waitForLanDnsReadiness({ mode: dns.mode, ensureCurrent });
        if (dns.mode === 'xray' && !readiness?.readiness?.ready) {
          pushStep(false, 'LAN DNS / dnsmasq', 'DNS inbound Xray еще не слушает 127.0.0.1:10535. Повторите после перезапуска Xray.');
          throw new Error('DNS inbound Xray еще не готов');
        }
        snapshot.dnsMutationAttempted = true;
        await persistSetupSnapshot(snapshot);
        ensureCurrent();
        const lanDns = await request('/api/dns/lan-upstream', {
          method: 'POST',
          body: JSON.stringify(dns)
        });
        ensureCurrent();
        syncLanDnsStatus(lanDns);
        const lanDnsOk = lanDns.ok === true;
        pushStep(lanDnsOk, 'Настройка DNS', lanDns.mode ? lanDnsModeLabel(lanDns.mode) : (lanDns.error || ''));
        if (!lanDnsOk) throw new Error(lanDns.error || 'Не удалось настроить LAN DNS');
      } else {
        pushStep(true, 'Настройка DNS', 'Оставлен текущий режим OpenWrt.');
      }

      ensureCurrent();
      const firewall = await applyFirewallWithRetry(3, { beforeAttempt: ensureCurrent });
      ensureCurrent();
      state.firewallStatus = firewall.status || state.firewallStatus || firewall;
      const firewallOk = Boolean(firewall.ok && firewallReadyStatus(state.firewallStatus));
      const firewallDetail = firewall.needsConfirmation
        ? (firewall.error || 'Найдены сторонние правила B4/NFQUEUE. Примените перехват вручную и подтвердите совместимость.')
        : (state.firewallStatus?.routerMode || firewall.status?.routerMode || state.firewallRouterMode);
      pushStep(firewallOk, 'Маршрутизация устройств', firewallDetail);
      if (!firewallOk) throw new Error(firewall.needsConfirmation ? firewallDetail : (firewall.error || 'Не удалось включить перехват'));

      state.message = 'Активный режим RuOpenRay включен';
      await refresh({ renderAfter: false, throwOnError: true });
      if (appliedRevision && appliedRevision !== state.activeConfigRevision) throw new Error('Действующая конфигурация изменилась после применения. Проверьте текущее состояние.');
      if (appliedRevision && !state.activeConfigConflict && !state.serverDraftConflict
        && choiceSignature === setupSelectionSignature({ ...state, config: null, jsonDraft: '' })
        && state.appliedConfigText) {
        const normalized = JSON.parse(state.appliedConfigText);
        const normalizedSignature = setupSelectionSignature({ ...state, config: normalized, jsonDraft: state.appliedConfigText });
        const currentSignature = setupSelectionSignature(state);
        if (currentSignature === selection || currentSignature === normalizedSignature) {
          state.config = normalized;
          state.jsonDraft = state.appliedConfigText;
          signature = selection = setupSelectionSignature(state);
        }
      }
      ensureCurrent();
      snapshot.recoveryPending = false;
      await persistSetupSnapshot(snapshot);
      ensureCurrent();
      state.setupResult = { ok: true, phase: 'complete', signature, steps, connectionVerified };
      if (!connectionVerified) state.message = 'Настройки применены. Работоспособность подключения ещё не подтверждена; запустите проверку соединения.';
    } catch (error) {
      if (state.token === token) {
        state.setupResult = { ok: false, phase: 'error', steps, error: error.message };
        state.message = error.message;
      } else state.setupResult = null;
    } finally {
      state.setupApplying = false;
      render();
    }
  }

  async function rollbackSetupWizard() {
    if (state.setupApplying || state.setupRollbacking) return;
    const expectedConfigRevision = state.activeConfigRevision || '';
    const token = state.token;
    const ensureCurrent = () => { if (state.token !== token) throw new Error('Сессия изменилась. Повторите откат после входа.'); };
    state.setupRollbacking = true;
    state.setupResult = null;
    state.setupRollbackResult = { ok: false, phase: 'running', steps: [] };
    render();
    const steps = [];
    const pushStep = (ok, title, detail = '') => {
      steps.push({ ok, title, detail });
      state.setupRollbackResult = { ok: false, phase: 'running', steps };
      render();
    };
    try {
      const snapshot = await restoreSetupSnapshot();
      ensureCurrent();
      if (!snapshot?.config) throw new Error('Нет сохранённой точки отката мастера.');
      validateSetupSnapshot(snapshot);
      const restoreDns = snapshot.dnsMutationAttempted !== false;
      const dnsPayload = restoreDns ? lanDnsRestorePayload(snapshot.lanDns) : null;
      const configTest = await request('/api/config/test', { method: 'POST', body: JSON.stringify({ config: snapshot.config }) });
      ensureCurrent();
      pushStep(Boolean(configTest.ok), 'Проверка прежней конфигурации Xray', configTest.stdout || configTest.stderr || '');
      if (!configTest.ok) throw new Error(configTest.stderr || 'Прежняя конфигурация Xray не прошла проверку');

      const configApply = await request('/api/config/apply', { method: 'POST', body: JSON.stringify({ config: snapshot.config, expectedConfigRevision }) });
      ensureCurrent();
      pushStep(Boolean(configApply.ok), 'Возврат конфигурации Xray', configApply.restart?.stdout || configApply.test?.stdout || '');
      if (!configApply.ok) throw new Error(configApply.restart?.stderr || configApply.test?.stderr || 'Не удалось вернуть конфигурацию Xray');
      if (typeof configApply.draft?.activeRevision === 'string') state.activeConfigRevision = configApply.draft.activeRevision;

      if (restoreDns) {
        const lan = await request('/api/dns/lan-upstream', { method: 'POST', body: JSON.stringify(dnsPayload) });
        ensureCurrent();
        syncLanDnsStatus(lan);
        pushStep(Boolean(lan.ok), 'Возврат LAN DNS', lan.mode ? lanDnsModeLabel(lan.mode) : (lan.error || ''));
        if (!lan.ok) throw new Error(lan.error || 'Не удалось вернуть LAN DNS');
      } else {
        pushStep(true, 'Возврат LAN DNS', 'Мастер не менял LAN DNS, текущие настройки сохранены.');
      }

      const firewall = await request('/api/firewall/restore', { method: 'POST', body: JSON.stringify({ snapshot: snapshot.firewall || {} }) });
      ensureCurrent();
      state.firewallStatus = firewall.status || firewall;
      pushStep(Boolean(firewall.ok), 'Возврат nftables', state.firewallStatus?.routerMode || '');
      if (!firewall.ok) throw new Error(firewall.error || 'Не удалось вернуть nftables');

      state.message = 'Откат мастера выполнен';
      await refresh({ renderAfter: false, throwOnError: true });
      ensureCurrent();
      await clearSetupSnapshot({ force: true });
      state.setupRollbackResult = { ok: true, phase: 'complete', steps };
    } catch (error) {
      if (state.token === token) {
        state.setupRollbackResult = { ok: false, phase: 'error', steps, error: error.message };
        state.message = error.message;
      } else state.setupRollbackResult = null;
    } finally {
      state.setupRollbacking = false;
      render();
    }
  }


  return {
    openInstallWizard,
    openSetupWizard,
    setupPrepareDraft,
    waitForLanDnsReadiness,
    runSetupWizard,
    rollbackSetupWizard
  };
}
