"use client";

import { useMemo, useState } from "react";
import { Body } from "@leafygreen-ui/typography";
import NetworkFilters from "@/components/forecasting/NetworkFilters";
import DemandForecastChart from "@/components/forecasting/DemandForecastChart";
import PeakTimingChart from "@/components/forecasting/PeakTimingChart";
import RegionFilters from "@/components/forecasting/RegionFilters";
import RegionalDemandForecastChart from "@/components/forecasting/RegionalDemandForecastChart";
import RegionSummaryCards from "@/components/forecasting/RegionSummaryCards";
import WeatherDemandForecastChart from "@/components/forecasting/WeatherDemandForecastChart";
import PipelineCard from "@/components/forecasting/PipelineCard";
import { useNetworkFilters } from "@/components/forecasting/useNetworkFilters";
import { useDemandForecast } from "@/components/forecasting/useDemandForecast";
import { useNetworkHierarchy } from "@/components/forecasting/useNetworkHierarchy";
import { useRegionalForecast } from "@/components/forecasting/useRegionalForecast";
import { useWeatherForecast } from "@/components/forecasting/useWeatherForecast";
import { buildDemandPipeline } from "@/lib/const/demandPipeline";
import { buildRegionalForecastPipeline } from "@/lib/const/regionalForecastPipeline";
import styles from "@/style/forecasting/document-showcase.module.css";

export default function ForecastingPage() {
  // ── Existing: expected demand peaks by region (bar per region) ──
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

  // Weather-adjusted forecast: driven by the same panel selection as the demand
  // forecast, so both charts move together when a filter is adjusted.
  const weather = useWeatherForecast(regions, feeders, meterIds);

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

  // ── New: projected demand vs capacity, by grid-hierarchy region ──
  const [level, setLevel] = useState("feeder");
  const [regionNodeIds, setRegionNodeIds] = useState([]);

  const {
    utilities,
    substations,
    feeders: feederNodes,
    error: hierarchyError,
  } = useNetworkHierarchy();

  const regionOptions = useMemo(() => {
    if (level === "utility") return utilities;
    if (level === "substation") return substations;
    return feederNodes;
  }, [level, utilities, substations, feederNodes]);

  const capacityForecast = useRegionalForecast(level, regionNodeIds);

  const capacityPipeline = useMemo(
    () => buildRegionalForecastPipeline({ level, regionIds: regionNodeIds }),
    [level, regionNodeIds]
  );

  const handleLevel = (value) => {
    setLevel(value);
    setRegionNodeIds([]);
  };

  return (
    <main className={styles.page}>
      {/* ── Section 1: filter panel next to both forecast charts. All three
          are driven by the same region/feeder/meter selection. ── */}
      <div className={styles.grid}>
        {/* Left: one card — intro text, filters, then the pipeline. The inner
            layer is absolutely positioned so the panel's height is set by the
            charts (not the pipeline JSON), which scrolls to fit. */}
        <div className={styles.panelCard}>
          <div className={styles.panelInner}>
            <div className={styles.panelText}>
              <Body>
                Compare projected demand across regions and see the exact MongoDB
                aggregation behind it. Start with a region, then drill down by
                feeder and meter — both charts and the pipeline update together.
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
        </div>

        {/* Right column: the weather-adjusted forecast on top, then the
            demand-planning charts below it — all beside the filter panel. */}
        <div className={styles.chartStack}>
          <WeatherDemandForecastChart
            region={weather.region}
            points={weather.points}
            nowIndex={weather.nowIndex}
            isLoading={weather.isLoading}
            isRefreshing={weather.isRefreshing}
            error={weather.error}
          />

          {/* Expected peak magnitude by region next to when those peaks land
              in local time. Both driven by the same filters. */}
          <div className={styles.gridEqual}>
            <DemandForecastChart
              bars={forecast.bars}
              isLoading={forecast.isLoading}
              isRefreshing={forecast.isRefreshing}
              error={forecast.error}
            />

            <PeakTimingChart
              bars={forecast.bars}
              isLoading={forecast.isLoading}
              isRefreshing={forecast.isRefreshing}
              error={forecast.error}
            />
          </div>
        </div>
      </div>

      {/* ── Section 2: projected demand vs capacity, by grid-hierarchy region ──
      <div className={styles.grid}>
        <div className={styles.panelCard}>
          <div className={styles.panelText}>
            <Body>
              Identify expected demand peaks by region and prepare for localized
              capacity pressure. Choose a grid granularity — utility, substation,
              or feeder — then compare regions&apos; projected demand against each
              region&apos;s own capacity. The chart and the aggregation below
              update together.
            </Body>
          </div>

          <RegionFilters
            level={level}
            onLevelChange={handleLevel}
            regionOptions={regionOptions}
            regionIds={regionNodeIds}
            onRegionIdsChange={setRegionNodeIds}
            error={hierarchyError}
          />

          <PipelineCard pipeline={capacityPipeline} />
        </div>

        <RegionalDemandForecastChart
          regions={capacityForecast.regions}
          isLoading={capacityForecast.isLoading}
          isRefreshing={capacityForecast.isRefreshing}
          error={capacityForecast.error}
        />
      </div> */}

      {/* Per-region summary cards for the capacity forecast. */}
      <RegionSummaryCards regions={capacityForecast.regions} />
    </main>
  );
}
