import { drawKeyword } from '../core/scheduler.js';
import { savePreferences, loadPreferences } from '../services/preferences.js';
import { saveActiveSession } from './focus.js';

const levelLabel = {
  beginner: '入门',
  advanced: '进阶',
  comprehensive: '综合'
};

let currentCard = null;

function renderNoDomains(container) {
  container.innerHTML = `
    <section class="hero empty-state">
      <div class="hero-copy">
        <p class="eyebrow">THE FIFTEEN-TO-ONE METHOD</p>
        <h1>十五分之一</h1>
        <p class="lead">给一个概念十五分钟，再用一分钟把它讲明白。</p>
        <button class="button primary" type="button" data-action="create-domain">创建第一个领域</button>
      </div>
      <article class="index-card" aria-label="学习方法示意卡">
        <div class="card-number">NO. 001</div><p class="card-kicker">今日关键词</p>
        <h2>从好奇心<br>开始抽取</h2><div class="card-rule"></div>
        <p>输入一个想探索的领域，建立属于你的概念卡组。</p><span class="card-tab">未开始</span>
      </article>
    </section>`;
}

function renderEmptyLibrary(container, domains) {
  container.innerHTML = `
    <section class="page draw-page">
      <header class="draw-heading"><div><p class="eyebrow">DRAW A CARD</p><h1>抽取概念</h1></div><span class="library-count">${domains.length} 个领域 · 0 张卡</span></header>
      <div class="draw-empty"><div class="empty-domain-names" aria-label="已有领域"></div><p>领域已经建立，下一步给它添加一些关键词。</p><a class="button primary" href="#library">前往领域管理</a></div>
    </section>`;
  const names = container.querySelector('.empty-domain-names');
  for (const domain of domains) {
    const badge = document.createElement('b');
    badge.textContent = domain.name;
    names.append(badge);
  }
}

function runShuffle({ host, finalCard, pool, domains, categories, onSettle }) {
  const stage = document.createElement('div');
  stage.className = 'shuffle-stage';
  const stack = document.createElement('div');
  stack.className = 'shuffle-stack';
  for (let i = 0; i < 3; i += 1) {
    const back = document.createElement('div');
    back.className = 'shuffle-card is-back';
    stack.append(back);
  }
  const front = document.createElement('div');
  front.className = 'shuffle-card is-front';
  front.innerHTML = '<span class="shuffle-name"></span><small class="shuffle-tag">ROLLING · 抽取中</small>';
  stack.append(front);
  stage.append(stack);
  host.replaceChildren(stage);

  const nameEl = front.querySelector('.shuffle-name');
  const tickMs = 70;
  const totalTicks = 20;
  let tick = 0;
  let settleTimer = null;
  const interval = setInterval(() => {
    tick += 1;
    nameEl.textContent = pool[Math.floor(Math.random() * pool.length)].name;
    front.classList.remove('is-tick');
    void front.offsetWidth;
    front.classList.add('is-tick');
    if (tick >= totalTicks) {
      clearInterval(interval);
      front.classList.add('is-settle');
      settleTimer = setTimeout(() => {
        setCardContent(host, finalCard, domains, categories);
        onSettle?.();
      }, 300);
    }
  }, tickMs);
  return () => {
    clearInterval(interval);
    if (settleTimer) clearTimeout(settleTimer);
  };
}

function setCardContent(host, card, domains, categories) {
  const domain = domains.find(item => item.id === card.domainId);
  const category = categories.find(item => item.id === card.categoryId);
  host.replaceChildren();
  const article = document.createElement('article');
  article.className = 'drawn-card is-revealed';
  const top = document.createElement('div');
  top.className = 'drawn-card-top';
  const number = document.createElement('span');
  number.textContent = `CARD ${String(card.studyCount + 1).padStart(3, '0')}`;
  const level = document.createElement('span');
  level.className = 'level-badge';
  level.textContent = levelLabel[card.level] ?? '入门';
  top.append(number, level);
  const breadcrumb = document.createElement('p');
  breadcrumb.className = 'card-breadcrumb';
  breadcrumb.textContent = `${domain?.name ?? '未分类'} / ${category?.name ?? '未分类'}`;
  const title = document.createElement('h2');
  title.textContent = card.name;
  const summary = document.createElement('p');
  summary.className = 'drawn-summary';
  summary.textContent = card.summary || '用十五分钟，为这个概念写下你自己的解释。';
  const footer = document.createElement('div');
  footer.className = 'drawn-card-footer';
  footer.innerHTML = '<span>15 MIN INPUT</span><i></i><span>1 MIN OUTPUT</span>';
  article.append(top, breadcrumb, title, summary, footer);
  host.append(article);
}

