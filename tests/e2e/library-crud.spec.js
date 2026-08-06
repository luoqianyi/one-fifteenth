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

async function seedDomain(page, name) {
  await page.getByRole('button', { name: '创建第一个领域' }).click();
  await page.getByLabel('领域名称').fill(name);
  await page.getByRole('button', { name: '保存领域' }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function hoverThenClick(button) {
  // 编辑/删除按钮需悬停父项才可见（父项可能是 div 或 article）
  const parent = button.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " library-list-item ") or contains(concat(" ", normalize-space(@class), " "), " keyword-card ")][1]');
  await parent.hover();
  await button.click();
}

test('可编辑领域名称', async ({ page }) => {
  await seedDomain(page, '经济学');
  await page.getByRole('link', { name: '领域', exact: true }).click();
  await hoverThenClick(page.getByRole('button', { name: '编辑' }).first());
  await page.getByLabel('领域名称').fill('经济学新');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByText('经济学新', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('经济学新', { exact: true })).toBeVisible();
});

test('可编辑类目名称', async ({ page }) => {
  await seedDomain(page, '经济学');
  await page.getByRole('link', { name: '领域', exact: true }).click();
  await page.getByRole('button', { name: '添加类目' }).click();
  await page.getByLabel('类目名称').fill('微观经济学');
  await page.getByRole('button', { name: '保存类目' }).click();
  await hoverThenClick(page.locator('.library-panel').nth(1).getByRole('button', { name: '编辑' }).first());
  await page.getByLabel('类目名称').fill('宏观经济学');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByText('宏观经济学', { exact: true })).toBeVisible();
});

test('可编辑关键词名称与简介', async ({ page }) => {
  await seedDomain(page, '经济学');
  await page.getByRole('link', { name: '领域', exact: true }).click();
  await page.getByRole('button', { name: '添加类目' }).click();
  await page.getByLabel('类目名称').fill('微观经济学');
  await page.getByRole('button', { name: '保存类目' }).click();
  await page.getByRole('button', { name: '手动添加关键词' }).click();
  await page.getByLabel('关键词').fill('机会成本');
  await page.getByLabel('一句简介').fill('旧简介');
  await page.getByRole('button', { name: '保存关键词' }).click();
  await expect(page.getByRole('heading', { name: '机会成本' })).toBeVisible();

  await hoverThenClick(page.locator('.keyword-card').getByRole('button', { name: '编辑' }));
  await page.getByLabel('关键词').fill('沉没成本');
  await page.getByLabel('一句简介').fill('新简介');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByRole('heading', { name: '沉没成本' })).toBeVisible();
  await expect(page.getByText('新简介', { exact: true })).toBeVisible();
});

async function confirmDialogDelete(page) {
  await page.locator('dialog').getByRole('button', { name: '删除' }).click();
}

test('可删除关键词', async ({ page }) => {
  await seedDomain(page, '经济学');
  await page.getByRole('link', { name: '领域', exact: true }).click();
  await page.getByRole('button', { name: '添加类目' }).click();
  await page.getByLabel('类目名称').fill('微观经济学');
  await page.getByRole('button', { name: '保存类目' }).click();
  await page.getByRole('button', { name: '手动添加关键词' }).click();
  await page.getByLabel('关键词').fill('机会成本');
  await page.getByRole('button', { name: '保存关键词' }).click();
  await expect(page.getByRole('heading', { name: '机会成本' })).toBeVisible();

  await hoverThenClick(page.locator('.keyword-card').getByRole('button', { name: '删除' }));
  await confirmDialogDelete(page);
  await expect(page.getByRole('heading', { name: '机会成本' })).toHaveCount(0);
  await expect(page.getByText('还没有关键词', { exact: false })).toBeVisible();
});

test('可删除类目', async ({ page }) => {
  await seedDomain(page, '经济学');
  await page.getByRole('link', { name: '领域', exact: true }).click();
  await page.getByRole('button', { name: '添加类目' }).click();
  await page.getByLabel('类目名称').fill('微观经济学');
  await page.getByRole('button', { name: '保存类目' }).click();
  await expect(page.getByText('微观经济学', { exact: true })).toBeVisible();

  await hoverThenClick(page.locator('.library-panel').nth(1).getByRole('button', { name: '删除' }));
  await confirmDialogDelete(page);
  await expect(page.getByText('微观经济学', { exact: true })).toHaveCount(0);
});

test('删除领域后回退到空状态', async ({ page }) => {
  await seedDomain(page, '经济学');
  await page.getByRole('link', { name: '领域', exact: true }).click();
  const firstDomainActions = page.locator('.library-panel').first().locator('.item-actions');
  await hoverThenClick(firstDomainActions.getByRole('button', { name: '删除' }));
  await confirmDialogDelete(page);
  await expect(page.getByText('先创建一个学习领域', { exact: false })).toBeVisible();
});

test('可添加第二个领域', async ({ page }) => {
  await seedDomain(page, '经济学');
  await page.getByRole('link', { name: '领域', exact: true }).click();
  await page.getByRole('button', { name: '添加领域' }).click();
  await page.getByLabel('领域名称').fill('心理学');
  await page.getByRole('button', { name: '保存领域' }).click();
  await expect(page.getByText('心理学', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('心理学', { exact: true })).toBeVisible();
});
