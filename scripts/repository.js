import { requestToPromise, runTransaction } from './storage.js';

export const repository = {
  async list(storeName) {
    return runTransaction(storeName, 'readonly', store => requestToPromise(store.getAll()));
  },

  async get(storeName, id) {
    return runTransaction(storeName, 'readonly', store => requestToPromise(store.get(id)));
  },

  async put(storeName, value) {
    await runTransaction(storeName, 'readwrite', store => requestToPromise(store.put(value)));
    return value;
  },

  async remove(storeName, id) {
    return runTransaction(storeName, 'readwrite', store => requestToPromise(store.delete(id)));
  },

  async createDomain(name) {
    const now = new Date().toISOString();
    const domain = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: now,
      updatedAt: now
    };
    return this.put('domains', domain);
  }
};
