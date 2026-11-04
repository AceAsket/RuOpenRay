import { bindActionControls } from './action-bindings.js';

export function bindProfileControls({
  state,
  render,
  activateProfile,
  openProfileEditor,
  deleteProfile,
  downloadProfile
}) {
  document.querySelector('#profileCreateName')?.addEventListener('input', (event) => {
    state.profileCreateName = event.target.value;
  });
  const controls = [
    ['[data-profile]', 'activateProfile', 'Применяю профиль и перезапускаю Xray', (button) => activateProfile(button.dataset.profile)],
    ['[data-profile-edit]', 'openProfileEditor', 'Загружаю JSON профиля', (button) => openProfileEditor(button.dataset.profileEdit)],
    ['[data-profile-delete]', 'deleteProfile', 'Удаляю профиль', (button) => deleteProfile(button.dataset.profileDelete)],
    ['[data-profile-download]', 'downloadProfile', 'Готовлю JSON профиля', (button) => downloadProfile(button.dataset.profileDownload)],
    ['[data-profile-download-anonymized]', 'downloadAnonymizedProfile', 'Готовлю профиль без секретов', (button) => downloadProfile(button.dataset.profileDownloadAnonymized, { anonymized: true })],
  ];
  const buttons = [];
  const handlers = {};
  for (const [selector, action, label, handler] of controls) {
    handlers[action] = handler;
    document.querySelectorAll(selector).forEach((button) => {
      button.dataset.action = action;
      button.dataset.busy = '1';
      button.dataset.busyLabel = label;
      buttons.push(button);
    });
  }
  bindActionControls({ state, render, handlers, buttons });
  document.querySelector('#profileEditName')?.addEventListener('input', (event) => {
    state.profileEditName = event.target.value;
  });
  document.querySelector('#profileEditDraft')?.addEventListener('input', (event) => {
    state.profileEditDraft = event.target.value;
  });
}
