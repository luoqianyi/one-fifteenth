import { loadPreferences, savePreferences } from '../services/preferences.js';
import { testConnection } from '../core/ai.js';
import { showToast } from '../ui/dialog.js';

export async function renderSettings(container) {
  const preferences = loadPreferences();
  container.innerHTML = `
    <section class="page settings-page">
      <header class="page-heading"><div><p class="eyebrow">SETTINGS</p><h1>设置</h1></div><p>连接你的 AI 服务，管理只属于这台设备的数据。</p></header>
      <div class="settings-grid">
        <form class="settings-card" data-form="ai">
          <div class="settings-card-heading"><span class="section-number">01</span><div><h2>AI 接口</h2><p>支持 OpenAI Chat Completions 兼容格式</p></div></div>
          <label class="field"><span>Base URL</span><input name="apiBaseUrl" type="url" required></label>
          <div class="field"><label for="api-key">API Key</label><div class="input-with-action"><input id="api-key" name="apiKey" type="password" autocomplete="off"><button type="button" aria-label="显示密钥" data-action="toggle-key">显示</button></div></div>
          <label class="field"><span>模型名称</span><input name="apiModel" required></label>
          <p class="security-note">此网站为纯前端应用，密钥会保存在当前浏览器中。请使用有限额、可撤销的专用密钥。</p>
          <div class="settings-actions"><button class="button" type="button" data-action="test-api">测试连接</button><button class="button primary" type="submit">保存 AI 设置</button></div>
        </form>
        <section class="settings-card">
          <div class="settings-card-heading"><span class="section-number">02</span><div><h2>提醒方式</h2><p>计时结束时如何提醒你</p></div></div>
          <label class="switch-row"><span><b>提示音</b><small>倒计时结束播放短提示音</small></span><input type="checkbox" data-preference="soundEnabled"></label>
          <label class="switch-row"><span><b>浏览器通知</b><small>切到其他页面时仍收到提醒</small></span><input type="checkbox" data-preference="notificationsEnabled"></label>
        </section>
        <section class="settings-card data-card">
          <div class="settings-card-heading"><span class="section-number">03</span><div><h2>数据与备份</h2><p>导出和恢复功能将在本地运行</p></div></div>
          <div class="data-actions"><button class="button" type="button" data-action="export" disabled>导出 JSON 备份</button><button class="button" type="button" data-action="import" disabled>导入备份</button></div>
        </section>
      </div>
    </section>`;

  const form = container.querySelector('[data-form="ai"]');
  form.elements.apiBaseUrl.value = preferences.apiBaseUrl;
  form.elements.apiKey.value = preferences.apiKey;
  form.elements.apiModel.value = preferences.apiModel;
  container.querySelector('[data-preference="soundEnabled"]').checked = preferences.soundEnabled;
  container.querySelector('[data-preference="notificationsEnabled"]').checked = preferences.notificationsEnabled;

  form.addEventListener('submit', event => {
    event.preventDefault();
    savePreferences({
      apiBaseUrl: form.elements.apiBaseUrl.value.trim(),
      apiKey: form.elements.apiKey.value.trim(),
      apiModel: form.elements.apiModel.value.trim()
    });
    showToast('AI 设置已保存', 'success');
  });

  form.querySelector('[data-action="toggle-key"]').addEventListener('click', event => {
    const keyInput = form.elements.apiKey;
    const hidden = keyInput.type === 'password';
    keyInput.type = hidden ? 'text' : 'password';
    event.currentTarget.textContent = hidden ? '隐藏' : '显示';
    event.currentTarget.setAttribute('aria-label', hidden ? '隐藏 API Key' : '显示 API Key');
  });

  form.querySelector('[data-action="test-api"]').addEventListener('click', async event => {
    const button = event.currentTarget;
    const config = {
      apiBaseUrl: form.elements.apiBaseUrl.value.trim(),
      apiKey: form.elements.apiKey.value.trim(),
      apiModel: form.elements.apiModel.value.trim()
    };
    if (!config.apiBaseUrl || !config.apiKey || !config.apiModel) {
      showToast('请先填写完整的 AI 接口配置', 'error');
      return;
    }
    button.disabled = true;
    button.textContent = '正在测试…';
    try {
      showToast(await testConnection(config), 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = '测试连接';
    }
  });

  for (const checkbox of container.querySelectorAll('[data-preference]')) {
    checkbox.addEventListener('change', () => savePreferences({ [checkbox.dataset.preference]: checkbox.checked }));
  }
}
