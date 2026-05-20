export function createGeoView({ state, escapeHtml, stat }) {
function fileSize(size) {
  const n = Number(size || 0);
  if (!n) return 'нет файла';
  return n > 1024 * 1024 ? `${Math.round((n / 1024 / 1024) * 10) / 10} MB` : `${Math.round(n / 1024)} KB`;
}

function geoSelectedPresetIds() {
  const ids = [state.geoBasePreset, ...state.geoExtraPresets].filter(Boolean);
  return [...new Set(ids)];
}

function geoSelectedPresets() {
  const presets = state.geoStatus?.presets || [];
  const builtin = geoSelectedPresetIds().map((id) => presets.find((preset) => preset.id === id)).filter(Boolean);
  const custom = state.geoCustomSources
    .filter((source) => state.geoCustomSourceIds.includes(source.id))
    .map((source) => ({
      ...source,
      installable: source.enabled !== false,
      mode: source.kind === 'extra' ? 'extra-geosite' : 'replace',
      estimatedBytes: source.kind === 'extra' ? 512 * 1024 : 24 * 1024 * 1024
    }));
  return [...builtin, ...custom];
}

function geoRequiredSpace(selectedPresets, geo, withBackup = true) {
  const installable = selectedPresets.filter((preset) => preset?.installable);
  if (!installable.length) return 0;
  let required = 1024 * 1024;
  installable.forEach((preset) => {
    required += Number(preset.estimatedBytes || 0);
    if (!withBackup) return;
    if (preset.mode === 'extra-geosite') {
      required += Number((geo.extras || []).find((item) => item.id === preset.id)?.file?.size || 0);
    } else if (preset.mode === 'geoip-only') {
      required += Number(geo.geoip?.size || 0);
    } else {
      required += Number(geo.geoip?.size || 0) + Number(geo.geosite?.size || 0);
    }
  });
  return required;
}

function geoDiskWarning(selectedPresets, geo) {
  const disk = geo.disk || {};
  if (!disk.ok || !selectedPresets.some((preset) => preset?.installable)) return '';
  const required = geoRequiredSpace(selectedPresets, geo, state.geoBackup);
  const free = Number(disk.free || 0);
  const low = free < required;
  const tight = free < required + 8 * 1024 * 1024;
  if (!low && !tight) return '';
  return `
    <div class="geo-disk-warning ${low ? 'danger' : ''}">
      <strong>${low ? 'Места может не хватить' : 'Места почти впритык'}</strong>
      <span>Свободно ${fileSize(free)}, расчетно нужно около ${fileSize(required)}${state.geoBackup ? ' с учетом бэкапа' : ' без бэкапа'}. Каталог: ${escapeHtml(geo.dir || '')}</span>
    </div>
  `;
}

function selectedGeoPreset() {
  return (state.geoStatus?.presets || []).find((preset) => preset.id === state.geoBasePreset);
}

function geoActionLabel(preset) {
  if (state.geoUpdating) return 'Обновляю...';
  if (!preset || state.geoBasePreset === 'custom') return 'Обновить geo';
  if (!preset.installable) return 'Справочный источник';
  if (preset.mode === 'extra-geosite') return 'Поставить dat-файл';
  if (preset.mode === 'geoip-only') return 'Обновить geoip.dat';
  return 'Обновить geo';
}

function geoNandCard(geo, selectedPresets) {
  const storage = geo.storage || {};
  const disk = geo.disk || {};
  const requiredNoBackup = geoRequiredSpace(selectedPresets, geo, false);
  const requiredBackup = geoRequiredSpace(selectedPresets, geo, true);
  const extraCount = (geo.files || []).filter((file) => file.role === 'extra').length;
  return `
    <section class="panel nand-card">
      <div class="panel-title">
        <div>
          <h2>NAND-friendly режим</h2>
          <span>Экономный профиль для роутеров с 128 MB NAND: без бэкапов по умолчанию, компактные geo и удаление лишних dat-файлов.</span>
        </div>
        <button class="btn secondary" data-action="cleanupExtraGeoDat" ${extraCount ? '' : 'disabled'}>Удалить дополнительные dat</button>
      </div>
      <div class="nand-plan-grid">
        <article><span>Свободно</span><strong>${escapeHtml(fileSize(disk.free))}</strong><small>${escapeHtml(geo.dir || '')}</small></article>
        <article><span>Geo сейчас</span><strong>${escapeHtml(fileSize(storage.currentDatBytes))}</strong><small>geoip.dat + geosite.dat</small></article>
        <article><span>Бэкапы</span><strong>${escapeHtml(fileSize(storage.backupBytes))}</strong><small>можно очистить отдельно</small></article>
        <article><span>Компактный набор</span><strong>${escapeHtml(fileSize(storage.compactEstimate))}</strong><small>Nidelon / РФ блокировки</small></article>
        <article><span>С бэкапом</span><strong>${escapeHtml(fileSize(requiredBackup))}</strong><small>оценка выбранного обновления</small></article>
        <article><span>Без бэкапа</span><strong>${escapeHtml(fileSize(requiredNoBackup))}</strong><small>рекомендуется для малого NAND</small></article>
      </div>
      <p class="settings-warning compact"><strong>По умолчанию без бэкапа</strong><span>Перед рискованным обновлением можно включить бэкап вручную. Для обычного обновления geo на маленьком NAND лучше сначала удалить лишние dat-файлы.</span></p>
    </section>
  `;
}

function geoPurposeLabel(preset) {
  const purpose = String(preset?.purpose || preset?.compat || '').trim();
  const labels = {
    'база': 'универсальный набор',
    'база через CDN': 'универсальный набор через CDN',
    'РФ bypass': 'российские блокировки',
    'РФ блоки': 'российские блокировки',
    'CN rules': 'Китай и CDN',
    'Iran rules': 'Иран',
    'расширенный GeoIP': 'расширенный GeoIP',
    'официальный fallback': 'официальный набор',
    'официальный резерв': 'официальный набор'
  };
  return labels[purpose] || purpose;
}

function geoPanel() {
  const geo = state.geoStatus || {};
  const presets = geo.presets || [];
  const extras = geo.extras || [];
  const installedFiles = geo.files || [];
  const selected = selectedGeoPreset();
  const basePresets = presets.filter((preset) => preset.mode !== 'extra-geosite');
  const extraPresets = presets.filter((preset) => preset.mode === 'extra-geosite');
  const selectedPresets = geoSelectedPresets();
  const custom = state.geoBasePreset === 'custom';
  const customSelected = state.geoCustomSourceIds.length > 0;
  const canUpdate = custom || selected?.installable || customSelected;
  return `
    <section class="route-hero">
      <div>
        <h2>Geodata manager</h2>
        <p>Источники geoip.dat/geosite.dat, свои URL, дополнительные dat-файлы, обновление и расписание для правил <code>geoip:...</code>, <code>geosite:...</code> и <code>ext:</code>.</p>
      </div>
      <div class="route-score">
        <strong>${(geo.geoip?.exists ? 1 : 0) + (geo.geosite?.exists ? 1 : 0)}/2</strong>
        <span>файлов установлено</span>
      </div>
    </section>

    <section class="stats route-stats">
      ${stat('geoip.dat', fileSize(geo.geoip?.size), geo.geoip?.modifiedAt ? new Date(geo.geoip.modifiedAt).toLocaleString() : geo.geoip?.path || 'не найден')}
      ${stat('geosite.dat', fileSize(geo.geosite?.size), geo.geosite?.modifiedAt ? new Date(geo.geosite.modifiedAt).toLocaleString() : geo.geosite?.path || 'не найден')}
      ${stat('Каталог', geo.dir || '-', 'куда RuOpenRay кладет dat-файлы')}
      ${stat('Свободно', fileSize(geo.disk?.free), geo.disk?.ok ? `занято ${geo.disk.usedPercent || fileSize(geo.disk.used)}` : 'df/statfs недоступен')}
    </section>

    ${geoNandCard(geo, selectedPresets)}

    <section class="panel">
      <div class="panel-title">
        <div><h2>Установленные dat-файлы</h2><span>Обычные источники заменяют пару <code>geoip.dat</code>/<code>geosite.dat</code>. Источники geoip-only обновляют только <code>geoip.dat</code>. Дополнительные файлы могут лежать рядом и использоваться правилами <code>ext:"file.dat:list"</code>.</span></div>
      </div>
      <div class="geo-file-list">
        ${installedFiles.map((file) => `<article>
          <div>
            <strong>${escapeHtml(file.name || file.path)}</strong>
            <span>${file.exists === false ? 'не найден' : `${fileSize(file.size)} · ${file.modifiedAt ? new Date(file.modifiedAt).toLocaleString() : ''}`}</span>
            <code>${escapeHtml(file.path || '')}</code>
          </div>
          <button class="btn secondary" data-geo-delete="${escapeHtml(file.name || '')}" ${file.exists === false ? 'disabled' : ''}>Удалить</button>
        </article>`).join('') || '<p class="muted">dat-файлов пока нет. Установите базовый источник или дополнительный ext DAT.</p>'}
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <div><h2>Источники geodata</h2><span>Выберите один основной источник: пару geoip/geosite или отдельный geoip.dat. Дополнительные dat-файлы для ext-правил можно ставить вместе с ним.</span></div>
        <div class="split-actions">
          <button class="btn secondary ${state.busyAction === 'cleanupGeoBackups' ? 'is-busy' : ''}" data-action="cleanupGeoBackups" ${state.busyAction === 'cleanupGeoBackups' ? 'disabled' : ''}>${state.busyAction === 'cleanupGeoBackups' ? 'Очищаю...' : 'Очистить geo-бэкапы'}</button>
          <button class="btn warning ${state.geoUpdating ? 'is-busy' : ''}" data-action="updateGeo" ${state.geoUpdating || !canUpdate ? 'disabled' : ''}>${state.geoUpdating ? 'Обновляю...' : geoActionLabel(selected)}</button>
        </div>
      </div>
      <div class="geo-presets">
        ${basePresets.map((preset) => `<button class="${state.geoBasePreset === preset.id ? 'active' : ''} ${preset.installable ? '' : 'reference'}" data-geo-base="${escapeHtml(preset.id)}">
          <span class="geo-purpose">${escapeHtml(geoPurposeLabel(preset))}</span>
          <strong>${escapeHtml(preset.name)}</strong>
          <small>${escapeHtml(preset.compat || '')}</small>
          <span>${escapeHtml(preset.detail)}</span>
          ${preset.ruleHint ? `<code>${escapeHtml(preset.ruleHint)}</code>` : ''}
          ${preset.estimatedBytes ? `<small>примерно ${fileSize(preset.estimatedBytes)}</small>` : ''}
        </button>`).join('')}
        <button class="${custom ? 'active' : ''}" data-geo-base="custom">
          <span class="geo-purpose">свои ссылки</span>
          <strong>Свой источник</strong>
          <small>Xray DAT</small>
          <span>Вставьте прямые URL на geoip.dat и geosite.dat.</span>
        </button>
      </div>
      ${extraPresets.length ? `<div class="geo-group-title">Дополнительные DAT для ext-правил</div>
      <div class="geo-extra-select">
        ${extraPresets.map((preset) => `<label class="${state.geoExtraPresets.includes(preset.id) ? 'active' : ''}">
          <input type="checkbox" data-geo-extra="${escapeHtml(preset.id)}" ${state.geoExtraPresets.includes(preset.id) ? 'checked' : ''} />
          <span>
            <strong>${escapeHtml(preset.name)}</strong>
            <small>${escapeHtml(geoPurposeLabel(preset))}</small>
            <em>${escapeHtml(preset.detail)}</em>
            ${preset.ruleHint ? `<code>${escapeHtml(preset.ruleHint)}</code>` : ''}
          </span>
        </label>`).join('')}
      </div>` : ''}
      <div class="geo-options">
        <label class="toggle-row">
          <input id="geoBackup" type="checkbox" ${state.geoBackup ? 'checked' : ''} />
          <span>Сохранять бэкап перед заменой</span>
        </label>
        <small class="muted">Если места мало, бэкап можно выключить: текущий dat-файл будет заменен без копии.</small>
      </div>
      ${geoDiskWarning(selectedPresets, geo)}
      ${custom ? `<div class="geo-custom">
        <div class="geo-group-title">Свои URL</div>
        <div class="form-row">
          <label>geoip.dat URL</label>
          <input id="geoipUrl" value="${escapeHtml(state.geoipUrl)}" placeholder="https://example.com/geoip.dat" />
        </div>
        <div class="form-row">
          <label>geosite.dat URL</label>
          <input id="geositeUrl" value="${escapeHtml(state.geositeUrl)}" placeholder="https://example.com/geosite.dat" />
        </div>
      </div>` : ''}
      <div class="geo-manager">
        <div class="geo-group-title">Свои источники</div>
        <div class="geo-source-form">
          <div class="form-row">
            <label>Название</label>
            <input id="geoSourceName" value="${escapeHtml(state.geoSourceName)}" placeholder="Мой geosite / офисный список" />
          </div>
          <div class="form-row">
            <label>Тип</label>
            <select id="geoSourceKind">
              <option value="base" ${state.geoSourceKind === 'base' ? 'selected' : ''}>geoip.dat + geosite.dat</option>
              <option value="extra" ${state.geoSourceKind === 'extra' ? 'selected' : ''}>дополнительный ext dat</option>
            </select>
          </div>
          ${state.geoSourceKind === 'extra' ? `
            <div class="form-row">
              <label>Имя файла</label>
              <input id="geoSourceTarget" value="${escapeHtml(state.geoSourceTarget)}" placeholder="my-site.dat" />
            </div>
            <div class="form-row">
              <label>URL dat-файла</label>
              <input id="geoSourceUrl" value="${escapeHtml(state.geoSourceUrl)}" placeholder="https://example.com/my-site.dat" />
            </div>
          ` : `
            <div class="form-row">
              <label>geoip.dat URL</label>
              <input id="geoSourceGeoipUrl" value="${escapeHtml(state.geoSourceGeoipUrl)}" placeholder="https://example.com/geoip.dat" />
            </div>
            <div class="form-row">
              <label>geosite.dat URL</label>
              <input id="geoSourceGeositeUrl" value="${escapeHtml(state.geoSourceGeositeUrl)}" placeholder="https://example.com/geosite.dat" />
            </div>
          `}
          <button class="btn secondary" data-action="addGeoSource">Добавить источник</button>
        </div>
        <div class="geo-source-list">
          ${state.geoCustomSources.map((source) => `<article class="${state.geoCustomSourceIds.includes(source.id) ? 'active' : ''}">
            <label class="toggle-row">
              <input type="checkbox" data-geo-custom="${escapeHtml(source.id)}" ${state.geoCustomSourceIds.includes(source.id) ? 'checked' : ''} ${source.enabled === false ? 'disabled' : ''} />
              <span>Выбрать для обновления</span>
            </label>
            <div>
              <strong>${escapeHtml(source.name)}</strong>
              <span>${source.kind === 'extra' ? `ext dat · ${escapeHtml(source.target || 'file.dat')}` : 'geoip.dat + geosite.dat'}</span>
              <code>${escapeHtml(source.kind === 'extra' ? source.url : [source.geoipUrl, source.geositeUrl].filter(Boolean).join(' · '))}</code>
            </div>
            <div class="split-actions">
              <button class="btn secondary" data-geo-source-toggle="${escapeHtml(source.id)}">${source.enabled === false ? 'Включить' : 'Выключить'}</button>
              <button class="btn secondary" data-geo-source-delete="${escapeHtml(source.id)}">Удалить</button>
            </div>
          </article>`).join('') || '<p class="muted">Своих источников пока нет. Добавьте URL один раз, потом выбирайте его для ручного или scheduled обновления.</p>'}
        </div>
      </div>
      <div class="geo-schedule">
        <div class="geo-group-title">Расписание обновления</div>
        <label class="toggle-row">
          <input id="geoScheduleEnabled" type="checkbox" ${state.geoScheduleEnabled ? 'checked' : ''} />
          <span>Обновлять выбранные geo-файлы автоматически</span>
        </label>
        <div class="geo-schedule-grid">
          <div class="form-row">
            <label>Период</label>
            <select id="geoScheduleInterval">
              <option value="daily" ${state.geoScheduleInterval === 'daily' ? 'selected' : ''}>Ежедневно</option>
              <option value="weekly" ${state.geoScheduleInterval === 'weekly' ? 'selected' : ''}>Еженедельно</option>
            </select>
          </div>
          <div class="form-row">
            <label>День</label>
            <select id="geoScheduleWeekday" ${state.geoScheduleInterval === 'daily' ? 'disabled' : ''}>
              ${['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map((day, index) => `<option value="${index}" ${state.geoScheduleWeekday === String(index) ? 'selected' : ''}>${day}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <label>Время</label>
            <input id="geoScheduleTime" type="time" value="${escapeHtml(state.geoScheduleTime)}" />
          </div>
          <button class="btn secondary ${state.busyAction === 'saveGeoSchedule' ? 'is-busy' : ''}" data-action="saveGeoSchedule" ${state.busyAction === 'saveGeoSchedule' ? 'disabled' : ''}>${state.busyAction === 'saveGeoSchedule' ? 'Сохраняю...' : 'Сохранить расписание'}</button>
        </div>
      </div>
      ${state.geoUpdate ? `<div class="core-result">
        <strong>${state.geoUpdate.ok ? 'Готово' : 'Ошибка'}</strong>
        ${state.geoUpdate.stdout || state.geoUpdate.stderr ? `<pre>${escapeHtml(state.geoUpdate.stdout || state.geoUpdate.stderr).slice(0, 1600)}</pre>` : ''}
      </div>` : '<p class="muted">Перед заменой существующие файлы сохраняются в backup-каталог. После успешного обновления Xray перезапускается.</p>'}
    </section>

    ${extras.length ? `<section class="panel">
      <div class="panel-title">
        <div><h2>Дополнительные dat-файлы</h2><span>Файлы для правил <code>ext:"file.dat:list"</code>, которые лежат рядом с geosite.dat.</span></div>
      </div>
      <div class="geo-extra-list">
        ${extras.map((item) => `<article>
          <strong>${escapeHtml(item.name)} · ${item.file?.exists ? fileSize(item.file.size) : 'не установлен'}</strong>
          <span>${escapeHtml(item.file?.path || '')}</span>
          ${item.ruleHint ? `<code>${escapeHtml(item.ruleHint)}</code>` : ''}
        </article>`).join('')}
      </div>
    </section>` : ''}
  `;
}


  return {
    fileSize,
    geoSelectedPresetIds,
    geoSelectedPresets,
    geoRequiredSpace,
    geoDiskWarning,
    selectedGeoPreset,
    geoActionLabel,
    geoNandCard,
    geoPurposeLabel,
    geoPanel,
  };
}
