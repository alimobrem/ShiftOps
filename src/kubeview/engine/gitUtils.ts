/** Shared Git URL utilities */

export function buildCommitUrl(repoURL: string, revision: string): string | null {
  try {
    const clean = repoURL.replace(/\.git$/, '');
    if (clean.includes('github.com')) return `${clean}/commit/${revision}`;
    if (clean.includes('gitlab')) return `${clean}/-/commit/${revision}`;
    if (clean.includes('bitbucket.org')) return `${clean}/commits/${revision}`;
    return `${clean}/commit/${revision}`;
  } catch { return null; }
}
