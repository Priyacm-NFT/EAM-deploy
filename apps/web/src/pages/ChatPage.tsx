import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, getAccessToken } from '../api/client.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type ChatMessage = {
  id: string;
  fromUserId: string;
  toUserId: string;
  content: string;
  createdAt: string;
  readAt?: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-400',
  disconnected: 'bg-slate-400',
  error: 'bg-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Connection error',
};

export function ChatPage() {
  const [partnerId, setPartnerId] = useState('');
  const [content, setContent] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<{ userId: string; status: string }[]>([]);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const loadHistory = useCallback(async (withUserId: string) => {
    if (!withUserId) return;
    const rows = await api<ChatMessage[]>(`/chat/messages?with=${encodeURIComponent(withUserId)}`);
    setMessages(rows);
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setStatus('error');
      return;
    }

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
    });

    socket.on('user:online', () => { void refreshOnline(); });
    socket.on('user:offline', () => { void refreshOnline(); });
    socket.on('user:presence', () => { void refreshOnline(); });

    async function refreshOnline() {
      try {
        const res = await api<{ users: { userId: string; status: string }[] }>('/presence/online');
        setOnlineUsers(res.users);
      } catch {
        /* ignore when unauthenticated */
      }
    }
    void refreshOnline();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (partnerId) void loadHistory(partnerId);
  }, [partnerId, loadHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const socket = socketRef.current;
    if (!socket || !partnerId.trim() || !content.trim()) return;
    socket.emit('chat:send', { toUserId: partnerId.trim(), content: content.trim() });
    setContent('');
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">Chat</h1>
        <p className="page-subtitle">Real-time messaging between users</p>
      </div>

      {/* Status + Online Users */}
      <div className="content-card flex flex-col sm:flex-row sm:items-start gap-4">
        {/* Connection status */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-block w-2 h-2 rounded-full ${STATUS_COLORS[status]}`} />
          <span
            className="text-xs font-medium text-slate-600"
            data-testid="socket-status"
          >
            {STATUS_LABELS[status]}
          </span>
        </div>

        <div className="sm:border-l sm:border-slate-200 sm:pl-4 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Online now
          </p>
          <ul
            className="flex flex-wrap gap-2"
            data-testid="online-users"
          >
            {onlineUsers.length === 0 ? (
              <li className="text-xs text-slate-400 italic">No users online</li>
            ) : (
              onlineUsers.map((u) => (
                <li key={u.userId}>
                  <button
                    type="button"
                    onClick={() => setPartnerId(u.userId)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent/10 text-accent-dark border border-accent/20 rounded-full px-3 py-1 hover:bg-accent/20 transition-colors cursor-pointer"
                    title={`Chat with ${u.userId}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                    {u.userId.slice(0, 8)}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Chat area */}
      <div className="content-card flex flex-col gap-0 p-0 overflow-hidden">
        {/* Recipient selector */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/60">
          <label className="form-label" htmlFor="chat-partner-id">
            Chat with (User ID)
          </label>
          <input
            id="chat-partner-id"
            className="form-input max-w-sm"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            placeholder="Paste a user ID or click a name above"
            data-testid="chat-partner-id"
          />
        </div>

        {/* Messages list */}
        <div className="flex-1 min-h-[260px] max-h-[400px] overflow-y-auto px-5 py-4 space-y-3 bg-white">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              No messages yet. Enter a user ID above to start a conversation.
            </div>
          ) : (
            messages.map((m) => {
              const isMine = m.toUserId === partnerId;
              return (
                <div
                  key={m.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[72%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      isMine
                        ? 'bg-accent text-white rounded-br-sm'
                        : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                    }`}
                  >
                    {!isMine && (
                      <p className="text-[0.65rem] font-semibold text-slate-500 mb-0.5">
                        {m.fromUserId.slice(0, 8)}…
                      </p>
                    )}
                    <p>{m.content}</p>
                    <p className={`text-[0.65rem] mt-1 ${isMine ? 'text-white/70' : 'text-slate-400'}`}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message input */}
        <form
          onSubmit={sendMessage}
          className="flex items-center gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50/60"
        >
          <input
            className="form-input flex-1"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type a message…"
            data-testid="chat-input"
          />
          <button
            type="submit"
            className="shrink-0 inline-flex items-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium text-sm px-5 py-2.5 rounded-md transition-colors shadow-md shadow-accent/20 disabled:opacity-50"
            disabled={!partnerId.trim() || !content.trim()}
            data-testid="chat-send"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
