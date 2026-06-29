import RecentReadings from "@/components/readings/live-readings";
import LiveReadingsChart from "@/components/readings/live-readings-chart";
import UsageChangeCard from "@/components/readings/usage-change-card";
import Outages from "@/components/outages/outages";
import CustomerMap from "@/components/outages/customerMap";
import GridStabilityCard from "@/components/readings/grid-stability-card";
// import MeterPowerChart from "@/components/monitoring/meter-power-chart";
import styles from "./monitoring.module.css";

export default function MonitoringPage() {
  return (
    <main className={styles.page} style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
      {/* Row 1 — Energy usage */}
      <section className={styles.cardRow}>
        <UsageChangeCard />
        <Outages />
        <GridStabilityCard />
      </section>

      {/* Row 2 — Outage summary and customer map */}
      <section
        style={{
          display: "flex",
          gap: "24px",
          alignItems: "stretch",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1.5 1 420px", minWidth: 0 }}>
          <CustomerMap />
        </div>
        {/* <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <Outages />
        </div> */}
      </section>

      {/* Row 3 — Recent readings and live readings chart */}
      <section
        style={{
          display: "flex",
          gap: "24px",
          alignItems: "stretch",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 380px", minWidth: 0 }}>
          <RecentReadings />
        </div>
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <LiveReadingsChart />
        </div>
      </section>

    </main>
  );
}
