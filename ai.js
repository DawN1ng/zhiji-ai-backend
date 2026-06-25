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
    title: `${type}深度报告`,
    subtitle: "写给未来一段时间的自己",
    summary: `你现在关心的「${concern}」，并不是一个孤立的问题。主元素 ${mainElement} 代表你理解世界时最先调用的能量，辅元素 ${secondaryElement} 则像关键时刻的补充力量。它们会一起影响你的选择、关系里的期待，以及压力升高时的反应。接下来更适合你的方式，是先把眼前真正消耗你的地方收束住，再用几个小而稳的选择，把方向慢慢走清楚。`,
    readingFocus: ["先读开头几条提醒，看看它们是否说中了当下的卡点", "再看事业、关系、情绪、财富四个部分", "最后从未来 90 天里选一个最容易开始的小动作"],
    keyInsights: [
      `你的「${type}」更适合在有节奏的环境里慢慢发力。事情越重要，越不必急着一次定终身。`,
      `「${concern}」会让你更容易放大某些细节。先分清事实和猜测，再决定下一步，会比反复推演更稳。`,
      "未来一段时间，最值得练习的是少一点自我消耗，多一点清楚表达，把想法落到看得见的小进展里。"
    ],
    sections: [
      {
        key: "career",
        title: "事业与能力沉淀",
        body: "事业上真正适合你的方向，不一定是最热闹的赛道，而是那些能让你持续积累判断、表达、组织或交付能力的地方。你容易被短期状态影响判断：累的时候想退，顺的时候又想一下子走很远。更稳的办法，是先做出一个小成果，让现实反馈替你筛选方向。",
        points: ["选择能沉淀作品、方法或信任的场景", "不要用某一天的疲惫判断整条路", "把擅长的事整理成别人也能理解的表达", "焦虑升起时，先看这件事能不能带来长期积累"],
        practice: "接下来 7 天，挑一个你愿意继续打磨的能力，做出一个小成果。它可以是一页方案、一次复盘、一份作品，或一次认真完成的交付。"
      },
      {
        key: "relationship",
        title: "关系与沟通模式",
        body: "关系里，你很需要被认真理解，也容易因为在意而多想。细节会被你看见，但细节不一定都能代表结论。比起反复确认对方态度，更适合你的方式，是把感受说得具体一点，把期待说得轻一点，让对方知道可以怎样回应。",
        points: ["少一点试探，多一点具体表达", "看沟通之后的行动，不只看当下语气", "边界不是疏远，而是让关系更稳", "不要在情绪最高点定义整段关系"],
        practice: "选一个最近没说出口的期待，把它改成一句更容易被回应的话：我有点在意这件事，我希望我们可以……"
      },
      {
        key: "emotion",
        title: "情绪内耗地图",
        body: "你的内耗常常不是因为脆弱，而是因为心里同时放着太多没有被说清的期待。信息太多、反馈不明、关系不确定，都会让你反复在脑中推演。这个时候，继续想下去未必会更清楚。先把事实、感受和猜测分开放，反而能让你从混乱里退出来一点。",
        points: ["先写事实，再写感受，最后写一个小动作", "情绪很满的时候，先记录，不急着决定", "把“我是不是不行”换成“我先试哪一步”", "少接一点消耗性的承诺，判断会清醒很多"],
        practice: "连续三天睡前写三行：今天发生了什么、我真实的感受是什么、明天可以先做哪一件小事。"
      },
      {
        key: "wealth",
        title: "财富与节奏",
        body: "财富这件事，对你来说不适合只看快慢，更适合看能不能长期留下东西。你可以留意：哪些能力是你反复用得上的，哪些事情别人愿意因为信任你而交给你。钱只是结果之一，前面还有能力、口碑、交付和稳定关系。这里不谈投资判断，只看你更适合怎样创造价值。",
        points: ["把收入焦虑拆成能力、渠道、信任三件事", "少用冲动消费安抚压力", "优先打磨能反复交付的技能或服务", "别只和别人比较，也要看自己的积累曲线"],
        practice: "写下你已经能稳定帮别人解决的三件事。选其中一件，想想它能不能变成一次更清楚、更完整的交付。"
      }
    ],
    actionPlan90Days: [
      {
        period: "前 30 天",
        focus: "先把最消耗你的地方收一收。不要急着改完整个人生，先让日常节奏回到自己手里。",
        risk: "一边想改变，一边继续答应太多事，最后还是被旧节奏拖着走。",
        action: "每周只选一件最重要的小事。每天结束前问自己：今天有没有往前挪一点点。"
      },
      {
        period: "中 30 天",
        focus: "挑一个方向试一试。不要只在脑子里判断，给它一个小范围的现实反馈。",
        risk: "反馈不够理想时，容易马上否定自己，或者因为比较别人而乱了节奏。",
        action: "做一个 14 天的小尝试：定一个目标，交付一个东西，结束后只判断它值不值得继续。"
      },
      {
        period: "后 30 天",
        focus: "把已经有效的东西留下来。不是把生活塞满，而是让自己更清楚什么值得继续。",
        risk: "刚有一点起色，就想一次性解决所有问题，反而打乱刚建立的秩序。",
        action: "做一次复盘：留下三个让你变稳的习惯，停掉一个明显消耗你的来源。"
      }
    ],
    pressureCard: {
      title: "高压时先看这里",
      signals: ["同一个问题想了很久，却迟迟没有动作", "因为一次反馈，就开始怀疑整个人生方向", "很想立刻做一个大决定，好让不确定感结束"],
      stabilize: ["先写下事实、感受、需求各一句", "把决定往后放一天，只做一件小事", "找一个可信的人复述事实，不急着要答案"],
      avoid: ["不要在情绪最高点定义关系或方向", "不要用消费、熬夜或反复解释来压住焦虑"]
    },
    conversationTemplates: [
      { scenario: "关系沟通", template: "我刚才的情绪比较满，但我真正想表达的是：我在意这件事，也希望我们能具体讨论接下来怎么配合。" },
      { scenario: "工作协作", template: "为了把这件事推进得更稳，我想先确认目标、边界和时间，再说说接下来怎么做。" },
      { scenario: "自我边界", template: "这件事我需要一点时间判断。我会在某个时间前回复你，但现在不想仓促承诺。" }
    ],
    nextQuestions: [
      "接下来一周，我最适合先做哪一步？",
      "事业方向里，哪些选择更适合长期积累？",
      "关系里，我怎么把需求说得更自然？",
      "开始内耗的时候，我可以先把问题怎么拆小？"
    ],
    quote: "真正懂自己的人，会把答案慢慢活成自己的节奏。"
  };
}

