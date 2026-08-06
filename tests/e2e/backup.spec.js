import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function reset(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise(resolve => {
      const request = indexedDB.deleteDatabase('fifteen-to-one');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
  await page.reload();
}

async function seedData(page) {
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('fifteen-to-one', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const now = new Date().toISOString();
    const earlier = new Date(Date.now() - 86400000).toISOString();
    const tx = db.transaction(['domains', 'categories', 'keywords', 'sessions', 'recordings'], 'readwrite');
    tx.objectStore('domains').put({ id: 'd1', name: '经济学', createdAt: earlier, updatedAt: earlier });
    tx.objectStore('categories').put({ id: 'c1', domainId: 'd1', name: '微观经济学', createdAt: earlier, updatedAt: earlier });
    tx.objectStore('keywords').put({ id: 'k1', domainId: 'd1', categoryId: 'c1', name: '机会成本', level: 'beginner', summary: '选择一种方案时放弃的最佳替代方案的价值。', studyCount: 2, mastery: 3, lastStudiedAt: now, lastDrawnAt: earlier, skipCount: 0, createdAt: earlier, updatedAt: now });
    tx.objectStore('sessions').put({ id: 's1', keywordId: 'k1', domainId: 'd1', startedAt: earlier, completedAt: earlier, inputSeconds: 900, outputSeconds: 60 });
    await new Promise(resolve => { tx.oncomplete = resolve; });
    db.close();
  });
  await page.reload();
}

async function readAll(page) {
  return page.evaluate(async () => {
    const open = name => new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await open('fifteen-to-one');
    const getAll = storeName => new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [domains, keywords, sessions, categories, recordings] = await Promise.all([
      getAll('domains'), getAll('keywords'), getAll('sessions'), getAll('categories'), getAll('recordings')
    ]);
    db.close();
    return { domains: domains.length, keywords: keywords.length, sessions: sessions.length, categories: categories.length, recordings: recordings.length };
  });
}

test.beforeEach(async ({ page }) => reset(page));

test('导出备份 JSON 后清空再导入恢复数据', async ({ page }) => {
  await seedData(page);
  await page.getByRole('link', { name: '设置', exact: true }).click();

  const exportBtn = page.getByRole('button', { name: /导出 JSON 备份/ });
  await expect(exportBtn).toBeEnabled();

  // 触发下载并读取文件内容
  const downloadPromise = page.waitForEvent('download');
  await exportBtn.click();
  const download = await downloadPromise;
  const filePath = await download.path();
  const fileContent = readFileSync(filePath, 'utf8');
  const backup = JSON.parse(fileContent);
  expect(backup.version).toBeDefined();
  expect(backup.exportedAt).toBeDefined();
  expect(backup.data.domains).toHaveLength(1);
  expect(backup.data.keywords).toHaveLength(1);
  expect(backup.data.sessions).toHaveLength(1);
  expect(backup.data.categories).toHaveLength(1);
  expect(backup.data.recordings).toHaveLength(0);
  expect(backup.data.keywords[0].name).toBe('机会成本');

  // 清空数据（通过 localStorage 清理 + indexedDB 删除后重载）
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise(resolve => {
      const request = indexedDB.deleteDatabase('fifteen-to-one');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
  await page.reload();
  const empty = await readAll(page);
  expect(empty.keywords).toBe(0);

  // 导入备份
  await page.getByRole('link', { name: '设置', exact: true }).click();
  const importLabel = page.locator('label[data-action="import"]');
  await expect(importLabel).toBeEnabled();
  const input = importLabel.locator('input[type="file"]');
  await input.setInputFiles(filePath);

  // 验证恢复
  await expect(page.getByText('数据已恢复', { exact: false })).toBeVisible({ timeout: 10000 });
  const restored = await readAll(page);
  expect(restored.domains).toBe(1);
  expect(restored.keywords).toBe(1);
  expect(restored.categories).toBe(1);
  expect(restored.sessions).toBe(1);
});