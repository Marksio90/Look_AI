import { execSync } from 'node:child_process';
import { join } from 'node:path';

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  clean: boolean;
}

export class GitWorktreeManager {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  list(): WorktreeInfo[] {
    try {
      const output = execSync('git worktree list --porcelain', { cwd: this.repoRoot, encoding: 'utf-8' });
      const lines = output.split('\n');
      const worktrees: WorktreeInfo[] = [];
      let current: Partial<WorktreeInfo> = {};

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (current.path) worktrees.push(current as WorktreeInfo);
          current = { path: line.slice(9).trim() };
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice(7).trim().replace('refs/heads/', '');
        } else if (line.startsWith('HEAD ')) {
          current.commit = line.slice(5).trim();
        }
      }
      if (current.path) worktrees.push(current as WorktreeInfo);
      return worktrees.map((w) => ({ ...w, clean: this.isClean(w.path) }));
    } catch {
      return [];
    }
  }

  create(branch: string, path?: string): WorktreeInfo | null {
    const targetPath = path ?? join(this.repoRoot, '..', `lookai-worktree-${branch}`);
    try {
      execSync(`git worktree add "${targetPath}" -b ${branch}`, { cwd: this.repoRoot });
      return { path: targetPath, branch, commit: 'HEAD', clean: true };
    } catch {
      return null;
    }
  }

  remove(path: string): boolean {
    try {
      execSync(`git worktree remove "${path}" --force`, { cwd: this.repoRoot });
      return true;
    } catch {
      return false;
    }
  }

  private isClean(path: string): boolean {
    try {
      execSync('git diff --quiet', { cwd: path });
      return true;
    } catch {
      return false;
    }
  }
}
