"use client";

import { useState } from "react";
import Icon from "@leafygreen-ui/icon";
import DataModelModal from "./DataModelModal";
import styles from "../../style/customers/customers.module.css";

/**
 * Reusable "show me the document" trigger: an icon button that opens a modal
 * scoped to one component's documents + queries/pipelines.
 *
 * @param {string} component the component key (e.g. "segment", "tariff")
 * @param {number|null} dataid selected customer id
 * @param {boolean} [inline] place the button in flow (default: absolute top-right)
 */
export default function ShowDocButton({
  component,
  dataid,
  scope = "customers",
  inline = false,
}) {
  const [open, setOpen] = useState(false);
  const title = "Show MongoDB document & pipelines";
  const disabled = scope === "customers" && dataid == null;

  return (
    <>
      <button
        type="button"
        className={inline ? styles.docButtonInline : styles.docButton}
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={title}
        aria-label={title}
      >
        <Icon glyph="CurlyBraces" />
      </button>
      <DataModelModal
        open={open}
        setOpen={setOpen}
        scope={scope}
        component={component}
        dataid={dataid}
      />
    </>
  );
}
