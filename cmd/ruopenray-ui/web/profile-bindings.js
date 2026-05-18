export function bindProfileControls({ activateProfile }) {
  document.querySelectorAll('[data-profile]').forEach((button) => {
    button.addEventListener('click', () => activateProfile(button.dataset.profile));
  });
}
