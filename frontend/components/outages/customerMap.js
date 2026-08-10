"use client";

import ShowDocButton from "@/components/customers/ShowDocButton";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoAlbers, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import statesTopo from "us-atlas/states-10m.json";
import { H2, Body, Error as ErrorText } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import Button from "@leafygreen-ui/button";
import { useCustomerLocations } from "./useCustomerLocations";
import { useNotifications } from "@/components/notifications/NotificationsContext";
import AddOutageModal from "./AddOutageModal";
import { getCityCoordinates } from "@/lib/const/cityCoordinates";
import styles from "../../style/outages/panel.module.css";

const WIDTH = 960;
const HEIGHT = 600;
const MIN_RADIUS = 11;
const MAX_RADIUS = 34;

// Core colors for the markers.
const CUSTOMER_COLOR = "#3CA557";
const OUTAGE_COLOR = "#D9534F";

// Fade rings around the core. The largest count gets MAX_LAYERS rings; smaller
// counts get proportionally fewer. Each ring extends RING_STEP beyond the last.
const MAX_LAYERS = 5;
const RING_STEP = 0.45;

// Keeps only the continental US: drops Alaska (02), Hawaii (15) and the
// territories (FIPS >= 60) so the map has no insets.
function isContinental(id) {
  const fips = Number(id);
  return fips !== 2 && fips !== 15 && fips < 60;
}

// geoAlbers is the conic-equal-area projection configured for the continental
// US by default. Computed once at module scope (geometry and size are fixed).
const allStates = feature(statesTopo, statesTopo.objects.states);
const continentalStates = {
  type: "FeatureCollection",
  features: allStates.features.filter((f) => isContinental(f.id)),
};
const projection = geoAlbers().fitSize([WIDTH, HEIGHT], continentalStates);
const pathGenerator = geoPath(projection);
const STATE_PATHS = continentalStates.features.map((stateFeature) => ({
  id: stateFeature.id,
  d: pathGenerator(stateFeature),
}));

// Square-root ratio of a count against the largest count, so circle *area*
// stays proportional. Returns 0 for an empty count.
function getRatio(count, maxCount) {
  if (!count || maxCount <= 0) return 0;
  return Math.sqrt(count) / Math.sqrt(maxCount);
}

// Core radius scaled proportionally to the count.
function getRadius(count, maxCount) {
  const ratio = getRatio(count, maxCount);
  return ratio ? MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS) : 0;
}

// Number of fade rings, proportional to the count (the largest gets MAX_LAYERS).
function getLayerCount(count, maxCount) {
  const ratio = getRatio(count, maxCount);
  return ratio ? Math.max(1, Math.round(ratio * MAX_LAYERS)) : 0;
}

// Builds `layerCount` fade rings (outermost first) for a marker. More rings
// reach further out and fade more, so bigger counts get a larger, softer halo.
function buildGlowLayers(layerCount) {
  const layers = [];
  for (let i = 1; i <= layerCount; i += 1) {
    layers.push({
      scale: 1 + i * RING_STEP,
      opacity: Math.max(0.06, 0.26 - (i - 1) * 0.05),
    });
  }
  return layers.reverse();
}

// Projects each location to x/y pixels and computes the green (customers) and
// red (outages) marker sizes. Both share a single scale (the largest count
// across all cities and both metrics) so radius and ring count are directly
// comparable. Cities with no known coordinates are dropped.
function buildMarkers(locations) {
  const maxCount = locations.reduce(
    (max, loc) => Math.max(max, loc.customers, loc.outages),
    0
  );

  const markers = locations
    .map((loc) => {
      const coordinates = getCityCoordinates(loc.city, loc.state);
      if (!coordinates) {
        console.warn(`No coordinates for ${loc.city}, ${loc.state}`);
        return null;
      }
      const point = projection(coordinates);
      if (!point) return null;

      return {
        key: `${loc.city}, ${loc.state}`,
        city: loc.city,
        state: loc.state,
        substation: loc.substation ?? null,
        feeder: loc.feeder ?? null,
        transformer: loc.transformer ?? null,
        customers: loc.customers,
        outages: loc.outages,
        x: point[0],
        y: point[1],
        customerRadius: getRadius(loc.customers, maxCount),
        customerLayers: getLayerCount(loc.customers, maxCount),
      };
    })
    .filter(Boolean)
    .map((marker, index) => ({ ...marker, index }));

  return { markers, maxCount };
}

// Builds a notification payload from a city marker (real outage data).
function alertFor(marker) {
  return {
    city: marker.city,
    substation: marker.substation,
    feeder: marker.feeder,
    transformer: marker.transformer,
    affected: marker.outages,
    severity: marker.outages >= 5 ? "high" : marker.outages >= 2 ? "medium" : "low",
    title: `Outage — ${marker.city}, ${marker.state}`,
  };
}

