import RecentReadings from "@/components/live-readings";
import LiveReadingsChart from "@/components/live-readings-chart";

export default function MonitoringPage() {
  return (
    <main style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
      <RecentReadings />
      <LiveReadingsChart />
    </main>
  );
}
