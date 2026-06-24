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

function buildLocalDeepReport(payload) {
  const input = payload && payload.payload ? payload.payload : payload;
  const profile = input && input.profile ? input.profile : {};
  const elementNameMap = {
    wood: '木',
    fire: '火',
    earth: '土',
    metal: '金',
    water: '水'
  };
  const mainElement = elementNameMap[profile.mainElement] || profile.mainElement || '水';
  const secondaryElement = elementNameMap[profile.secondaryElement] || profile.secondaryElement || '火';
  const type = `${profile.personalityType || "五行人格"} · ${profile.personalityName || "自我观察者"}`;
  const concern = profile.concern || "自我认知";
  return {
    title: `${type}完整报告`,
    subtitle: "一份写给当下自己的东方人格卷宗",
    summary: `这份报告会围绕你的五行结构展开：主元素 ${mainElement} 代表你理解世界时最先调用的能量，辅元素 ${secondaryElement} 则像关键时刻的补充力量。你当前最关注的是「${concern}」，所以这份报告会把人格、事业、财富、关系、情绪和未来节律放在一起观察。它不是结论书，也不替你做现实决定，而是一面温和的镜子，帮助你看见优势、惯性和下一步可以尝试的小行动。`,
    readingFocus: ["先看人格结构，再看具体场景", "把建议当作观察线索", "选择一个七日小行动开始验证"],
    sections: [
      {
        key: "personality",
        title: "完整五行人格分析",
        body: `你的结构呈现出「${type}」的组合感。主元素让你形成稳定的判断入口，辅元素则影响你表达、行动和处理压力的方式。当两股能量配合良好时，你会更容易把感受转化成清晰行动；当压力升高时，也可能在谨慎和冲动之间来回摆动。理解自己不是为了贴标签，而是为了知道什么环境会滋养你，什么节奏会消耗你。`,
        points: ["主元素决定你理解问题的入口", "辅元素影响你的行动出口", "压力状态下容易放大惯性反应", "稳定节奏比一次性爆发更适合你"],
        practice: "未来 7 天，每晚写下一个让你有能量的场景和一个让你消耗的场景，观察它们背后共同的触发条件。"
      },
      {
        key: "career",
        title: "事业方向与适合行业",
        body: "事业上，你更适合能沉淀长期能力、允许持续打磨、并且能看见反馈的场景。不要只用职位名称判断适合与否，要看日常工作是否允许你发挥判断、表达、组织、洞察或稳定交付的优势。短期焦虑容易让人误判方向，真正值得投入的路径，往往能同时带来成长感、秩序感和可持续的价值交换。",
        points: ["优先选择能沉淀作品或方法的场景", "避免只被短期回报牵引", "用小项目验证方向，而不是一次定终身", "把优势转化成可复用能力"],
        practice: "挑一个你愿意长期打磨的能力，设计一个 7 天内能完成的小作品或小验证。"
      },
      {
        key: "wealth",
        title: "财富模式与赚钱方式",
        body: "你的财富模式更适合从稳定能力、可信交付和长期关系中累积，而不是依靠短期刺激或高风险判断。适合你的赚钱方式通常和能力复利有关：把经验整理成方法，把审美或判断变成服务，把稳定输出变成他人愿意持续购买的价值。财富部分只适合当作能力和节奏观察，不构成任何投资建议。",
        points: ["先识别自己能稳定交付的价值", "减少情绪化消费和冲动投入", "长期信任比短期刺激更重要", "把收入目标拆成能力目标"],
        practice: "记录一周内三次消费或赚钱冲动，标注它来自真实需要、压力补偿还是对未来的焦虑。"
      },
      {
        key: "relationship",
        title: "情感关系模式",
        body: "关系中，你需要被理解，也需要有空间保持自己的节奏。你容易从细节里读出对方态度，但如果缺少直接沟通，细腻感受也可能变成过度推测。更适合你的关系方式，是把感受说成具体需求，把期待落成可以回应的请求，而不是用沉默、试探或一次情绪爆发来确认安全感。",
        points: ["把感受翻译成具体需求", "观察稳定行动，不只看即时回应", "别把一次摩擦放大成整体结论", "边界和温度可以同时存在"],
        practice: "把一个没有说出口的期待改写成一句温和、具体、可回应的请求。"
      },
      {
        key: "emotion",
        title: "情绪盲点与改善建议",
        body: "当信息过多、期待过高或反馈不清晰时，你容易进入反复思考。情绪不是问题本身，它更像提醒你某个需求没有被看见。真正有效的处理方式，是先区分事实和评价，再选择一个最小行动。不要在情绪最高点做重大决定，也不要用短暂低落否定长期积累。",
        points: ["先区分事实、感受和评价", "情绪高点适合记录，不适合定论", "最小行动能打断反复内耗", "稳定作息会明显影响判断质量"],
        practice: "连续三天睡前写下一个事实、一个感受和一个明天可以完成的小动作。"
      },
      {
        key: "rhythm",
        title: "未来 90 天人生节律",
        body: "未来 90 天适合先整理秩序，再放大行动。前 30 天先收束最消耗你的问题，减少无效承诺；中间 30 天选择一个方向做小规模验证；后 30 天再根据反馈稳定推进。这个节律的重点不是求快，而是让每一步都能积累清晰感。",
        points: ["前 30 天整理消耗源", "中 30 天验证一个方向", "后 30 天稳定推进并复盘", "每周只抓一个核心动作"],
        practice: "在日历里标出未来 7 天最重要的一件小事，把其它事项降级处理。"
      },
      {
        key: "action",
        title: "专属行动建议",
        body: "现在最适合你的，不是立刻做一个巨大决定，而是找到一个能带来真实反馈的小行动。把问题从“我到底该怎么办”改写成“我可以先验证什么”，你会更容易从焦虑里走出来。真正的改变通常不是靠一次顿悟，而是靠连续几次诚实的小复盘。",
        points: ["写下最想解决的问题", "拆出一个低成本验证动作", "观察行动后的能量变化", "每周复盘一次而不是每天苛责自己"],
        practice: "今晚只做一件事：把最困扰你的问题写成“我可以先做什么”，并给它安排一个 20 分钟行动。"
      }
    ],
    quote: "真正懂自己的人，不急着给人生下结论。"
  };
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
  const model = options.model || getEnv(moduleName === "deepReport" ? "OPENAI_DEEP_REPORT_MODEL" : "OPENAI_MODEL", getEnv("OPENAI_MODEL", "gpt-5.4-mini"));

  if (!baseUrl || !apiKey) {
    return null;
  }

  const requestBody = {
    model,
    temperature: options.temperature === undefined ? 0.2 : options.temperature,
    max_tokens: options.maxTokens || 1800,
    messages: [
      { role: "system", content: buildSystemPrompt(moduleName) },
      { role: "user", content: buildUserPrompt(moduleName, payload) }
    ]
  };
  if (options.useJsonResponseFormat !== false) {
    requestBody.response_format = { type: "json_object" };
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text();
  const data = safeJsonParse(responseText);
  if (!response.ok) {
    const message = data && data.error && data.error.message ? data.error.message : (responseText || JSON.stringify(data));
    throw new Error(`AI 请求失败：${response.status} ${message}`);
  }

  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : "";
  return content ? safeJsonParse(content) : data;
}

function getAIConfigStatus() {
  const baseUrl = getEnv("OPENAI_BASE_URL");
  const apiKey = getEnv("OPENAI_API_KEY");
  return {
    hasOpenAIBaseUrl: Boolean(baseUrl),
    openAIBaseUrl: baseUrl ? baseUrl.replace(/\/$/, "") : "",
    hasOpenAIKey: Boolean(apiKey),
    openAIKeyLength: apiKey.length,
    model: getEnv("OPENAI_MODEL", "gpt-5.4-mini"),
    deepReportModel: getEnv("OPENAI_DEEP_REPORT_MODEL", getEnv("OPENAI_MODEL", "gpt-5.4-mini")),
  };
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
  buildLocalDeepReport,
  getAIConfigStatus,
  buildAdvisorFallback
};
