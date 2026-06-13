import { useState } from 'react';
import type { ChatMessage } from '../types';

interface ChatProps {
  messages: ChatMessage[];
  onSend: (content: string) => void;
  connected: boolean;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ToolCallPill({ call }: { call: NonNullable<ChatMessage['toolCalls']>[number] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="my-2 rounded-lg border border-ink-200 bg-white/60 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left text-sm font-mono hover:bg-white/80 transition-colors"
      >
        <span className="text-ink-400">▶</span>
        <span className="text-sage-600 font-medium">{call.name}</span>
        <span className="text-ink-400 text-xs ml-auto">{expanded ? 'collapse' : 'expand'}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 text-xs font-mono text-ink-600 space-y-1">
          <div className="text-ink-400">args:</div>
          <pre className="bg-ink-900/5 rounded p-2 overflow-x-auto">{JSON.stringify(call.args, null, 2)}</pre>
          {call.result !== undefined && (
            <>
              <div className="text-ink-400 mt-2">result:</div>
              <pre className="bg-ink-900/5 rounded p-2 overflow-x-auto">{call.result}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const isBrain = msg.model === 'brain';
  const accentColor = isBrain ? 'border-l-terracotta-400' : 'border-l-sage-400';
  const roleLabel = isUser ? 'You' : isBrain ? 'Mózg' : 'Worker';

  return (
    <div className={`py-4 ${isUser ? 'bg-transparent' : 'bg-paper-100/50'}`}>
      <div className="max-w-3xl mx-auto px-4">
        <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
            isUser
              ? 'bg-ink-800 text-white'
              : isBrain
                ? 'bg-terracotta-400 text-white'
                : 'bg-sage-400 text-white'
          }`}>
            {isUser ? 'U' : isBrain ? 'M' : 'W'}
          </div>
          <div className={`flex-1 ${isUser ? 'text-right' : ''}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-semibold ${isBrain ? 'text-terracotta-500' : isUser ? 'text-ink-700' : 'text-sage-500'}`}>
                {roleLabel}
              </span>
              <span className="text-xs text-ink-400">{formatTime(msg.timestamp)}</span>
              {msg.status === 'pending' && <span className="text-xs text-ink-400 animate-pulse">●</span>}
            </div>
            <div className={`inline-block text-left rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              isUser
                ? 'bg-ink-800 text-white rounded-br-md'
                : `bg-white border border-ink-100 shadow-sm rounded-bl-md ${accentColor} border-l-4`
            }`}>
              {msg.role === 'assistant' ? (
                <div className="font-serif text-ink-800 whitespace-pre-wrap">{msg.content}</div>
              ) : (
                <div className="font-sans whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>
            {msg.toolCalls && msg.toolCalls.map((tc) => (
              <ToolCallPill key={tc.id} call={tc} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Chat({ messages, onSend, connected }: ChatProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !connected) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-ink-400">
            <div className="text-center space-y-2">
              <div className="text-4xl font-serif text-terracotta-400">LookAI</div>
              <p className="text-sm">Local agentic coding harness</p>
              <p className="text-xs text-ink-300">Start a conversation or create a new session</p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
      </div>

      <div className="border-t border-ink-200 bg-paper-50 p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={connected ? 'Ask LookAI anything...' : 'Connecting...'}
              disabled={!connected}
              rows={1}
              className="w-full resize-none rounded-xl border border-ink-200 bg-white px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-400/30 focus:border-terracotta-400 transition-shadow disabled:opacity-50"
              style={{ minHeight: '44px', maxHeight: '200px' }}
            />
            <button
              type="submit"
              disabled={!connected || !input.trim()}
              className="absolute right-2 bottom-2 p-1.5 rounded-lg bg-terracotta-500 text-white hover:bg-terracotta-600 disabled:opacity-30 disabled:hover:bg-terracotta-500 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <div className="mt-1 text-center text-xs text-ink-400">
            Shift+Enter for new line • Enter to send
          </div>
        </form>
      </div>
    </div>
  );
}
