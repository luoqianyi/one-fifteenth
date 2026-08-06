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
  },

  // 删除该会话关联的录音（若有）
  async removeRecordingsForSession(sessionId) {
    const recordings = await this.getByIndex('recordings', 'sessionId', sessionId);
    for (const recording of recordings) {
      await this.remove('recordings', recording.id);
    }
  },

  // 删除关键词及其关联的学习记录
  async removeKeywordCascade(keywordId) {
    const sessions = await this.getByIndex('sessions', 'keywordId', keywordId);
    for (const session of sessions) {
      await this.removeRecordingsForSession(session.id);
      await this.remove('sessions', session.id);
    }
    await this.remove('keywords', keywordId);
  },

  // 删除类目及其下所有关键词、学习记录
  async removeCategoryCascade(categoryId) {
    const keywords = await this.getByIndex('keywords', 'categoryId', categoryId);
    for (const keyword of keywords) {
      await this.removeKeywordCascade(keyword.id);
    }
    await this.remove('categories', categoryId);
  },

  // 删除领域及其下所有类目、关键词、学习记录
  async removeDomainCascade(domainId) {
    const categories = await this.getByIndex('categories', 'domainId', domainId);
    for (const category of categories) {
      await this.removeCategoryCascade(category.id);
    }
    const sessions = await this.getByIndex('sessions', 'domainId', domainId);
    for (const session of sessions) {
      await this.removeRecordingsForSession(session.id);
      await this.remove('sessions', session.id);
    }
    await this.remove('domains', domainId);
  }
};
