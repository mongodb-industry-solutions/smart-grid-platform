import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getDb } from "./agentDb";
import { hybridSearch } from "./knowledgeBase";
import {
  getCustomers,
  getCustomerDetail,
  getTariffRecommendation,
  getCustomerInsights,
} from "@/lib/db/customers";
import { getOutagesSummary } from "@/lib/db/outages";
import { getGridStability } from "@/lib/db/gridStability";
import { getAnomalies } from "@/lib/db/anomalies";
import { getDemandForecast } from "@/lib/db/demandForecast";

const j = (x) => JSON.stringify(x);

export const searchKnowledgeBase = tool(
  async ({ query, category }, config) => {
    const db = await getDb();
    // A UI-selected category (passed via graph config) overrides the tool arg.
    const cat = config?.configurable?.category || category || null;
    const articles = await hybridSearch(db, query, { k: 5, category: cat });
    return j(articles.map((a) => ({ title: a.title, category: a.category, text: a.text })));
  },
  {
    name: "search_knowledge_base",
    description:
      "Search the energy & tariff knowledge base (concepts, definitions, billing, tips, glossary) via hybrid vector + keyword search.",
    schema: z.object({
      query: z.string().describe("The natural-language search query."),
      category: z
        .enum(["Glossary", "Billing", "Tariffs", "Concepts", "Tips", "Operations"])
        .optional()
        .describe("Optional category to restrict the search."),
    }),
  }
);

export const getOutages = tool(
  async () => j(await getOutagesSummary(await getDb())),
  {
    name: "get_outages_summary",
    description:
      "Live outage summary: total outage readings, customers affected, percentage affected, and the longest outage.",
    schema: z.object({}),
  }
);

export const getGrid = tool(
  async () => {
    const gs = await getGridStability(await getDb(), 0);
    return j({ summary: gs.summary, feeders: (gs.feeders ?? []).slice(0, 8) });
  },
  {
    name: "get_grid_stability",
    description:
      "Live feeder load-vs-capacity snapshot: overall utilization, peak feeder, totals, and normal/elevated/critical counts.",
    schema: z.object({}),
  }
);

export const getAnomaliesTool = tool(
  async ({ threshold, limit }) => {
    const rows = await getAnomalies(await getDb(), { threshold: threshold ?? 3 });
    return j(rows.slice(0, limit ?? 10));
  },
  {
    name: "get_anomalies",
    description:
      "Meters whose latest reading deviates from their own baseline, in standard deviations (sigma). threshold 0 lists all.",
    schema: z.object({
      threshold: z.number().optional().describe("Minimum sigma (default 3; 0 = all)."),
      limit: z.number().optional().describe("Max rows (default 10)."),
    }),
  }
);

export const listCustomers = tool(
  async () => j(await getCustomers(await getDb())),
  {
    name: "list_customers",
    description:
      "List customers with location, tariff plan, and latest reading. Use to find a customer's dataid.",
    schema: z.object({}),
  }
);

export const getCustomerDetailTool = tool(
  async ({ dataid }) => j(await getCustomerDetail(await getDb(), Number(dataid))),
  {
    name: "get_customer_detail",
    description: "Full detail for one customer by dataid: location, tariff (with tiers), latest reading.",
    schema: z.object({ dataid: z.number().describe("The customer/meter id.") }),
  }
);

export const getTariffRecommendationTool = tool(
  async ({ dataid }) => j(await getTariffRecommendation(await getDb(), Number(dataid))),
  {
    name: "get_tariff_recommendation",
    description:
      "Estimated personalized monthly tariff for a customer by dataid, with a cost breakdown.",
    schema: z.object({ dataid: z.number().describe("The customer/meter id.") }),
  }
);

export const getCustomerInsightsTool = tool(
  async ({ dataid }) => j(await getCustomerInsights(await getDb(), Number(dataid))),
  {
    name: "get_customer_insights",
    description: "Peak hour of the day and estimated monthly consumption for a customer by dataid.",
    schema: z.object({ dataid: z.number().describe("The customer/meter id.") }),
  }
);

export const getDemandByRegion = tool(
  async () => {
    const f = await getDemandForecast(await getDb(), {});
    return j({ regions: f.regions, bars: f.bars });
  },
  {
    name: "get_demand_by_region",
    description:
      "Expected peak demand per region (kW) with a 95% prediction interval and peak hour.",
    schema: z.object({}),
  }
);
