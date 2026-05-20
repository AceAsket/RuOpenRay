import { noticeView } from './notice-view.js';

export function createSettingsView({ state, byteSize, escapeHtml }) {
function settingsPanel() {
  const logLevels = [
    ['none', 'Нет'],
    ['error', 'Ошибки'],
    ['warning', 'Предупреждения'],
    ['info', 'Инфо'],
    ['debug', 'Отладка']
  ];
  const accessSize = byteSize(state.loggingSettings?.accessSize || 0);
  const errorSize = byteSize(state.loggingSettings?.errorSize || 0);
  const settingsTabs = [
    ['logging', 'Логирование'],
    ['security', 'Панель'],
    ['service', 'Сервис'],
    ['updates', 'Обновление']
  ];
  const settingsView = settingsTabs.some(([value]) => value === state.settingsView) ? state.settingsView : 'logging';
  const loggingSections = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Логирование Xray</h2><span>Access, error и DNS-логи пишутся самим Xray. Для постоянной работы лучше держать уровень warning или error.</span></div>
      </div>
      <div class="settings-log-layout">
        <div class="settings-field wide">
          <label>Уровень логирования</label>
          <div class="segmented settings-log-levels" aria-label="Уровень логирования">
            ${logLevels.map(([value, label]) => `<button type="button" class="${state.loggingLevel === value ? 'active' : ''}" data-logging-level="${value}">${label}</button>`).join('')}
          </div>
          <small>Debug быстро раздувает файлы и может влиять на слабые роутеры.</small>
        </div>

        <label class="settings-check ${state.loggingAccessLog ? 'active' : ''}">
          <input id="loggingAccessLog" type="checkbox" ${state.loggingAccessLog ? 'checked' : ''} />
          <span><strong>Логи доступа</strong><em>Соединения, источник, назначение, inbound и outbound.</em></span>
          <b>${accessSize}</b>
        </label>
        <label class="settings-check ${state.loggingErrorLog ? 'active' : ''}">
          <input id="loggingErrorLog" type="checkbox" ${state.loggingErrorLog ? 'checked' : ''} />
          <span><strong>Логи ошибок</strong><em>Ошибки и предупреждения Xray для диагностики запуска и правил.</em></span>
          <b>${errorSize}</b>
        </label>
        <label class="settings-check ${state.loggingDnsLog ? 'active' : ''}">
          <input id="loggingDnsLog" type="checkbox" ${state.loggingDnsLog ? 'checked' : ''} />
          <span><strong>DNS-логи Xray</strong><em>Запросы встроенного DNS. Полезно для поиска DNS leak.</em></span>
          <b>dnsLog</b>
        </label>

        <div class="settings-field">
          <label>Файл access</label>
          <input id="loggingAccessPath" value="${escapeHtml(state.loggingAccessPath)}" ${state.loggingAccessLog ? '' : 'disabled'} />
        </div>
        <div class="settings-field">
          <label>Файл error</label>
          <input id="loggingErrorPath" value="${escapeHtml(state.loggingErrorPath)}" ${state.loggingErrorLog ? '' : 'disabled'} />
        </div>
      </div>
    </section>

    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Обслуживание логов</h2><span>RuOpenRay следит за размером файлов каждые 15 минут и перед рестартом Xray.</span></div>
      </div>
      <div class="settings-maintenance">
        <div class="settings-field">
          <label>Максимальный размер файла, MB</label>
          <input id="loggingMaxSizeMb" type="number" min="1" max="200" value="${escapeHtml(state.loggingMaxSizeMb)}" />
        </div>
        <div class="settings-field">
          <label>Хранить копий после ротации</label>
          <input id="loggingRotateCopies" type="number" min="0" max="5" value="${escapeHtml(state.loggingRotateCopies)}" />
        </div>
        <label class="settings-check compact ${state.loggingClearOnRestart ? 'active' : ''}">
          <input id="loggingClearOnRestart" type="checkbox" ${state.loggingClearOnRestart ? 'checked' : ''} />
          <span><strong>Очищать при перезапуске Xray</strong><em>Удобно для временной диагностики.</em></span>
        </label>
        <label class="settings-check compact ${state.loggingRestart ? 'active' : ''}">
          <input id="loggingRestart" type="checkbox" ${state.loggingRestart ? 'checked' : ''} />
          <span><strong>Перезапустить Xray после сохранения</strong><em>Новые пути и уровень применятся сразу.</em></span>
        </label>
      </div>
      <div class="settings-warning">
        <strong>Flash-память</strong>
        <span>Access-логи при активном трафике создают много записей. Для постоянного мониторинга лучше использовать временный каталог или внешний накопитель.</span>
      </div>
      <div class="toolbar">
        <button class="btn warning ${state.loggingSaving ? 'is-busy' : ''}" data-action="saveLoggingSettings" ${state.loggingSaving ? 'disabled' : ''}>${state.loggingSaving ? 'Сохраняю...' : 'Сохранить логирование'}</button>
        <button class="btn secondary" data-action="clearLoggingFiles" ${state.loggingSaving ? 'disabled' : ''}>Очистить логи</button>
      </div>
    </section>
  `;
  const securitySection = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Пароль панели</h2><span>После смены активные сессии будут сброшены, нужно будет войти заново.</span></div>
      </div>
      <div class="settings-form">
        <div class="form-row">
          <label>Текущий пароль</label>
          <input id="settingsCurrentPassword" type="password" value="${escapeHtml(state.settingsCurrentPassword)}" autocomplete="current-password" />
        </div>
        <div class="form-row">
          <label>Новый пароль</label>
          <input id="settingsNewPassword" type="password" value="${escapeHtml(state.settingsNewPassword)}" autocomplete="new-password" placeholder="минимум 8 символов" />
        </div>
        <div class="form-row">
          <label>Повторите пароль</label>
          <input id="settingsConfirmPassword" type="password" value="${escapeHtml(state.settingsConfirmPassword)}" autocomplete="new-password" />
        </div>
      </div>
      <div class="toolbar">
        <button class="btn warning" data-action="changePanelPassword" ${state.settingsPasswordSaving ? 'disabled' : ''}>${state.settingsPasswordSaving ? 'Сохраняю...' : 'Сменить пароль'}</button>
      </div>
    </section>
  `;
  const appInfo = state.status?.app || {};
  const appRelease = state.appRelease || {};
  const appHasUpdate = Boolean(appRelease.update && appRelease.assetUrl);
  const appVersion = appInfo.version || 'dev';
  const appTarget = appRelease.tag || 'не загружен';
  const appAsset = appRelease.asset || appInfo.asset || '';
  const appUpdateSection = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Обновление RuOpenRay UI</h2><span>Панель может обновить собственный бинарник из релизов GitHub с учетом архитектуры роутера.</span></div>
      </div>
      <div class="settings-info-grid">
        <article><span>Установлено</span><strong>${escapeHtml(appVersion)}</strong></article>
        <article><span>Последний релиз</span><strong>${escapeHtml(appTarget)}</strong></article>
        <article><span>Архитектура</span><strong>${escapeHtml(appAsset || 'не определена')}</strong></article>
        <article><span>Размер</span><strong>${escapeHtml(appRelease.assetSize ? byteSize(appRelease.assetSize) : 'неизвестно')}</strong></article>
      </div>
      <div class="settings-maintenance">
        <label class="settings-check compact ${state.appBackup ? 'active' : ''}">
          <input id="appBackup" type="checkbox" ${state.appBackup ? 'checked' : ''} />
          <span><strong>Сохранить бэкап бинарника</strong><em>Выключайте на роутерах с малым NAND, если свободного места мало.</em></span>
        </label>
      </div>
      <div class="toolbar">
        <button class="btn secondary ${state.appReleaseChecking ? 'is-busy' : ''}" data-action="checkAppUpdate" ${state.appReleaseChecking || state.appUpdating ? 'disabled' : ''}>${state.appReleaseChecking ? 'Проверяю...' : 'Проверить обновления'}</button>
        <button class="btn warning ${state.appUpdating ? 'is-busy' : ''}" data-action="updateApp" ${state.appUpdating || !appHasUpdate ? 'disabled' : ''}>${state.appUpdating ? 'Обновляю...' : appHasUpdate ? 'Обновить панель' : 'Актуальная версия'}</button>
      </div>
      ${state.appUpdate ? `<div class="core-result">
        <strong>${state.appUpdate.ok ? 'Готово' : 'Ошибка'}</strong>
        <span>${escapeHtml(state.appUpdate.stdout || state.appUpdate.stderr || '')}</span>
      </div>` : ''}
    </section>
  `;
  const serviceSection = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Сервис и пути</h2><span>Ключевые параметры окружения. Их меняет установщик или UCI, здесь показываем то, с чем сейчас работает панель.</span></div>
      </div>
      <div class="settings-info-grid">
        <article><span>Сервис Xray</span><strong>${escapeHtml(state.status?.service?.running ? 'работает' : 'остановлен')}</strong></article>
        <article><span>Активная конфигурация</span><strong>${escapeHtml(state.status?.config?.path || 'не определена')}</strong></article>
        <article><span>Версия ядра</span><strong>${escapeHtml(state.status?.core?.version || 'не найдена')}</strong></article>
        <article><span>Правил маршрутизации</span><strong>${escapeHtml(state.status?.config?.routingRules ?? 0)}</strong></article>
      </div>
      <div class="settings-maintenance">
        <div class="settings-field">
          <label>Задержка старта панели, сек</label>
          <input id="serviceStartupDelaySec" type="number" min="0" max="180" value="${escapeHtml(state.serviceStartupDelaySec)}" />
          <small>Полезно после загрузки роутера, когда сеть и storage просыпаются не сразу.</small>
        </div>
        <div class="settings-field">
          <label>Пауза перед перезапуском Xray, сек</label>
          <input id="serviceApplyDelaySec" type="number" min="0" max="60" value="${escapeHtml(state.serviceApplyDelaySec)}" />
          <small>Дает firewall/WAN/DNS успеть прийти в порядок перед start/restart.</small>
        </div>
        <div class="settings-field">
          <label>Лимит памяти панели</label>
          <input id="serviceGoMemLimit" value="${escapeHtml(state.serviceGoMemLimit)}" placeholder="48MiB" />
          <small>Передается в Go как GOMEMLIMIT после перезапуска RuOpenRay UI. Для 256 MB RAM обычно достаточно 32-48MiB.</small>
        </div>
        <div class="settings-field">
          <label>Агрессивность GC</label>
          <input id="serviceGoGC" type="number" min="20" max="200" value="${escapeHtml(state.serviceGoGC)}" />
          <small>GOGC: ниже значение — меньше RAM, но чуть больше CPU. Дефолт RuOpenRay: 60.</small>
        </div>
        <div class="settings-field">
          <label>Загрузка ядра и geo-файлов</label>
          <select id="serviceDownloadMirror">
            <option value="direct" ${state.serviceDownloadMirror !== 'custom' ? 'selected' : ''}>Напрямую</option>
            <option value="custom" ${state.serviceDownloadMirror === 'custom' ? 'selected' : ''}>Через зеркало</option>
          </select>
          <small>Для роутеров, у которых GitHub скачивается нестабильно.</small>
        </div>
        <div class="settings-field">
          <label>Префикс зеркала</label>
          <input id="serviceMirrorPrefix" value="${escapeHtml(state.serviceMirrorPrefix)}" ${state.serviceDownloadMirror === 'custom' ? '' : 'disabled'} placeholder="https://gh-proxy.example/?url={url}" />
          <small>Можно использовать {url}; без него RuOpenRay просто добавит исходную ссылку после префикса.</small>
        </div>
      </div>
      <div class="toolbar">
        <button class="btn warning ${state.serviceSettingsSaving ? 'is-busy' : ''}" data-action="saveServiceSettings" ${state.serviceSettingsSaving ? 'disabled' : ''}>${state.serviceSettingsSaving ? 'Сохраняю...' : 'Сохранить сервис'}</button>
      </div>
    </section>
  `;
  const visibleSection = settingsView === 'security'
    ? securitySection
    : settingsView === 'updates'
      ? appUpdateSection
    : settingsView === 'service'
      ? serviceSection
      : loggingSections;
  return `
    <section class="settings-hero">
      <div>
        <h2>Параметры RuOpenRay</h2>
        <p>Параметры панели и Xray, которые влияют на работу сервиса на роутере.</p>
      </div>
      <div class="settings-hero-status">
        <strong>${escapeHtml(state.status?.core?.available ? 'Xray доступен' : 'Xray не найден')}</strong>
        <span>${escapeHtml(state.status?.core?.version || '')}</span>
      </div>
    </section>

    <div class="settings-subnav" role="tablist" aria-label="Подменю настроек">
      ${settingsTabs.map(([value, label]) => `<button type="button" class="${settingsView === value ? 'active' : ''}" data-settings-view="${value}">${label}</button>`).join('')}
    </div>

    ${visibleSection}

    <section class="settings-message">
      ${noticeView(state, escapeHtml, { style: 'margin-top: 14px' })}
    </section>
  `;
}


  return { settingsPanel };
}
