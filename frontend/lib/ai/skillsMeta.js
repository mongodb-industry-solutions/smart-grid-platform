// Client-safe metadata about the agent's skills and tools, for the Agent Graph
// visualization. Kept separate from skills.js (which imports server-only tools).

export const SKILLS_META = [
  { id: "knowledge", label: "Knowledge Base" },
  { id: "outages", label: "Outages" },
  { id: "forecasting", label: "Forecasting" },
  { id: "tariffs", label: "Tariffs" },
  { id: "customers", label: "Customers" },
  { id: "grid", label: "Grid Stability" },
  { id: "anomalies", label: "Anomalies" },
  { id: "general", label: "General" },
];

export const TOOL_LABELS = {
  search_knowledge_base: "search_knowledge_base",
  get_outages_summary: "get_outages_summary",
  get_grid_stability: "get_grid_stability",
  get_anomalies: "get_anomalies",
  list_customers: "list_customers",
  get_customer_detail: "get_customer_detail",
  get_tariff_recommendation: "get_tariff_recommendation",
  get_customer_insights: "get_customer_insights",
  get_demand_by_region: "get_demand_by_region",
};
