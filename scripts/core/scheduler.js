export function calculateWeight(keyword, now = Date.now()) {
  if (!keyword.studyCount) return 12;
  const lastStudied = Date.parse(keyword.lastStudiedAt);
  const hours = Number.isFinite(lastStudied) ? Math.max(0, now - lastStudied) / 3_600_000 : 24 * 30;
  const spacing = Math.min(8, 1 + Math.log2(1 + hours / 24));
  const mastery = Math.max(1, 6 - Number(keyword.mastery || 0));
  const lastDrawn = Date.parse(keyword.lastDrawnAt);
  const recentPenalty = Number.isFinite(lastDrawn) && now - lastDrawn < 3_600_000 ? 0.2 : 1;
  const skipPenalty = Math.max(0.6, 1 - Number(keyword.skipCount || 0) * 0.05);
  return Math.max(0.1, spacing * mastery * recentPenalty * skipPenalty);
}

export function chooseWeighted(weightedItems, random = Math.random) {
  if (!weightedItems.length) return null;
  const total = weightedItems.reduce((sum, item) => sum + item.weight, 0);
  let point = random() * total;
  for (const item of weightedItems) {
    point -= item.weight;
    if (point <= 0) return item;
  }
  return weightedItems.at(-1);
}

export function drawKeyword(keywords, random = Math.random, now = Date.now()) {
  return chooseWeighted(keywords.map(keyword => ({
    ...keyword,
    weight: calculateWeight(keyword, now)
  })), random);
}
