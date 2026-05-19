function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return { rawText: text };
  }
}

function buildSystemPrompt(moduleName) {
  const schemaMap = {
    advisor: '只返回 JSON：{"structure":"...","conflict":"...","advantage":"...","pitfall":"...","actions":["...","...","..."]}',
    deepReport: '只返回 JSON：{"title":"...","subtitle":"...","summary":"...","readingFocus":["..."],"sections":[{"key":"personality","title":"...","body":"...","points":["..."],"practice":"..."}],"quote":"..."}'
  };
  return [
    "你是「知己AI」的东方五行人格顾问。",
    "风格：新中式、克制、温和、清醒，有文化感。",
    "边界：用于自我认知、情绪陪伴和娱乐参考，不构成医疗、法律、投资、婚姻等现实决策建议。",
    "禁止使用：算命、改命、转运、消灾、必然、命中注定、疾病预测、投资建议等表达。",
    schemaMap[moduleName] || "只返回 JSON，不要输出 Markdown。"
  ].join("\n");
}

function buildUserPrompt(moduleName, payload) {
  return JSON.stringify({
    task: moduleName,
    input: payload
  });
}

async function callOpenAICompatible(moduleName, payload, options = {}) {
  const baseUrl = getEnv("OPENAI_BASE_URL");
  const apiKey = getEnv("OPENAI_API_KEY");
  const model = options.model || getEnv("OPENAI_MODEL", "gpt-5.4-mini");

  if (!baseUrl || !apiKey) {
    return null;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: options.maxTokens || 1800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(moduleName) },
        { role: "user", content: buildUserPrompt(moduleName, payload) }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && data.error && data.error.message ? data.error.message : JSON.stringify(data);
    throw new Error(`AI 请求失败：${response.status} ${message}`);
  }

  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : "";
  return content ? safeJsonParse(content) : data;
}

function buildAdvisorFallback(question, profile) {
  const type = profile ? `${profile.personalityType || ""} · ${profile.personalityName || ""}` : "五行人格";
  return {
    structure: `你的五行人格结构呈现为「${type}」，这个问题适合先从自身节律与真实需求看起。`,
    conflict: "问题背后的核心矛盾，往往是安全感、期待与行动节奏之间还没有对齐。",
    advantage: "你的优势在于能够观察细节，也愿意认真理解自己和关系中的变化。",
    pitfall: "容易踩的坑是想得太满、行动太晚，或在情绪高点急着做结论。",
    actions: ["写下这个问题里最在意的 3 个点", "选择一个 7 天内能完成的小行动", "复盘行动后的情绪变化"]
  };
}

module.exports = {
  callOpenAICompatible,
  buildAdvisorFallback
};
