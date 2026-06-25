import RecentReadings from "@/components/monitoring/live-readings";
import LiveReadingsChart from "@/components/monitoring/live-readings-chart";
import UsageChangeCard from "@/components/monitoring/usage-change-card";

export default function MonitoringPage() {
  return (
    <main style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
      <UsageChangeCard />
      <RecentReadings />
      <LiveReadingsChart />
    </main>
  );
}
