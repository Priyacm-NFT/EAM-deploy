// apps/web/src/hooks/usePagination.ts
// Usage in any list page — 2 lines:
//   const { page, setPage, paged, totalPages, totalItems } = usePagination(filteredArray, 10);
//   Then render: <Pagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={10} onChange={setPage} />
import { useState, useEffect } from 'react';

export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the items array length changes (filter applied)
  useEffect(() => { setPage(1); }, [items.length]);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage   = Math.min(page, totalPages);
  const paged      = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return { page: safePage, setPage, paged, totalPages, totalItems, pageSize };
}
