import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';

interface Notification {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  entityType?: string;
  entityId?: string;
}

// Entity type → route prefix mapping
const ENTITY_ROUTES: Record<string, string> = {
  ChatMessage:    '/chat',
  WorkOrder:      '/work-orders',
  Asset:          '/assets',
  ServiceRequest: '/service-requests',
  Permit:         '/permits',
  PM:             '/pm',
};

// P0-8: polling interval — 30s standard, 15s when tab is visible
const POLL_INTERVAL_VISIBLE = 15_000;
const POLL_INTERVAL_HIDDEN  = 60_000;

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function load() {
    api<Notification[]>('/notifications').then(setNotifications).catch(() => {});
  }

  // ── P0-8: SSE streaming + polling fallback ─────────────────────────────────
  // Try SSE first. If EventSource isn't supported or the connection drops,
  // fall back to interval polling so notifications always arrive.
  useEffect(() => {
    load(); // initial load

    const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

    let sseConnected = false;

    function startPolling() {
      if (pollRef.current) return; // already polling
      const interval = document.hidden ? POLL_INTERVAL_HIDDEN : POLL_INTERVAL_VISIBLE;
      pollRef.current = setInterval(load, interval);
    }

    function stopPolling() {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }

    // Attempt SSE connection
    try {
      const token = localStorage.getItem('eam_access_token');
      // SSE with auth via query param (EventSource doesn't support headers)
      const url = `${API_URL}/notifications/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        sseConnected = true;
        stopPolling(); // SSE is working, don't need polling
      };

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as { type: string; count?: number };
          if (data.type === 'unread_count') {
            // Refresh full list when we know something changed
            load();
          }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        sseConnected = false;
        es.close();
        startPolling(); // SSE failed — fall back to polling
      };
    } catch {
      // EventSource not available (unlikely in modern browsers) — use polling
      startPolling();
    }

    // Adjust poll frequency on visibility change
    const onVisibility = () => {
      if (!sseConnected) {
        stopPolling();
        startPolling(); // restarts with correct interval for current visibility
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      eventSourceRef.current?.close();
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleNotificationClick(n: Notification) {
    // Mark as read first
    if (!n.isRead) await markRead(n.id);

    // Navigate to the entity
    if (n.entityType && n.entityId) {
      const basePath = ENTITY_ROUTES[n.entityType];
      if (basePath) {
        setOpen(false);
        if (n.entityType === 'ChatMessage') {
          // For chat messages, navigate to chat with the sender
          navigate('/chat');
        } else {
          navigate(`${basePath}/${n.entityId}`);
        }
        return;
      }
    }
    // No entity — just mark read
  }

  async function markRead(id: string) {
    await api(`/notifications/${id}/read`, { method: 'POST' });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
  }
  async function markAllRead() {
    await api('/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  // P0-8: delete a single notification
  async function deleteNotification(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await api(`/notifications/${id}`, { method: 'DELETE' }).catch(() => {});
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '0.5px solid var(--color-border-tertiary)',
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-secondary)',
        }}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
      >
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 16, height: 16, borderRadius: '50%',
            background: '#E24B4A', color: '#fff',
            fontSize: 10, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 44, zIndex: 200,
          width: 340, maxHeight: 480,
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
              Notifications {unread > 0 && <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: 13 }}>({unread} unread)</span>}
            </span>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} style={{ fontSize: 12, color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    padding: '13px 18px',
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    background: n.isRead ? '#ffffff' : '#fff7ed',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    transition: 'background 0.12s',
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: n.isRead ? 'transparent' : '#f97316',
                    flexShrink: 0, marginTop: 5,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 2 }}>{n.title}</p>
                    <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, lineHeight: 1.4 }}>{n.body}</p>
                    <p style={{ fontSize: 11, color: '#9ca3af' }}>
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {/* P0-8: delete button */}
                  <button
                    type="button"
                    title="Dismiss"
                    onClick={(e) => deleteNotification(n.id, e)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#9ca3af', fontSize: 14,
                      padding: '0 2px', lineHeight: 1, flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
