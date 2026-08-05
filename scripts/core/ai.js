const LEVELS = new Set(['beginner', 'advanced', 'comprehensive']);

export function normalizeName(value) {
  return String(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

export function parseSuggestions(content) {
  const clean = String(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 未返回可解析的 JSON');
  const parsed = JSON.parse(clean.slice(start, end + 1));
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const valid = suggestions.flatMap(item => {
    const name = typeof item?.name === 'string' ? item.name.trim().slice(0, 80) : '';
    const summary = typeof item?.summary === 'string' ? item.summary.trim().slice(0, 240) : '';
    return name && LEVELS.has(item?.level) ? [{ name, level: item.level, summary }] : [];
  });
  if (!valid.length) throw new Error('没有有效的关键词');
  return valid;
}

export function removeDuplicateSuggestions(suggestions, existingNames) {
  const seen = new Set(existingNames.map(normalizeName));
  return suggestions.filter(item => {
    const key = normalizeName(item.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildEndpoint(baseUrl) {
  const normalized = String(baseUrl).trim().replace(/\/+$/, '');
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}

export function buildSuggestionMessages({ domain, category, count }) {
  return [
    {
      role: 'system',
      content: '你是严谨的学习课程设计师。只输出合法 JSON，不要输出代码围栏或解释。难度只能是 beginner、advanced、comprehensive。避免同义词重复。'
    },
    {
      role: 'user',
      content: `为学习领域“${domain}”的类目“${category}”生成 ${count} 个适合自主学习与一分钟讲述的关键词。兼顾基础概念、进阶机制和综合应用。输出格式：{"suggestions":[{"name":"关键词","level":"beginner","summary":"不超过80字的简介"}]}`
    }
  ];
}

export async function requestSuggestions(config, input, signal) {
  try {
    const response = await fetch(buildEndpoint(config.apiBaseUrl), {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.apiModel,
        temperature: 0.4,
        messages: buildSuggestionMessages(input)
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || `AI 接口返回 HTTP ${response.status}`);
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('AI 响应缺少文本内容');
    return parseSuggestions(content);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (error instanceof TypeError) {
      throw new Error('跨域或网络连接失败，请检查接口是否允许浏览器直连');
    }
    throw error;
  }
}

export async function testConnection(config, signal) {
  const suggestions = await requestSuggestions(config, {
    domain: '连接测试',
    category: '基础概念',
    count: 1
  }, signal);
  return `连接成功，模型返回 ${suggestions.length} 条结果`;
}
