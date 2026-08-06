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

function confirmDestructive({ title, message, confirmLabel = '删除', onConfirm }) {
  const content = document.createElement('div');
  const p = document.createElement('p');
  p.className = 'confirm-message';
  p.textContent = message;
  content.append(p);
  openDialog({
    eyebrow: 'CONFIRM',
    title,
    content,
    confirmLabel,
    onConfirm: async () => {
      await onConfirm();
      return true;
    }
  });
}

function createField(label, control) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(text, control);
  return wrapper;
}

function textInput(name, placeholder, maxLength, value = '') {
  const input = document.createElement('input');
  input.name = name;
  input.placeholder = placeholder;
  input.maxLength = maxLength;
  input.required = true;
  input.autocomplete = 'off';
  if (value) input.value = value;
  return input;
}

async function openCategoryDialog(context, domainId, existing = null) {
  const content = document.createElement('div');
  content.className = 'form-stack';
  content.append(createField('类目名称', textInput('name', '例如：微观经济学', 60, existing?.name ?? '')));
  openDialog({
    eyebrow: existing ? 'EDIT CATEGORY' : 'NEW CATEGORY',
    title: existing ? '编辑学习类目' : '添加学习类目',
    content,
    confirmLabel: existing ? '保存修改' : '保存类目',
    onConfirm: async data => {
      const name = String(data.get('name')).trim();
      if (!name) throw new Error('请输入类目名称');
      const found = await context.repository.getByIndex('categories', 'domainId', domainId);
      if (found.some(item => item.id !== existing?.id && item.name.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))) {
        throw new Error('这个类目已经存在');
      }
      if (existing) {
        await context.repository.put('categories', { ...existing, name, updatedAt: new Date().toISOString() });
        showToast('类目已更新', 'success');
      } else {
        const category = await context.repository.createCategory(domainId, name);
        selectedCategoryId = category.id;
        showToast('类目已添加', 'success');
      }
      await renderLibrary(context.container, context);
    }
  });
}

