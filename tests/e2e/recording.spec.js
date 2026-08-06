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

async function setOutputPhaseRunning(page) {
  // 在注入前先确保会话被重载为专注页当前状态，再注入输出阶段会话并重载
  await page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem('fifteen-to-one:active-session'));
    session.phases = { input: 3, output: 3600 };
    session.phase = 'output';
    session.status = 'running';
    session.remaining = 3600;
    session.endAt = Date.now() + 3600 * 1000;
    sessionStorage.setItem('fifteen-to-one:active-session', JSON.stringify(session));
  });
  await page.reload();
  // 等待重新渲染后再注入 mock，避免组件重渲染时丢失 mock
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible();
  await mockMediaRecorder(page);
}

async function mockMediaRecorder(page) {
  await page.evaluate(() => {
    class MockMediaRecorder {
      static instances = [];
      constructor(stream) {
        this.state = 'inactive';
        this.ondataavailable = null;
        this.onstop = null;
        this.stream = stream;
        MockMediaRecorder.instances.push(this);
      }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['fake-audio'], { type: 'audio/webm' }) });
        this.onstop?.({});
      }
    }
    window.MediaRecorder = MockMediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [] }) },
      configurable: true
    });
    window.__mockRecorder = MockMediaRecorder;
  });
}

async function readRecordings(page) {
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
    const recordings = await getAll('recordings');
    db.close();
    return recordings.map(rec => ({ sessionId: rec.sessionId, duration: rec.duration, hasBlob: Boolean(rec.blob) }));
  });
}

test.beforeEach(async ({ page }) => reset(page));

test('输出阶段提供录音复盘，停止后记入录制', async ({ page }) => {
  await drawKeywordCard(page);
  // 等待专注页自动开始完成持久化，避免后续注入会话时被覆盖
  await expect(page.locator('.clock-time')).toHaveText('15:00');
  await setOutputPhaseRunning(page);

  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始录音' })).toBeVisible();
  await expect(page.locator('[data-action="record"]')).toBeVisible();

  // 点击开始录音 → 切换为停止录音
  await page.getByRole('button', { name: '开始录音' }).click();
  await expect(page.getByRole('button', { name: '停止录音' })).toBeVisible();
  await expect(page.locator('.recording-time')).not.toHaveText('00:00');

  // 停止录音 → 显示已保存时长
  await page.getByRole('button', { name: '停止录音' }).click();
  await expect(page.getByText('已保存', { exact: false })).toBeVisible();

  // 完成学习，录音应落库并关联 session
  await page.getByRole('button', { name: '跳过本阶段' }).click();
  await expect(page.getByText('学习完成，已记入档案')).toBeVisible();

  const recordings = await readRecordings(page);
  expect(recordings).toHaveLength(1);
  expect(recordings[0].sessionId).toBeTruthy();
  expect(recordings[0].hasBlob).toBe(true);
  expect(recordings[0].duration).toBeGreaterThan(0);
});