function buildSystemPrompt(moduleName) {
  const schemaMap = {
    advisor: '只返回 JSON：{"structure":"...","conflict":"...","advantage":"...","pitfall":"...","actions":["...","...","..."]}',
    deepReport: [
      '只返回 JSON，不要 Markdown，不要解释。',
      'JSON 结构：{"title":"...","subtitle":"...","summary":"...","readingFocus":["..."],"keyInsights":["...","...","..."],"sections":[{"key":"career","title":"...","body":"...","points":["..."],"practice":"..."}],"actionPlan90Days":[{"period":"前 30 天","focus":"...","risk":"...","action":"..."},{"period":"中 30 天","focus":"...","risk":"...","action":"..."},{"period":"后 30 天","focus":"...","risk":"...","action":"..."}],"pressureCard":{"title":"高压时先看这里","signals":["..."],"stabilize":["..."],"avoid":["..."]},"conversationTemplates":[{"scenario":"...","template":"..."}],"nextQuestions":["..."],"quote":"..."}',
      '整份报告正文目标 3200-4600 字，不要写成摘要。',
      'summary 约 260-360 字；keyInsights 固定 3 条；每个 section.body 约 360-560 字；每章 points 4-6 条；practice 约 80-140 字。',
      '每个章节都要具体展开：先解释五行结构如何影响该主题，再写优势、风险、适合的场景和能落到生活里的建议。',
      'actionPlan90Days、pressureCard、conversationTemplates、nextQuestions 必须具体，但不要写成应急 SOP、客服模板或清单教练。',
      '降低 AI 味：不要频繁使用“核心、模块、拆解、可执行、底层、路径、赋能、价值交换”等词；少用“首先/其次/最后”；要像针对这个人的私密报告。',
      '必须严格遵守输入的人格类型、人格名称、主元素、辅元素和五行分数，不得重新计算、改名、调换主辅元素或写出与分数排序相反的判断。'
    ].join("\n"),
    dailyCompanion: [
      '只返回 JSON，不要 Markdown，不要解释。',
      'JSON 结构：{"response":"...","action":"...","focus":"...","signTitle":"...","signText":"...","review":"..."}',
      'response 是 45-80 字中文温柔回应；action 是 20-36 字可执行小行动；focus 是 4-10 字关注侧重点；review 是 80-140 字七日回顾。',
      '不要医疗诊断、不要现实承诺、不要命令用户。'
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
    const elementNameMap = {
      wood: "木",
      fire: "火",
      earth: "土",
      metal: "金",
      water: "水",
    };
    const mainElement = elementNameMap[profile.mainElement] || profile.mainElement || "";
    const secondaryElement = elementNameMap[profile.secondaryElement] || profile.secondaryElement || "";
    return [
      `用户昵称：${profile.nickname || "用户"}`,
      `关注问题：${profile.concern || "自我认知"}`,
      `人格类型：${profile.personalityType || ""} · ${profile.personalityName || ""}`,
      `主元素：${mainElement}`,
      `辅元素：${secondaryElement}`,
      `关键词：${(profile.keywords || []).join(" / ")}`,
      `人格基础五行分数：${JSON.stringify(profile.baseWuxingScores || profile.wuxingScores || {})}`,
      `当前关注议题加权后分数：${JSON.stringify(profile.concernWuxingScores || {})}`,
      `关注议题加权：${JSON.stringify(profile.concernWeights || {})}`,
      `节气与干支依据：${JSON.stringify(profile.scoreBasis || {})}`,
      `promptVersion：${payload.promptVersion || ""}`,
      `schemaVersion：${payload.schemaVersion || ""}`,
      "",
      "请生成一份付费版「深度报告」，要求：",
      "1. 每一部分都要围绕用户的五行结构和关注问题展开，不要写成通用性格文案，也不要只给短段落。",
      "2. 人格基础五行分数决定主辅元素和人格结构；当前关注议题加权后分数只能用于解释用户当下关心的问题，不得替代人格本体。",
      "3. 必须保持主元素、辅元素、人格类型、人格名称与输入完全一致，不得重新计算或调换。",
      "4. 如果提到分数，请按输入分数解释，不得写出与分数高低相反的结论。",
      "5. 事业、财富、关系、情绪建议必须保持“倾向与观察”口吻，避免绝对化承诺。",
      "6. 财富部分只能讨论能力积累、收入节奏和风险意识，不提供任何投资建议。",
      "7. 情感部分只能讨论沟通模式和关系观察，不预测婚姻结果。",
      "8. 情绪部分只能给自我觉察和日常调节建议，不做医疗判断。",
      "9. 未来 90 天行动计划必须分成前 30 天、中 30 天、后 30 天三个阶段，每阶段都有 focus、risk、action。",
      "10. 高压提醒、沟通话术和后续问题要具体，但不要写成清单教练或客服模板。",
      "11. 输出体量请接近付费深度报告：总览充分、四个专项章节完整，每章不要少于 360 个中文字符。",
      "12. 降低 AI 味：不要频繁使用“核心、模块、拆解、可执行、底层、路径、赋能、价值交换”等词；不要写成通用公众号鸡汤；要像针对这个人的私密报告。",
      "13. 五行元素必须使用中文“木、火、土、金、水”，不要输出 wood、fire、earth、metal、water。"
    ].join("\n");
  }
  if (moduleName === "dailyCompanion") {
    const input = payload && payload.payload ? payload.payload : payload;
    return JSON.stringify({
      task: input.task || "daily_response",
      profile: input.profile || {},
      today: input.today || {},
      checkin: input.checkin || {},
      entitlement: input.entitlement || {}
    });
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
