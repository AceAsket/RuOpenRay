export function bindActionControls({ state, render, handlers }) {
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      try {
        if (button.classList.contains('modal-backdrop')) {
          const startedInModal = button.dataset.pointerStartedInModal === '1';
          button.dataset.pointerStartedInModal = '0';
          if (startedInModal || event.target !== button) return;
        }
        const handler = handlers[button.dataset.action];
        if (handler) await handler(button, event);
      } catch (error) {
        state.configTesting = false;
        state.configApplying = false;
        state.serverChecking = false;
        state.serverCheckingTags = [];
        state.message = error.message;
        render();
      }
    });
  });
}
