import { formatClock, nextPhase, PHASES, phaseSeconds } from '../core/timer.js';
import { loadPreferences } from '../services/preferences.js';
import { showToast } from '../ui/dialog.js';

export const SESSION_KEY = 'fifteen-to-one:active-session';

let intervalId = null;
let recorder = null;
let recordingSeconds = 0;
let recordingTimerId = null;
let pendingRecording = null;

export function loadActiveSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function saveActiveSession(patch) {
  const session = { ...loadActiveSession(), ...patch };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearActiveSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function stopTick() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (recordingTimerId) {
    clearInterval(recordingTimerId);
    recordingTimerId = null;
  }
}

function stopRecorder() {
  if (!recorder) return Promise.resolve();
  const instance = recorder;
  recorder = null;
  return new Promise(resolve => {
    const originalOnstop = instance.onstop;
    instance.onstop = () => {
      try {
        originalOnstop?.();
      } catch {
        // 忽略回调异常
      }
      resolve();
    };
    try {
      instance.stop();
    } catch {
      resolve();
    }
  });
}

function chime() {
  try {
    const audioContext = new AudioContext();
    const play = delay => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.35, audioContext.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + delay + 0.4);
      oscillator.start(audioContext.currentTime + delay);
      oscillator.stop(audioContext.currentTime + delay + 0.42);
    };
    play(0);
    play(0.18);
    setTimeout(() => audioContext.close(), 1200);
  } catch {
    // 无音频设备时静默
  }
}

function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch {
    // 通知失败不影响流程
  }
}

function buildState(session) {
  const inputSeconds = phaseSeconds(session.phases, 'input');
  return {
    phase: session.phase === 'output' ? 'output' : 'input',
    status: session.status === 'paused' ? 'paused' : 'running',
    endAt: session.endAt ? Number(session.endAt) : null,
    remaining: Number.isFinite(Number(session.remaining)) ? Number(session.remaining) : inputSeconds,
    spent: { input: Number(session.spent?.input ?? 0), output: Number(session.spent?.output ?? 0) }
  };
}

