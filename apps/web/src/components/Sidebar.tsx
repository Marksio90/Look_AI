import type { Session } from '../types';

interface SidebarProps {
  sessions: Session[];
  activeId: string | null;
  onSwitch: (id: string) => void;
  onNew: () => void;
  expanded: boolean;
  onToggle: () => void;
}

export default function Sidebar({ sessions, activeId, onSwitch, onNew, expanded, onToggle }: SidebarProps) {
  if (!expanded) {
    return (
      <button
        onClick={onToggle}
        className="fixed left-0 top-0 z-50 h-full w-10 flex items-center justify-center bg-paper-100 border-r border-ink-200 hover:bg-paper-200 transition-colors"
        title="Open sidebar"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      </button>
    );
  }

  return (
    <div className="w-64 h-full bg-paper-100 border-r border-ink-200 flex flex-col">
      <div className="p-4 border-b border-ink-200 flex items-center justify-between">
        <div className="font-serif text-lg font-bold text-terracotta-500">LookAI</div>
        <button onClick={onToggle} className="p-1 rounded hover:bg-paper-200 text-ink-500">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-terracotta-500 text-white text-sm font-medium hover:bg-terracotta-600 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2 px-1">Sessions</div>
        <div className="space-y-1">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSwitch(session.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                session.id === activeId
                  ? 'bg-terracotta-500/10 text-terracotta-600 font-medium'
                  : 'hover:bg-paper-200 text-ink-600'
              }`}
            >
              <div className="truncate">{session.title || 'Untitled session'}</div>
              <div className="text-xs text-ink-400 mt-0.5">
                {new Date(session.updatedAt).toLocaleDateString()}
              </div>
            </button>
          ))}
          {sessions.length === 0 && (
            <div className="text-xs text-ink-400 px-3 py-2">No sessions yet</div>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-ink-200">
        <div className="text-xs text-ink-400 space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sage-400" />
            <span>Worker (7B) — resident</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-terracotta-400" />
            <span>Mózg (35B) — on-demand</span>
          </div>
        </div>
      </div>
    </div>
  );
}