async function openKeywordDialog(context, domainId, categoryId, existing = null) {
  const content = document.createElement('div');
  content.className = 'form-stack';
  const name = textInput('name', '例如：机会成本', 80, existing?.name ?? '');
  const level = document.createElement('select');
  level.name = 'level';
  level.setAttribute('aria-label', '难度');
  level.innerHTML = '<option value="beginner">入门</option><option value="advanced">进阶</option><option value="comprehensive">综合</option>';
  level.value = existing?.level ?? 'beginner';
  const summary = document.createElement('textarea');
  summary.name = 'summary';
  summary.maxLength = 240;
  summary.rows = 4;
  summary.placeholder = '用一句话说明这个概念';
  if (existing?.summary) summary.value = existing.summary;
  content.append(
    createField('关键词', name),
    createField('难度', level),
    createField('一句简介', summary)
  );
  openDialog({
    eyebrow: existing ? 'EDIT KEYWORD' : 'NEW KEYWORD',
    title: existing ? '编辑关键词卡' : '添加关键词卡',
    content,
    confirmLabel: existing ? '保存修改' : '保存关键词',
    onConfirm: async data => {
      const keywordName = String(data.get('name')).trim();
      if (!keywordName) throw new Error('请输入关键词');
      const found = await context.repository.getByIndex('keywords', 'categoryId', categoryId);
      if (found.some(item => item.id !== existing?.id && item.name.toLocaleLowerCase('zh-CN') === keywordName.toLocaleLowerCase('zh-CN'))) {
        throw new Error('这个关键词已经存在');
      }
      const payload = {
        domainId,
        categoryId,
        name: keywordName,
        level: String(data.get('level')),
        summary: String(data.get('summary') ?? '')
      };
      if (existing) {
        await context.repository.put('keywords', { ...existing, ...payload, name: keywordName.trim(), summary: payload.summary.trim(), updatedAt: new Date().toISOString() });
        showToast('关键词已更新', 'success');
      } else {
        await context.repository.createKeyword(payload);
        showToast('关键词已加入卡组', 'success');
      }
      await renderLibrary(context.container, context);
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

function openDomainDialog(context, existing = null) {
  const content = document.createElement('div');
  content.className = 'form-stack';
  content.append(createField('领域名称', textInput('name', '例如：经济学', 60, existing?.name ?? '')));
  openDialog({
    eyebrow: existing ? 'EDIT DOMAIN' : 'NEW DOMAIN',
    title: existing ? '编辑学习领域' : '创建学习领域',
    content,
    confirmLabel: existing ? '保存修改' : '保存领域',
    onConfirm: async data => {
      const name = String(data.get('name')).trim();
      if (!name) throw new Error('请输入领域名称');
      const found = await context.repository.list('domains');
      if (found.some(item => item.id !== existing?.id && item.name.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))) {
        throw new Error('这个领域已经存在');
      }
      if (existing) {
        await context.repository.put('domains', { ...existing, name, updatedAt: new Date().toISOString() });
        showToast('领域已更新', 'success');
      } else {
        const domain = await context.repository.createDomain(name);
        selectedDomainId = domain.id;
        showToast('领域已创建', 'success');
      }
      await renderLibrary(context.container, context);
    }
  });
}

function appendDomainButtons(host, domains, activeId, onSelect, context) {
  for (const domain of domains) {
    const item = document.createElement('div');
    item.className = 'library-list-item';
    if (domain.id === activeId) item.setAttribute('aria-current', 'true');
    const name = document.createElement('strong');
    name.textContent = domain.name;
    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'text-button';
    edit.textContent = '编辑';
    edit.addEventListener('click', event => {
      event.stopPropagation();
      openDomainDialog(context, domain);
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'text-button is-danger';
    del.textContent = '删除';
    del.addEventListener('click', event => {
      event.stopPropagation();
      confirmDestructive({
        title: '删除领域',
        message: `确定删除领域“${domain.name}”吗？其下的所有类目、关键词与学习记录将一并删除，此操作不可恢复。`,
        onConfirm: async () => {
          await context.repository.removeDomainCascade(domain.id);
          if (selectedDomainId === domain.id) selectedDomainId = null;
          showToast('领域已删除', 'success');
          await renderLibrary(context.container, context);
        }
      });
    });
    actions.append(edit, del);
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'library-list-item-main';
    main.textContent = domain.name;
    main.addEventListener('click', () => onSelect(domain.id));
    item.append(actions, main);
    host.append(item);
  }
}

function appendCategoryButtons(host, categories, activeId, onSelect, context) {
  for (const category of categories) {
    const item = document.createElement('div');
    item.className = 'library-list-item';
    if (category.id === activeId) item.setAttribute('aria-current', 'true');
    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'text-button';
    edit.textContent = '编辑';
    edit.addEventListener('click', event => {
      event.stopPropagation();
      openCategoryDialog(context, category.domainId, category);
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'text-button is-danger';
    del.textContent = '删除';
    del.addEventListener('click', event => {
      event.stopPropagation();
      confirmDestructive({
        title: '删除类目',
        message: `确定删除类目“${category.name}”吗？其下的所有关键词与学习记录将一并删除，此操作不可恢复。`,
        onConfirm: async () => {
          await context.repository.removeCategoryCascade(category.id);
          if (selectedCategoryId === category.id) selectedCategoryId = null;
          showToast('类目已删除', 'success');
          await renderLibrary(context.container, context);
        }
      });
    });
    actions.append(edit, del);
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'library-list-item-main';
    main.textContent = category.name;
    main.addEventListener('click', () => onSelect(category.id));
    item.append(actions, main);
    host.append(item);
  }
}

function appendKeywordCards(host, keywords, context, domainId, categoryId) {
  if (!keywords.length) {
    host.innerHTML = '<div class="panel-empty"><p>这个类目还没有关键词。</p><small>手动添加，或让 AI 为你整理一组候选。</small></div>';
    return;
  }
  for (const keyword of keywords) {
    const card = document.createElement('article');
    card.className = 'keyword-card';
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'text-button';
    edit.textContent = '编辑';
    edit.addEventListener('click', () => openKeywordDialog(context, domainId, categoryId, keyword));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'text-button is-danger';
    del.textContent = '删除';
    del.addEventListener('click', () => {
      confirmDestructive({
        title: '删除关键词',
        message: `确定删除关键词“${keyword.name}”吗？其学习记录也将一并删除，此操作不可恢复。`,
        onConfirm: async () => {
          await context.repository.removeKeywordCascade(keyword.id);
          showToast('关键词已删除', 'success');
          await renderLibrary(context.container, context);
        }
      });
    });
    actions.append(edit, del);
    const meta = document.createElement('div');
    meta.className = 'keyword-meta';
    meta.textContent = levelLabel[keyword.level] ?? '入门';
    const title = document.createElement('h3');
    title.textContent = keyword.name;
    const summary = document.createElement('p');
    summary.textContent = keyword.summary || '还没有添加简介。';
    card.append(meta, title, summary, actions);
    host.append(card);
  }
}

export async function renderLibrary(container, context) {
  context.container = container;
  const domains = await context.repository.list('domains');
  if (!domains.length) {
    container.innerHTML = `<section class="page"><p class="eyebrow">LIBRARY</p><h1>领域与词库</h1><div class="panel-empty"><p>先创建一个学习领域。</p><button class="button primary" type="button" data-action="add-domain">创建第一个领域</button></div></section>`;
    container.querySelector('[data-action="add-domain"]').addEventListener('click', () => openDomainDialog(context));
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
        <section class="library-panel"><div class="panel-heading"><span>学习领域</span><button class="text-button" type="button" data-action="add-domain">添加领域</button></div><div class="library-list" data-list="domains"></div></section>
        <section class="library-panel"><div class="panel-heading"><span>类目</span><button class="text-button" type="button" data-action="add-category">添加类目</button></div><div class="library-list" data-list="categories"></div></section>
        <section class="library-panel keyword-panel"><div class="panel-heading"><span>关键词卡</span><div class="panel-actions"><button class="text-button" type="button" data-action="ai-keywords" ${selectedCategoryId ? '' : 'disabled'}>AI 建议关键词</button><button class="text-button" type="button" data-action="add-keyword" ${selectedCategoryId ? '' : 'disabled'}>手动添加关键词</button></div></div><div class="keyword-grid" data-list="keywords"></div></section>
      </div>
    </section>`;

  appendDomainButtons(container.querySelector('[data-list="domains"]'), domains, selectedDomainId, async id => {
    selectedDomainId = id;
    selectedCategoryId = null;
    await renderLibrary(container, context);
  }, context);
  appendCategoryButtons(container.querySelector('[data-list="categories"]'), categories, selectedCategoryId, async id => {
    selectedCategoryId = id;
    await renderLibrary(container, context);
  }, context);
  if (!categories.length) {
    container.querySelector('[data-list="categories"]').innerHTML = '<div class="panel-empty"><p>还没有类目。</p></div>';
  }
  appendKeywordCards(container.querySelector('[data-list="keywords"]'), keywords, context, selectedDomainId, selectedCategoryId);

  container.querySelector('[data-action="add-domain"]').addEventListener('click', () => openDomainDialog(context));
  container.querySelector('[data-action="add-category"]').addEventListener('click', () => openCategoryDialog(context, selectedDomainId));
  container.querySelector('[data-action="add-keyword"]').addEventListener('click', () => openKeywordDialog(context, selectedDomainId, selectedCategoryId));
  container.querySelector('[data-action="ai-keywords"]').addEventListener('click', () => {
    const domain = domains.find(item => item.id === selectedDomainId);
    const category = categories.find(item => item.id === selectedCategoryId);
    if (domain && category) openAiSuggestionDialog(context, domain, category);
  });
}
