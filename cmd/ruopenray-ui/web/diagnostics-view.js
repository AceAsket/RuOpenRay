import { createDiagnosticsDomainView } from './diagnostics-domain-view.js';
import { createDiagnosticsObservatoryView } from './diagnostics-observatory-view.js';
import { createDiagnosticsTrafficView } from './diagnostics-traffic-view.js';

export function createDiagnosticsView(deps) {
  const {
    deviceRules,
    domainDiagnosticRows,
    logsPanel,
    sniPanel,
    stat,
    state
  } = deps;

  const { diagnosticsDomainMonitorView } = createDiagnosticsDomainView(deps);
  const {
    clientTrafficTestView,
    diagnosticsChainView,
    diagnosticsDpiView,
    diagnosticsTrafficView
  } = createDiagnosticsTrafficView(deps);
  const { observatoryPanel } = createDiagnosticsObservatoryView(deps);

  function diagnosticsLiveView() {
    return logsPanel(false);
  }

  function diagnosticsPanel() {
    const checks = Object.values(state.serverChecks);
    const alive = checks.filter((item) => item?.ok).length;
    const views = {
      live: diagnosticsLiveView,
      chain: diagnosticsChainView,
      dpi: diagnosticsDpiView,
      traffic: diagnosticsTrafficView,
      sni: sniPanel,
      domains: diagnosticsDomainMonitorView
    };
    const activeView = views[state.diagnosticsView] ? state.diagnosticsView : 'chain';
    return `
      <section class="diagnostics-overview">
        <div class="diagnostics-overview-copy">
          <span>Центр диагностики</span>
          <h2>Проверка работы RuOpenRay</h2>
          <p>Начните с общей проверки подключения. DPI, трафик, домены и журнал нужны для точечного поиска проблемы.</p>
        </div>
        <div class="diagnostics-overview-actions">
          <div class="diagnostics-server-health ${checks.length && alive === checks.length ? 'ok' : checks.length ? 'warn' : ''}">
            <strong>${checks.length ? `${alive}/${checks.length}` : '—'}</strong>
            <span>${checks.length ? 'серверов доступны' : 'серверы не проверялись'}</span>
          </div>
          <a class="btn secondary" href="/api/diagnostics/package" download>Скачать отчёт</a>
        </div>
      </section>

      <section class="panel diagnostic-switcher">
        <div class="segmented diagnostics-tabs" aria-label="Режим диагностики">
          ${[
            ['chain', 'Проверка'],
            ['dpi', 'DPI'],
            ['traffic', 'Трафик'],
            ['domains', 'Домены'],
            ['sni', 'SNI'],
            ['live', 'Журнал Xray']
          ].map(([value, label]) => `<button type="button" class="${activeView === value ? 'active' : ''}" data-diagnostics-view="${value}">${label}</button>`).join('')}
        </div>
      </section>

      ${views[activeView]()}
    `;
  }

  return {
    clientTrafficTestView,
    diagnosticsChainView,
    diagnosticsPanel,
    observatoryPanel
  };
}
