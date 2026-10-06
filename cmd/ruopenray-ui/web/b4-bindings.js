export function bindB4Controls({ state }) {
  for (const [id, key] of [['b4ApiUrl', 'b4ApiUrl'], ['b4ApiUsername', 'b4ApiUsername'], ['b4ApiPassword', 'b4ApiPassword'], ['b4CheckDomain', 'b4CheckDomain']]) {
    document.querySelector(`#${id}`)?.addEventListener('input', (event) => {
      state[key] = event.target.value;
      if (key === 'b4CheckDomain') state.b4DomainResult = null;
    });
  }
  document.querySelectorAll('[data-b4-domain-input]').forEach((input) => {
    input.addEventListener('input', (event) => {
      state.b4Domains ??= {};
      state.b4Domains[input.dataset.b4DomainInput] = event.target.value;
    });
  });
}
