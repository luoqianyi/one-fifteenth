import { loadPreferences } from '../services/preferences.js';

async function loadAll(repository) {
  const [domains, categories, keywords, sessions, recordings] = await Promise.all([
    repository.list('domains'),
    repository.list('categories'),
    repository.list('keywords'),
    repository.list('sessions'),
    repository.list('recordings')
  ]);
  return { domains, categories, keywords, sessions, recordings };
}

function findName(list, id) {
  return list.find(item => item.id === id);
}

function formatDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours} 小时 ${minutes % 60} 分钟`;
  }
  return minutes > 0 ? `${minutes} 分钟 ${secs} 秒` : `${secs} 秒`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const sameYear = date.getFullYear() === now.getFullYear();
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `今天 ${time}`;
  const opts = { month: 'short', day: 'numeric' };
  if (!sameYear) opts.year = 'numeric';
  return `${date.toLocaleDateString('zh-CN', opts)} ${time}`;
}

function aggregateStats(keywords, sessions) {
  const studyCount = keywords.reduce((sum, item) => sum + (item.studyCount || 0), 0);
  const totalSeconds = sessions.reduce((sum, item) => sum + (item.inputSeconds || 0) + (item.outputSeconds || 0), 0);
  const avgMastery = keywords.length
    ? Math.round((keywords.reduce((sum, item) => sum + (item.mastery || 0), 0) / keywords.length) * 20)
    : 0;
  const mastered = keywords.filter(item => (item.mastery || 0) >= 4).length;
  return { studyCount, totalSeconds, avgMastery, mastered, totalKeywords: keywords.length };
}

function renderEmpty(container, hasKeywords) {
  container.innerHTML = `
    <section class="page history-page">
      <header class="page-heading"><div><p class="eyebrow">HISTORY</p><h1>学习档案</h1></div><p>回看每一次输入与输出，见证概念如何被真正掌握。</p></header>
      <div class="history-empty">
        <p>${hasKeywords ? '专注计时完成后，这里会沉淀你的学习足迹。' : '还没有建立任何学习记录，先从抽一张概念卡开始。'}</p>
        <a class="button primary" href="${hasKeywords ? '#focus' : '#draw'}">${hasKeywords ? '去专注' : '去抽卡'}</a>
      </div>
    </section>`;
}

export async function renderHistory(container, { repository }) {
  const { domains, categories, keywords, sessions, recordings } = await loadAll(repository);
  if (!sessions.length) {
    renderEmpty(container, keywords.length > 0);
    return;
  }

  const stats = aggregateStats(keywords, sessions);
  const byKeyword = new Map();
  for (const session of [...sessions].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))) {
    const keyword = findName(keywords, session.keywordId);
    const key = session.keywordId;
    if (!byKeyword.has(key)) {
      byKeyword.set(key, {
        keyword,
        sessions: [],
        totalInput: 0,
        totalOutput: 0
      });
    }
    const group = byKeyword.get(key);
    group.sessions.push(session);
    group.totalInput += session.inputSeconds || 0;
    group.totalOutput += session.outputSeconds || 0;
  }

  const sortedGroups = [...byKeyword.values()].sort((a, b) => b.sessions[0].completedAt.localeCompare(a.sessions[0].completedAt));

  const statCards = [
    { label: '累计学习', value: `${stats.studyCount}`, unit: '次' },
    { label: '投入时长', value: formatDuration(stats.totalSeconds), unit: '' },
    { label: '平均熟练度', value: `${stats.avgMastery}`, unit: '%' },
    { label: '已掌握概念', value: `${stats.mastered}`, unit: `/${stats.totalKeywords}` }
  ];

  const groupsHtml = sortedGroups.map(group => {
    const keyword = group.keyword;
    const domain = keyword ? findName(domains, keyword.domainId) : null;
    const category = keyword ? findName(categories, keyword.categoryId) : null;
    const mastery = keyword ? Math.round((keyword.mastery || 0) * 20) : 0;
    const duration = formatDuration(group.totalInput + group.totalOutput);

    const rowsHtml = group.sessions.map(session => {
      const hasRecording = recordings.some(rec => rec.sessionId === session.id);
      return `
        <li class="session-row">
          <span class="session-date">${formatDate(session.completedAt)}</span>
          <span class="session-duration">${formatDuration((session.inputSeconds || 0) + (session.outputSeconds || 0))}</span>
          ${hasRecording ? '<span class="session-badge">复盘</span>' : '<span class="session-badge is-muted">未复盘</span>'}
          <button class="text-button" type="button" data-action="expand-session" data-id="${session.id}">详情</button>
        </li>`;
    }).join('');

    return `
      <article class="history-group" data-keyword="${keyword?.id ?? ''}">
        <div class="history-group-head">
          <div class="history-group-title">
            <span class="card-breadcrumb">${domain?.name ?? '未分类'} / ${category?.name ?? '未分类'}</span>
            <h2>${keyword?.name ?? '已删除的关键词'}</h2>
          </div>
          <div class="history-group-meta">
            <span>${group.sessions.length} 次</span>
            <i></i>
            <span>${duration}</span>
            <i></i>
            <span>熟练度 ${mastery}%</span>
          </div>
        </div>
        <ul class="session-list">${rowsHtml}</ul>
      </article>`;
  }).join('');

  container.innerHTML = `
    <section class="page history-page">
      <header class="page-heading"><div><p class="eyebrow">HISTORY</p><h1>学习档案</h1></div><p>回看每一次输入与输出，见证概念如何被真正掌握。</p></header>
      <div class="history-stats">${statCards.map((item, index) => `
        <div class="history-stat">
          <span class="section-number">0${index + 1}</span>
          <b>${item.value}</b>
          <small>${item.label}${item.unit}</small>
        </div>`).join('')}
      </div>
      <div class="history-groups">${groupsHtml}</div>
      <div class="history-tip">提示：一次完整学习（输入 + 输出）会在此记录；在专注页结束时即可看到本页更新。</div>
    </section>`;

  // 最新数据挂在 container 上，供事件委托读取，避免闭包捕获过期数组
  container._historyData = { sessions, recordings, keywords };
  // 展开状态 Map 随每次渲染重置（旧 detail 元素已被 innerHTML 替换销毁）
  container._historyExpanded = new Map();

  // 点击委托：单例 handler，渲染前先移除再绑定，防止重复渲染累积监听器
  const handleClick = container._historyClick ??= (event => {
    const button = event.target.closest('[data-action="expand-session"]');
    if (!button) return;
    const group = button.closest('.history-group');
    if (!group) return;

    const { sessions, recordings, keywords } = container._historyData;
    const expanded = container._historyExpanded;
    const session = sessions.find(item => item.id === button.dataset.id);
    const recording = recordings.find(item => item.sessionId === session?.id);
    const keyword = group._keyword || findName(keywords, session?.keywordId);
    const existing = group.querySelector('.session-detail');
    if (existing) {
      if (existing._audioUrl) URL.revokeObjectURL(existing._audioUrl);
      existing.remove();
      expanded.delete(button.dataset.id);
      button.textContent = '详情';
      return;
    }

    const detail = document.createElement('div');
    detail.className = 'session-detail';
    let audioHtml = '';
    let audioUrl = null;
    if (recording && recording.blob && recording.blob.size) {
      audioUrl = URL.createObjectURL(recording.blob);
      audioHtml = `<audio class="recording-audio" controls preload="metadata" src="${audioUrl}"></audio>`;
    }
    detail.innerHTML = `
      <div class="session-detail-block"><span>输入阶段</span><b>${formatDuration(session?.inputSeconds || 0)}</b></div>
      <div class="session-detail-block"><span>输出阶段</span><b>${formatDuration(session?.outputSeconds || 0)}</b></div>
      <div class="session-detail-block">${recording
        ? `<span>复盘录音</span><b class="session-recording">已保存 · ${formatDuration(recording.duration || 0)}</b>${audioHtml}`
        : '<span>复盘</span><b>未录制</b>'}</div>
    `;
    group._keyword = keyword;
    if (audioUrl) detail._audioUrl = audioUrl;
    group.append(detail);
    expanded.set(button.dataset.id, detail);
    button.textContent = '收起';
  });
  container.removeEventListener('click', handleClick);
  container.addEventListener('click', handleClick);

  const domainFilter = loadPreferences().activeDomainId;
  void domainFilter;
}
