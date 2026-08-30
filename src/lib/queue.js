// Offline support for the synced backend.
//
// Two halves: the last board we saw, so the app opens to something real
// without a connection, and a queue of writes to replay when one comes back.
//
// Only earning and editing are queued. Spending - redeeming a reward,
// claiming a tier - is checked against the bank on the server, so queuing it
// would let two phones overdraw the same balance while they're both offline.
// Those stay online-only and say so.
//
// Proof photos are queued too, but they are the one op allowed to fail
// without stopping the drain: a photo must never hold up a point. The blob
// itself lives in IndexedDB (lib/proofStore); the queue only carries the fact
// of it, keyed by the check's natural key rather than its id, because an
// offline check-off has no server id yet.

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
  let cosigns = rows.cosigns ?? []

  const sameCheck = (row, match) =>
    row.member_id === match.member_id &&
    row.habit_id === match.habit_id &&
    row.day === match.day

  for (const op of queue) {
    switch (op.type) {
      case 'check.add':
        checks = [
          ...checks.filter((c) => !sameCheck(c, op.row)),
          { ...op.row, id: op.id, created_at: new Date(op.at).toISOString() },
        ]
        break

      case 'check.remove':
        checks = checks.filter((c) => !sameCheck(c, op.match))
        break

      case 'proof.upload':
        checks = checks.map((c) =>
          sameCheck(c, op.match)
            ? { ...c, proof_path: op.path, proof_w: op.w, proof_h: op.h }
            : c
        )
        break

      case 'proof.remove':
        checks = checks.map((c) =>
          sameCheck(c, op.match)
            ? { ...c, proof_path: null, proof_w: null, proof_h: null }
            : c
        )
        break

      case 'cosign.add':
        cosigns = [
          ...cosigns.filter(
            (s) => !(s.check_id === op.row.check_id && s.member_id === op.row.member_id)
          ),
          { ...op.row, created_at: new Date(op.at).toISOString() },
        ]
        break

      case 'cosign.remove':
        cosigns = cosigns.filter(
          (s) => !(s.check_id === op.match.check_id && s.member_id === op.match.member_id)
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

  return { ...rows, checks, redemptions, catalog, cosigns }
}
