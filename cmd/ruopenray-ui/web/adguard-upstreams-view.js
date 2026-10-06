export function dohUrlKey(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname.toLowerCase()}:${url.port || '443'}${url.pathname}${url.search}`;
  } catch { return value; }
}

export function adguardUpstreamText(state) {
  return state.adguardUpstreamDraft ?? (state.adguardStatus?.upstreams || []).join('\n');
}

export function adguardUpstreamList(state) {
  return adguardUpstreamText(state).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

export function adguardUpstreamsSection(state, escapeHtml) {
  const status = state.adguardStatus || {};
  const busy = String(state.busyAction || '').startsWith('adguard');
  const writable = status.configured && status.ok && Array.isArray(status.upstreamSnapshot) && !status.upstreamFile && !status.upstreamsError;
  const results = state.adguardUpstreamResult?.results || [];
  const stats = status.upstreamStats || [];
  const urls = [...new Map([...adguardUpstreamList(state), ...stats.map((row) => row.url)].map((url) => [dohUrlKey(url), url])).values()];
  const metric = (value) => Number.isFinite(value) ? `${Math.round(value).toLocaleString('ru-RU')} мс` : '—';
  const period = status.statsPeriodHours ? `за последние ${status.statsPeriodHours} ч` : 'за период AdGuard';
  const rows = urls.map((url) => {
    const history = stats.find((row) => dohUrlKey(row.url) === dohUrlKey(url));
    const measured = results.find((row) => dohUrlKey(row.url) === dohUrlKey(url));
    const errors = measured?.samples?.filter((sample) => !sample.ok) || [];
    return `<tr><td class="adguard-upstream-url">${escapeHtml(url)}${!(status.upstreams || []).some((item) => dohUrlKey(item) === dohUrlKey(url)) ? '<span class="muted">Не в текущем общем списке</span>' : ''}</td>
      <td>${metric(history?.averageMs)}<span class="muted">${history?.responses != null ? `${Number(history.responses)} ответов` : 'Нет статистики'}</span></td>
      <td>${measured ? `${metric(measured.medianMs)}<span class="muted">${Number(measured.succeeded) || 0}/${measured.samples?.length || 3} успешных</span>` : '—'}</td>
      <td>${measured ? `<details><summary>${measured.ok ? 'Все ответы получены' : 'Есть ошибки'}</summary>${measured.samples.map((sample, index) => `<div>${escapeHtml(sample.host)} · ${escapeHtml(sample.type)}${index === 0 ? ' · первое соединение' : ''}: ${sample.ok ? metric(sample.ms) : escapeHtml(sample.error || sample.errorCode || 'Ошибка')}</div>`).join('')}</details>` : 'Проверка ещё не запускалась'}${errors.length ? '<span class="muted">Медиана учитывает только успешные ответы</span>' : ''}</td></tr>`;
  }).join('');
  return `<section class="adguard-upstreams">
    <div class="panel-title"><div><h3>DoH-серверы AdGuard</h3><span>Среднее из реальных запросов ${escapeHtml(period)} и отдельный замер с роутера.</span></div></div>
    ${status.upstreamsError || status.statsError ? `<p class="settings-warning">${escapeHtml(status.upstreamsError || status.statsError)}</p>` : ''}
    <label class="field"><span>Общие DoH-серверы — по одному HTTPS URL с IP на строку</span><textarea id="adguardUpstreams" rows="4" placeholder="https://1.1.1.1/dns-query" ${busy ? 'disabled' : ''}>${escapeHtml(adguardUpstreamText(state))}</textarea></label>
    <div class="split-actions">${[['Google', '8.8.8.8'], ['Quad9', '9.9.9.9'], ['Cloudflare', '1.1.1.1']].map(([name, ip]) => `<button class="btn secondary" data-adguard-upstream-preset="https://${ip}/dns-query" ${busy ? 'disabled' : ''}>+ ${name}</button>`).join('')}</div>
    <p class="muted">До 8 адресов с публичным IP. Такой HTTPS DNS не требует разрешения имени самого сервера. Проверка выполняется с роутера и не меняет настройки.</p>
    <div class="form-actions"><button class="btn secondary" data-action="adguardUpstreamCheck" ${busy ? 'disabled' : ''}>Проверить скорость</button>
      <button class="btn primary" data-action="adguardUpstreamSave" ${busy || !writable ? 'disabled' : ''}>Проверить и сохранить DoH</button>
      <button class="btn secondary" data-action="adguardUpstreamReset" ${busy ? 'disabled' : ''}>Загрузить текущий список</button></div>
    ${status.upstreamFile ? '<p class="settings-warning">AdGuard читает upstream из файла. Измените его в админке AdGuard Home.</p>' : ''}
    <p class="muted">Список применяется сразу после проверки всех адресов в AdGuard. DNS для запуска VPN, доменные маршруты и фильтры сохраняются. Xray не перезапускается.</p>
    ${state.adguardUpstreamResult ? `<p class="muted">Свежий замер: ${escapeHtml(new Date(state.adguardUpstreamResult.checkedAt).toLocaleString('ru-RU'))}. Медиана трёх запросов; при ошибках — только успешных.</p>` : ''}
    ${rows ? `<div class="table-scroll"><table class="adguard-upstream-table"><thead><tr><th>Upstream</th><th>Среднее AdGuard</th><th>Медиана замера</th><th>Результаты</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">Добавьте адреса для проверки.</p>'}
    <details><summary>Как проверяется скорость и выбирается сервер</summary><p class="muted">Три запроса A/AAAA, таймаут 3 с на запрос, проверка сертификата TLS. Первое соединение включает установку TCP/TLS, следующие могут использовать его повторно. Кэш AdGuard не участвует. Замер использует HTTPS с роутера без HTTP-прокси; при другой схеме AdGuard его маршрут может отличаться. Это снимок доступности, а не гарантия постоянной скорости. Порядок строк не задаёт приоритет: выбор сервера зависит от режима AdGuard.</p></details>
  </section>`;
}
