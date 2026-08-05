import { repository } from './repository.js';

export const routes = [
  ['draw', '抽取'],
  ['focus', '专注'],
  ['library', '领域'],
  ['history', '档案'],
  ['settings', '设置']
];

const nav = document.querySelector('#main-nav');
const view = document.querySelector('#app-view');
const dialogRoot = document.querySelector('#dialog-root');
const state = { domains: [] };

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function navIcon(route) {
  const paths = {
    draw: '<path d="M5 4.5h14v15H5z"/><path d="M8 8h8M8 12h5"/>',
    focus: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>',
    library: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22zM20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22z"/>',
    history: '<path d="M4 7h16M7 3v4m10-4v4M5 5h14v16H5z"/><path d="M8 11h3v3H8z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[route]}</svg>`;
}

function renderNav(active) {
  nav.innerHTML = routes.map(([route, label]) => `
    <a href="#${route}" data-route="${route}" ${route === active ? 'aria-current="page"' : ''}>
      ${navIcon(route)}<span>${label}</span>
    </a>
  `).join('');
}

function renderEmptyDraw() {
  view.innerHTML = `
    <section class="hero empty-state">
      <div class="hero-copy">
        <p class="eyebrow">THE FIFTEEN-TO-ONE METHOD</p>
        <h1>十五分之一</h1>
        <p class="lead">给一个概念十五分钟，再用一分钟把它讲明白。</p>
        ${state.domains.length
          ? `<div class="domain-strip"><span>当前领域</span>${state.domains.map(domain => `<b>${escapeHtml(domain.name)}</b>`).join('')}</div><button class="button primary" type="button" disabled>添加关键词后开始抽卡</button>`
          : '<button class="button primary" type="button" data-action="create-domain">创建第一个领域</button>'}
      </div>
      <article class="index-card" aria-label="学习方法示意卡">
        <div class="card-number">NO. 001</div>
        <p class="card-kicker">今日关键词</p>
        <h2>从好奇心<br>开始抽取</h2>
        <div class="card-rule"></div>
        <p>输入一个想探索的领域，建立属于你的概念卡组。</p>
        <span class="card-tab">未开始</span>
      </article>
    </section>`;
}

function renderPlaceholder(route) {
  const label = routes.find(([key]) => key === route)?.[1] ?? '抽取';
  view.innerHTML = `<section class="page"><p class="eyebrow">FIFTEEN / ONE</p><h1>${label}</h1><p class="lead">这一页正在等待你的第一张知识卡。</p></section>`;
}

function render() {
  const requested = location.hash.slice(1) || 'draw';
  const route = routes.some(([key]) => key === requested) ? requested : 'draw';
  renderNav(route);
  if (route === 'draw') renderEmptyDraw();
  else renderPlaceholder(route);
}

function openDomainDialog() {
  dialogRoot.innerHTML = `
    <dialog class="dialog">
      <form method="dialog" class="dialog-form">
        <div class="dialog-heading">
          <p class="eyebrow">NEW DOMAIN</p>
          <h2>创建学习领域</h2>
        </div>
        <label class="field">
          <span>领域名称</span>
          <input name="name" maxlength="60" autocomplete="off" placeholder="例如：经济学" required>
          <small class="field-error" aria-live="polite"></small>
        </label>
        <div class="dialog-actions">
          <button class="button" type="button" data-action="cancel">取消</button>
          <button class="button primary" type="submit">保存领域</button>
        </div>
      </form>
    </dialog>`;

  const dialog = dialogRoot.querySelector('dialog');
  const form = dialog.querySelector('form');
  const input = form.elements.name;
  const error = dialog.querySelector('.field-error');

  dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      error.textContent = '请输入领域名称';
      input.focus();
      return;
    }
    const duplicate = state.domains.some(domain => domain.name.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'));
    if (duplicate) {
      error.textContent = '这个领域已经存在';
      input.focus();
      return;
    }
    const domain = await repository.createDomain(name);
    state.domains.push(domain);
    dialog.close();
    render();
  });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
  input.focus();
}

view.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'create-domain') openDomainDialog();
});

addEventListener('hashchange', render);
state.domains = await repository.list('domains');
render();
