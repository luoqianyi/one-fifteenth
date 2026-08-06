import { test, expect } from '@playwright/test';

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

async function seedLearning(page) {
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('fifteen-to-one', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const now = new Date().toISOString();
    const earlier = new Date(Date.now() - 86400000).toISOString();
    const domain = { id: 'd1', name: '经济学', createdAt: earlier, updatedAt: earlier };
    const category = { id: 'c1', domainId: 'd1', name: '微观经济学', createdAt: earlier, updatedAt: earlier };
    const keyword = {
      id: 'k1', domainId: 'd1', categoryId: 'c1', name: '机会成本',
      level: 'beginner', summary: '选择一种方案时放弃的最佳替代方案的价值。',
      studyCount: 2, mastery: 3, lastStudiedAt: now, lastDrawnAt: earlier, skipCount: 0,
      createdAt: earlier, updatedAt: now
    };
    const session1 = { id: 's1', keywordId: 'k1', domainId: 'd1', startedAt: earlier, completedAt: earlier, inputSeconds: 900, outputSeconds: 60 };
    const session2 = { id: 's2', keywordId: 'k1', domainId: 'd1', startedAt: now, completedAt: now, inputSeconds: 870, outputSeconds: 55 };
    const recording = { id: 'r1', sessionId: 's2', duration: 62, blob: new Blob(['fake audio data'], { type: 'audio/webm' }) };
    const tx = db.transaction(['domains', 'categories', 'keywords', 'sessions', 'recordings'], 'readwrite');
    tx.objectStore('domains').put(domain);
    tx.objectStore('categories').put(category);
    tx.objectStore('keywords').put(keyword);
    tx.objectStore('sessions').put(session1);
    tx.objectStore('sessions').put(session2);
    tx.objectStore('recordings').put(recording);
    await new Promise(resolve => { tx.oncomplete = resolve; });
    db.close();
  });
}

test.beforeEach(async ({ page }) => reset(page));

test('学习档案展示统计、分组与复盘点', async ({ page }) => {
  await seedLearning(page);
  await page.getByRole('link', { name: '档案' }).click();

  await expect(page.getByRole('heading', { name: '学习档案' })).toBeVisible();
  await expect(page.getByText('累计学习', { exact: false })).toBeVisible();
  await expect(page.getByText('已掌握概念', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: '机会成本' })).toBeVisible();
  await expect(page.locator('.session-row')).toHaveCount(2);
  await expect(page.locator('.session-badge')).toHaveCount(2);

  const firstRow = page.locator('.session-group, .history-group').first();
  await firstRow.getByRole('button', { name: '详情' }).first().click();
  await expect(page.locator('.session-detail')).toBeVisible();
  await expect(page.getByText('复盘录音', { exact: false })).toBeVisible();
  await expect(page.locator('.recording-audio').first()).toBeVisible();
  await expect(page.locator('.recording-audio').first()).toHaveAttribute('src', /^blob:/);
});

test('重复进入档案页后点详情依然稳定展开', async ({ page }) => {
  await seedLearning(page);
  // 多次进出档案页，模拟 hash 路由反复渲染，监听器不得累积
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('link', { name: '领域' }).click();
    await expect(page.getByRole('heading', { name: '领域与词库' })).toBeVisible();
    await page.getByRole('link', { name: '档案' }).click();
    await expect(page.getByRole('heading', { name: '学习档案' })).toBeVisible();
  }

  const firstRow = page.locator('.history-group').first();
  await firstRow.getByRole('button', { name: '详情' }).first().click();
  await expect(page.locator('.session-detail')).toHaveCount(1);
  await expect(firstRow.getByRole('button', { name: '收起' })).toBeVisible();
  await expect(page.locator('.recording-audio')).toHaveCount(1);
});
