import * as vscode from 'vscode';

export class LookaiLspProvider implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('lookai');
  }

  analyzeDocument(document: vscode.TextDocument): void {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Simple heuristics for common issues
      if (line.includes('console.log') && !line.trim().startsWith('//')) {
        const range = new vscode.Range(i, line.indexOf('console.log'), i, line.indexOf('console.log') + 11);
        diagnostics.push(new vscode.Diagnostic(range, 'LookAI: Remove console.log before commit', vscode.DiagnosticSeverity.Warning));
      }
      if (line.includes('TODO') || line.includes('FIXME')) {
        const idx = Math.min(line.indexOf('TODO') >= 0 ? line.indexOf('TODO') : Infinity, line.indexOf('FIXME') >= 0 ? line.indexOf('FIXME') : Infinity);
        if (idx !== Infinity) {
          const range = new vscode.Range(i, idx, i, idx + 4);
          diagnostics.push(new vscode.Diagnostic(range, 'LookAI: Unresolved TODO/FIXME', vscode.DiagnosticSeverity.Information));
        }
      }
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  clear(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri);
  }

  dispose(): void {
    this.diagnosticCollection.dispose();
  }
}
