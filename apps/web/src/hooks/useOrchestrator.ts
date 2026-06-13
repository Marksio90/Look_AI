import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage, Session, OrchestratorStatus } from '../types';

const WS_URL = 'ws://localhost:3000';

export function useOrchestrator() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<OrchestratorStatus>({
    model: 'worker',
    contextTokens: 0,
    contextLimit: 4096,
    turnCount: 0,
    mode: 'agent',
  });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      if (data.type === 'message') {
        setMessages((prev) => [...prev, data.payload as ChatMessage]);
      } else if (data.type === 'status') {
        setStatus(data.payload as OrchestratorStatus);
      } else if (data.type === 'session_list') {
        setSessions(data.payload as Session[]);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      setConnected(false);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'message', content }));
  }, []);

  const createSession = useCallback(async () => {
    const res = await fetch('/api/sessions', { method: 'POST' });
    const session = (await res.json()) as Session;
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setMessages([]);
    return session;
  }, []);

  const switchSession = useCallback((id: string) => {
    setActiveSessionId(id);
    const session = sessions.find((s) => s.id === id);
    setMessages(session?.messages ?? []);
  }, [sessions]);

  return {
    sessions,
    activeSessionId,
    messages,
    status,
    connected,
    sendMessage,
    createSession,
    switchSession,
  };
}
