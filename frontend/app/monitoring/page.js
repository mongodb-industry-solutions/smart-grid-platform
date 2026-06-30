import RecentReadings from "@/components/readings/live-readings";
import LiveReadingsChart from "@/components/readings/live-readings-chart";
import UsageChangeCard from "@/components/readings/usage-change-card";
import PowerFactorCard from "@/components/readings/power-factor-card";
import Outages from "@/components/outages/outages";
import CustomerMap from "@/components/outages/customerMap";
import GridStabilityCard from "@/components/readings/grid-stability-card";
// import MeterPowerChart from "@/components/monitoring/meter-power-chart";
import Anomalies from "@/components/anomalies/anomalies";
import styles from "./monitoring.module.css";

export default function MonitoringPage() {
  return (
    <main className={styles.page}>
      {/* Row 1 — Energy usage and outage summary */}
      <section className={`${styles.row} ${styles.rowFour}`}>
        <UsageChangeCard />
        <PowerFactorCard />
        <GridStabilityCard />
        <Outages />
      </section>

      {/* Row 2 — Customer map and anomalies */}
      <section className={`${styles.row} ${styles.rowSplit}`}>
        <RecentReadings />
        <CustomerMap />
      </section>

      {/* Row 3 — Recent readings and live readings chart */}
      <section className={`${styles.row} ${styles.rowEqual}`}>
        <LiveReadingsChart />
        <Anomalies />
      </section>
    </main>
  );
}
