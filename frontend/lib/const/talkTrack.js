export const TALK_TRACK = [
  {
    heading: "Overview & Demo",
    content: [
      {
        heading: "Solution Overview",
        body: "Smart Grid Intelligent Platform is a utility operations demo built entirely on MongoDB Atlas. It brings four workloads together on one operational data layer: real-time grid monitoring, customer intelligence, demand forecasting, and an AI assistant. All over the same smart-meter data.",
      },
      {
        heading: "What it shows",
        body: [
          "Monitoring: outages, grid/feeder stability, anomalies, power factor, live readings, and a customer/outage map.",
          "Network Center: the grid topology (utility → substation → feeder → transformer), substation health, capacity pressure, and outage status across the service territory.",
          "Customers: profile, latest reading, tariff recommendation, insights, appliance breakdown, usage segment, and consumption trend.",
          "Forecasting: expected demand and peak timing per region, weather-adjusted with external data, plus the exact aggregation pipeline behind it.",
          "Grid Support Agent: a multi-agent chatbot that answers questions over the data and a knowledge base.",
        ],
      },
      {
        heading: "How to Demo",
        body: [
          "Start in Monitoring - point out outages, grid stability and anomalies computed live in MongoDB.",
          "Open any card's { } 'Show document' button to reveal the real documents and aggregation pipelines behind it.",
          "Go to the Network Center - explore the grid topology, substation health and capacity pressure, all joined on demand with $lookup.",
          "Go to Customers - select a customer to see their tariff estimate, insights and consumption trend.",
          "Go to Forecasting - filter by region/feeder/meter and watch the weather-adjusted aggregation pipeline update with the chart.",
          "Finish in the Grid Support Agent - ask a question and show the Agent Graph (how it routed) and the Vector Map (semantic retrieval).",
        ],
      },
    ],
  },
  {
    heading: "Behind the Scenes",
    content: [
      {
        heading: "Reference architecture - Operational Data layer",
        image: {
          src: "/General_Architecture.svg",
          alt: "Operational Data layer reference architecture: MongoDB Atlas as the operational data layer for the smart grid demo, with four workloads (Monitoring, Network Center, Customers, Forecasting) and an AI assistant.",
        },
      },
      {
        heading: "Reference architecture - Agentic AI layer",
        image: {
          src: "/Reference_Architectures.svg",
          alt: "Reference architecture: the agentic AI layer (Perception, Planning, Tools, Memory) and MongoDB Atlas collections.",
        },
      },
      {
        heading: "Data model",
        body: "The flexible document model keeps related data together and joins the rest on demand.",
      },
      {
        heading: "Collections",
        body: [
          "readings - 15-min smart-meter readings (voltage, current, power, energy, power factor, appliance sub-loads).",
          "customer_db - customer records; tariff_catalog - rate plans (tiered / TOU) with tier bands.",
          "meter_network_map + network - grid topology (meter → feeder → substation → transformer, with capacities).",
          "kb_articles - energy/tariff knowledge base for the AI assistant (Atlas Vector Search + full-text).",
          "agent_checkpoints - LangGraph conversation memory for the AI assistant.",
        ],
      },
      {
        heading: "Aggregations doing the work",
        body: [
          "Outages: $match + $facet + $setWindowFields/$shift (gaps-and-islands) for the longest continuous outage.",
          "Grid stability: $lookup readings → meter_network_map → network, $group load, compute utilization vs capacity_kw.",
          "Network Center: same topology join across the utility → substation → feeder → transformer hierarchy to score substation health and outage status.",
          "Anomalies: per-meter baseline mean/$stdDevSamp, flag readings beyond N sigma.",
          "Forecasting: $group by region and hour with $avg/$stdDevSamp, enriched with external weather data (heating/cooling degree days) for peak demand and timing.",
          "AI retrieval: $vectorSearch + $search fused with Reciprocal Rank Fusion (hybrid search).",
        ],
      },
    ],
  },
  {
    heading: "Why MongoDB?",
    content: [
      {
        heading: "One platform, many workloads",
        body: "Operational analytics, customer intelligence, forecasting and generative AI run on the same Atlas cluster and the same documents - no separate data stores to sync.",
      },
      {
        heading: "Highlights",
        body: [
          "Flexible document model - each meter/customer carries exactly the nested fields it needs; schema evolves without migrations.",
          "Aggregation framework - analytics computed in the database ($facet, $setWindowFields, $lookup, $group, statistics).",
          "Atlas Vector Search with automated Voyage AI embeddings - semantic search with no separate embedding service.",
          "Hybrid search - vector + full-text fused with Reciprocal Rank Fusion for better retrieval.",
          "Agentic AI on MongoDB - a LangGraph multi-agent with conversation memory persisted in Atlas.",
        ],
      },
    ],
  },
];
