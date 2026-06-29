import { useCallback, useRef } from "react";

// Fallbacks used before the table has rendered measurable rows.
const FALLBACK_HEADER_HEIGHT = 45;
const FALLBACK_ROW_HEIGHT = 41;
// Always show at least this many data rows, even in a short container.
const DEFAULT_MIN_ROWS = 4;

/**
 * Sizes a table's page to however many rows fit in its container, instead of a
 * fixed/user-chosen page size. Returns a callback ref to attach to the
 * scrollable table wrapper; it observes the wrapper's height and updates the
 * table's pageSize so the rows fill (without large empty gaps) the available
 * space, never dropping below `minRows`.
 *
 * The wrapper is expected to have a height fixed by its layout (e.g. a flex
 * `flex: 1` cell), so changing the row count doesn't change the wrapper size —
 * avoiding a measure/resize feedback loop.
 *
 * @param {import("@leafygreen-ui/table").LeafyGreenTable} table the table instance
 * @param {object} [options]
 * @param {number} [options.minRows=4] minimum number of rows to display
 * @returns {(node: HTMLElement|null) => void} callback ref for the table wrapper
 */
export function useAutoPageSize(table, { minRows = DEFAULT_MIN_ROWS } = {}) {
  const elRef = useRef(null);
  const observerRef = useRef(null);

  const measure = useCallback(() => {
    const el = elRef.current;
    if (!el) return;

    const thead = el.querySelector("thead");
    const firstRow = el.querySelector("tbody tr");
    const headerHeight = thead?.offsetHeight || FALLBACK_HEADER_HEIGHT;
    const rowHeight = firstRow?.offsetHeight || FALLBACK_ROW_HEIGHT;

    const available = el.clientHeight - headerHeight;
    const fit = Math.max(minRows, Math.floor(available / rowHeight));

    if (fit !== table.getState().pagination.pageSize) {
      table.setPageSize(fit);
    }
  }, [table, minRows]);

  // Callback ref: sets up the observer when the wrapper mounts (also handles
  // the empty-state -> table transition) and tears it down on unmount. Measures
  // after paint so the container's final (stretched) height is used.
  const wrapperRef = useCallback(
    (node) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      elRef.current = node;
      if (node) {
        const ro = new ResizeObserver(() => requestAnimationFrame(measure));
        ro.observe(node);
        observerRef.current = ro;
        requestAnimationFrame(measure);
      }
    },
    [measure]
  );

  return wrapperRef;
}
