import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { flushQueue, listQueuedActions, subscribeQueueChanges, discardAction, type QueuedAction } from '../lib/offlineQueue.js';

// FIX (P1-8 gap — AC-P1-8.5): the visible half of the offline queue —
// a small banner technicians actually see, showing how many changes are
// waiting and syncing them automatically the moment the browser's
// `online` event fires (with a manual "Sync now" fallback, since the
// `online` event isn't always reliable on flaky mobile connections).
export function useOfflineQueue() {
  const [actions, setActions] = useState<QueuedAction[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    listQueuedActions().then(setActions).catch(() => {});
  }, []);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await flushQueue(api);
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [syncing, refresh]);

  useEffect(() => {
    refresh();
    const unsub = subscribeQueueChanges(refresh);
    const onOnline = () => { setIsOnline(true); void sync(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FIX: pending vs. failed is the distinction flushQueue's fix
  // introduced — pending items are still worth retrying (network was
  // down, or haven't tried yet); failed ones got an actual rejection
  // from the server and retrying the exact same request will just fail
  // the same way again forever (this is what caused the banner to get
  // stuck showing "syncing…" indefinitely before).
  const pending = actions.filter((a) => !a.failedReason);
  const failed = actions.filter((a) => a.failedReason);

  return { pending, failed, isOnline, syncing, syncNow: sync, discard: (id: string) => discardAction(id).then(refresh) };
}

export function OfflineQueueBanner() {
  const { pending, failed, isOnline, syncing, syncNow, discard } = useOfflineQueue();
  if (pending.length === 0 && failed.length === 0 && isOnline) return null;

  return (
    <div className="mb-3 space-y-2">
      {(pending.length > 0 || !isOnline) && (
        <div
          className={`rounded px-3 py-2 text-sm flex items-center justify-between ${
            isOnline ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-slate-100 border border-slate-300 text-slate-700'
          }`}
        >
          <span>
            {!isOnline && 'You are offline. '}
            {pending.length > 0
              ? `${pending.length} change${pending.length === 1 ? '' : 's'} saved locally, ${isOnline ? (syncing ? 'syncing…' : 'waiting to sync.') : 'will sync when back online.'}`
              : 'Connected.'}
          </span>
          {isOnline && pending.length > 0 && (
            <button type="button" className="btn-link text-xs" disabled={syncing} onClick={() => void syncNow()}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}
        </div>
      )}

      {/* FIX: this is the piece that didn't exist before — a queued
          action the server has actually rejected (not a connectivity
          problem) needs to stop retrying and tell the technician why,
          with a way to clear it, instead of sitting there forever
          silently claiming to be "syncing". */}
      {failed.length > 0 && (
        <div className="rounded px-3 py-2 text-sm bg-red-50 border border-red-200 text-red-800 space-y-1">
          <p className="font-medium">{failed.length} change{failed.length === 1 ? '' : 's'} couldn't be synced:</p>
          {failed.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-xs">
              <span>{a.description} — {a.failedReason}</span>
              <button type="button" className="btn-link text-xs text-red-700" onClick={() => discard(a.id)}>Discard</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
