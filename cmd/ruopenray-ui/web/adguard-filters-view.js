export function adguardFiltersSection(state, escapeHtml) {
  const status = state.adguardStatus || {};
  const disabled = Boolean(state.busyAction || !status.configured || !status.ok || status.filtersError);
  const filters = Array.isArray(status.filterLists) ? status.filterLists : [];
  const catalog = Array.isArray(status.filterCatalog) ? status.filterCatalog : [];
  return `<section class="adguard-filter-lists" aria-label="Списки фильтрации AdGuard">
    <div class="panel-title"><div><h3>Списки фильтрации</h3><span>Состав и состояние списков из AdGuard Home.</span></div>
      <button class="btn secondary" data-action="adguardFiltersRefresh" ${disabled ? 'disabled' : ''}>Обновить списки</button></div>
    ${status.filtersError ? `<p class="settings-warning">${escapeHtml(status.filtersError)}</p>` : ''}
    ${state.adguardFilterError ? `<p class="settings-warning">${escapeHtml(state.adguardFilterError)}</p>` : ''}
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Список</th><th>Состояние</th><th>Правил</th><th>Обновлён</th><th>Действия</th></tr></thead><tbody>
    ${filters.map((filter) => `<tr><td><strong>${escapeHtml(filter.name || 'Без названия')}</strong><div class="muted adguard-filter-url">${escapeHtml(filter.url || '')}</div></td>
      <td>${filter.enabled ? 'Включён' : 'Выключен'}</td><td>${Number(filter.rules) || 0}</td><td>${escapeHtml(filter.updatedAt && Number.isFinite(Date.parse(filter.updatedAt)) ? new Date(filter.updatedAt).toLocaleString('ru-RU') : 'Нет данных')}</td>
      <td><div class="split-actions"><button class="btn secondary" data-action="adguardFilterToggle" data-filter-url="${escapeHtml(filter.url || '')}" data-filter-enabled="${!filter.enabled}" ${disabled ? 'disabled' : ''}>${filter.enabled ? 'Выключить' : 'Включить'}</button>
      <button class="btn danger" data-action="adguardFilterRemove" data-filter-url="${escapeHtml(filter.url || '')}" ${disabled ? 'disabled' : ''}>Удалить</button></div></td></tr>`).join('') || '<tr><td colspan="5">Списки пока не добавлены</td></tr>'}
    </tbody></table></div>
    <p class="muted">Автообновление AdGuard: ${Number(status.filterIntervalHours) > 0 ? `каждые ${Number(status.filterIntervalHours)} ч` : 'выключено'}. Обновление и переключение списков применяются сразу; Xray не перезапускается.</p>
    <details class="lan-dns-details" data-details-key="adguard-add-filter" ${state.adguardFilterName || state.adguardFilterUrl ? 'open' : ''}><summary>Добавить список</summary><div class="lan-dns-details-body">
      <div class="split-actions">${catalog.map((item, index) => `<button class="btn secondary" data-action="adguardFilterPreset" data-filter-index="${index}" ${disabled ? 'disabled' : ''}>${escapeHtml(item.name)}</button>`).join('')}</div>
      <label class="field"><span>Название</span><input id="adguardFilterName" maxlength="120" value="${escapeHtml(state.adguardFilterName || '')}"></label>
      <label class="field"><span>HTTPS URL списка</span><input id="adguardFilterUrl" value="${escapeHtml(state.adguardFilterUrl || '')}" placeholder="https://example.org/filter.txt"></label>
      <button class="btn primary" data-action="adguardFilterAdd" ${disabled ? 'disabled' : ''}>Добавить и включить</button>
    </div></details>
  </section>`;
}
