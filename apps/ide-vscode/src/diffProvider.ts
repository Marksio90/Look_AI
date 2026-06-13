import * as vscode from 'vscode';

interface DiffHunk {
  oldRange: vscode.Range;
  newText: string;
  uri: vscode.Uri;
}

export class DiffProvider implements vscode.Disposable {
  private decorations: vscode.TextEditorDecorationType[] = [];
  private pendingDiffs: Map<string, DiffHunk[]> = new Map();

  showDiff(uri: vscode.Uri, oldText: string, newText: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== uri.toString()) return;

    const hunks = this.computeDiffHunks(oldText, newText);
    this.pendingDiffs.set(uri.toString(), hunks);

    const addedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(94, 138, 104, 0.15)',
      overviewRulerColor: '#5e8a68',
      isWholeLine: true,
    });

    const removedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(196, 90, 58, 0.15)',
      overviewRulerColor: '#c45a3a',
      isWholeLine: true,
    });

    this.decorations.push(addedDecoration, removedDecoration);

    const addedRanges: vscode.Range[] = [];
    const removedRanges: vscode.Range[] = [];

    for (const hunk of hunks) {
      if (hunk.newText) {
        addedRanges.push(hunk.oldRange);
      } else {
        removedRanges.push(hunk.oldRange);
      }
    }

    editor.setDecorations(addedDecoration, addedRanges);
    editor.setDecorations(removedDecoration, removedRanges);

    vscode.window.showInformationMessage(
      'LookAI: Apply diff?',
      'Accept',
      'Reject'
    ).then((choice) => {
      if (choice === 'Accept') this.acceptCurrentDiff();
      else if (choice === 'Reject') this.rejectCurrentDiff();
    });
  }

  acceptCurrentDiff(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const uri = editor.document.uri.toString();
    const hunks = this.pendingDiffs.get(uri);
    if (!hunks) return;

    editor.edit((editBuilder) => {
      for (const hunk of hunks) {
        editBuilder.replace(hunk.oldRange, hunk.newText);
      }
    });

    this.clearDecorations();
    this.pendingDiffs.delete(uri);
  }

  rejectCurrentDiff(): void {
    this.clearDecorations();
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.pendingDiffs.delete(editor.document.uri.toString());
    }
  }

  private clearDecorations(): void {
    for (const d of this.decorations) {
      d.dispose();
    }
    this.decorations = [];
  }

  private computeDiffHunks(oldText: string, newText: string): DiffHunk[] {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const hunks: DiffHunk[] = [];

    let i = 0;
    while (i < oldLines.length || i < newLines.length) {
      if (i >= oldLines.length) {
        const pos = new vscode.Position(i, 0);
        hunks.push({ oldRange: new vscode.Range(pos, pos), newText: newLines.slice(i).join('\n'), uri: vscode.Uri.file('') });
        break;
      }
      if (i >= newLines.length) {
        const pos = new vscode.Position(i, 0);
        hunks.push({ oldRange: new vscode.Range(pos, new vscode.Position(i + 1, 0)), newText: '', uri: vscode.Uri.file('') });
        i++;
        continue;
      }
      if (oldLines[i] !== newLines[i]) {
        const pos = new vscode.Position(i, 0);
        hunks.push({ oldRange: new vscode.Range(pos, new vscode.Position(i + 1, 0)), newText: newLines[i], uri: vscode.Uri.file('') });
      }
      i++;
    }

    return hunks;
  }

  dispose(): void {
    this.clearDecorations();
  }
}
