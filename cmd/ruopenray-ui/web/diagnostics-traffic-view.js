export function createDiagnosticsTrafficView(deps) {
  const {
    accessLogRows,
    accessLogTable,
    activeProxyTag,
    aggregateLogDomains,
    burstObservatoryConfig,
    burstObservatorySelectors,
    byteRate,
    byteSize,
    checkForTag,
    checkLabel,
    configInbounds,
    deviceRules,
    domainDiagnosticRows,
    domainMonitorDevicesText,
    domainMonitorDomainQuality,
    domainMonitorFilterCounts,
    domainMonitorHost,
    domainMonitorMatchesFilter,
    domainMonitorProtocols,
    domainMonitorRows,
    escapeHtml,
    isIpLiteral,
    logsPanel,
    monitorSourceLabel,
    monitoredDevices,
    monitoredDomains,
    monitoredEvents,
    observatoryConfig,
    observatoryMatchedOutbounds,
    observatoryRequiredBalancers,
    observatorySelectors,
    outboundAddress,
    outboundMatchesSelectors,
    proxyOutbounds,
    sniPanel,
    stat,
    state,
    strategyObserverType,
    trafficMonitor,
    xrayActiveStats,
    xrayStatsPanel,
    xrayStatsTotals,
  } = deps;

function diagnosticsTrafficView() {
  const system = state.status?.system || {};
  const traffic = system.traffic || {};
  const conntrack = system.conntrack || {};
  const xrayStats = state.status?.xrayStats || {};
  const totals = xrayStatsTotals(xrayStats);
  const active = xrayActiveStats(xrayStats);
  const totalConnections = conntrack.ok ? conntrack.total : ((system.tcp?.total || 0) + (conntrack.udp || 0));
  return `
    <section class="traffic-overview-panel">
      <article class="traffic-overview-main">
        <span>Активный сервер Xray</span>
        <strong>${escapeHtml(active?.tag || 'статистика выключена')}</strong>
        <small>${escapeHtml(active ? `прием ${byteRate(active.downRate)} · отдача ${byteRate(active.upRate)}` : 'включите статистику Xray, чтобы видеть трафик по серверам')}</small>
      </article>
      <article>
        <span>Через proxy</span>
        <strong>${escapeHtml(byteRate(xrayStats.groups?.proxy?.downRate))} прием</strong>
        <small>${escapeHtml(`${byteSize(xrayStats.groups?.proxy?.downlink)} принято · ${byteSize(xrayStats.groups?.proxy?.uplink)} отправлено`)}</small>
      </article>
      <article>
        <span>WAN-интерфейс</span>
        <strong>${escapeHtml(traffic.interface || '—')}</strong>
        <small>${escapeHtml(traffic.interface ? `прием ${byteRate(traffic.rxRate)} · отдача ${byteRate(traffic.txRate)}` : 'системный счетчик пока пустой')}</small>
      </article>
      <article>
        <span>Соединения</span>
        <strong>${escapeHtml(totalConnections || totalConnections === 0 ? totalConnections : '—')}</strong>
        <small>${escapeHtml(conntrack.ok ? `${conntrack.tcp || 0} TCP · ${conntrack.udp || 0} UDP` : 'conntrack недоступен')}</small>
      </article>
    </section>
    ${xrayStatsPanel(xrayStats)}
    <section class="panel traffic-system-panel">
      <div class="panel-title">
        <div>
          <h2>Системный трафик интерфейса</h2>
          <span>WAN-график показывает общий трафик выбранного интерфейса. Для VPN смотрите статистику Xray выше.</span>
        </div>
        <span class="traffic-period-pill">Через Xray: ${escapeHtml(byteSize(totals.downlink))} принято · ${escapeHtml(byteSize(totals.uplink))} отправлено</span>
      </div>
      ${trafficMonitor(system)}
    </section>
  `;
}

function clientTrafficTestView() {
  const baseline = state.clientTrafficBaseline;
  const result = state.clientTrafficResult;
  return `
    <section class="panel client-traffic-test">
      <div class="panel-title">
        <div>
          <h2>Клиентский тест трафика</h2>
          <span>Самый честный тест transparent proxy: открыть URL с телефона/ПК в LAN и проверить, выросли ли nft/Xray счетчики.</span>
        </div>
        <div class="split-actions">
          <button class="btn secondary ${state.busyAction === 'startClientTrafficTest' ? 'is-busy' : ''}" type="button" data-action="startClientTrafficTest" ${state.busyAction === 'startClientTrafficTest' ? 'disabled' : ''}>${state.busyAction === 'startClientTrafficTest' ? 'Начинаю...' : 'Начать замер'}</button>
          <button class="btn warning ${state.busyAction === 'finishClientTrafficTest' ? 'is-busy' : ''}" type="button" data-action="finishClientTrafficTest" ${baseline && state.busyAction !== 'finishClientTrafficTest' ? '' : 'disabled'}>${state.busyAction === 'finishClientTrafficTest' ? 'Проверяю...' : 'Проверить после клиента'}</button>
        </div>
      </div>
      <div class="client-test-grid">
        <article>
          <strong>1. Начните замер</strong>
          <span>RuOpenRay запомнит текущие nftables и Xray stats.</span>
        </article>
        <article>
          <strong>2. Откройте с LAN-устройства</strong>
          <code>${escapeHtml(state.clientTrafficUrl)}</code>
        </article>
        <article>
          <strong>3. Проверьте результат</strong>
          <span>${baseline ? `точка отсчета: ${new Date(baseline.at).toLocaleTimeString('ru-RU')}` : 'сначала нажмите “Начать замер”'}</span>
        </article>
      </div>
      <div class="form-row">
        <label>URL для LAN-устройства</label>
        <input id="clientTrafficUrl" value="${escapeHtml(state.clientTrafficUrl)}" placeholder="https://www.gstatic.com/generate_204" />
      </div>
      ${result ? `<div class="setup-result ${result.ok ? 'ok' : 'bad'}">
        <strong>${result.ok ? 'Трафик идет через цепочку' : 'Рост счетчиков не найден'}</strong>
        <span>nft +${byteSize(result.nftDelta)} · Xray stats +${byteSize(result.statsDelta)}${result.statsEnabled ? '' : ' · учет Xray stats выключен'}${result.activeTag ? ` · активный proxy: ${escapeHtml(result.activeTag)}` : ''}</span>
      </div>` : '<p class="muted">Для проверки нужен реальный LAN-клиент. Запрос с самого роутера может идти другим путем и не доказывает работу перехвата.</p>'}
    </section>
  `;
}

function diagnosticsChainView() {
  const result = state.diagnosticsChainResult;
  const steps = result?.steps || [];
  return `
    <section class="panel chain-diagnostics">
      <div class="panel-title">
        <div>
          <h2>Проверка цепочки подключения</h2>
          <span>Проверяет Xray config, LAN DNS, dnsmasq, nftables, policy routing, запрос с роутера и Xray stats.</span>
        </div>
        <button class="btn" type="button" data-action="runConnectivityDiagnostics" ${state.diagnosticsChainRunning ? 'disabled' : ''}>${state.diagnosticsChainRunning ? 'Проверяю...' : 'Проверить цепочку'}</button>
      </div>
      <div class="chain-url-row">
        <div class="form-row">
          <label>URL для проверки с роутера</label>
          <input id="diagnosticsTestUrl" value="${escapeHtml(state.diagnosticsTestUrl)}" placeholder="https://www.gstatic.com/generate_204" />
        </div>
        <p>Запрос выполняет сам роутер. Так видно, растут ли nft-счетчики и статистика Xray после реального исходящего запроса.</p>
      </div>
      <div class="setup-result-list chain-result-list">
        ${steps.length ? steps.map((step) => `<article class="${step.ok ? 'ok' : step.tone === 'warn' ? 'warn' : 'bad'}">
          <span>${step.ok ? '✓' : step.tone === 'warn' ? '!' : '×'}</span>
          <div><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.detail || '')}</small></div>
        </article>`).join('') : '<p class="muted">Нажмите проверку: результат появится здесь по шагам.</p>'}
      </div>
    </section>
    ${clientTrafficTestView()}
  `;
}



  return {
    clientTrafficTestView,
    diagnosticsChainView,
    diagnosticsTrafficView,
  };
}
