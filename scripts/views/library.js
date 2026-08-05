import { openDialog, showToast } from '../ui/dialog.js';
import { loadPreferences } from '../services/preferences.js';
import { removeDuplicateSuggestions, requestSuggestions } from '../core/ai.js';

let selectedDomainId = null;
let selectedCategoryId = null;

const levelLabel = {
  beginner: '入门',
  advanced: '进阶',
  comprehensive: '综合'
};

function createField(label, control) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(text, control);
  return wrapper;
}

function textInput(name, placeholder, maxLength) {
  const input = document.createElement('input');
  input.name = name;
  input.placeholder = placeholder;
  input.maxLength = maxLength;
  input.required = true;
  input.autocomplete = 'off';
  return input;
}

async function openCategoryDialog(context, domainId) {
  const content = document.createElement('div');
  content.className = 'form-stack';
  content.append(createField('类目名称', textInput('name', '例如：微观经济学', 60)));
  openDialog({
    eyebrow: 'NEW CATEGORY',
    title: '添加学习类目',
    content,
    confirmLabel: '保存类目',
    onConfirm: async data => {
      const name = String(data.get('name')).trim();
      if (!name) throw new Error('请输入类目名称');
      const existing = await context.repository.getByIndex('categories', 'domainId', domainId);
      if (existing.some(item => item.name.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))) {
        throw new Error('这个类目已经存在');
      }
      const category = await context.repository.createCategory(domainId, name);
      selectedCategoryId = category.id;
      await renderLibrary(context.container, context);
      showToast('类目已添加', 'success');
    }
  });
}

async function openKeywordDialog(context, domainId, categoryId) {
  const content = document.createElement('div');
  content.className = 'form-stack';
  const name = textInput('name', '例如：机会成本', 80);
  const level = document.createElement('select');
  level.name = 'level';
  level.setAttribute('aria-label', '难度');
  level.innerHTML = '<option value="beginner">入门</option><option value="advanced">进阶</option><option value="comprehensive">综合</option>';
  const summary = document.createElement('textarea');
  summary.name = 'summary';
  summary.maxLength = 240;
  summary.rows = 4;
  summary.placeholder = '用一句话说明这个概念';
  content.append(
    createField('关键词', name),
    createField('难度', level),
    createField('一句简介', summary)
  );
  openDialog({
    eyebrow: 'NEW KEYWORD',
    title: '添加关键词卡',
    content,
    confirmLabel: '保存关键词',
    onConfirm: async data => {
      const keywordName = String(data.get('name')).trim();
      if (!keywordName) throw new Error('请输入关键词');
      const existing = await context.repository.getByIndex('keywords', 'categoryId', categoryId);
      if (existing.some(item => item.name.toLocaleLowerCase('zh-CN') === keywordName.toLocaleLowerCase('zh-CN'))) {
        throw new Error('这个关键词已经存在');
      }
      await context.repository.createKeyword({
        domainId,
        categoryId,
        name: keywordName,
        level: String(data.get('level')),
        summary: String(data.get('summary') ?? '')
      });
      await renderLibrary(context.container, context);
      showToast('关键词已加入卡组', 'success');
    }
  });
}

async function openAiSuggestionDialog(context, domain, category) {
  const preferences = loadPreferences();
  if (!preferences.apiKey || !preferences.apiBaseUrl || !preferences.apiModel) {
    showToast('请先在设置页填写 AI 接口配置', 'error');
    return;
  }

  const content = document.createElement('div');
  content.className = 'form-stack';
  const count = document.createElement('input');
  count.name = 'count';
  count.type = 'number';
  count.min = '5';
  count.max = '30';
  count.value = '12';
  content.append(createField('建议数量', count));
  const hint = document.createElement('p');
  hint.className = 'form-hint';
  hint.textContent = `AI 将为“${domain.name} / ${category.name}”整理入门、进阶与综合候选。`;
  content.append(hint);

  let mode = 'generate';
  let candidates = [];
  openDialog({
    eyebrow: 'AI CURATION',
    title: 'AI 建议关键词',
    content,
    confirmLabel: '生成建议',
    onConfirm: async (data, form, dialog) => {
      if (mode === 'generate') {
        const existing = await context.repository.getByIndex('keywords', 'categoryId', category.id);
        const generated = await requestSuggestions(preferences, {
          domain: domain.name,
          category: category.name,
          count: Math.min(30, Math.max(5, Number(data.get('count')) || 12))
        });
        candidates = removeDuplicateSuggestions(generated, existing.map(item => item.name));
        if (!candidates.length) throw new Error('生成结果都已存在于当前类目');

        content.replaceChildren();
        const summary = document.createElement('p');
        summary.className = 'candidate-summary';
        summary.textContent = `得到 ${candidates.length} 个候选。取消不需要的项目，也可以直接修改名称与简介。`;
        const list = document.createElement('div');
        list.className = 'candidate-list';
        candidates.forEach((candidate, index) => {
          const row = document.createElement('div');
          row.className = 'candidate-row';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.name = 'selectedSuggestion';
          checkbox.value = String(index);
          checkbox.checked = true;
          checkbox.setAttribute('aria-label', `选择 ${candidate.name}`);
          const fields = document.createElement('div');
          fields.className = 'candidate-fields';
          const name = document.createElement('input');
          name.value = candidate.name;
          name.maxLength = 80;
          name.dataset.candidateName = String(index);
          name.setAttribute('aria-label', `${candidate.name} 名称`);
          const info = document.createElement('div');
          info.className = 'candidate-info';
          const badge = document.createElement('span');
          badge.textContent = levelLabel[candidate.level];
          const description = document.createElement('input');
          description.value = candidate.summary;
          description.maxLength = 240;
          description.dataset.candidateSummary = String(index);
          description.setAttribute('aria-label', `${candidate.name} 简介`);
          info.append(badge, description);
          fields.append(name, info);
          row.append(checkbox, fields);
          list.append(row);
        });
        content.append(summary, list);
        mode = 'select';
        dialog.querySelector('[type="submit"]').textContent = '加入已选关键词';
        return false;
      }

      const selected = [...form.querySelectorAll('input[name="selectedSuggestion"]:checked')]
        .map(input => Number(input.value));
      if (!selected.length) throw new Error('请至少选择一个关键词');
      for (const index of selected) {
        const candidate = candidates[index];
        await context.repository.createKeyword({
          domainId: domain.id,
          categoryId: category.id,
          name: form.querySelector(`[data-candidate-name="${index}"]`).value,
          level: candidate.level,
          summary: form.querySelector(`[data-candidate-summary="${index}"]`).value
        });
      }
      await renderLibrary(context.container, context);
      showToast(`已加入 ${selected.length} 个关键词`, 'success');
      return true;
    }
  });
}

