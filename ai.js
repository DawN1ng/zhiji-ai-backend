const fetch = require("node-fetch");

function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function safeJsonParse(text) {
  const content = typeof text === "string" ? text.trim() : "";
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  try {
    return JSON.parse(content);
  } catch (error) {
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch (innerError) {
        return { rawText: text };
      }
    }
    return { rawText: text };
  }
}

function buildSystemPrompt(moduleName) {
  const schemaMap = {
    advisor: '只返回 JSON：{"structure":"...","conflict":"...","advantage":"...","pitfall":"...","actions":["...","...","..."]}',
    deepReport: [
      '只返回 JSON，不要 Markdown，不要解释。',
      'JSON 结构：{"title":"...","subtitle":"...","summary":"...","readingFocus":["..."],"sections":[{"key":"personality","title":"...","body":"...","points":["..."],"practice":"..."}],"quote":"..."}',
      '整份报告正文目标 3000-4500 字，不要写成摘要。',
      'summary 约 260-360 字；每个 section.body 约 320-520 字；每章 points 4-6 条，每条 24-56 字；practice 约 80-140 字。',
      '每个章节都要具体展开：先解释五行结构如何影响该主题，再写优势、风险、适合的场景和可执行建议。'
    ].join("\n")
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
  if (moduleName === "deepReport") {
    const input = payload && payload.payload ? payload.payload : payload;
    const profile = input && input.profile ? input.profile : {};
    return [
      `用户昵称：${profile.nickname || "用户"}`,
      `关注问题：${profile.concern || "自我认知"}`,
      `人格类型：${profile.personalityType || ""} · ${profile.personalityName || ""}`,
      `主元素：${profile.mainElement || ""}`,
      `辅元素：${profile.secondaryElement || ""}`,
      `关键词：${(profile.keywords || []).join(" / ")}`,
      `五行分数：${JSON.stringify(profile.wuxingScores || {})}`,
      `promptVersion：${payload.promptVersion || ""}`,
      `schemaVersion：${payload.schemaVersion || ""}`,
      "",
      "请生成一份完整深度报告，要求：",
      "1. 每章都要围绕用户的五行结构展开，不要写成通用性格文案，也不要只给短段落。",
      "2. 事业、财富、关系、情绪建议必须保持“倾向与观察”口吻，避免绝对化承诺。",
      "3. 财富部分只能讨论能力、价值交换、节奏和风险意识，不提供任何投资建议。",
      "4. 情感部分只能讨论沟通模式和关系观察，不预测婚姻结果。",
      "5. 情绪部分只能给自我觉察和日常调节建议，不做医疗判断。",
      "6. 未来 90 天节律请分成前 30 天、中 30 天、后 30 天三个阶段。",
      "7. 专属行动建议要可执行，适合放进小程序报告页直接展示。",
      "8. 输出体量请接近付费报告：总览充分、七个章节完整，每章不要少于 320 个中文字符。"
    ].join("\n");
  }
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
