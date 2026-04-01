import { describe, it, expect } from 'vitest';
import { buildCommitUrl } from '../gitUtils';

describe('buildCommitUrl', () => {
  const sha = 'abc123def456';

  it('builds GitHub commit URL', () => {
    expect(buildCommitUrl('https://github.com/org/repo', sha)).toBe(
      `https://github.com/org/repo/commit/${sha}`,
    );
  });

  it('strips .git suffix for GitHub', () => {
    expect(buildCommitUrl('https://github.com/org/repo.git', sha)).toBe(
      `https://github.com/org/repo/commit/${sha}`,
    );
  });

  it('builds GitLab commit URL', () => {
    expect(buildCommitUrl('https://gitlab.com/org/repo', sha)).toBe(
      `https://gitlab.com/org/repo/-/commit/${sha}`,
    );
  });

  it('strips .git suffix for GitLab', () => {
    expect(buildCommitUrl('https://gitlab.com/org/repo.git', sha)).toBe(
      `https://gitlab.com/org/repo/-/commit/${sha}`,
    );
  });

  it('handles self-hosted GitLab', () => {
    expect(buildCommitUrl('https://gitlab.mycompany.com/team/app', sha)).toBe(
      `https://gitlab.mycompany.com/team/app/-/commit/${sha}`,
    );
  });

  it('builds Bitbucket commit URL', () => {
    expect(buildCommitUrl('https://bitbucket.org/org/repo', sha)).toBe(
      `https://bitbucket.org/org/repo/commits/${sha}`,
    );
  });

  it('strips .git suffix for Bitbucket', () => {
    expect(buildCommitUrl('https://bitbucket.org/org/repo.git', sha)).toBe(
      `https://bitbucket.org/org/repo/commits/${sha}`,
    );
  });

  it('falls back to /commit/ for unknown providers', () => {
    expect(buildCommitUrl('https://gitea.example.com/org/repo', sha)).toBe(
      `https://gitea.example.com/org/repo/commit/${sha}`,
    );
  });

  it('strips .git suffix for unknown providers', () => {
    expect(buildCommitUrl('https://gitea.example.com/org/repo.git', sha)).toBe(
      `https://gitea.example.com/org/repo/commit/${sha}`,
    );
  });
});
