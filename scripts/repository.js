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

  async getByIndex(storeName, indexName, value) {
    return runTransaction(storeName, 'readonly', store => requestToPromise(store.index(indexName).getAll(value)));
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
  },

  async createCategory(domainId, name) {
    const now = new Date().toISOString();
    const category = {
      id: crypto.randomUUID(),
      domainId,
      name: name.trim(),
      createdAt: now,
      updatedAt: now
    };
    return this.put('categories', category);
  },

  async createKeyword(input) {
    const now = new Date().toISOString();
    const keyword = {
      id: crypto.randomUUID(),
      domainId: input.domainId,
      categoryId: input.categoryId,
      name: input.name.trim(),
      level: input.level,
      summary: input.summary.trim(),
      studyCount: 0,
      mastery: 0,
      lastStudiedAt: null,
      lastDrawnAt: null,
      skipCount: 0,
      createdAt: now,
      updatedAt: now
    };
    return this.put('keywords', keyword);
  }
};
