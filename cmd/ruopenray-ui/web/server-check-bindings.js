export function bindServerCheckControls({ state, render }) {
  document.querySelector('#serverCheckTimeout')?.addEventListener('input', (event) => {
    state.serverCheckTimeout = event.target.value;
  });
  document.querySelector('#serverCheckAttempts')?.addEventListener('input', (event) => {
    state.serverCheckAttempts = event.target.value;
  });
  document.querySelector('#serverCheckMode')?.addEventListener('change', (event) => {
    state.serverCheckMode = event.target.value;
    render();
  });
  document.querySelector('#serverCheckUrl')?.addEventListener('input', (event) => {
    state.serverCheckUrl = event.target.value;
  });
  document.querySelector('#observatoryCheckUrl')?.addEventListener('input', (event) => {
    state.serverCheckUrl = event.target.value;
  });
  document.querySelector('#observatoryInterval')?.addEventListener('input', (event) => {
    state.observatoryInterval = event.target.value;
  });
}
