/**
 * Simulation 策略常量（L3 W1 策略数据化）
 *
 * PolicyConfig dual-read 的 codeFallback 来源：DB 空 / flag 关 / DB 异常时，
 * SimulationPolicyService 逐字节返回这里的常量（零下降铁律）。
 * 内容从 ai-simulation.engine.ts / ai-assist.service.ts 的内联字面量原样提取，
 * 插值改为 {{placeholder}} 占位符（渲染见 renderSimulationTemplate）。
 *
 * 只迁"策略类"（产出质量/业务决策）；安全网类（如外部数据 slice(0,3000)
 * token 截断）永不数据化。
 */

// ==================== 黑天鹅事件库（engine）====================

export interface BlackSwanEventTemplate {
  type: string;
  name: string;
  description: string;
  impact: "high" | "medium" | "low";
  affectedTeams: string[];
}

export const BLACK_SWAN_EVENTS: BlackSwanEventTemplate[] = [
  {
    type: "supply_chain",
    name: "供应链中断",
    description: "关键供应商遭遇不可抗力，交付周期延长50%+",
    impact: "high",
    affectedTeams: ["BLUE", "RED"],
  },
  {
    type: "regulation",
    name: "监管政策突变",
    description: "新出口管制/反垄断政策出台，限制部分业务",
    impact: "high",
    affectedTeams: ["BLUE", "RED", "GREEN"],
  },
  {
    type: "competitor_move",
    name: "竞争对手突击",
    description: "主要竞争对手宣布重大价格下调或技术突破",
    impact: "medium",
    affectedTeams: ["BLUE"],
  },
  {
    type: "customer_change",
    name: "大客户变动",
    description: "关键客户大单签约或解约",
    impact: "medium",
    affectedTeams: ["BLUE", "RED"],
  },
  {
    type: "media_exposure",
    name: "媒体曝光事件",
    description: "负面新闻曝光，舆情危机爆发",
    impact: "medium",
    affectedTeams: ["BLUE", "RED"],
  },
  {
    type: "tech_breakthrough",
    name: "技术突破/失败",
    description: "关键技术研发取得突破或遭遇重大挫折",
    impact: "high",
    affectedTeams: ["BLUE", "RED"],
  },
  {
    type: "financial_shock",
    name: "金融市场冲击",
    description: "融资环境恶化、汇率剧烈波动或信贷紧缩",
    impact: "high",
    affectedTeams: ["BLUE", "RED"],
  },
  {
    type: "talent_crisis",
    name: "人才危机",
    description: "核心团队离职或招聘困难",
    impact: "medium",
    affectedTeams: ["BLUE", "RED"],
  },
  {
    type: "natural_disaster",
    name: "自然灾害/疫情",
    description: "不可抗力导致运营中断",
    impact: "high",
    affectedTeams: ["BLUE", "RED", "GREEN"],
  },
];

// ==================== Agent 推演 prompt（engine）====================

/** 六阵营角色定义（buildAgentSystemPrompt 的 teamRole 映射） */
export const TEAM_ROLE_PROMPTS: Record<string, string> = {
  BLUE: "你是蓝军（我方/主角），代表当前市场主导者。你的目标是保持市场份额、抵御竞争、防范风险。",
  RED: "你是红军（对手/挑战者），代表激进的竞争者。你的目标是抢占市场、颠覆格局、寻找弱点攻击。",
  GREEN:
    "你是绿军（市场/客户/供应商），代表市场参与者、客户和供应链伙伴。你的目标是追求自身利益最大化、评估合作方、做出采购或供应决策。",
  WHITE:
    "你是白方（裁判/监管机构），代表监管机构、行业协会和中立观察者。你关注合规、公平竞争、政策执行和行业健康发展。",
  CHAOS: "你是混沌军（黑天鹅制造者），你会引入不可预测的市场冲击和突发事件。",
  ARBITER: "你是裁判，负责评估各方行动的可行性和后果。",
};

/** Agent system prompt 模板（buildAgentSystemPrompt） */
export const AGENT_SYSTEM_PROMPT_TEMPLATE = `你是一个战略推演中的AI角色。
场景：{{scenarioName}} - {{industry}}
{{teamRole}}

你的角色：{{role}}
{{personaSection}}

回复格式要求：
1. 内心独白（Inner Monologue）：你的分析思考过程，对手可能看不到
2. 公开行动（Public Action）：你决定采取的具体行动，所有人可见

请用以下JSON格式回复：
{"innerMonologue": "你的思考...", "publicAction": "你的行动..."}`;

