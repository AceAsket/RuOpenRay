import { countryFlagMarkup, serverLocation } from './server-location.js';
import { proxyOptionLabel } from './proxy-label.js';

export function tlsStabilityView(state, escapeHtml, outbounds = [], activeTag = '') {
  const selected = state.tlsStabilityTag || activeTag || outbounds[0]?.tag || '';
  const selectedOutbound = outbounds.find((item) => item.tag === selected);
  const location = selectedOutbound ? serverLocation(selectedOutbound, state.serverMeta?.[selected] || {}) : {};
  const result = state.tlsStabilityResult;
  const variants = { direct: 'Прямой запрос с роутера', proxy: 'Выбранный VPN', 'without-fragment': 'VPN без фрагментации' };
  return `<section class="panel tls-stability-panel"><div class="panel-title"><div><h2>Плавающие ошибки HTTPS / TLS</h2><span>Повторные запросы с TLS 1.2 и 1.3 через временные локальные подключения.</span></div></div>
    <div class="form-grid"><label class="field"><span>HTTPS URL</span><input id="tlsStabilityTarget" value="${escapeHtml(state.tlsStabilityTarget || 'https://github.com/')}"></label>
    <label class="field"><span>VPN-выход</span><span class="diagnostic-proxy-select ${location.code ? 'has-flag' : ''}">${location.code ? countryFlagMarkup(location.code) : ''}<select id="tlsStabilityTag" aria-label="VPN-выход">${outbounds.map((item) => `<option value="${escapeHtml(item.tag)}" ${item.tag === selected ? 'selected' : ''}>${escapeHtml(proxyOptionLabel(item, state.serverMeta?.[item.tag] || {}))}</option>`).join('')}</select></span></label>
    <label class="field"><span>Запросов на версию TLS</span><input id="tlsStabilityAttempts" type="number" min="1" max="5" value="${Number(state.tlsStabilityAttempts) || 5}"></label></div>
    <p class="muted">Сертификаты проверяются, читается до 1 МиБ ответа. Если у выхода включена фрагментация, добавляется сравнение без неё. Рабочие настройки и Xray не перезапускаются.</p>
    <button class="btn primary" data-action="runTLSStability" ${state.busyAction || state.tlsStabilityRunning || !selected ? 'disabled' : ''}>${state.tlsStabilityRunning ? 'Проверяю…' : 'Проверить стабильность TLS'}</button>
    ${result?.error ? `<p class="settings-warning">${escapeHtml(result.error)}</p>` : ''}
    ${result?.results ? `<p class="settings-warning ${result.healthy && result.complete ? 'ok' : ''}">${result.complete ? (result.healthy ? 'В этой серии ошибок не обнаружено' : 'В серии обнаружены ошибки') : 'Проверка неполная'} · ${escapeHtml(result.host || '')}</p>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>Маршрут</th><th>TLS</th><th>Успешно</th><th>Ошибки</th></tr></thead><tbody>${result.results.map((row) => {
        const failures = (row.samples || []).filter((sample) => !sample.ok);
        const errors = [...new Set(failures.map((sample) => sample.error || sample.code))].join('; ');
        const limited = (row.samples || []).some((sample) => sample.ok && !sample.bodyComplete);
        return `<tr><td>${escapeHtml(variants[row.variant] || row.variant || '')}</td><td>${escapeHtml(row.tls || '—')}</td><td>${Number(row.passed) || 0}/${Number(row.total) || 0}${row.complete ? '' : ' · неполная серия'}</td><td>${escapeHtml(row.error || errors || (limited ? 'Прочитан лимит, ответ проверен частично' : '—'))}</td></tr>`;
      }).join('')}</tbody></table></div><p class="muted">${escapeHtml(result.hint || '')}</p>` : ''}
  </section>`;
}
