export function bindImportControls({ state, render }) {
  document.querySelector('#importLink')?.addEventListener('input', (event) => {
    state.importLink = event.target.value;
    state.importPreview = null;
  });
  document.querySelector('#importOutboundTag')?.addEventListener('input', (event) => {
    state.importOutboundTag = event.target.value;
  });
  document.querySelector('#subscriptionUrl')?.addEventListener('input', (event) => {
    state.subscriptionUrl = event.target.value;
    state.subscriptionPreview = null;
  });
  document.querySelector('#subscriptionAutoBalancer')?.addEventListener('change', (event) => {
    state.subscriptionAutoBalancer = event.target.checked;
    render();
  });
  document.querySelector('#subscriptionBalancerTag')?.addEventListener('input', (event) => {
    state.subscriptionBalancerTag = event.target.value;
  });
  document.querySelector('#subscriptionBalancerStrategy')?.addEventListener('change', (event) => {
    state.subscriptionBalancerStrategy = event.target.value;
    render();
  });
}
