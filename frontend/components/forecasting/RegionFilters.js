"use client";

import { Select, Option } from "@leafygreen-ui/select";
import { Combobox, ComboboxOption } from "@leafygreen-ui/combobox";
import { Body } from "@leafygreen-ui/typography";
import styles from "../../style/forecasting/document-showcase.module.css";

const LEVELS = [
  { value: "utility", label: "Utility" },
  { value: "substation", label: "Substation" },
  { value: "feeder", label: "Feeder" },
];

/**
 * Region controls for the demand-peaks view: a granularity Select (which grid
 * level counts as a "region") plus a multi-select of the nodes at that level to
 * compare. Presentational — options and selections are driven by the page.
 */
export default function RegionFilters({
  level,
  onLevelChange,
  regionOptions,
  regionIds,
  onRegionIdsChange,
  error,
}) {
  if (error) {
    return <Body className={styles.errorText}>Error: {error}</Body>;
  }

  const levelLabel = LEVELS.find((l) => l.value === level)?.label ?? "Region";

  return (
    <div className={styles.filters}>
      <div className={styles.filtersRow}>
        <Select
          label="Granularity"
          value={level}
          onChange={onLevelChange}
          className={styles.filterSelect}
          size="small"
          allowDeselect={false}
        >
          {LEVELS.map((l) => (
            <Option key={l.value} value={l.value}>
              {l.label}
            </Option>
          ))}
        </Select>

        <Combobox
          multiselect
          label={`${levelLabel} regions`}
          placeholder={`Select ${levelLabel.toLowerCase()} regions`}
          value={regionIds}
          onChange={onRegionIdsChange}
          className={styles.filterSelectWide}
          size="small"
        >
          {regionOptions.map((o) => (
            <ComboboxOption key={o.id} value={o.id} displayName={o.label} />
          ))}
        </Combobox>
      </div>
      <p className={styles.filtersHint}>
        Pick a granularity, then choose two or more regions to compare their
        projected demand against each region&apos;s own capacity.
      </p>
    </div>
  );
}
