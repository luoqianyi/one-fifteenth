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

async function createKeyword(page) {
  await page.getByRole('button', { name: '创建第一个领域' }).click();
  await page.getByLabel('领域名称').fill('经济学');
  await page.getByRole('button', { name: '保存领域' }).click();
  await expect(page.getByText('经济学', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '领域', exact: true }).click();
  await page.getByRole('button', { name: '添加类目' }).click();
  await page.getByLabel('类目名称').fill('微观经济学');
  await page.getByRole('button', { name: '保存类目' }).click();
  await page.getByRole('button', { name: '手动添加关键词' }).click();
  await page.getByLabel('关键词').fill('机会成本');
  await page.getByLabel('难度').selectOption('beginner');
  await page.getByLabel('一句简介').fill('选择一种方案时放弃的最佳替代方案的价值。');
  await page.getByRole('button', { name: '保存关键词' }).click();
  await expect(page.getByRole('heading', { name: '机会成本' })).toBeVisible();
}

test.beforeEach(async ({ page }) => reset(page));

test('从词库加权抽取完整的关键词卡', async ({ page }) => {
  await createKeyword(page);
  await page.getByRole('link', { name: '抽取' }).click();
  await page.getByRole('button', { name: '抽取关键词' }).click();
  await expect(page.getByRole('heading', { name: '机会成本' })).toBeVisible();
  await expect(page.locator('.card-breadcrumb')).toContainText('微观经济学');
  await expect(page.locator('.level-badge')).toContainText('入门');
  await expect(page.getByRole('button', { name: '开始 15 分钟' })).toBeVisible();
});
