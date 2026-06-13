import { useState } from 'react';
import Chat from './components/Chat';
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
import { useOrchestrator } from './hooks/useOrchestrator';

export default function App() {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const {
    sessions,
    activeSessionId,
    messages,
    status,
    connected,
    sendMessage,
    createSession,
    switchSession,
  } = useOrchestrator();

  return (
    <div className="h-screen flex flex-col bg-paper-50">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          sessions={sessions}
          activeId={activeSessionId}
          onSwitch={switchSession}
          onNew={createSession}
          expanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
        />
        <div className={`flex-1 flex flex-col transition-all ${sidebarExpanded ? 'ml-0' : 'ml-10'}`}>
          <Chat messages={messages} onSend={sendMessage} connected={connected} />
        </div>
      </div>
      <StatusBar status={status} connected={connected} />
    </div>
  );
}
