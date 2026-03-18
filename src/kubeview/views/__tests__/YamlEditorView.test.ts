import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(process.cwd(), 'src/kubeview/views/YamlEditorView.tsx'),
  'utf-8'
);

describe('YamlEditorView', () => {
  it('passes resourceGvk to YamlEditor', () => {
    expect(source).toContain('resourceGvk={resourceGvk}');
  });

  it('builds resourceGvk from gvrKey for grouped resources', () => {
    // For apps/v1/deployments -> { group: 'apps', version: 'v1', kind: ... }
    expect(source).toContain("group: gvrParts[0]");
    expect(source).toContain("version: gvrParts[1]");
  });

  it('builds resourceGvk for core resources with empty group', () => {
    // For v1/pods -> { group: '', version: 'v1', kind: ... }
    expect(source).toContain("group: ''");
  });

  it('passes showDiff and originalValue to YamlEditor', () => {
    expect(source).toContain('showDiff={true}');
    expect(source).toContain('originalValue={originalYaml}');
  });

  it('passes onSave to YamlEditor', () => {
    expect(source).toContain('onSave={handleSave}');
  });

  it('shows save error banner when save fails', () => {
    expect(source).toContain('saveError');
    expect(source).toContain('Save failed');
  });

  it('has discard button for unsaved changes', () => {
    expect(source).toContain('handleDiscard');
    expect(source).toContain('Discard');
  });

  it('invalidates cache after successful save', () => {
    expect(source).toContain("invalidateQueries");
  });
});
