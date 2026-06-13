export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  model?: 'brain' | 'worker';
  timestamp: number;
  toolCalls?: ToolCall[];
  status?: 'pending' | 'done' | 'error';
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  expanded?: boolean;
}

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorStatus {
  model: string;
  contextTokens: number;
  contextLimit: number;
  turnCount: number;
  mode: 'assistant' | 'agent';
}
