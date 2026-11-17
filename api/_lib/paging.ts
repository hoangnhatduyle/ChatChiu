import { ApiError } from './errors.js';

/** PostgREST answers at most max_rows (1000 by default) per request. */
export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Read every row of a query page by page, so results are never silently cut at
 * max_rows. `page(from, to)` must apply a stable order and `.range(from, to)`.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => Page<T>,
  what: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new ApiError('INTERNAL', `Failed to load ${what}`, error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
