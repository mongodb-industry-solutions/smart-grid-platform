"use client";

import { Combobox, ComboboxOption } from "@leafygreen-ui/combobox";
import { Body } from "@leafygreen-ui/typography";
import styles from "../../style/forecasting/document-showcase.module.css";

/**
 * Cascading, multi-select region / feeder / meter filters (checkbox comboboxes),
 * laid out horizontally. Presentational: options and selections are driven by
 * the page. An empty selection means "all" for that level.
 */
export default function NetworkFilters({
  stateOptions,
  feederOptions,
  meterOptions,
  regions,
  feeders,
  meterIds,
  onRegionsChange,
  onFeedersChange,
  onMeterIdsChange,
  error,
}) {
  if (error) {
    return <Body className={styles.errorText}>Error: {error}</Body>;
  }

  return (
    <div className={styles.filters}>
      <div className={styles.filtersRow}>
        <Combobox
          multiselect
          label="Region"
          placeholder="All regions"
          value={regions}
          onChange={onRegionsChange}
          className={styles.filterSelect}
          size="small"
        >
          {stateOptions.map((s) => (
            <ComboboxOption key={s} value={s} displayName={s} />
          ))}
        </Combobox>

        <Combobox
          multiselect
          label="Feeder"
          placeholder="All feeders"
          value={feeders}
          onChange={onFeedersChange}
          className={styles.filterSelect}
          size="small"
        >
          {feederOptions.map((f) => (
            <ComboboxOption key={f} value={f} displayName={f} />
          ))}
        </Combobox>

        <Combobox
          multiselect
          label="Meter"
          placeholder="All meters"
          value={meterIds}
          onChange={onMeterIdsChange}
          className={styles.filterSelect}
          size="small"
        >
          {meterOptions.map((m) => (
            <ComboboxOption
              key={m.dataid}
              value={String(m.dataid)}
              displayName={`${m.dataid} · ${m.city}`}
            />
          ))}
        </Combobox>
      </div>
      <p className={styles.filtersHint}>
        Leave a filter empty to include everything at that level.
      </p>
    </div>
  );
}
