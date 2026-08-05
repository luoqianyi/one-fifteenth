import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise(resolve => {
      const request = indexedDB.deleteDatabase('fifteen-to-one');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
  await page.reload();
});

test('首次访问显示品牌、导航和开始引导', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '十五分之一' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
  await expect(page.getByRole('button', { name: '创建第一个领域' })).toBeVisible();
});

test('创建领域后刷新页面仍保留', async ({ page }) => {
  await page.getByRole('button', { name: '创建第一个领域' }).click();
  await page.getByLabel('领域名称').fill('经济学');
  await page.getByRole('button', { name: '保存领域' }).click();
  await expect(page.getByText('经济学', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('经济学', { exact: true })).toBeVisible();
});
