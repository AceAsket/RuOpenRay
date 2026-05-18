export function bindConfigControls({ state }) {
  const jsonDraftNode = document.querySelector('#jsonDraft');
  jsonDraftNode?.addEventListener('input', (event) => {
    state.jsonDraft = event.target.value;
    state.configScrollTop = event.target.scrollTop;
    try {
      state.config = JSON.parse(event.target.value);
    } catch {
      // Keep the draft text editable until the user fixes JSON.
    }
  });
  jsonDraftNode?.addEventListener('scroll', (event) => {
    state.configScrollTop = event.target.scrollTop;
  }, { passive: true });
}
