import { loadPreferences, savePreferences } from './preferences.js';
import { repository } from '../repository.js';

const STORES = ['domains', 'categories', 'keywords', 'sessions', 'recordings'];
const VERSION = 1;

export function downloadBackup(backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `fifteen-to-one-backup-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return anchor;
}

export async function exportBackup() {
  const data = {};
  for (const store of STORES) {
    data[store] = await repository.list(store);
  }
  const { apiKey, ...preferences } = loadPreferences();
  const backup = {
    version: VERSION,
    exportedAt: new Date().toISOString(),
    app: 'fifteen-to-one',
    data,
    preferences
  };
  return backup;
}

function validateBackup(backup) {
  if (!backup || backup.app !== 'fifteen-to-one' || !backup.data) {
    throw new Error('这不是有效的备份文件');
  }
  if (!Array.isArray(backup.data.domains) || !Array.isArray(backup.data.keywords)) {
    throw new Error('备份文件缺少数据');
  }
}

export async function importBackup(blob) {
  let backup;
  try {
    backup = JSON.parse(await blob.text());
  } catch {
    throw new Error('无法解析备份文件');
  }
  validateBackup(backup);

  // 清空现有数据后写入备份内容
  for (const store of STORES) {
    const existing = await repository.list(store);
    for (const item of existing) {
      await repository.remove(store, item.id);
    }
  }
  for (const store of STORES) {
    const items = Array.isArray(backup.data[store]) ? backup.data[store] : [];
    for (const item of items) {
      await repository.put(store, item);
    }
  }
  if (backup.preferences && typeof backup.preferences === 'object') {
    const { apiKey, ...safe } = backup.preferences;
    const current = loadPreferences();
    savePreferences({ ...current, ...safe });
  }
  return { counts: Object.fromEntries(STORES.map(store => [store, backup.data[store]?.length ?? 0])) };
}