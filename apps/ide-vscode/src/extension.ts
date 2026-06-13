import * as vscode from 'vscode';
import { DiffProvider } from './diffProvider';

let diffProvider: DiffProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  diffProvider = new DiffProvider();

  const startChat = vscode.commands.registerCommand('lookai.startChat', () => {
    const panel = vscode.window.createWebviewPanel(
      'lookaiChat',
      'LookAI',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.webview.html = getChatWebviewContent();
  });

  const acceptDiff = vscode.commands.registerCommand('lookai.acceptDiff', () => {
    diffProvider?.acceptCurrentDiff();
  });

  const rejectDiff = vscode.commands.registerCommand('lookai.rejectDiff', () => {
    diffProvider?.rejectCurrentDiff();
  });

  context.subscriptions.push(startChat, acceptDiff, rejectDiff);
}

export function deactivate() {
  diffProvider?.dispose();
}

function getChatWebviewContent(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: system-ui, sans-serif; padding: 16px; background: #fdfbf7; color: #1a1a1a; }
    h1 { font-size: 18px; color: #c45a3a; margin-bottom: 16px; }
    .msg { padding: 8px 12px; border-radius: 8px; margin-bottom: 8px; max-width: 80%; }
    .user { background: #2d2d2d; color: white; margin-left: auto; }
    .assistant { background: white; border: 1px solid #e5e5e5; }
    input { width: 100%; padding: 10px; border: 1px solid #e5e5e5; border-radius: 8px; margin-top: 16px; }
  </style>
</head>
<body>
  <h1>LookAI</h1>
  <div id="chat"></div>
  <input type="text" placeholder="Ask LookAI..." id="input" />
  <script>
    const chat = document.getElementById('chat');
    const input = document.getElementById('input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const user = document.createElement('div');
        user.className = 'msg user';
        user.textContent = input.value;
        chat.appendChild(user);
        input.value = '';
        const assistant = document.createElement('div');
        assistant.className = 'msg assistant';
        assistant.textContent = 'Thinking...';
        chat.appendChild(assistant);
      }
    });
  </script>
</body>
</html>`;
}
