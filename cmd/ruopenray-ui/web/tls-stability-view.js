import { countryFlagMarkup, serverLocation } from './server-location.js';
import { proxyOptionLabel } from './proxy-label.js';

function sampleTimeline(sample, escapeHtml) {
  const phases = { dns: 'DNS', connect: 'TCP / прокси', tls: 'TLS', headers: 'Ожидание HTTP', body: 'Чтение ответа', complete: 'Готово', request: 'Запрос', target: 'URL' };
  const markers = { dnsDoneMs: 'DNS', connectDoneMs: 'TCP / прокси', tlsDoneMs: 'TLS', firstByteMs: 'Первый байт', completeMs: 'Ответ прочитан' };
  const points = Object.entries(markers).filter(([key]) => Number.isFinite(sample.timings?.[key]))
    .map(([key, title]) => `${title}: ${Math.round(sample.timings[key])} мс`);
  const total = Number.isFinite(sample.latencyMs) ? ` · всего ${Math.round(sample.latencyMs)} мс` : '';
  return `${escapeHtml(phases[sample.phase] || sample.phase || 'Фаза не записана')}${total}${points.length ? ` · ${escapeHtml(points.join(' · '))}` : ''}`;
}

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
    <p class="muted">Запрос без локального прокси может идти через VPN вышестоящего роутера. При SOCKS фаза TLS включает ожидание удалённого туннеля; она сама по себе не указывает, на какой стороне произошёл сбой.</p>
    <button class="btn primary" data-action="runTLSStability" ${state.busyAction || state.tlsStabilityRunning || !selected ? 'disabled' : ''}>${state.tlsStabilityRunning ? 'Проверяю…' : 'Проверить стабильность TLS'}</button>
    ${result?.error ? `<p class="settings-warning">${escapeHtml(result.error)}</p>` : ''}
    ${result?.results ? `<p class="settings-warning ${result.healthy && result.complete ? 'ok' : ''}">${result.complete ? (result.healthy ? 'В этой серии ошибок не обнаружено' : 'В серии обнаружены ошибки') : 'Проверка неполная'} · ${escapeHtml(result.host || '')}</p>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>Маршрут</th><th>TLS</th><th>Успешно</th><th>Ошибки</th></tr></thead><tbody>${result.results.map((row) => {
        const failures = (row.samples || []).filter((sample) => !sample.ok);
        const errors = [...new Set(failures.map((sample) => sample.error || sample.code))].join('; ');
        const limited = (row.samples || []).some((sample) => sample.ok && !sample.bodyComplete);
        const timeline = (row.samples || []).map((sample, index) => `<div>${index + 1}. ${sample.ok ? 'Успех' : 'Ошибка'} · ${sampleTimeline(sample, escapeHtml)}</div>`).join('');
        return `<tr><td>${escapeHtml(variants[row.variant] || row.variant || '')}</td><td>${escapeHtml(row.tls || '—')}</td><td>${Number(row.passed) || 0}/${Number(row.total) || 0}${row.complete ? '' : ' · неполная серия'}</td><td>${escapeHtml(row.error || errors || (limited ? 'Прочитан лимит, ответ проверен частично' : '—'))}${timeline ? `<details><summary>Время и фазы запросов</summary>${timeline}<p class="muted">Отметки времени отсчитываются от начала запроса и не складываются. Завершение фазы может соответствовать ошибке.</p></details>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div><p class="muted">${escapeHtml(result.hint || '')}</p>` : ''}
  </section>`;
}