/** 每轮 user prompt 模板 + 条件段（buildAgentUserPrompt） */
export interface AgentRoundPromptPolicy {
  template: string;
  blackSwanSection: string;
  irrationalSection: string;
  memorySection: string;
}

export const AGENT_ROUND_PROMPT: AgentRoundPromptPolicy = {
  template: `当前是第 {{roundNumber}} 轮推演。

外部态势：
- {{marketInfo}}
- {{financeInfo}}
- {{newsInfo}}
- {{regulationInfo}}

{{blackSwanSection}}

请基于你的角色和当前态势，决定你的下一步行动。{{irrationalSection}}{{memorySection}}`,
  blackSwanSection: "⚠️ 黑天鹅事件：{{name}} - {{description}}",
  irrationalSection:
    "\n\n⚡ 注意：当前存在市场非理性情绪，你可能需要考虑情绪化因素。",
  memorySection: "\n\n公共记忆：{{memoryPublic}}",
};

// ==================== 公司指标模板 + 行业系数（assist）====================

export interface CompanyMetricsTemplate {
  cash: { min: number; max: number }; // 万美元
  share: { min: number; max: number }; // %
  margin: { min: number; max: number }; // %
  debt: { min: number; max: number }; // 万美元
  capacity: { min: number; max: number };
  inventory: { min: number; max: number };
  priceBand: string;
  delivery: string;
  patents: { min: number; max: number };
  channels: string;
  brand: string;
}

export const COMPANY_METRICS_BY_TYPE: Record<string, CompanyMetricsTemplate> = {
  benchmark: {
    cash: { min: 50000, max: 200000 },
    share: { min: 25, max: 60 },
    margin: { min: 35, max: 55 },
    debt: { min: 10000, max: 50000 },
    capacity: { min: 5000, max: 20000 },
    inventory: { min: 500, max: 2000 },
    priceBand: "高端",
    delivery: "2-4周",
    patents: { min: 500, max: 5000 },
    channels: "直销+代理",
    brand: "global_leader",
  },
  challenger: {
    cash: { min: 20000, max: 80000 },
    share: { min: 10, max: 25 },
    margin: { min: 25, max: 40 },
    debt: { min: 5000, max: 30000 },
    capacity: { min: 2000, max: 8000 },
    inventory: { min: 300, max: 1000 },
    priceBand: "中高端",
    delivery: "3-6周",
    patents: { min: 100, max: 1000 },
    channels: "直销+电商",
    brand: "strong",
  },
  regional: {
    cash: { min: 10000, max: 50000 },
    share: { min: 5, max: 20 },
    margin: { min: 20, max: 35 },
    debt: { min: 3000, max: 20000 },
    capacity: { min: 1000, max: 5000 },
    inventory: { min: 200, max: 800 },
    priceBand: "中端",
    delivery: "2-4周",
    patents: { min: 50, max: 500 },
    channels: "区域代理",
    brand: "growing",
  },
  startup: {
    cash: { min: 1000, max: 20000 },
    share: { min: 1, max: 10 },
    margin: { min: 15, max: 30 },
    debt: { min: 500, max: 10000 },
    capacity: { min: 100, max: 1000 },
    inventory: { min: 50, max: 300 },
    priceBand: "中低端",
    delivery: "4-8周",
    patents: { min: 10, max: 100 },
    channels: "电商+直销",
    brand: "emerging",
  },
};

export type IndustryModifier = Partial<{
  cashMultiplier: number;
  marginBonus: number;
  patentMultiplier: number;
  deliveryFast: boolean;
}>;

export const INDUSTRY_MODIFIERS: Record<string, IndustryModifier> = {
  "AI Compute Infrastructure": {
    cashMultiplier: 2,
    marginBonus: 10,
    patentMultiplier: 3,
  },
  Semiconductor: { cashMultiplier: 3, marginBonus: 15, patentMultiplier: 5 },
  "Cloud Services": { cashMultiplier: 2, marginBonus: 5, deliveryFast: true },
  Fintech: { cashMultiplier: 1.5, marginBonus: -5 },
  "E-commerce": { cashMultiplier: 1.2, deliveryFast: true },
  SaaS: { marginBonus: 20, deliveryFast: true },
  Gaming: { marginBonus: 10, patentMultiplier: 0.5 },
  Healthcare: { cashMultiplier: 2.5, patentMultiplier: 4 },
  "Electric Vehicles": { cashMultiplier: 3, patentMultiplier: 2 },
};