export async function renderFocus(container, { repository }) {
  stopTick();
  const session = loadActiveSession();
  if (!session?.keywordId) {
    container.innerHTML = `
      <section class="page focus-empty">
        <p class="eyebrow">FOCUS TIMER</p>
        <h1>专注计时</h1>
        <p class="lead">先在「抽取」页抽一张关键词卡，再回到这里开始十五分钟的专注。</p>
        <a class="button primary" href="#draw">去抽卡</a>
      </section>`;
    return;
  }

  const keyword = await repository.get('keywords', session.keywordId);
  if (!keyword) {
    clearActiveSession();
    await renderFocus(container, { repository });
    return;
  }
  const [domains, categories] = await Promise.all([
    repository.list('domains'),
    repository.list('categories')
  ]);
  const domain = domains.find(item => item.id === keyword.domainId);
  const category = categories.find(item => item.id === keyword.categoryId);

  const inputSeconds = phaseSeconds(session.phases, 'input');
  const outputSeconds = phaseSeconds(session.phases, 'output');
  const state = buildState(session);
  const startedAt = session.startedAt ?? new Date().toISOString();

  container.innerHTML = `
    <section class="page focus-page">
      <header class="focus-header">
        <div><p class="eyebrow">FOCUS TIMER</p><h1>专注计时</h1></div>
        <span class="library-count">${Math.round(inputSeconds / 60)} MIN INPUT · ${Math.round(outputSeconds / 60)} MIN OUTPUT</span>
      </header>
      <div class="focus-stage">
        <article class="focus-card">
          <span class="card-number">KEYWORD</span>
          <p class="card-breadcrumb">${domain?.name ?? '未分类'} / ${category?.name ?? '未分类'}</p>
          <h2>${keyword.name}</h2>
          <p class="focus-summary">${keyword.summary || '用十五分钟，为这个概念写下你自己的解释。'}</p>
          <div class="focus-card-footer"><span>已学习 ${keyword.studyCount || 0} 次</span><i></i><span>熟练度 ${Math.round((keyword.mastery || 0) * 20)}%</span></div>
        </article>
        <div class="focus-timer">
          <div class="phase-tabs" role="tablist" aria-label="学习阶段">
            <button class="phase-tab" type="button" data-phase="input" aria-selected="false">输入</button>
            <button class="phase-tab" type="button" data-phase="output" aria-selected="false">输出</button>
          </div>
          <div class="clock" aria-live="polite">
            <span class="clock-time">00:00</span>
            <span class="clock-caption">准备开始</span>
          </div>
          <div class="recording-area is-hidden">
            <span class="recording-dot" aria-hidden="true"></span>
            <button class="button" type="button" data-action="record">开始录音</button>
            <span class="recording-time">00:00</span>
            <small>输出阶段，把你的理解讲出来并录下复盘</small>
          </div>
          <div class="focus-actions">
            <button class="button primary" type="button" data-action="toggle">开始</button>
            <button class="button" type="button" data-action="skip">跳过本阶段</button>
            <button class="button" type="button" data-action="quit">退出</button>
          </div>
        </div>
      </div>
    </section>`;

  const clockTime = container.querySelector('.clock-time');
  const clockCaption = container.querySelector('.clock-caption');
  const toggleButton = container.querySelector('[data-action="toggle"]');
  const tabButtons = [...container.querySelectorAll('.phase-tab')];

  function persist() {
    saveActiveSession({
      keywordId: keyword.id,
      startedAt,
      phase: state.phase,
      status: state.status,
      remaining: Math.max(0, remainingSeconds()),
      endAt: state.endAt,
      spent: state.spent
    });
  }

  function syncTabs() {
    for (const tab of tabButtons) {
      const active = tab.dataset.phase === state.phase;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    }
    const phase = PHASES[state.phase];
    clockCaption.textContent = `${phase.label}阶段 · ${phase.caption}`;
    syncRecording();
  }

  function isRecordingPhase() {
    return state.phase === 'output' && state.status === 'running';
  }

  function syncRecording() {
    const area = container.querySelector('.recording-area');
    const time = container.querySelector('.recording-time');
    const recordButton = container.querySelector('[data-action="record"]');
    if (!area) return;
    if (isRecordingPhase()) {
      area.classList.remove('is-hidden');
      if (recordButton) {
        const recording = recorder !== null;
        recordButton.textContent = recording ? '停止录音' : '开始录音';
        recordButton.setAttribute('aria-label', recording ? '停止录音' : '开始录音');
        recordButton.disabled = false;
      }
      if (time) time.textContent = formatClock(recordingSeconds);
    } else {
      area.classList.add('is-hidden');
    }
  }

  function startRecordingTimer() {
    stopRecordingTimer();
    recordingTimerId = setInterval(() => {
      if (!document.contains(container)) {
        stopRecordingTimer();
        return;
      }
      recordingSeconds += 0.2;
      syncRecording();
    }, 200);
  }

  function stopRecordingTimer() {
    if (recordingTimerId) {
      clearInterval(recordingTimerId);
      recordingTimerId = null;
    }
  }

  async function startRecording() {
    if (recorder || recordingSeconds > 0) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('当前浏览器不支持录音', 'error');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      showToast('无法访问麦克风', 'error');
      return;
    }
    recordingSeconds = 0;
    recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = event => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      const duration = Math.max(1, Math.round(recordingSeconds));
      recordingSeconds = 0;
      const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
      if (blob.size) pendingRecording = { blob, duration, finishedAt: new Date().toISOString() };
      else pendingRecording = null;
      syncRecording();
      if (pendingRecording) {
        showToast('复盘录音已保存，可在结束学习后回听', 'success');
      }
    };
    try {
      recorder.start();
      startRecordingTimer();
      showToast('开始录音');
      syncRecording();
    } catch {
      stream.getTracks().forEach(track => track.stop());
      recorder = null;
      showToast('无法开始录音', 'error');
      syncRecording();
    }
  }

  function stopRecording() {
    if (!recorder) return;
    recorder.stop();
    stopRecordingTimer();
  }

  function remainingSeconds() {
    if (state.status === 'running' && state.endAt) {
      return Math.max(0, (state.endAt - Date.now()) / 1000);
    }
    return state.remaining;
  }

  function renderClock() {
    clockTime.textContent = formatClock(remainingSeconds());
    toggleButton.textContent = state.status === 'running' ? '暂停' : '继续';
  }

  function startTick() {
    stopTick();
    intervalId = setInterval(() => {
      if (!document.contains(container)) {
        stopTick();
        return;
      }
      tick();
    }, 200);
  }

  function tick() {
    if (state.status !== 'running') return;
    renderClock();
    if (remainingSeconds() <= 0) completePhase();
  }

  function start() {
    if (state.status === 'running') return;
    state.status = 'running';
    state.endAt = Date.now() + state.remaining * 1000;
    renderClock();
    syncRecording();
    persist();
    startTick();
  }

  function pause() {
    if (state.status !== 'running') return;
    stopTick();
    state.remaining = remainingSeconds();
    state.endAt = null;
    state.status = 'paused';
    renderClock();
    syncRecording();
    persist();
  }

  function completePhase() {
    const duration = phaseSeconds(session.phases, state.phase);
    state.spent[state.phase] += Math.max(0, Math.round(duration - remainingSeconds()));
    const next = nextPhase(state.phase);
    if (!next) {
      finish();
      return;
    }
    chime();
    notify('输出阶段', `「${keyword.name}」已进入一分钟输出`);
    state.phase = next;
    state.remaining = phaseSeconds(session.phases, next);
    state.status = 'running';
    state.endAt = Date.now() + state.remaining * 1000;
    syncTabs();
    showToast(`进入${PHASES[next].label}阶段`);
    persist();
    startTick();
  }

  async function finish() {
    stopTick();
    await stopRecorder();
    const now = new Date().toISOString();
    await repository.put('keywords', {
      ...keyword,
      studyCount: (keyword.studyCount || 0) + 1,
      mastery: Math.min(5, (keyword.mastery || 0) + 1),
      lastStudiedAt: now,
      updatedAt: now
    });
    const sessionId = crypto.randomUUID();
    await repository.put('sessions', {
      id: sessionId,
      keywordId: keyword.id,
      domainId: keyword.domainId,
      startedAt,
      completedAt: now,
      inputSeconds: state.spent.input,
      outputSeconds: state.spent.output
    });
    if (pendingRecording) {
      await repository.put('recordings', {
        id: crypto.randomUUID(),
        sessionId,
        keywordId: keyword.id,
        domainId: keyword.domainId,
        duration: pendingRecording.duration,
        blob: pendingRecording.blob,
        createdAt: pendingRecording.finishedAt
      });
      pendingRecording = null;
    }
    clearActiveSession();
    chime();
    notify('学习完成', `「${keyword.name}」已记录一次完整学习`);
    showToast('学习完成，已记入档案');
    await renderFocus(container, { repository });
  }

  toggleButton.addEventListener('click', () => {
    if (state.status === 'running') pause();
    else start();
  });

  container.querySelector('[data-action="record"]').addEventListener('click', () => {
    if (recorder) stopRecording();
    else startRecording();
  });

  container.querySelector('[data-action="skip"]').addEventListener('click', () => {
    stopRecording();
    const duration = phaseSeconds(session.phases, state.phase);
    state.spent[state.phase] += Math.max(0, Math.round(duration - remainingSeconds()));
    completePhase();
  });

  container.querySelector('[data-action="quit"]').addEventListener('click', async () => {
    stopTick();
    await stopRecorder();
    recorder = null;
    recordingSeconds = 0;
    pendingRecording = null;
    clearActiveSession();
    showToast('已退出本次专注');
    renderFocus(container, { repository });
  });

  syncTabs();
  if (state.status === 'paused') {
    renderClock();
  } else if (state.status === 'running' && state.endAt) {
    renderClock();
    startTick();
  } else {
    state.status = 'idle';
    renderClock();
    start();
  }
}
