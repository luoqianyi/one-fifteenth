export const PHASES = {
  input: { key: 'input', label: '输入', caption: '收集与理解', defaultSeconds: 15 * 60 },
  output: { key: 'output', label: '输出', caption: '讲述与检验', defaultSeconds: 60 }
};

export const PHASE_ORDER = ['input', 'output'];

export function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function phaseSeconds(phases = {}, phaseKey) {
  const override = Number(phases?.[phaseKey]);
  return Number.isFinite(override) && override > 0 ? Math.floor(override) : PHASES[phaseKey].defaultSeconds;
}

export function nextPhase(phaseKey) {
  const index = PHASE_ORDER.indexOf(phaseKey);
  return PHASE_ORDER[index + 1] ?? null;
}
