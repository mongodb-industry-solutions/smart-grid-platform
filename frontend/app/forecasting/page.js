"use client";

import { useMemo, useState } from "react";
import { Body } from "@leafygreen-ui/typography";
import NetworkFilters from "@/components/forecasting/NetworkFilters";
import DemandForecastChart from "@/components/forecasting/DemandForecastChart";
import PipelineCard from "@/components/forecasting/PipelineCard";
import { useNetworkFilters } from "@/components/forecasting/useNetworkFilters";
import { useDemandForecast } from "@/components/forecasting/useDemandForecast";
import { buildDemandPipeline } from "@/lib/const/demandPipeline";
import styles from "@/style/forecasting/document-showcase.module.css";

export default function ForecastingPage() {
  const [regions, setRegions] = useState([]);
  const [feeders, setFeeders] = useState([]);
  const [meterIds, setMeterIds] = useState([]);

  // Region-first drill-down: the selected regions narrow the feeders, and both
  // narrow the meters (options come already scoped from the hook).
  const {
    states: stateOptions,
    feeders: feederOptions,
    meters: meterOptions,
    error: filtersError,
  } = useNetworkFilters(regions, feeders);

  const forecast = useDemandForecast(regions, feeders, meterIds);

  // Build the pipeline client-side so the card updates instantly with the
  // filters — no server round-trip, no dimming.
  const pipeline = useMemo(
    () => buildDemandPipeline({ states: regions, feeders, meterIds }),
    [regions, feeders, meterIds]
  );

  // Changing an upper filter resets the ones below it (empty = all again).
  const handleRegions = (values) => {
    setRegions(values);
    setFeeders([]);
    setMeterIds([]);
  };
  const handleFeeders = (values) => {
    setFeeders(values);
    setMeterIds([]);
  };

  return (
    <main className={styles.page}>
      <div className={styles.grid}>
        {/* Left: one card — intro text, horizontal filters, then the pipeline. */}
        <div className={styles.panelCard}>
          <div className={styles.panelText}>
            <Body>
              Compare projected demand across regions and see the exact MongoDB
              aggregation behind it. Start with a region, then drill down by
              feeder and meter — the chart and the pipeline update together.
            </Body>
          </div>

          <NetworkFilters
            stateOptions={stateOptions}
            feederOptions={feederOptions}
            meterOptions={meterOptions}
            regions={regions}
            feeders={feeders}
            meterIds={meterIds}
            onRegionsChange={handleRegions}
            onFeedersChange={handleFeeders}
            onMeterIdsChange={setMeterIds}
            error={filtersError}
          />

          <PipelineCard pipeline={pipeline} />
        </div>

        {/* Right: the chart. */}
        <DemandForecastChart
          bars={forecast.bars}
          isLoading={forecast.isLoading}
          isRefreshing={forecast.isRefreshing}
          error={forecast.error}
        />
      </div>
    </main>
  );
}
