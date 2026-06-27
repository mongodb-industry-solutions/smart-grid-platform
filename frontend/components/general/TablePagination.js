"use client";

import Pagination from "@leafygreen-ui/pagination";

/**
 * Pagination control wired to a useLeafyGreenTable instance created with
 * `withPagination: true`. The page size is driven by the table itself (e.g. by
 * useAutoPageSize), so no items-per-page selector is shown — only the item
 * range and the page navigation.
 *
 * @param {object} props
 * @param {import("@leafygreen-ui/table").LeafyGreenTable} props.table the table instance
 */
export default function TablePagination({ table }) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const numTotalItems = table.getPrePaginationRowModel().rows.length;

  return (
    <Pagination
      itemsPerPage={pageSize}
      itemsPerPageOptions={[pageSize]}
      numTotalItems={numTotalItems}
      currentPage={pageIndex + 1}
      onCurrentPageOptionChange={(value) =>
        table.setPageIndex(Number(value) - 1)
      }
      onBackArrowClick={() => table.previousPage()}
      onForwardArrowClick={() => table.nextPage()}
    />
  );
}
