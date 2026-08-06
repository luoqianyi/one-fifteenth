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

async function drawKeywordCard(page) {
  await page.getByRole('button', { name: '创建第一个领域' }).click();
  await page.getByLabel('领域名称').fill('经济学');
  await page.getByRole('button', { name: '保存领域' }).click();
  await page.getByRole('link', { name: '领域', exact: true }).click();
  await page.getByRole('button', { name: '添加类目' }).click();
  await page.getByLabel('类目名称').fill('微观经济学');
  await page.getByRole('button', { name: '保存类目' }).click();
  await page.getByRole('button', { name: '手动添加关键词' }).click();
  await page.getByLabel('关键词').fill('机会成本');
  await page.getByLabel('难度').selectOption('beginner');
  await page.getByLabel('一句简介').fill('选择一种方案时放弃的最佳替代方案的价值。');
  await page.getByRole('button', { name: '保存关键词' }).click();
  await page.getByRole('link', { name: '抽取' }).click();
  await page.getByRole('button', { name: '抽取关键词' }).click();
  await page.getByRole('button', { name: '开始 15 分钟' }).click();
}

async function setShortPhases(page) {
  // 先停止计时器再注入短会话，避免自动开始/暂停事件反复覆盖会话
  await page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem('fifteen-to-one:active-session'));
    session.phases = { input: 5, output: 2 };
    session.status = 'paused';
    session.remaining = 5;
    session.endAt = null;
    sessionStorage.setItem('fifteen-to-one:active-session', JSON.stringify(session));
  });
  await page.reload();
}

async function readLearningState(page) {
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
    const [keywords, sessions] = await Promise.all([getAll('keywords'), getAll('sessions')]);
    db.close();
    return { studyCount: keywords[0]?.studyCount, sessionCount: sessions.length };
  });
}

test.beforeEach(async ({ page }) => reset(page));

test('双阶段计时器完整流程', async ({ page }) => {
  await drawKeywordCard(page);

  await expect(page.getByRole('heading', { name: '机会成本' })).toBeVisible();
  await expect(page.locator('.clock-time')).toHaveText(/^(14:5[0-9]|15:00)$/);
  await expect(page.locator('[data-phase="input"]')).toHaveClass(/is-active/);

  await setShortPhases(page);
  // 注入后保持暂停状态（reload 后应立即显示「继续」）
  await expect(page.getByRole('button', { name: '继续' })).toBeVisible();
  await expect(page.locator('.clock-time')).toHaveText('00:05');

  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible();
  await expect(page.locator('.clock-time')).not.toHaveText('00:05');
  await page.getByRole('button', { name: '暂停' }).click();
  const frozen = await page.locator('.clock-time').textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator('.clock-time')).toHaveText(frozen);

  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.getByText('进入输出阶段')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-phase="output"]')).toHaveClass(/is-active/);

  await expect(page.getByText('学习完成，已记入档案')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('link', { name: '去抽卡' })).toBeVisible();

  const learning = await readLearningState(page);
  expect(learning.studyCount).toBe(1);
  expect(learning.sessionCount).toBe(1);
});
