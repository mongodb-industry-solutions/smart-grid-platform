"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { H3, Body } from "@leafygreen-ui/typography";
import Button from "@leafygreen-ui/button";

const selectStyle = {
  width: "100%",
  padding: "8px 34px 8px 10px", // room for the custom arrow on the right
  borderRadius: 6,
  border: "1px solid #c1c7c6",
  fontSize: 14,
  marginTop: 6,
  background: "#fff",
  // Replace the OS-default arrow (which sits flush at the edge) with a chevron
  // positioned a consistent 12px from the right.
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235c6c75' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
};

/**
 * Modal to inject a full outage for one meter: pick a region (city/state), then a
 * customer in it. On submit it POSTs the outage, then hands the result back so the
 * map can fire the notification and refresh the red dot.
 */
export default function AddOutageModal({ open, onClose, onOutageAdded }) {
  const [customers, setCustomers] = useState([]);
  const [region, setRegion] = useState("");
  const [dataid, setDataid] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | submitting | error
  const [errorMsg, setErrorMsg] = useState("");

  // Start each open with a clean form (don't keep the last region/customer).
  useEffect(() => {
    if (open) {
      setRegion("");
      setDataid("");
      setPhase("idle");
      setErrorMsg("");
    }
  }, [open]);

  // While open: lock body scroll and close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Load the customer list once the modal opens (dataid + city/state).
  useEffect(() => {
    if (!open || customers.length) return;
    let active = true;
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => {
        if (active) setCustomers(d.customers ?? []);
      })
      .catch(() => {
        if (active) {
          setErrorMsg("Failed to load customers. Please try again.");
          setPhase("error");
        }
      });
    return () => {
      active = false;
    };
  }, [open, customers.length]);

  const regions = useMemo(() => {
    const set = new Set(
      customers
        .filter((c) => c.city && c.state)
        .map((c) => `${c.city}, ${c.state}`)
    );
    return [...set].sort();
  }, [customers]);

  const regionCustomers = useMemo(
    () => customers.filter((c) => `${c.city}, ${c.state}` === region),
    [customers, region]
  );

  if (!open) return null;

  async function submit() {
    if (!dataid) return;
    setPhase("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/monitoring-panel/outages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataid: Number(dataid) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
      onOutageAdded?.(result); // parent fires the notification + map refresh
      // Reset for a possible next add, then close.
      setDataid("");
      setPhase("idle");
      onClose?.();
    } catch (err) {
      setErrorMsg(err.message || "Failed to add outage.");
      setPhase("error");
    }
  }

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          maxWidth: 440,
          width: "100%",
          padding: 28,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <H3 style={{ marginBottom: 6 }}>Add outage</H3>
        <Body style={{ color: "#5c6c75" }}>
          Inject a full outage for one meter. It appears on the map as a red marker
          and fires a notification.
        </Body>

        <div style={{ marginTop: 20 }}>
          <Body weight="medium">Region</Body>
          <select
            style={selectStyle}
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setDataid("");
            }}
          >
            <option value="">Select a region…</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 16 }}>
          <Body weight="medium">Customer</Body>
          <select
            style={selectStyle}
            value={dataid}
            disabled={!region}
            onChange={(e) => setDataid(e.target.value)}
          >
            <option value="">
              {region ? "Select a customer…" : "Pick a region first"}
            </option>
            {regionCustomers.map((c) => (
              <option key={c.dataid} value={c.dataid}>
                Meter {c.dataid}
              </option>
            ))}
          </select>
        </div>

        {phase === "error" && (
          <Body style={{ marginTop: 14, color: "#970606" }}>{errorMsg}</Body>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!dataid || phase === "submitting"}
            onClick={submit}
          >
            {phase === "submitting" ? "Adding…" : "Add outage"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
