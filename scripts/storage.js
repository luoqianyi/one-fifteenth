export const DB_NAME = 'fifteen-to-one';
export const DB_VERSION = 1;

export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('数据库事务已取消'));
  });
}

function ensureIndex(store, name) {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, name, { unique: false });
  }
}

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      const store = name => database.objectStoreNames.contains(name)
        ? transaction.objectStore(name)
        : database.createObjectStore(name, { keyPath: 'id' });

      store('domains');
      const categories = store('categories');
      ensureIndex(categories, 'domainId');
      const keywords = store('keywords');
      ['domainId', 'categoryId', 'lastStudiedAt'].forEach(name => ensureIndex(keywords, name));
      const sessions = store('sessions');
      ['keywordId', 'domainId', 'completedAt'].forEach(name => ensureIndex(sessions, name));
      const recordings = store('recordings');
      ensureIndex(recordings, 'sessionId');
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('数据库正在被其他页面使用，请关闭其他标签页后重试'));
  });
}

export async function runTransaction(storeNames, mode, operation) {
  const database = await openDatabase();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  const transaction = database.transaction(names, mode);
  const stores = Object.fromEntries(names.map(name => [name, transaction.objectStore(name)]));
  const done = transactionToPromise(transaction);

  try {
    const result = await operation(names.length === 1 ? stores[names[0]] : stores, transaction);
    await done;
    return result;
  } finally {
    database.close();
  }
}
