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

export function ChatPage() {
  const [partnerId, setPartnerId] = useState('');
  const [content, setContent] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<{ userId: string; status: string }[]>([]);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const socketRef = useRef<Socket | null>(null);

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

    socket.on('user:online', () => {
      void refreshOnline();
    });
    socket.on('user:offline', () => {
      void refreshOnline();
    });
    socket.on('user:presence', () => {
      void refreshOnline();
    });

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

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const socket = socketRef.current;
    if (!socket || !partnerId.trim() || !content.trim()) return;
    socket.emit('chat:send', { toUserId: partnerId.trim(), content: content.trim() });
    setContent('');
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Chat</h1>
      <p className="text-sm text-slate-500 mb-4" data-testid="socket-status">
        Socket: {status}
      </p>

      <section className="mb-6 rounded-lg border bg-white p-4">
        <h2 className="text-sm font-medium text-slate-700 mb-2">Online users</h2>
        <ul className="text-sm text-slate-600" data-testid="online-users">
          {onlineUsers.length === 0 ? (
            <li>None</li>
          ) : (
            onlineUsers.map((u) => (
              <li key={u.userId}>
                {u.userId} ({u.status})
              </li>
            ))
          )}
        </ul>
      </section>

      <form onSubmit={sendMessage} className="space-y-3 mb-4">
        <label className="block text-sm">
          Chat with user ID
          <input
            className="mt-1 w-full border rounded px-2 py-1"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            data-testid="chat-partner-id"
          />
        </label>
        <label className="block text-sm">
          Message
          <input
            className="mt-1 w-full border rounded px-2 py-1"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            data-testid="chat-input"
          />
        </label>
        <button
          type="submit"
          className="px-3 py-1 bg-slate-800 text-white rounded text-sm"
          data-testid="chat-send"
        >
          Send
        </button>
      </form>

      <ul className="rounded-lg border bg-white divide-y" data-testid="chat-messages">
        {messages.map((m) => (
          <li key={m.id} className="p-3 text-sm">
            <span className="text-slate-500">{m.fromUserId.slice(0, 8)}…</span>: {m.content}
          </li>
        ))}
      </ul>
    </div>
  );
}
