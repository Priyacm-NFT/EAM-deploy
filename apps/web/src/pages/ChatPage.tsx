import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { api, getAccessToken } from '../api/client.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const MAX_CHARS = 2000;

type ChatMessage = {
  id: string;
  fromUserId: string;
  toUserId: string;
  content: string;
  createdAt: string;
  readAt?: string | null;
  contextEntityType?: string | null;
  contextEntityId?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
};

type OnlineUser = {
  userId: string;
  displayName?: string;
  status?: string;
};

const ENTITY_LABELS: Record<string, string> = {
  WorkOrder: 'Work Order',
  Asset: 'Asset',
  ServiceRequest: 'Service Request',
  PM: 'PM',
};

const STATUS_DOT: Record<string, string> = {
  connected: '#4ADE80',
  disconnected: '#94A3B8',
  error: '#EF4444',
};

export function ChatPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlContext     = searchParams.get('context') ?? '';
  const urlContextId   = searchParams.get('contextId') ?? '';
  const urlContextLabel = searchParams.get('contextLabel') ?? '';

  const [partnerId, setPartnerId] = useState('');
  const [content, setContent] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadHistory = useCallback(async (withUserId: string) => {
    if (!withUserId) return;
    const rows = await api<ChatMessage[]>(`/chat/messages?with=${encodeURIComponent(withUserId)}`);
    setMessages(rows.slice().reverse());
    await api('/chat/messages/mark-read', { method: 'POST', body: JSON.stringify({ fromUserId: withUserId }) })
      .catch(() => {});
    api<{ count: number }>('/chat/messages/unread-count')
      .then((r) => setUnreadCount(r.count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { setStatus('error'); return; }

    const socket = io(`${API_URL}/eam`, {
      path: '/eam/socket.io',
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('connect_error', () => setStatus('error'));

    socket.on('chat:message', (msg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (msg.fromUserId !== partnerId) {
        setUnreadCount((c) => c + 1);
      }
    });

    socket.on('user:online', () => { void refreshOnline(); });
    socket.on('user:offline', () => { void refreshOnline(); });
    socket.on('user:presence', () => { void refreshOnline(); });

    async function refreshOnline() {
      try {
        const res = await api<{ users: OnlineUser[] }>('/presence/online');
        setOnlineUsers(res.users);
      } catch { /* ignore */ }
    }
    void refreshOnline();

    api<{ count: number }>('/chat/messages/unread-count')
      .then((r) => setUnreadCount(r.count))
      .catch(() => {});

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (partnerId) {
      void loadHistory(partnerId);
      setUnreadCount(0);
    }
  }, [partnerId, loadHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const socket = socketRef.current;
    if (!socket || !partnerId.trim() || (!content.trim() && !attachFile)) return;
    if (content.length > MAX_CHARS) return;

    setSending(true);
    try {
      if (attachFile) {
        const form = new FormData();
        form.append('file', attachFile);
        form.append('toUserId', partnerId.trim());
        form.append('content', content.trim() || `📎 ${attachFile.name}`);
        if (urlContext) form.append('contextEntityType', urlContext);
        if (urlContextId) form.append('contextEntityId', urlContextId);

        const msg = await api<ChatMessage>('/chat/messages/with-attachment', {
          method: 'POST',
          body: form,
        });
        setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
        setAttachFile(null);
      } else {
        socket.emit('chat:send', {
          toUserId: partnerId.trim(),
          content: content.trim(),
          contextEntityType: urlContext || undefined,
          contextEntityId: urlContextId || undefined,
        });
      }
      setContent('');
    } catch {
      const msg = await api<ChatMessage>('/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          toUserId: partnerId.trim(),
          content: content.trim(),
          contextEntityType: urlContext || undefined,
          contextEntityId: urlContextId || undefined,
        }),
      });
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      setContent('');
    } finally {
      setSending(false);
    }
  }

  const displayedMessages = searchQuery.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const partnerName = onlineUsers.find((u) => u.userId === partnerId)?.displayName ?? partnerId?.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">Chat</h1>
        <p className="page-subtitle">Real-time messaging — internal coordination only</p>
      </div>

      {/* Status + Online Users */}
      <div className="content-card flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[status], display: 'inline-block' }} />
          <span className="text-xs font-medium text-slate-600">{status === 'connected' ? 'Connected' : status === 'error' ? 'Connection error' : 'Disconnected'}</span>

          {status === 'connected' && (
            <select
              className="ml-2 text-xs border border-slate-200 rounded-full px-2 py-0.5 bg-white"
              defaultValue="ONLINE"
              onChange={(e) => socketRef.current?.emit('presence:update', { status: e.target.value })}
            >
              <option value="ONLINE">🟢 Online</option>
              <option value="AWAY">🟡 Away</option>
              <option value="DND">🔴 Do not disturb</option>
            </select>
          )}
        </div>

        <div className="sm:border-l sm:border-slate-200 sm:pl-4 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Team online
          </p>
          <ul className="flex flex-wrap gap-2" data-testid="online-users">
            {onlineUsers.length === 0 ? (
              <li className="text-xs text-slate-400 italic">No users online</li>
            ) : (
              onlineUsers.map((u) => (
                <li key={u.userId}>
                  <button
                    type="button"
                    onClick={() => setPartnerId(u.userId)}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 transition-colors cursor-pointer border ${
                      partnerId === u.userId
                        ? 'bg-accent text-white border-accent'
                        : 'bg-accent/10 text-accent-dark border-accent/20 hover:bg-accent/20'
                    }`}
                    title={`Chat with ${u.displayName ?? u.userId}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                    {u.displayName ?? u.userId.slice(0, 8)}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={async () => {
              try {
                const msgs = await api<{ fromUserId: string }[]>('/chat/messages?with=');
                const sender = msgs.find((m) => m.fromUserId !== partnerId)?.fromUserId;
                if (sender) setPartnerId(sender);
              } catch { /* ignore */ }
              setUnreadCount(0);
            }}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded-full px-2.5 py-1 cursor-pointer transition-colors"
            title="Click to open unread messages"
          >
            {unreadCount} unread
          </button>
        )}
      </div>

      {/* Chat area */}
      <div className="content-card flex flex-col gap-0 p-0 overflow-hidden">

        {urlContext && urlContextLabel && (
          <div className="px-5 py-2 bg-accent/10 border-b border-accent/20 flex items-center gap-2">
            <span className="text-xs font-semibold text-accent-dark">
              📎 Context: {ENTITY_LABELS[urlContext] ?? urlContext} {urlContextLabel}
            </span>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="ml-auto text-[10px] text-accent-dark hover:underline"
            >
              ← Back
            </button>
          </div>
        )}

        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="form-label text-xs" htmlFor="chat-partner-id">Chat with (User ID)</label>
            <input
              id="chat-partner-id"
              className="form-input"
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              placeholder="Paste a user ID or click a name above"
              data-testid="chat-partner-id"
            />
          </div>
          <div className="flex-1">
            <label className="form-label text-xs">Search messages</label>
            <input
              className="form-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in conversation..."
              data-testid="chat-search"
            />
          </div>
        </div>

        {/* Messages list */}
        <div className="flex-1 min-h-[420px] max-h-[600px] overflow-y-auto px-5 py-4 space-y-3 bg-white">
          {displayedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400 text-sm">
              {searchQuery ? (
                <p>No messages match <strong>"{searchQuery}"</strong></p>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {partnerId ? 'No messages yet. Say hello!' : 'Enter a user ID above or click a name to start.'}
                </>
              )}
            </div>
          ) : (
            displayedMessages.map((m) => {
              const isMine = m.fromUserId !== partnerId;
              const entityLabel = m.contextEntityType ? (ENTITY_LABELS[m.contextEntityType] ?? m.contextEntityType) : null;

              return (
                <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[60%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                    isMine ? 'bg-accent text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                  }`}>
                    {!isMine && (
                      <p className="text-[0.65rem] font-semibold text-slate-500 mb-0.5">
                        {onlineUsers.find((u) => u.userId === m.fromUserId)?.displayName ?? m.fromUserId.slice(0, 8)}
                      </p>
                    )}

                    {entityLabel && m.contextEntityId && (
                      <button
                        type="button"
                        onClick={() => {
                          const paths: Record<string, string> = {
                            WorkOrder: '/work-orders',
                            Asset: '/assets',
                            ServiceRequest: '/service-requests',
                          };
                          const base = paths[m.contextEntityType ?? ''];
                          if (base) navigate(`${base}/${m.contextEntityId}`);
                        }}
                        className={`text-[0.65rem] font-medium mb-1 flex items-center gap-1 hover:underline ${isMine ? 'text-white/80' : 'text-accent'}`}
                        title={`Open ${entityLabel}`}
                      >
                        📎 {entityLabel} {urlContextLabel || m.contextEntityId?.slice(0, 8)}
                      </button>
                    )}

                    {m.attachmentUrl && (
                      <a
                        href={m.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={`text-xs flex items-center gap-1 mb-1 hover:underline ${isMine ? 'text-white/80' : 'text-accent'}`}
                      >
                        📎 {m.attachmentName ?? 'Attachment'}
                      </a>
                    )}

                    <p>{m.content}</p>
                    <p className={`text-[0.65rem] mt-1 ${isMine ? 'text-white/70' : 'text-slate-400'}`}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {m.readAt && isMine && <span className="ml-1">✓✓</span>}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {attachFile && (
          <div className="flex items-center gap-2 px-5 py-2 bg-accent/5 border-t border-accent/20 text-sm text-slate-700">
            <span>📎 {attachFile.name}</span>
            <button type="button" onClick={() => setAttachFile(null)} className="text-slate-400 hover:text-red-500 ml-1 font-bold">✕</button>
          </div>
        )}

        {/* Message input */}
        <form onSubmit={sendMessage} className="flex items-center gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50/60">
          <button
            type="button"
            title="Attach file"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 text-slate-400 hover:text-accent transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex-1 relative">
            <input
              className="form-input w-full pr-12"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type a message…"
              data-testid="chat-input"
              maxLength={MAX_CHARS}
            />
            {content.length > MAX_CHARS * 0.8 && (
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] ${content.length >= MAX_CHARS ? 'text-red-500' : 'text-slate-400'}`}>
                {MAX_CHARS - content.length}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="shrink-0 inline-flex items-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium text-sm px-5 py-2.5 rounded-md transition-colors shadow-md shadow-accent/20 disabled:opacity-50"
            disabled={sending || (!partnerId.trim() || (!content.trim() && !attachFile)) || content.length > MAX_CHARS}
            data-testid="chat-send"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
            {sending ? '…' : 'Send'}
          </button>
        </form>
      </div>

      {content.length >= MAX_CHARS && (
        <p className="text-xs text-red-500">Message limit is {MAX_CHARS} characters.</p>
      )}
    </div>
  );
}