// A core circle ringed by concentric fade layers, with the count centered inside.
function GlowMarker({ cx, cy, radius, layerCount, coreColor, label, count, pulse }) {
  if (!radius) return null;

  return (
    <g>
      {buildGlowLayers(layerCount).map((layer) => (
        <circle
          key={layer.scale}
          cx={cx}
          cy={cy}
          r={radius * layer.scale}
          fill={coreColor}
          fillOpacity={layer.opacity}
        />
      ))}
      {pulse && (
        <circle
          className={styles.pulseRing}
          cx={cx}
          cy={cy}
          r={radius}
          fill={coreColor}
          fillOpacity={0.5}
        />
      )}
      <circle cx={cx} cy={cy} r={radius} fill={coreColor} fillOpacity={0.95}>
        <title>{`${label}: ${count}`}</title>
      </circle>
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.max(11, radius * 0.7)}
        fontWeight="600"
        fill={palette.black}
      >
        {count}
      </text>
    </g>
  );
}

// Small swatch + label used in the legend.
function LegendItem({ color, label }) {
  return (
    <span className={styles.legendItem}>
      <span className={styles.legendSwatch} style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export default function CustomerMap() {
  const { locations, isLoading, error } = useCustomerLocations();

  const { markers, maxCount } = useMemo(() => buildMarkers(locations), [locations]);
  const { addAlert, reset } = useNotifications();

  const [outageOpen, setOutageOpen] = useState(false);

  // After an outage is injected, wait ~1s, then fire the notification and nudge
  // the map to refetch so the new red marker appears.
  const handleOutageAdded = (r) => {
    setTimeout(() => {
      addAlert({
        city: r.city,
        state: r.state,
        substation: r.substation_id,
        feeder: r.feeder_id,
        transformer: r.transformer_id,
        severity: "high",
        title: `Outage — ${r.city}, ${r.state}`,
      });
      window.dispatchEvent(new Event("outage:added"));
    }, 1000);
  };

  // Restart the demo cleanly each time the map mounts (fresh page load or
  // navigating back to Monitoring), so alerts don't accumulate across visits.
  useEffect(() => {
    reset();
  }, [reset]);

  const seededRef = useRef(false);

  // Seed the notification center (silently) with the current outages, so the bell
  // reflects the outage cities on load.
  useEffect(() => {
    if (seededRef.current || markers.length === 0) return;
    seededRef.current = true;
    markers
      .filter((m) => m.outages > 0)
      .sort((a, b) => a.outages - b.outages) // prepended, so worst ends up on top
      .forEach((m) => addAlert(alertFor(m), { silent: true }));
  }, [markers.length, addAlert]);

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <H2>Customers & Outages by Location</H2>
        <Button
          size="small"
          variant="danger"
          style={{ marginLeft: "auto", alignSelf: "center", whiteSpace: "nowrap", flexShrink: 0 }}
          onClick={() => setOutageOpen(true)}
        >
          + Add outage
        </Button>
      </div>

      <AddOutageModal
        open={outageOpen}
        onClose={() => setOutageOpen(false)}
        onOutageAdded={handleOutageAdded}
      />

      <div className={styles.card}>
        <ShowDocButton scope="monitoring" component="customer-map" />
        <div className={styles.legend}>
          <LegendItem color={CUSTOMER_COLOR} label="Customers" />
          <LegendItem color={OUTAGE_COLOR} label="Outages" />
        </div>

        {isLoading && (
          <Body style={{ color: palette.gray.dark1 }}>Loading map…</Body>
        )}

        {error && <ErrorText>Error: {error}</ErrorText>}

        {!isLoading && !error && (
          <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          style={{ width: "100%", height: "auto" }}
          role="img"
          aria-label="Map of customers and outages by city"
        >
          {STATE_PATHS.map((state) => (
            <path
              key={state.id}
              d={state.d}
              fill={palette.gray.light2}
              stroke={palette.white}
              strokeWidth={0.75}
            />
          ))}

          {markers.map((marker) => {
            const shownOutages = marker.outages;
            const outageRadius = getRadius(shownOutages, maxCount);
            const outageLayers = getLayerCount(shownOutages, maxCount);

            return (
              <g key={marker.key}>
                <text
                  x={marker.x}
                  y={marker.y - Math.max(marker.customerRadius, outageRadius) - 8}
                  textAnchor="middle"
                  fontSize={15}
                  fontWeight="600"
                  fill={palette.gray.dark3}
                >
                  {marker.city}
                </text>

                <GlowMarker
                  cx={marker.x - marker.customerRadius}
                  cy={marker.y}
                  radius={marker.customerRadius}
                  layerCount={marker.customerLayers}
                  coreColor={CUSTOMER_COLOR}
                  label="Customers"
                  count={marker.customers}
                  pulse
                />

                <GlowMarker
                  cx={marker.x + outageRadius}
                  cy={marker.y}
                  radius={outageRadius}
                  layerCount={outageLayers}
                  coreColor={OUTAGE_COLOR}
                  label="Outages"
                  count={shownOutages}
                  pulse={shownOutages > 0}
                />
              </g>
            );
          })}
          </svg>
        )}
      </div>
    </div>
  );
}
