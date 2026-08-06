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

test('保存 OpenAI 兼容配置并从 AI 候选加入关键词', async ({ page }) => {
  await page.getByRole('link', { name: '设置' }).click();
  await page.getByLabel('Base URL').fill('https://api.example.test/v1');
  await page.getByLabel('API Key').fill('secret-test-key');
  await page.getByLabel('模型名称').fill('test-model');
  await page.getByRole('button', { name: '保存 AI 设置' }).click();
  await expect(page.getByText('AI 设置已保存')).toBeVisible();

  await page.getByRole('link', { name: '抽取' }).click();
  await page.getByRole('button', { name: '创建第一个领域' }).click();
  await page.getByLabel('领域名称').fill('经济学');
  await page.getByRole('button', { name: '保存领域' }).click();
  await expect(page.getByText('经济学', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '领域', exact: true }).click();
  await page.getByRole('button', { name: '添加类目' }).click();
  await page.getByLabel('类目名称').fill('宏观经济学');
  await page.getByRole('button', { name: '保存类目' }).click();

  await page.route('**/chat/completions', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      suggestions: [
        { name: '边际效用', level: 'beginner', summary: '新增一单位消费带来的效用变化' },
        { name: '流动性陷阱', level: 'advanced', summary: '利率极低时货币政策效力减弱' }
      ]
    }) } }] })
  }));

  await page.getByRole('button', { name: 'AI 建议关键词' }).click();
  await page.getByRole('button', { name: '生成建议' }).click();
  await expect(page.getByRole('textbox', { name: '边际效用 名称' })).toHaveValue('边际效用');
  await page.getByLabel('选择 流动性陷阱').uncheck();
  await page.getByRole('button', { name: '加入已选关键词' }).click();
  await expect(page.getByRole('heading', { name: '边际效用' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '流动性陷阱' })).toHaveCount(0);
});
