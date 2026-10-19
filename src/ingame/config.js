const root = require('../config');
const store = require('../store');

function commands() {
  return store.load().commands || {};
}

module.exports = {
  get brand() {
    return root.brand;
  },
  get discord() {
    return root.discord;
  },
  get timeclock() {
    return root.timeclock;
  },
  fivem: {
    get baseUrl() {
      return String(commands().fivemUrl || root.fivem.endpoint || 'http://127.0.0.1:30120').replace(/\/$/, '');
    },
    get resource() {
      return commands().fivemResource || 'sunville_bridge';
    },
    get token() {
      return commands().fivemToken || process.env.FIVEM_TOKEN || '';
    },
    endpoint(path) {
      return `${this.baseUrl}/${this.resource}${path}`;
    },
  },
};
