// FIX (P1-8 gap — AC-P1-8.5): "Offline status update, labour entry, and
// photo capture queue locally and sync on reconnect (basic)." Nothing
// like this existed anywhere in apps/web before — every write went
// straight to fetch() with no fallback, so a technician losing signal
// mid-WO just got a failed request and had to retry manually once back
// in range, with no guarantee the retry actually happened.
//
// This is a hand-rolled IndexedDB queue, not a full service-worker/PWA
// setup (vite-plugin-pwa + a Workbox config + manifest.json would be the
// "real" production version of this, but that's a bigger dependency and
// build-tooling change). What's here covers the PRD's actual acceptance
// criterion — actions queue locally while offline and replay in order
// once the connection comes back — without needing a new build
// dependency. IndexedDB (not localStorage) specifically because photo
// capture needs to hold onto binary Blobs, which localStorage can't do
// cleanly and has a much smaller size ceiling for.

const DB_NAME = 'eam-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'queued-actions';

export type QueuedAction =
  | {
      id: string;
      kind: 'api';
      createdAt: number;
      description: string; // human-readable, shown in the offline banner
      url: string;
      method: string;
      body: unknown;
      // FIX: a queued action can fail for two very different reasons —
      // the network's still down (retry later, this is expected), or the
      // server has now permanently rejected it (e.g. a rule changed
      // between queueing and syncing, like this WO reaching CLOSE while
      // an "add labour" was sitting queued). The original version
      // treated both the same and retried forever, which meant one
      // permanently-rejected action jammed the entire queue — nothing
      // after it in order ever got a chance to sync either. failedReason
      // records the second case so the UI can surface it instead of
      // silently looping.
      failedReason?: string;
    }
  | {
      id: string;
      kind: 'attachment';
      createdAt: number;
      description: string;
      documentTypeId: string;
      entityType: string;
      entityId: string;
      filename: string;
      mimeType: string;
      fileBlob: Blob;
      failedReason?: string;
    };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

type NewApiAction = Omit<Extract<QueuedAction, { kind: 'api' }>, 'id' | 'createdAt'>;
type NewAttachmentAction = Omit<Extract<QueuedAction, { kind: 'attachment' }>, 'id' | 'createdAt'>;

export async function enqueueAction(action: NewApiAction | NewAttachmentAction): Promise<void> {
  const db = await openDb();
  const full: QueuedAction = { ...action, id: crypto.randomUUID(), createdAt: Date.now() } as QueuedAction;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(full);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyListeners();
}

export async function listQueuedActions(): Promise<QueuedAction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as QueuedAction[]).sort((a, b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
}

async function removeAction(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function markActionFailed(id: string, reason: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as QueuedAction | undefined;
      if (existing) store.put({ ...existing, failedReason: reason });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Lets the user explicitly drop a permanently-rejected queued action
 * instead of it sitting there forever — e.g. the "add labour" example
 * above, where the only real fix is to re-enter it as a fresh action
 * against the WO's current (now-CLOSEd) state, not keep retrying the
 * original one. */
export async function discardAction(id: string): Promise<void> {
  await removeAction(id);
  notifyListeners();
}

let flushing = false;

/** Replays every queued action in the order it was created. Stops at the
 * first failure so ordering is preserved (a labour entry queued after a
 * status change shouldn't land before it) — the remaining queue stays
 * intact and will be retried on the next flush (reconnect, or manual). */
export async function flushQueue(apiFn: (url: string, opts?: RequestInit) => Promise<unknown>): Promise<{ synced: number; remaining: number; failed: number }> {
  if (flushing) {
    const all = await listQueuedActions();
    return { synced: 0, remaining: all.length, failed: all.filter((a) => a.failedReason).length };
  }
  flushing = true;
  let synced = 0;
  try {
    const actions = await listQueuedActions();
    for (const action of actions) {
      try {
        if (action.kind === 'api') {
          await apiFn(action.url, { method: action.method, body: JSON.stringify(action.body) });
        } else {
          // Attachment: re-run the same presign -> PUT -> scan flow the
          // online path uses, since the presigned URL from whenever this
          // was queued has almost certainly expired by now (900s TTL).
          const { uploadUrl, attachmentId } = await apiFn('/attachments/presign', {
            method: 'POST',
            body: JSON.stringify({
              documentTypeId: action.documentTypeId,
              entityType: action.entityType,
              entityId: action.entityId,
              filename: action.filename,
              mimeType: action.mimeType,
              sizeBytes: action.fileBlob.size,
              description: `Captured offline at ${new Date(action.createdAt).toLocaleString()}`,
            }),
          }) as { uploadUrl: string; attachmentId: string };
          await fetch(uploadUrl, { method: 'PUT', body: action.fileBlob, headers: { 'Content-Type': action.mimeType } });
          await apiFn(`/attachments/${attachmentId}/scan`, { method: 'POST', body: JSON.stringify({}) });
        }
        await removeAction(action.id);
        synced++;
      } catch (e) {
        // FIX: this used to `break` on *any* failure, network or not —
        // meaning a genuinely rejected action (e.g. the server now
        // returning 400 because a business rule changed between queueing
        // and syncing, like the WO reaching CLOSE while a labour entry
        // was still queued for it) jammed the entire queue forever, since
        // it fails identically on every retry and nothing after it in
        // order ever got a chance.
        //
        // looksLikeOfflineFailure(e) is true for a raw network failure
        // (fetch never reached the server at all) — that's the "stop
        // here, preserve order, retry the whole remaining queue later"
        // case, since a real network outage affects every subsequent
        // item too. Anything else means the server *did* respond, just
        // with a rejection — that's permanent, not a connectivity
        // problem, so it's marked failed and skipped rather than
        // blocking whatever's queued after it.
        if (looksLikeOfflineFailure(e)) {
          break;
        }
        await markActionFailed(action.id, e instanceof Error ? e.message : 'Sync failed');
      }
    }
  } finally {
    flushing = false;
  }
  const remaining = await listQueuedActions();
  notifyListeners();
  return { synced, remaining: remaining.length, failed: remaining.filter((a) => a.failedReason).length };
}

type Listener = () => void;
const listeners = new Set<Listener>();
function notifyListeners() { listeners.forEach((l) => l()); }
export function subscribeQueueChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True if a fetch/api() failure looks like "we're offline" rather than
 * a real server error (4xx/5xx) — those should still surface as normal
 * errors, not get silently queued and hidden from the user. */
export function looksLikeOfflineFailure(err: unknown): boolean {
  if (!navigator.onLine) return true;
  if (err instanceof TypeError) return true; // fetch's generic "network request failed"
  return false;
}
