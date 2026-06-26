import Outages from "@/components/monitoring-panel/outages";
import CustomerMap from "@/components/monitoring-panel/customerMap";

export default function MonitoringPage() {
  return (
    <div>
      <Outages />
      <CustomerMap />
    </div>
  );
}
