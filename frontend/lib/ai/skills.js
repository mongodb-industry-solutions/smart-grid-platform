import * as T from "./agentTools";

const BASE =
  "You are a specialist assistant for a MongoDB-powered Smart Grid platform. Answer concisely in Markdown. Use your tools for real data; never invent numbers. If something is outside your scope or the data, say so.";

// One skill per module. Each has a focused toolset + prompt. The router picks
// which skill handles a question.
export const SKILLS = {
  knowledge: {
    label: "Knowledge Base",
    description:
      "Concepts, definitions, billing, tariffs explained, energy-saving tips, glossary (power factor, demand charge, load factor, TOU vs tiered).",
    tools: [T.searchKnowledgeBase],
    prompt: `${BASE} You handle explanations and advice. Always ground answers in search_knowledge_base results and mention the concepts you used.`,
  },
  outages: {
    label: "Outages",
    description: "Power outages: how many, who is affected, longest outage.",
    tools: [T.getOutages],
    prompt: `${BASE} You handle outage questions using get_outages_summary.`,
  },
  forecasting: {
    label: "Forecasting",
    description: "Projected/expected demand, peaks, regional demand comparisons.",
    tools: [T.getDemandByRegion],
    prompt: `${BASE} You handle demand forecasting with get_demand_by_region.`,
  },
  tariffs: {
    label: "Tariffs",
    description: "Tariff plans, rates, billing estimates, tariff recommendations.",
    tools: [T.getTariffRecommendationTool, T.listCustomers, T.searchKnowledgeBase],
    prompt: `${BASE} You handle tariffs and billing. For a specific customer, find their dataid with list_customers, then get_tariff_recommendation. For general tariff concepts use search_knowledge_base. Deployment fact: customers in Texas are always on a Tiered rate plan.`,
  },
  customers: {
    label: "Customers",
    description: "Specific customers/meters: details, usage, insights, lookup.",
    tools: [T.listCustomers, T.getCustomerDetailTool, T.getCustomerInsightsTool],
    prompt: `${BASE} You handle customer questions. Use list_customers to resolve a dataid, then get_customer_detail or get_customer_insights.`,
  },
  grid: {
    label: "Grid Stability",
    description: "Feeder load, capacity, utilization, grid stress.",
    tools: [T.getGrid],
    prompt: `${BASE} You handle grid/feeder questions with get_grid_stability.`,
  },
  anomalies: {
    label: "Anomalies",
    description: "Unusual readings, deviations (sigma), power-quality issues.",
    tools: [T.getAnomaliesTool],
    prompt: `${BASE} You handle anomaly questions with get_anomalies.`,
  },
  general: {
    label: "General",
    description: "Anything that spans modules or is unclear.",
    tools: [
      T.searchKnowledgeBase,
      T.getOutages,
      T.getGrid,
      T.getAnomaliesTool,
      T.listCustomers,
      T.getCustomerDetailTool,
      T.getTariffRecommendationTool,
      T.getCustomerInsightsTool,
      T.getDemandByRegion,
    ],
    prompt: `${BASE} You can use any tool. Pick the ones that fit the question.`,
  },
};

export const MODULE_IDS = Object.keys(SKILLS);

// Every tool (the ToolNode must be able to execute any tool the agent calls).
export const ALL_TOOLS = [
  T.searchKnowledgeBase,
  T.getOutages,
  T.getGrid,
  T.getAnomaliesTool,
  T.listCustomers,
  T.getCustomerDetailTool,
  T.getTariffRecommendationTool,
  T.getCustomerInsightsTool,
  T.getDemandByRegion,
];

// Short catalog for the router prompt.
export const MODULE_CATALOG = MODULE_IDS.map(
  (id) => `- ${id}: ${SKILLS[id].description}`
).join("\n");
