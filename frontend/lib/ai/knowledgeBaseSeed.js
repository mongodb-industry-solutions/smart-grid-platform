// Curated energy/tariff knowledge base for the AI chatbot. Each article is
// embedded with Voyage AI and indexed for hybrid (vector + full-text) search.
// Keep entries self-contained and factual.

export const KB_ARTICLES = [
  {
    slug: "what-is-power-factor",
    title: "What is power factor?",
    category: "Glossary",
    text: "Power factor is the ratio of real power (kW, the power that does useful work) to apparent power (kVA, the total power drawn). It ranges from 0 to 1. A power factor near 1.0 means electricity is being used efficiently; a low power factor (for example below 0.9) means a lot of reactive power is being drawn, which stresses the grid and can incur penalties for commercial customers. Motors, transformers, and other inductive loads lower the power factor.",
  },
  {
    slug: "what-is-a-demand-charge",
    title: "What is a demand charge?",
    category: "Billing",
    text: "A demand charge bills you for your highest rate of electricity use during a billing period, measured in kilowatts (kW), rather than total energy used (kWh). Utilities apply it because they must size the grid for each customer's peak demand. Demand charges are common for commercial and industrial customers and are usually based on the maximum average demand over a 15- or 30-minute interval. To lower a demand charge, flatten your load: avoid running many large appliances at the same time and shift heavy usage off your peak.",
  },
  {
    slug: "what-is-load-factor",
    title: "What is load factor?",
    category: "Glossary",
    text: "Load factor is average demand divided by peak demand over a period, expressed from 0 to 1. A high load factor (steady usage) is efficient and cheaper to serve; a low load factor (spiky usage with short, high peaks) is more expensive because the grid must be built for the peaks. Improving load factor means spreading usage more evenly across the day.",
  },
  {
    slug: "kwh-vs-kw",
    title: "kWh vs kW: energy vs power",
    category: "Glossary",
    text: "A kilowatt (kW) is a rate of power — how fast you are using electricity at an instant. A kilowatt-hour (kWh) is energy — the amount used over time. Running a 2 kW heater for 3 hours uses 6 kWh. Energy charges bill kWh; demand charges bill peak kW.",
  },
  {
    slug: "time-of-use-plans",
    title: "Time-of-Use (TOU) plans",
    category: "Tariffs",
    text: "Time-of-Use tariffs charge different prices depending on the time of day. Peak hours (often late afternoon and evening) are the most expensive, while off-peak hours (overnight) are the cheapest. TOU plans reward customers who shift flexible usage — laundry, dishwashers, EV charging, pool pumps — to off-peak periods. They suit households that can move consumption away from the evening peak.",
  },
  {
    slug: "tiered-rate-plans",
    title: "Tiered (block) rate plans",
    category: "Tariffs",
    text: "Tiered rate plans charge a low price for the first block of energy each month and higher prices as you cross usage thresholds. The more you use, the more each additional kWh costs. Tiered plans reward low overall consumption and are simple because the price does not depend on the time of day. Heavy users may pay more than they would on a well-managed Time-of-Use plan.",
  },
  {
    slug: "tou-vs-tiered",
    title: "Choosing between Time-of-Use and Tiered plans",
    category: "Tariffs",
    text: "Choose a Time-of-Use plan if you can shift a meaningful share of usage to off-peak hours (for example, charge an EV overnight or run appliances at night). Choose a Tiered plan if your usage is low overall or hard to schedule, since it does not penalize evening use. The best plan depends on both how much energy you use and when you use it.",
  },
  {
    slug: "fixed-charge",
    title: "What is a fixed (service) charge?",
    category: "Billing",
    text: "A fixed charge, also called a service or basic charge, is a flat monthly fee that covers metering, billing, and grid connection. You pay it regardless of how much energy you use. It appears on the bill separately from energy and demand charges.",
  },
  {
    slug: "net-metering-solar",
    title: "Net metering and rooftop solar",
    category: "Concepts",
    text: "Net metering credits customers for excess energy their rooftop solar exports back to the grid. When solar production exceeds on-site use, the meter effectively runs backward and net power can be zero or negative. This is normal for solar customers and should not be confused with an outage; it is energy export, not loss of supply.",
  },
  {
    slug: "reduce-your-bill",
    title: "Ways to reduce your electricity bill",
    category: "Tips",
    text: "To lower your bill: shift flexible loads (laundry, dishwasher, EV charging) to off-peak hours on Time-of-Use plans; reduce standby loads; improve heating and cooling efficiency since HVAC is often the largest load; flatten your peak to reduce demand charges; and pick the tariff that matches your usage pattern. Small, consistent changes to when you use energy often save more than reducing total usage.",
  },
  {
    slug: "hvac-largest-load",
    title: "Why HVAC dominates home energy use",
    category: "Tips",
    text: "Heating, ventilation, and air conditioning (HVAC) is usually the single largest electricity load in a home, often 40-50% of usage. Setting the thermostat a few degrees higher in summer or lower in winter, sealing leaks, and using a programmable schedule can cut HVAC energy substantially and reduce both energy and peak demand.",
  },
  {
    slug: "what-is-an-outage",
    title: "How outages are detected on a smart meter",
    category: "Operations",
    text: "A power outage is a loss of electricity supply to the customer. On a smart meter it typically shows up as voltage dropping to zero (or the meter stopping reporting), sustained for a period. In this platform an outage is flagged when a meter reports non-positive power. Momentary interruptions shorter than the meter's reporting interval may not be captured. A zero or negative reading can also come from solar export, so context matters.",
  },
  {
    slug: "reading-your-usage",
    title: "Reading your consumption trend",
    category: "Operations",
    text: "Consumption is derived from the cumulative energy register on the meter: the energy used in an interval is the difference between consecutive readings. Plotting these differences over time shows your usage pattern and when you peak. Comparing your curve to your region's average helps you see whether you use more or less than similar customers.",
  },
  {
    slug: "anomaly-detection",
    title: "How anomaly detection works",
    category: "Operations",
    text: "The platform flags anomalies by comparing a meter's latest reading against its own recent history. For each metric (voltage, current, power, power factor, frequency) it computes the mean and standard deviation of the baseline and measures how many standard deviations (sigma) the latest reading deviates. Larger sigma means a more unusual reading. This catches meter faults, unusual consumption, and power-quality issues.",
  },
  {
    slug: "grid-stability-feeders",
    title: "Grid stability and feeder utilization",
    category: "Operations",
    text: "Feeders are power lines that carry electricity from substations to groups of meters. Feeder utilization is the load on a feeder divided by its rated capacity. Utilization above about 70% is elevated and above 90% is critical, indicating the feeder is near its limit. Monitoring utilization helps operators prevent overloads and plan capacity.",
  },
  {
    slug: "power-quality",
    title: "Power quality: voltage, frequency, and power factor",
    category: "Concepts",
    text: "Power quality describes how stable and clean the electricity supply is. Voltage should stay within a tight band around its nominal value; frequency should stay near the grid standard (about 60 Hz in North America, 50 Hz elsewhere); and power factor should stay high. Deviations can indicate grid stress, faults, or heavy reactive loads, and can affect sensitive equipment.",
  },
  {
    slug: "peak-demand-shifting",
    title: "Peak shaving and load shifting",
    category: "Tips",
    text: "Peak shaving means reducing your highest bursts of demand; load shifting means moving usage to cheaper or less congested times. Both lower costs on Time-of-Use and demand-charge tariffs and reduce strain on the grid. Batteries, smart thermostats, and scheduling large appliances are common tools for shifting load away from peak periods.",
  },
];
