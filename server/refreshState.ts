let triggerId = 0;
let lastUpdated: Date | null = null;

export const refreshState = {
  get triggerId() { return triggerId; },
  get lastUpdated() { return lastUpdated; },
  trigger() {
    triggerId += 1;
    lastUpdated = new Date();
  },
};
