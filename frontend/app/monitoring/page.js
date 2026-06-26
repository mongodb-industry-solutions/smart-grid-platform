import RecentReadings from "@/components/monitoring/live-readings";
import LiveReadingsChart from "@/components/monitoring/live-readings-chart";
import MeterPowerChart from "@/components/monitoring/meter-power-chart";
import UsageChangeCard from "@/components/monitoring/usage-change-card";
import styles from "./monitoring.module.css";

export default function MonitoringPage() {
  return (
    <main className={styles.page}>
      <UsageChangeCard />
      <RecentReadings />
      <LiveReadingsChart />
      {/* <MeterPowerChart /> */}
    </main>
  );
}
