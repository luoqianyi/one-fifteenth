const STORAGE_KEY = 'fifteen-to-one:preferences';

const defaults = {
  activeDomainId: 'all',
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  apiModel: 'gpt-4.1-mini',
  soundEnabled: true,
  notificationsEnabled: false
};

export function loadPreferences() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return { ...defaults };
  }
}

export function savePreferences(patch) {
  const preferences = { ...loadPreferences(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  return preferences;
}

export function exportSafePreferences() {
  const { apiKey, ...safe } = loadPreferences();
  return safe;
}
