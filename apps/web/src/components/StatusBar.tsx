import type { OrchestratorStatus } from '../types';

interface StatusBarProps {
  status: OrchestratorStatus;
  connected: boolean;
}

export default function StatusBar({ status, connected }: StatusBarProps) {
  const pct = Math.min(100, Math.round((status.contextTokens / status.contextLimit) * 100));
  const barColor = pct > 85 ? 'bg-terracotta-500' : pct > 60 ? 'bg-amber-500' : 'bg-sage-500';

  return (
    <div className="h-8 bg-paper-100 border-t border-ink-200 flex items-center px-4 text-xs text-ink-500 gap-4">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-sage-500' : 'bg-terracotta-500 animate-pulse'}`} />
        <span>{connected ? 'Connected' : 'Reconnecting...'}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${status.model === 'brain' ? 'bg-terracotta-400' : 'bg-sage-400'}`} />
        <span className="font-medium">{status.model === 'brain' ? 'Mózg' : 'Worker'}</span>
      </div>

      <div className="flex items-center gap-2 flex-1">
        <span>Context:</span>
        <div className="w-32 h-2 bg-ink-200 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span>{status.contextTokens.toLocaleString()} / {status.contextLimit.toLocaleString()} ({pct}%)</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span>Turns:</span>
        <span className="font-mono">{status.turnCount}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span>Mode:</span>
        <span className={`font-medium ${status.mode === 'agent' ? 'text-sage-600' : 'text-terracotta-600'}`}>
          {status.mode}
        </span>
      </div>

      <div className="ml-auto text-ink-400">$0.00 — local</div>
    </div>
  );
}