export async function renderDraw(container, { repository }) {
  const [domains, categories, keywords] = await Promise.all([
    repository.list('domains'),
    repository.list('categories'),
    repository.list('keywords')
  ]);
  if (!domains.length) {
    renderNoDomains(container);
    return;
  }
  if (!keywords.length) {
    renderEmptyLibrary(container, domains);
    return;
  }

  const preferences = loadPreferences();
  const activeDomainId = domains.some(item => item.id === preferences.activeDomainId)
    ? preferences.activeDomainId
    : 'all';
  container.innerHTML = `
    <section class="page draw-page">
      <header class="draw-heading">
        <div><p class="eyebrow">DRAW A CARD</p><h1>抽取概念</h1></div>
        <label class="compact-field"><span>抽卡领域</span><select data-field="domain"><option value="all">全部领域</option></select></label>
      </header>
      <div class="draw-stage">
        <div class="draw-copy"><span class="library-count">${domains.length} 个领域 · ${keywords.length} 张卡</span><h2>今天，你想<br>讲明白什么？</h2><p>每次抽取都会综合新鲜度、掌握程度和复习间隔。</p></div>
        <div class="draw-card-host" aria-live="polite"><div class="card-deck-placeholder"><span>15 / 1</span><p>等待抽取</p></div></div>
      </div>
      <div class="draw-actions"><button class="button" type="button" data-action="redraw" hidden>换一张</button><button class="button primary" type="button" data-action="draw">抽取关键词</button><button class="button primary" type="button" data-action="start-focus" hidden>开始 15 分钟</button></div>
    </section>`;

  const select = container.querySelector('[data-field="domain"]');
  for (const domain of domains) {
    const option = document.createElement('option');
    option.value = domain.id;
    option.textContent = domain.name;
    select.append(option);
  }
  select.value = activeDomainId;
  select.addEventListener('change', () => {
    savePreferences({ activeDomainId: select.value });
    if (stopShuffle) stopShuffle();
    stopShuffle = null;
    currentCard = null;
    host.replaceChildren();
    const placeholder = document.createElement('div');
    placeholder.className = 'card-deck-placeholder';
    placeholder.innerHTML = '<span>15 / 1</span><p>等待抽取</p>';
    host.append(placeholder);
    drawButton.hidden = false;
    drawButton.disabled = false;
    redrawButton.hidden = true;
    startButton.hidden = true;
  });

  const host = container.querySelector('.draw-card-host');
  const drawButton = container.querySelector('[data-action="draw"]');
  const redrawButton = container.querySelector('[data-action="redraw"]');
  const startButton = container.querySelector('[data-action="start-focus"]');
  let stopShuffle = null;

  function showResultButtons() {
    stopShuffle = null;
    drawButton.hidden = true;
    redrawButton.hidden = false;
    startButton.hidden = false;
  }

  async function draw() {
    const pool = select.value === 'all' ? keywords : keywords.filter(item => item.domainId === select.value);
    currentCard = drawKeyword(pool);
    if (!currentCard) return;
    currentCard.lastDrawnAt = new Date().toISOString();
    await repository.put('keywords', currentCard);
    drawButton.disabled = true;
    redrawButton.hidden = true;
    startButton.hidden = true;
    stopShuffle = runShuffle({ host, finalCard: currentCard, pool, domains, categories, onSettle: showResultButtons });
  }

  drawButton.addEventListener('click', async () => {
    if (stopShuffle) return;
    await draw();
  });
  redrawButton.addEventListener('click', async () => {
    if (stopShuffle || !currentCard) return;
    currentCard.skipCount += 1;
    await repository.put('keywords', currentCard);
    await draw();
  });
  startButton.addEventListener('click', () => {
    saveActiveSession({ keywordId: currentCard.id, startedAt: new Date().toISOString() });
    location.hash = '#focus';
  });
}