// ==================== 行业分析 prompt（assist.analyzeIndustryWithLLM）====================

export const INDUSTRY_ANALYSIS_SYSTEM_PROMPT = `你是一位资深的行业分析师和商业情报专家。请根据用户提供的行业和区域信息，分析该行业的竞争格局。

你的分析必须基于真实的市场数据和行业知识，包括：
1. 识别该行业的主要参与者（至少5-8家真实公司）
2. 分析每家公司的市场定位和竞争优势
3. 推荐适合商业模拟的关键角色
4. 提供行业洞察和趋势分析

公司类型说明：
- competitor: 直接竞争对手（用于RED队，模拟竞争压力）
- customer: 主要客户/采购方（用于GREEN队，模拟市场需求）
- supplier: 关键供应商（用于GREEN队，模拟供应链）
- benchmark: 行业标杆（通常是用户自己选择的公司）

注意：
- 不要返回用户已经选择的公司
- 优先推荐真实存在的知名公司
- 根据区域筛选相关公司

请以 JSON 格式返回，不要包含任何其他文字：
{
  "companies": [
    { "name": "公司名称", "type": "competitor/customer/supplier", "market": "Global/China/US/等", "reason": "推荐理由" }
  ],
  "agents": [
    { "role": "角色名称", "team": "WHITE/CHAOS", "reason": "角色作用" }
  ],
  "goals": {
    "targetShare": "市场份额目标建议",
    "risk": "风险控制建议",
    "growth": "增长策略建议"
  },
  "insights": ["行业洞察1", "行业洞察2", "行业洞察3"]
}`;

export interface IndustryAnalysisUserPromptPolicy {
  template: string;
  existingCompaniesSection: string;
}

export const INDUSTRY_ANALYSIS_USER_PROMPT: IndustryAnalysisUserPromptPolicy = {
  template: `请分析以下行业的竞争格局：

行业：{{industry}}
目标区域：{{region}}
{{existingCompaniesSection}}

请推荐：
1. 5-8家该行业的主要竞争对手公司（type为competitor）
2. 2-3家主要客户或采购方（type为customer）
3. 1-2家关键供应商（type为supplier）
4. 适合WHITE队（监管/分析师）和CHAOS队（黑天鹅事件）的角色
5. 战略目标建议和行业洞察

所有公司必须是真实存在的知名企业。`,
  existingCompaniesSection:
    "用户已选择的公司（请不要重复推荐）：{{existingCompanies}}",
};

// ==================== 公司指标生成 prompt（assist.generateMetricsWithLLM）====================

export interface CompanyMetricsSystemPromptPolicy {
  template: string;
  /** 有外部数据时注入 {{externalDataSection}} 的追加注意事项（第 5/6 条） */
  externalDataSection: string;
}

export const COMPANY_METRICS_SYSTEM_PROMPT: CompanyMetricsSystemPromptPolicy = {
  template: `你是一位资深的行业分析师和商业情报专家。请根据公司名称、类型、所属行业和市场，生成合理的公司量化指标。

注意事项：
1. 数据应该基于该行业的实际情况和公司类型进行合理估算
2. 如果是知名公司，尽量贴近其公开财务数据的量级
3. 如果是虚构或不知名公司，根据行业和类型给出合理假设
4. 所有数值应该保持内部一致性（如初创公司不应有过高的现金储备）{{externalDataSection}}

请以 JSON 格式返回，不要包含任何其他文字：
{
  "metrics": {
    "cash": <现金储备，万美元>,
    "share": <市场份额，百分比数值如15表示15%>,
    "margin": <毛利率，百分比数值>,
    "debt": <负债，万美元>,
    "capacity": <产能单位数>,
    "inventory": <库存单位数>,
    "priceBand": "<定位：高端/中高端/中端/中低端/低端>",
    "delivery": "<交付周期如：2-4周>",
    "patents": <专利数量>,
    "channels": "<渠道：如直销+代理>",
    "brand": "<品牌力：global_leader/strong/growing/niche/emerging>"
  },
  "reasoning": "<简要说明生成依据，如果使用了外部数据请注明>"
}`,
  externalDataSection: `
5. 重要：用户提供了外部API获取的真实数据，请优先参考这些数据，并据此调整生成的指标
6. 如果外部数据中包含财务数据、市场数据，请直接使用或合理换算`,
};

