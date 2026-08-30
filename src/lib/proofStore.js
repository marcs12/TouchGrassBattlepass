// Blob storage for proof photos.
//
// `localStorage` is strings only and about 5MB, so the offline queue can hold
// the *fact* of a photo but not the photo. Blobs live here instead, keyed by
// the check they belong to. In synced mode this is a staging area the queue
// drains; in local-only mode it is where the photos actually live, which is
// right for a board that never leaves the device.

const DB = 'tgbp.proof'
const STORE = 'blobs'

let opening = null

const open = () => {
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no indexeddb'))
      return
    }
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  // A failed open must not poison every later call - private mode can recover.
  opening.catch(() => {
    opening = null
  })
  return opening
}

const run = async (mode, work) => {
  try {
    const db = await open()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = work(tx.objectStore(STORE))
      if (request) {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      } else {
        tx.oncomplete = () => resolve(undefined)
        tx.onerror = () => reject(tx.error)
      }
    })
  } catch {
    // No IndexedDB, or a quota wall. Photos are the one thing in the app
    // allowed to silently not happen.
    return undefined
  }
}

export const putProof = (key, blob) => run('readwrite', (store) => store.put(blob, key))
export const getProof = (key) => run('readonly', (store) => store.get(key))
export const removeProof = (key) => run('readwrite', (store) => store.delete(key))
export const proofKeys = () => run('readonly', (store) => store.getAllKeys())
export const clearProofs = () => run('readwrite', (store) => store.clear())
