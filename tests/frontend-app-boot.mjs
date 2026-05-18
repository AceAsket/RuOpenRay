const storage = {
  data: new Map(),
  getItem(key) {
    return this.data.get(key) || null;
  },
  setItem(key, value) {
    this.data.set(key, String(value));
  },
  removeItem(key) {
    this.data.delete(key);
  }
};

class TestElement {
  constructor(selector = '') {
    this.selector = selector;
    this.innerHTML = '';
    this.value = '';
    this.checked = false;
    this.dataset = {};
    this.classList = {
      add() {},
      remove() {}
    };
  }

  addEventListener() {}
  focus() {}
  setSelectionRange() {}
  querySelector() {
    return new TestElement();
  }
  querySelectorAll() {
    return [];
  }
}

const app = new TestElement('#app');

globalThis.localStorage = storage;
globalThis.window = {
  addEventListener() {},
  localStorage: storage
};
globalThis.document = {
  querySelector(selector) {
    if (selector === '#app') return app;
    return new TestElement(selector);
  },
  querySelectorAll() {
    return [];
  },
  addEventListener() {}
};
globalThis.prompt = () => '';

await import(`../cmd/ruopenray-ui/web/app.js?boot=${Date.now()}`);

if (!app.innerHTML.includes('login-card')) {
  throw new Error('app.js did not render login view on cold boot');
}

console.log('Frontend app boot passed');
