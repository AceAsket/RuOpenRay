import { proxyDisplayText } from './proxy-label.js';

export function noticeDialogOwner(state) {
  // Match the overlay order in app.js: the last rendered open dialog is visible.
  const dialogs = [
    ['routePreset', state.routePresetDialog && state.routePresetEditor],
    ['routeGroup', state.routeGroupDialog],
    ['core', state.coreDialogOpen],
    ['install', state.installWizardOpen],
    ['profileEditor', state.tab === 'profiles' && state.profileEditorOpen],
    ['serverEditor', state.tab === 'servers' && state.serverEditDialog],
    ['amneziaImport', state.tab === 'amnezia' && state.amneziaImportDialog],
    ['firewallPreflight', state.firewallPreflightPrompt],
    ['import', state.importDialog],
    ['routeTargetReplace', state.routeTargetReplaceDialog],
    ['routeBalancer', state.routeBalancerDialog],
    ['routeRule', state.routeRuleDialog]
  ];
  return dialogs.find(([, open]) => open)?.[0] || '';
}

export function modalNoticeView(state, escapeHtml, dialog) {
  if (noticeDialogOwner(state) !== dialog) return '';
  return noticeView(state, escapeHtml, { className: 'page-result-notice modal-result-notice', live: true });
}

export function noticeView(state, escapeHtml, { className = '', style = '', live = false } = {}) {
  if (!state.message) return '';
  const details = state.messageDetails?.forMessage === state.message
    ? state.messageDetails
    : null;
  const classes = ['notice', className].filter(Boolean).join(' ');
  const styleAttr = style ? ` style="${escapeHtml(style)}"` : '';
  const liveAttrs = live ? ' role="status" aria-live="polite" aria-atomic="true"' : '';
  return `
    <div class="${classes}"${styleAttr}${liveAttrs}>
      <div>${escapeHtml(proxyDisplayText(state.message, state))}</div>
      ${details ? noticeDetails(details, (text) => escapeHtml(proxyDisplayText(text, state))) : ''}
    </div>
  `;
}

function noticeDetails(details, escapeHtml) {
  const summary = details.summary || 'Показать подробности';
  const title = details.title || '';
  const body = details.body || '';
  const technical = details.technical || '';
  return `
    <details class="notice-details">
      <summary>${escapeHtml(summary)}</summary>
      <div class="notice-details-body">
        ${title ? `<strong>${escapeHtml(title)}</strong>` : ''}
        ${body ? `<p>${escapeHtml(body)}</p>` : ''}
        ${technical ? `<pre>${escapeHtml(technical)}</pre>` : ''}
      </div>
    </details>
  `;
}
