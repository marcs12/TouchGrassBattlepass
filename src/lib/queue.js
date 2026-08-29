// Offline support for the synced backend.
//
// Two halves: the last board we saw, so the app opens to something real
// without a connection, and a queue of writes to replay when one comes back.
//
// Only earning and editing are queued. Spending - redeeming a reward,
// claiming a tier - is checked against the bank on the server, so queuing it
// would let two phones overdraw the same balance while they're both offline.
// Those stay online-only and say so.

const ROWS_KEY = (household) => `tgbp.rows.${household}`
const QUEUE_KEY = 'tgbp.queue'

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode or full - the app still works, just not offline */
  }
}

export const cacheRows = (household, rows) => write(ROWS_KEY(household), rows)
export const cachedRows = (household) => read(ROWS_KEY(household), null)

export const loadQueue = () => read(QUEUE_KEY, [])
export const saveQueue = (queue) => write(QUEUE_KEY, queue)

export const isOffline = () => typeof navigator !== 'undefined' && !navigator.onLine

/**
 * Replays the queue over the last known rows, so an offline board shows what
 * you just did rather than what the server last confirmed.
 */
export function applyPending(rows, queue) {
  if (queue.length === 0) return rows

  let checks = rows.checks
  let redemptions = rows.redemptions
  let catalog = rows.catalog

  for (const op of queue) {
    switch (op.type) {
      case 'check.add':
        checks = [
          ...checks.filter(
            (c) =>
              !(
                c.member_id === op.row.member_id &&
                c.habit_id === op.row.habit_id &&
                c.day === op.row.day
              )
          ),
          { ...op.row, id: op.id, created_at: new Date(op.at).toISOString() },
        ]
        break

      case 'check.remove':
        checks = checks.filter(
          (c) =>
            !(
              c.member_id === op.match.member_id &&
              c.habit_id === op.match.habit_id &&
              c.day === op.match.day
            )
        )
        break

      case 'coupon.set':
        redemptions = redemptions.map((r) =>
          r.id === op.receiptId ? { ...r, used_at: op.usedAt } : r
        )
        break

      case 'catalog.upsert':
        catalog = [
          ...catalog.filter(
            (c) => !(c.kind === op.row.kind && c.item_id === op.row.item_id)
          ),
          { ...op.row, id: op.id },
        ]
        break

      case 'catalog.remove':
        catalog = catalog.filter(
          (c) => !(c.kind === op.kind && c.item_id === op.itemId)
        )
        break

      default:
        break
    }
  }

  return { ...rows, checks, redemptions, catalog }
}
