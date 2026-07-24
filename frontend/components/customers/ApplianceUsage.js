"use client";

import Icon from "@leafygreen-ui/icon";
import { useApplianceUsage } from "./useApplianceUsage";
import ShowDocButton from "./ShowDocButton";
import styles from "../../style/customers/customers.module.css";

const APPLIANCE_ICONS = {
  hvac_power:    "Cloud",
  heating_power: "Sun",
  kitchen_power: "Bulb",
  laundry_power: "Sweep",
  env_power:     "GlobeAmericas",
  ev_power:      "LightningBolt",
  other:         "Ellipsis",
};

// Colors ranked highest → lowest usage
const BAR_COLORS = [
  "#00684A",
  "#00A35C",
  "#0082C5",
  "#D4730A",
  "#895AF6",
  "#5C6970",
  "#89979B",
];

function fmtW(watts) {
  if (watts >= 1000) return `${(watts / 1000).toFixed(1)} kW`;
  return `${watts} W`;
}

export default function ApplianceUsage({ dataid }) {
  const { data, isLoading, error } = useApplianceUsage(dataid);

  if (!dataid) {
    return (
      <div className={styles.card}>
        <div className={styles.empty}>Select a customer to view appliance usage.</div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <ShowDocButton component="appliance" dataid={dataid} />
      <div className={styles.cardTitle}>Appliance Usage</div>

      {isLoading && !data ? (
        <div className={styles.applianceSkeleton} />
      ) : error ? (
        <div className={styles.empty} style={{ color: "#DB3030" }}>{error}</div>
      ) : data ? (
        <div className={styles.applianceBody}>
          <p className={styles.applianceSub}>
            Avg draw across {data.readingCount.toLocaleString()} readings
            {" · "}
            {fmtW(data.totalAvgWatts)} total
          </p>
          <div className={styles.applianceList}>
            {data.appliances.map((a, i) => (
              <div key={a.key} className={styles.applianceRow}>
                <div className={styles.applianceLabel}>
                  <Icon glyph={APPLIANCE_ICONS[a.key] ?? "Ellipsis"} size="small" />
                  {a.label}
                </div>
                <div className={styles.applianceBar}>
                  <div
                    className={styles.applianceFill}
                    style={{
                      width: `${a.pct}%`,
                      background: BAR_COLORS[i] ?? BAR_COLORS[BAR_COLORS.length - 1],
                    }}
                  />
                </div>
                <div className={styles.applianceStat}>
                  <span className={styles.applianceWatts}>{fmtW(a.avgWatts)}</span>
                  <span className={styles.appliancePct}>{a.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