// ==================== 推演参数启发式（assist.suggestParams + generateScenarioSuggestions）====================

/**
 * 一份数据、两处消费：suggestParams 用主体字段，
 * generateScenarioSuggestions 用 scenarioSuggestion 子对象（两处历史数值
 * 有重叠但不一致，为零下降各自保留现值，统一收敛在同一 key 下防双 key 漂移）。
 */
export interface SuggestParamsHeuristics {
  industryTraits: {
    highVolatility: string[];
    highRegulation: string[];
    fastPaced: string[];
    geopolitical: string[];
  };
  baseline: {
    blindMove: boolean;
    cot: boolean;
    chaosProb: number;
    irrationalProb: number;
    humanBreakEvery: number;
    rounds: number;
  };
  highVolatility: { chaosProb: number; irrationalProb: number; rounds: number };
  highRegulation: { humanBreakEvery: number; irrationalProb: number };
  fastPaced: { blindMove: boolean; chaosProb: number };
  geopolitical: { chaosProbBoost: number; chaosProbCap: number };
  scale: {
    companyCountThreshold: number;
    roundsBoost: number;
    roundsCap: number;
    humanBreakBoost: number;
    humanBreakCap: number;
    agentCountThreshold: number;
  };
  regionChina: { chaosProbBoost: number; chaosProbCap: number };
  events: {
    base: string[];
    highVolatility: string[];
    highRegulation: string[];
    geopolitical: string[];
  };
  scenarioSuggestion: {
    highRiskIndustries: string[];
    regulationHeavyIndustries: string[];
    rounds: { highRisk: number; default: number };
    chaosProb: { highRisk: number; regulationHeavy: number; default: number };
    humanBreakEvery: { regulationHeavy: number; default: number };
  };
}

export const SUGGEST_PARAMS_HEURISTICS: SuggestParamsHeuristics = {
  industryTraits: {
    highVolatility: [
      "AI Compute Infrastructure",
      "Semiconductor",
      "Electric Vehicles",
    ],
    highRegulation: ["Fintech", "Healthcare", "Semiconductor"],
    fastPaced: ["E-commerce", "SaaS", "Cloud Services", "Gaming"],
    geopolitical: ["AI Compute Infrastructure", "Semiconductor"],
  },
  baseline: {
    blindMove: true,
    cot: true,
    chaosProb: 0.2,
    irrationalProb: 0.15,
    humanBreakEvery: 2,
    rounds: 4,
  },
  highVolatility: { chaosProb: 0.35, irrationalProb: 0.25, rounds: 6 },
  highRegulation: { humanBreakEvery: 1, irrationalProb: 0.1 },
  fastPaced: { blindMove: true, chaosProb: 0.25 },
  geopolitical: { chaosProbBoost: 0.15, chaosProbCap: 0.5 },
  scale: {
    companyCountThreshold: 3,
    roundsBoost: 2,
    roundsCap: 8,
    humanBreakBoost: 1,
    humanBreakCap: 3,
    agentCountThreshold: 6,
  },
  regionChina: { chaosProbBoost: 0.1, chaosProbCap: 0.5 },
  events: {
    base: ["supply_chain", "regulation", "competitor"],
    highVolatility: ["tech", "finance"],
    highRegulation: ["media", "customer"],
    geopolitical: ["disaster", "talent"],
  },
  scenarioSuggestion: {
    highRiskIndustries: ["Semiconductor", "AI Compute Infrastructure"],
    regulationHeavyIndustries: ["Fintech", "Healthcare"],
    rounds: { highRisk: 6, default: 4 },
    chaosProb: { highRisk: 0.35, regulationHeavy: 0.25, default: 0.2 },
    humanBreakEvery: { regulationHeavy: 1, default: 2 },
  },
};

// ==================== 模板渲染 ====================

/**
 * {{key}} 占位符渲染。用回调替换避免值里的 "$" 被 String.replace
 * 当作特殊模式（如 JSON.stringify 后的 "$&"）；单遍替换，值中出现的
 * {{...}} 不会被二次展开。未提供的占位符原样保留。
 */
export function renderSimulationTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in variables ? variables[key] : match,
  );
}
