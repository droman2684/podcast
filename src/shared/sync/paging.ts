import type { PostgrestListResult } from './supabaseLike'

const PAGE_SIZE = 1000

// Supabase caps a single .select() at 1000 rows by default — silently, with
// no error, just a truncated result. episode_played in particular can
// easily exceed that for a library with a long listening history (one real
// account has 16,000+ rows), and a truncated read makes every row past 1000
// look never-synced even though it exists.
//
// The caller's query must pass { count: 'exact' } in its .select() — the
// first page's response includes the true row count, so every remaining
// page can be requested in parallel instead of one at a time.
export async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<PostgrestListResult<T>>
): Promise<T[]> {
  const first = await query(0, PAGE_SIZE - 1)
  if (first.error) throw new Error(first.error.message)
  const firstPage = first.data ?? []
  const total = first.count ?? firstPage.length
  if (total <= firstPage.length) return firstPage

  const remainingStarts: number[] = []
  for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) remainingStarts.push(from)

  const restResults = await Promise.all(remainingStarts.map((from) => query(from, from + PAGE_SIZE - 1)))
  const rest: T[] = []
  for (const result of restResults) {
    if (result.error) throw new Error(result.error.message)
    rest.push(...(result.data ?? []))
  }
  return [...firstPage, ...rest]
}
