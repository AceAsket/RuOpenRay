import { createDiagnosticsDomainView } from './diagnostics-domain-view.js';
import { createDiagnosticsObservatoryView } from './diagnostics-observatory-view.js';
import { createDiagnosticsTrafficView } from './diagnostics-traffic-view.js';

export function createDiagnosticsView(deps) {
  const {
    logsPanel,
    sniPanel,
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
    const activeView = views[state.diagnosticsView] ? state.diagnosticsView : 'live';
    return `
      <section class="panel diagnostic-switcher">
        <div class="segmented diagnostics-tabs" aria-label="Режим диагностики">
          ${[
            ['live', 'Live-Xray'],
            ['chain', 'Проверка связи'],
            ['dpi', 'DPI'],
            ['traffic', 'Трафик'],
            ['sni', 'SNI'],
            ['domains', 'Домены']
          ].map(([value, label]) => `<button type="button" class="${activeView === value ? 'active' : ''}" data-diagnostics-view="${value}">${label}</button>`).join('')}
        </div>
        <div class="diagnostic-switcher-actions">
          <span class="status-chip ${checks.length && alive === checks.length ? 'ok' : 'muted'}">Серверы: ${checks.length ? `${alive}/${checks.length}` : 'не проверялись'}</span>
          <a class="btn secondary compact" href="/api/diagnostics/package" download>Скачать диагностику</a>
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