function appendDomainButtons(host, domains, activeId, onSelect) {
  for (const domain of domains) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'library-list-item';
    if (domain.id === activeId) button.setAttribute('aria-current', 'true');
    const name = document.createElement('strong');
    name.textContent = domain.name;
    button.append(name);
    button.addEventListener('click', () => onSelect(domain.id));
    host.append(button);
  }
}

function appendCategoryButtons(host, categories, activeId, onSelect) {
  for (const category of categories) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'library-list-item';
    if (category.id === activeId) button.setAttribute('aria-current', 'true');
    button.textContent = category.name;
    button.addEventListener('click', () => onSelect(category.id));
    host.append(button);
  }
}

function appendKeywordCards(host, keywords) {
  if (!keywords.length) {
    host.innerHTML = '<div class="panel-empty"><p>这个类目还没有关键词。</p><small>手动添加，或让 AI 为你整理一组候选。</small></div>';
    return;
  }
  for (const keyword of keywords) {
    const card = document.createElement('article');
    card.className = 'keyword-card';
    const meta = document.createElement('div');
    meta.className = 'keyword-meta';
    meta.textContent = levelLabel[keyword.level] ?? '入门';
    const title = document.createElement('h3');
    title.textContent = keyword.name;
    const summary = document.createElement('p');
    summary.textContent = keyword.summary || '还没有添加简介。';
    card.append(meta, title, summary);
    host.append(card);
  }
}

export async function renderLibrary(container, context) {
  context.container = container;
  const domains = await context.repository.list('domains');
  if (!domains.length) {
    container.innerHTML = '<section class="page"><p class="eyebrow">LIBRARY</p><h1>领域与词库</h1><div class="panel-empty"><p>先创建一个学习领域。</p></div></section>';
    return;
  }
  if (!domains.some(item => item.id === selectedDomainId)) selectedDomainId = domains[0].id;
  const categories = await context.repository.getByIndex('categories', 'domainId', selectedDomainId);
  if (!categories.some(item => item.id === selectedCategoryId)) selectedCategoryId = categories[0]?.id ?? null;
  const keywords = selectedCategoryId
    ? await context.repository.getByIndex('keywords', 'categoryId', selectedCategoryId)
    : [];

  container.innerHTML = `
    <section class="page library-page">
      <header class="page-heading"><div><p class="eyebrow">LIBRARY</p><h1>领域与词库</h1></div><p>把好奇心拆成可以反复抽取的概念卡。</p></header>
      <div class="library-grid">
        <section class="library-panel"><div class="panel-heading"><span>学习领域</span></div><div class="library-list" data-list="domains"></div></section>
        <section class="library-panel"><div class="panel-heading"><span>类目</span><button class="text-button" type="button" data-action="add-category">添加类目</button></div><div class="library-list" data-list="categories"></div></section>
        <section class="library-panel keyword-panel"><div class="panel-heading"><span>关键词卡</span><div class="panel-actions"><button class="text-button" type="button" data-action="ai-keywords" ${selectedCategoryId ? '' : 'disabled'}>AI 建议关键词</button><button class="text-button" type="button" data-action="add-keyword" ${selectedCategoryId ? '' : 'disabled'}>手动添加关键词</button></div></div><div class="keyword-grid" data-list="keywords"></div></section>
      </div>
    </section>`;

  appendDomainButtons(container.querySelector('[data-list="domains"]'), domains, selectedDomainId, async id => {
    selectedDomainId = id;
    selectedCategoryId = null;
    await renderLibrary(container, context);
  });
  appendCategoryButtons(container.querySelector('[data-list="categories"]'), categories, selectedCategoryId, async id => {
    selectedCategoryId = id;
    await renderLibrary(container, context);
  });
  if (!categories.length) {
    container.querySelector('[data-list="categories"]').innerHTML = '<div class="panel-empty"><p>还没有类目。</p></div>';
  }
  appendKeywordCards(container.querySelector('[data-list="keywords"]'), keywords);

  container.querySelector('[data-action="add-category"]').addEventListener('click', () => openCategoryDialog(context, selectedDomainId));
  container.querySelector('[data-action="add-keyword"]').addEventListener('click', () => openKeywordDialog(context, selectedDomainId, selectedCategoryId));
  container.querySelector('[data-action="ai-keywords"]').addEventListener('click', () => {
    const domain = domains.find(item => item.id === selectedDomainId);
    const category = categories.find(item => item.id === selectedCategoryId);
    if (domain && category) openAiSuggestionDialog(context, domain, category);
  });
}
