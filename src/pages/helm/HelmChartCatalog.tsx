import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageSection, Title, Card, CardBody, Gallery, GalleryItem,
  Label, Button, SearchInput, Toolbar, ToolbarContent, ToolbarItem,
  Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter,
  FormGroup, TextInput, Checkbox,
} from '@patternfly/react-core';
import { useUIStore } from '@/store/useUIStore';
import { useClusterStore } from '@/store/useClusterStore';
import HelmInstallProgress from '@/components/HelmInstallProgress';

const BASE = '/api/kubernetes';

interface ChartDependency {
  name: string;
  version: string;
  repository: string;
}

interface ChartEntry {
  name: string;
  version: string;
  appVersion: string;
  description: string;
  repoName: string;
  repoUrl: string;
  icon?: string;
  keywords: string[];
  home?: string;
  urls: string[];
  kubeVersion: string;
  type: string;
  dependencies: ChartDependency[];
  hasSchema: boolean;
  annotations: Record<string, string>;
  warnings: string[];
}

interface HelmRepo {
  name: string;
  url: string;
  status: string;
}

/**
 * Parse a Helm index.yaml into chart entries.
 * index.yaml is YAML but has a predictable structure — we parse the key fields
 * without a full YAML parser using simple line-based extraction.
 */
function parseChartIndex(yaml: string, repoName: string, repoUrl: string): ChartEntry[] {
  const charts: ChartEntry[] = [];

  // Split into chart blocks: each chart starts at indent level 2 under "entries:"
  const entriesStart = yaml.indexOf('entries:');
  if (entriesStart === -1) return charts;

  const entriesSection = yaml.slice(entriesStart);
  // Match top-level chart names (2-space indent under entries:)
  const chartNameRegex = /^  ([a-zA-Z0-9_-]+):\s*$/gm;
  const chartNames: { name: string; start: number }[] = [];
  let match;
  while ((match = chartNameRegex.exec(entriesSection)) !== null) {
    chartNames.push({ name: match[1], start: match.index });
  }

  for (let i = 0; i < chartNames.length; i++) {
    const chartBlock = entriesSection.slice(
      chartNames[i].start,
      i + 1 < chartNames.length ? chartNames[i + 1].start : undefined
    );

    // Only take the first version entry (latest) — entries start with "  - " at 2-space indent
    const versionMatch = chartBlock.match(/^  - /m);
    if (!versionMatch || versionMatch.index === undefined) continue;

    const versionStart = versionMatch.index;
    // Find the next version entry (next "  - " at same indent level)
    const nextVersion = chartBlock.indexOf('\n  - ', versionStart + 4);
    const firstVersionBlock = chartBlock.slice(
      versionStart,
      nextVersion > 0 ? nextVersion : undefined,
    );

    const getField = (field: string): string => {
      const re = new RegExp(`^\\s+${field}:\\s*(.+)$`, 'm');
      const m = firstVersionBlock.match(re);
      if (!m) return '';
      return m[1].replace(/^["']|["']$/g, '').trim();
    };

    const getArrayField = (field: string): string[] => {
      const re = new RegExp(`^\\s+${field}:\\s*$`, 'm');
      const m = re.exec(firstVersionBlock);
      if (!m) return [];
      const items: string[] = [];
      const rest = firstVersionBlock.slice(m.index + m[0].length);
      for (const line of rest.split('\n')) {
        const itemMatch = line.match(/^\s+- ["']?(.+?)["']?\s*$/);
        if (itemMatch) items.push(itemMatch[1]);
        else if (line.trim() && !line.match(/^\s+-/)) break;
      }
      return items;
    };

    const name = getField('name') || chartNames[i].name;
    const version = getField('version');
    const appVersion = getField('appVersion');
    const description = getField('description');
    const icon = getField('icon');
    const home = getField('home');
    const keywords = getArrayField('keywords');
    const urls = getArrayField('urls');
    const kubeVersion = getField('kubeVersion');
    const chartType = getField('type');

    // Parse dependencies block
    const dependencies: ChartDependency[] = [];
    const depsMatch = firstVersionBlock.match(/^\s+dependencies:\s*$/m);
    if (depsMatch) {
      const depsBlock = firstVersionBlock.slice(depsMatch.index! + depsMatch[0].length);
      const depEntries = depsBlock.split(/\n\s+- /);
      for (const dep of depEntries.slice(1)) {
        const depName = dep.match(/name:\s*(.+)/)?.[1]?.trim().replace(/["']/g, '') ?? '';
        const depVersion = dep.match(/version:\s*(.+)/)?.[1]?.trim().replace(/["']/g, '') ?? '';
        const depRepo = dep.match(/repository:\s*(.+)/)?.[1]?.trim().replace(/["']/g, '') ?? '';
        if (depName) dependencies.push({ name: depName, version: depVersion, repository: depRepo });
      }
    }

    // Check for schema
    const hasSchema = firstVersionBlock.includes('values.schema.json') ||
      firstVersionBlock.includes('schema') && !firstVersionBlock.includes('skip-schema');

    // Parse annotations
    const annotations: Record<string, string> = {};
    const annMatch = firstVersionBlock.match(/^\s+annotations:\s*$/m);
    if (annMatch) {
      const annBlock = firstVersionBlock.slice(annMatch.index! + annMatch[0].length);
      for (const line of annBlock.split('\n')) {
        const kv = line.match(/^\s+([a-zA-Z0-9._/-]+):\s*['"]?(.+?)['"]?\s*$/);
        if (kv) annotations[kv[1]] = kv[2];
        else if (line.trim() && !line.match(/^\s+[a-zA-Z]/)) break;
      }
    }

    // Compute warnings
    const warnings: string[] = [];
    if (dependencies.length > 0) {
      warnings.push(`${dependencies.length} subchart${dependencies.length > 1 ? 's' : ''}: ${dependencies.map((d) => d.name).join(', ')}`);
    }
    if (kubeVersion) {
      warnings.push(`Requires K8s ${kubeVersion}`);
    }
    if (annotations['charts.openshift.io/supportedOpenShiftVersions']) {
      warnings.push(`OpenShift ${annotations['charts.openshift.io/supportedOpenShiftVersions']}`);
    }
    if (chartType === 'library') {
      warnings.push('Library chart (not installable)');
    }

    if (name) {
      charts.push({
        name,
        version,
        appVersion,
        description: description.slice(0, 200),
        repoName,
        repoUrl,
        icon: icon && icon.startsWith('http') ? icon : undefined,
        keywords,
        home,
        urls,
        kubeVersion,
        type: chartType,
        dependencies,
        hasSchema,
        annotations,
        warnings,
      });
    }
  }

  return charts;
}

export default function HelmChartCatalog() {
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace);
  const [repos, setRepos] = useState<HelmRepo[]>([]);
  const [charts, setCharts] = useState<ChartEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [installChart, setInstallChart] = useState<ChartEntry | null>(null);
  const [installName, setInstallName] = useState('');
  const [installNamespace, setInstallNamespace] = useState('');
  const [installing, setInstalling] = useState(false);
  const [skipSchema, setSkipSchema] = useState(false);
  const [customValues, setCustomValues] = useState('');
  const [showValuesEditor, setShowValuesEditor] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progressChart, setProgressChart] = useState<{ name: string; releaseName: string; namespace: string; chartUrl: string; repoUrl: string; skipSchema: boolean; valuesYaml: string } | null>(null);

  // Fetch repos and chart indexes
  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setLoading(true);
      const loadedRepos: HelmRepo[] = [];
      const allCharts: ChartEntry[] = [];

      // Fetch HelmChartRepositories
      try {
        const res = await fetch(`${BASE}/apis/helm.openshift.io/v1beta1/helmchartrepositories`);
        if (res.ok) {
          const data = await res.json() as { items: Record<string, unknown>[] };
          for (const item of data.items ?? []) {
            const meta = (item['metadata'] ?? {}) as Record<string, unknown>;
            const spec = (item['spec'] ?? {}) as Record<string, unknown>;
            const connConfig = (spec['connectionConfig'] ?? {}) as Record<string, unknown>;
            const status = (item['status'] ?? {}) as Record<string, unknown>;
            const conditions = (status['conditions'] ?? []) as Record<string, unknown>[];
            const readyCond = conditions.find((c) => String(c['type']) === 'Ready');
            const repoName = String(meta['name'] ?? '');
            const repoUrl = String(connConfig['url'] ?? '');

            if (repoName && repoUrl) {
              loadedRepos.push({
                name: repoName,
                url: repoUrl,
                status: String(readyCond?.['status'] ?? 'Unknown'),
              });
            }
          }
        }
      } catch { /* ignore */ }

      // Also try ProjectHelmChartRepositories (namespace-scoped)
      try {
        const res = await fetch(`${BASE}/apis/helm.openshift.io/v1beta1/projecthelmchartrepositories`);
        if (res.ok) {
          const data = await res.json() as { items: Record<string, unknown>[] };
          for (const item of data.items ?? []) {
            const meta = (item['metadata'] ?? {}) as Record<string, unknown>;
            const spec = (item['spec'] ?? {}) as Record<string, unknown>;
            const connConfig = (spec['connectionConfig'] ?? {}) as Record<string, unknown>;
            const repoName = String(meta['name'] ?? '');
            const repoUrl = String(connConfig['url'] ?? '');
            if (repoName && repoUrl && !loadedRepos.some((r) => r.url === repoUrl)) {
              loadedRepos.push({ name: repoName, url: repoUrl, status: 'True' });
            }
          }
        }
      } catch { /* ignore */ }

      if (cancelled) return;
      setRepos(loadedRepos);

      // Fetch chart indexes — try direct first (many repos have CORS *), fall back to proxy
      for (const repo of loadedRepos) {
        let fetched = false;
        const indexUrl = repo.url.endsWith('/index.yaml') ? repo.url : `${repo.url.replace(/\/$/, '')}/index.yaml`;

        // Try direct fetch first (works when repo sends Access-Control-Allow-Origin: *)
        try {
          const res = await fetch(indexUrl, { signal: AbortSignal.timeout(30000) });
          if (res.ok) {
            const text = await res.text();
            const parsed = parseChartIndex(text, repo.name, repo.url);
            allCharts.push(...parsed);
            fetched = true;
          }
        } catch { /* CORS or network error */ }

        // Fall back to server-side proxy
        if (!fetched) {
          try {
            const proxyUrl = `/api/helmrepo?url=${encodeURIComponent(repo.url)}`;
            const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(30000) });
            if (res.ok) {
              const text = await res.text();
              const parsed = parseChartIndex(text, repo.name, repo.url);
              allCharts.push(...parsed);
            }
          } catch { /* proxy not available */ }
        }
      }

      if (!cancelled) {
        // Sort alphabetically
        allCharts.sort((a, b) => a.name.localeCompare(b.name));
        setCharts(allCharts);
        setLoading(false);
      }
    }

    loadCatalog();
    return () => { cancelled = true; };
  }, []);

  // Filter
  const filtered = charts.filter((c) => {
    if (selectedRepo && c.repoName !== selectedRepo) return false;
    if (!searchValue) return true;
    const q = searchValue.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.keywords.some((k) => k.toLowerCase().includes(q)) ||
      c.repoName.toLowerCase().includes(q)
    );
  });

  const handleInstallClick = useCallback((chart: ChartEntry) => {
    setInstallChart(chart);
    setInstallName(chart.name);
    setInstallNamespace(selectedNamespace !== 'all' ? selectedNamespace : 'default');
    setCustomValues('');
    setShowValuesEditor(false);
  }, [selectedNamespace]);

  const handleInstall = useCallback(() => {
    if (!installChart || !installName || !installNamespace) return;

    const chartUrl = installChart.urls.length > 0
      ? installChart.urls[0].startsWith('http')
        ? installChart.urls[0]
        : `${installChart.repoUrl.replace(/\/index\.yaml$/, '').replace(/\/$/, '')}/${installChart.urls[0]}`
      : '';

    setProgressChart({
      name: installChart.name,
      releaseName: installName,
      namespace: installNamespace,
      chartUrl,
      repoUrl: installChart.repoUrl,
      skipSchema,
      valuesYaml: customValues,
    });
    setInstallChart(null);
    setShowProgress(true);
  }, [installChart, installName, installNamespace, skipSchema, customValues]);

  const repoNames = [...new Set(charts.map((c) => c.repoName))].sort();

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1" size="2xl">Helm Chart Catalog</Title>
        <p className="os-text-muted">
          Browse and install Helm charts from {repos.length} configured {repos.length === 1 ? 'repository' : 'repositories'}
        </p>
      </PageSection>

      <PageSection>
        <Toolbar id="helm-catalog-toolbar">
          <ToolbarContent>
            <ToolbarItem style={{ flex: 1 }}>
              <SearchInput
                placeholder="Search charts by name, keyword, or description..."
                value={searchValue}
                onChange={(_e, v) => setSearchValue(v)}
                onClear={() => setSearchValue('')}
              />
            </ToolbarItem>
            <ToolbarItem>
              <span className="os-text-muted">{filtered.length} charts</span>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>

        {/* Repo filter */}
        {repoNames.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            <Button variant={selectedRepo === null ? 'primary' : 'secondary'} size="sm" onClick={() => setSelectedRepo(null)}>
              All repos ({charts.length})
            </Button>
            {repoNames.map((r) => (
              <Button key={r} variant={selectedRepo === r ? 'primary' : 'secondary'} size="sm" onClick={() => setSelectedRepo(selectedRepo === r ? null : r)}>
                {r} ({charts.filter((c) => c.repoName === r).length})
              </Button>
            ))}
          </div>
        )}

        {loading ? (
          <Card><CardBody><p className="os-text-muted">Fetching chart indexes from {repos.length} repositories...</p></CardBody></Card>
        ) : charts.length === 0 && repos.length === 0 ? (
          <Card>
            <CardBody>
              <Title headingLevel="h3" size="lg" style={{ marginBottom: 8 }}>No Helm Chart Repositories Configured</Title>
              <p className="os-text-muted" style={{ marginBottom: 12 }}>
                Add a Helm chart repository to browse and install charts.
              </p>
              <pre style={{ fontSize: 13, padding: 12, borderRadius: 6, background: 'var(--modern-bg)', border: '1px solid var(--modern-border)' }}>
{`# Add the official Red Hat Helm chart repo
oc apply -f - <<EOF
apiVersion: helm.openshift.io/v1beta1
kind: HelmChartRepository
metadata:
  name: redhat-helm-charts
spec:
  connectionConfig:
    url: https://redhat-developer.github.io/redhat-helm-charts
EOF

# Or add Bitnami charts
oc apply -f - <<EOF
apiVersion: helm.openshift.io/v1beta1
kind: HelmChartRepository
metadata:
  name: bitnami
spec:
  connectionConfig:
    url: https://charts.bitnami.com/bitnami
EOF`}
              </pre>
            </CardBody>
          </Card>
        ) : charts.length === 0 && repos.length > 0 ? (
          <Card>
            <CardBody>
              <Title headingLevel="h3" size="lg" style={{ marginBottom: 8 }}>Could Not Fetch Chart Indexes</Title>
              <p className="os-text-muted" style={{ marginBottom: 12 }}>
                {repos.length} {repos.length === 1 ? 'repository is' : 'repositories are'} configured but chart indexes could not be fetched.
                This may be due to network restrictions or the repos being unreachable.
              </p>
              <Title headingLevel="h4" size="md" style={{ marginBottom: 8 }}>Configured Repositories</Title>
              {repos.map((r) => (
                <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Label color={r.status === 'True' ? 'green' : 'red'} isCompact>{r.status === 'True' ? 'Ready' : 'Error'}</Label>
                  <strong>{r.name}</strong>
                  <code style={{ fontSize: 12, color: 'var(--os-text-muted)' }}>{r.url}</code>
                </div>
              ))}
              <pre style={{ fontSize: 13, padding: 12, borderRadius: 6, background: 'var(--modern-bg)', border: '1px solid var(--modern-border)', marginTop: 16 }}>
{`# Browse charts via CLI instead:
${repos.map((r) => `helm repo add ${r.name} ${r.url}`).join('\n')}
helm search repo`}
              </pre>
            </CardBody>
          </Card>
        ) : (
          <Gallery hasGutter minWidths={{ default: '100%', sm: '280px', md: '300px' }}>
            {filtered.slice(0, 60).map((chart) => (
              <GalleryItem key={`${chart.repoName}/${chart.name}`}>
                <Card isFullHeight className="os-operatorhub__card">
                  <CardBody>
                    <div className="os-operatorhub__card-header">
                      <div className="os-operatorhub__icon" style={chart.icon ? { backgroundImage: `url(${chart.icon})`, backgroundSize: 'cover', color: 'transparent' } : {}}>
                        {chart.icon ? '' : chart.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="os-operatorhub__info">
                        <div className="os-operatorhub__name">{chart.name}</div>
                        <div className="os-operatorhub__provider">{chart.repoName} &middot; v{chart.version}</div>
                      </div>
                    </div>
                    <p className="os-operatorhub__card-desc">
                      {chart.description || 'No description available.'}
                    </p>
                    {/* Warnings and dependency info */}
                    {(chart.warnings.length > 0 || chart.dependencies.length > 0 || chart.hasSchema) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        {chart.type === 'library' && (
                          <Label color="purple" isCompact>Library</Label>
                        )}
                        {chart.dependencies.length > 0 && (
                          <Label color="orange" isCompact>{chart.dependencies.length} dep{chart.dependencies.length > 1 ? 's' : ''}</Label>
                        )}
                        {chart.hasSchema && (
                          <Label color="orange" isCompact>Schema</Label>
                        )}
                        {chart.kubeVersion && (
                          <Label color="grey" isCompact>K8s {chart.kubeVersion}</Label>
                        )}
                        {chart.annotations['charts.openshift.io/supportedOpenShiftVersions'] && (
                          <Label color="grey" isCompact>OCP {chart.annotations['charts.openshift.io/supportedOpenShiftVersions']}</Label>
                        )}
                      </div>
                    )}
                    <div className="os-operatorhub__card-footer">
                      <div className="os-operatorhub__label-group">
                        {chart.keywords.slice(0, 2).map((kw) => (
                          <Label key={kw} color="grey" isCompact>{kw}</Label>
                        ))}
                        {chart.appVersion && <Label color="blue" isCompact>{chart.appVersion}</Label>}
                      </div>
                      {chart.type === 'library' ? (
                        <Label color="grey" isCompact>Not installable</Label>
                      ) : (
                        <Button variant="primary" size="sm" onClick={() => handleInstallClick(chart)}>
                          Install
                        </Button>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </GalleryItem>
            ))}
          </Gallery>
        )}

        {filtered.length > 60 && (
          <div style={{ textAlign: 'center', padding: 16 }} className="os-text-muted">
            Showing 60 of {filtered.length} charts. Use search to narrow results.
          </div>
        )}
      </PageSection>

      {/* Install dialog */}
      {installChart && (
        <Modal
          variant={ModalVariant.small}
          isOpen
          onClose={() => setInstallChart(null)}
        >
          <ModalHeader title={`Install ${installChart.name}`} />
          <ModalBody>
            <p style={{ marginBottom: 12, fontSize: 13 }} className="os-text-muted">
              {installChart.description}
            </p>
            {/* Pre-install warnings */}
            {(installChart.warnings.length > 0 || installChart.dependencies.length > 0 || installChart.hasSchema) && (
              <div style={{ marginBottom: 16, padding: 10, borderRadius: 6, background: 'rgba(240, 171, 0, 0.08)', border: '1px solid rgba(240, 171, 0, 0.3)', fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Pre-install notes:</div>
                {installChart.dependencies.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <strong>Subcharts:</strong> {installChart.dependencies.map((d) => d.name).join(', ')}
                    {' '}<span className="os-text-muted">(bundled dependencies that install with this chart)</span>
                  </div>
                )}
                {installChart.hasSchema && (
                  <div style={{ marginBottom: 4 }}>
                    <strong>Has values schema</strong> — may need "Skip schema validation" if defaults don't pass
                  </div>
                )}
                {installChart.kubeVersion && (
                  <div style={{ marginBottom: 4 }}>
                    <strong>Requires K8s:</strong> {installChart.kubeVersion}
                  </div>
                )}
                {installChart.annotations['charts.openshift.io/supportedOpenShiftVersions'] && (
                  <div style={{ marginBottom: 4 }}>
                    <strong>OpenShift:</strong> {installChart.annotations['charts.openshift.io/supportedOpenShiftVersions']}
                  </div>
                )}
                {installChart.type === 'library' && (
                  <div style={{ color: '#c9190b', fontWeight: 600 }}>This is a library chart and cannot be installed directly.</div>
                )}
              </div>
            )}
            <FormGroup label="Release Name" isRequired fieldId="helm-release-name">
              <TextInput
                id="helm-release-name"
                value={installName}
                onChange={(_e, val) => setInstallName(val)}
                placeholder="my-release"
                isRequired
              />
            </FormGroup>
            <FormGroup label="Namespace" isRequired fieldId="helm-namespace" style={{ marginTop: 12 }}>
              <TextInput
                id="helm-namespace"
                value={installNamespace}
                onChange={(_e, val) => setInstallNamespace(val)}
                placeholder="default"
                isRequired
              />
            </FormGroup>
            <Checkbox
              id="skip-schema"
              label="Skip schema validation"
              description="Some charts have broken schemas. Enable this if install fails with schema errors."
              isChecked={skipSchema}
              onChange={(_e, checked) => setSkipSchema(checked)}
              style={{ marginTop: 12 }}
            />
            <div style={{ marginTop: 16 }}>
              <Button
                variant="link"
                isInline
                onClick={() => setShowValuesEditor(!showValuesEditor)}
                style={{ fontSize: 13, padding: 0 }}
              >
                {showValuesEditor ? 'Hide' : 'Customize'} values.yaml
              </Button>
              {showValuesEditor && (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    value={customValues}
                    onChange={(e) => setCustomValues(e.target.value)}
                    placeholder={'# Override default chart values\n# Example:\n# replicaCount: 2\n# service:\n#   type: LoadBalancer'}
                    style={{
                      width: '100%',
                      minHeight: 160,
                      fontFamily: 'monospace',
                      fontSize: 12,
                      lineHeight: 1.6,
                      padding: 10,
                      borderRadius: 6,
                      border: '1px solid var(--modern-border)',
                      background: 'var(--modern-bg)',
                      color: 'var(--modern-text)',
                      resize: 'vertical',
                    }}
                  />
                  <div style={{ fontSize: 11, marginTop: 4 }} className="os-text-muted">
                    YAML format. These values override the chart defaults.
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginTop: 16, padding: 12, borderRadius: 6, background: 'var(--modern-bg)', border: '1px solid var(--modern-border)', fontSize: 12, fontFamily: 'monospace' }}>
              {skipSchema
                ? `helm pull ${installChart.repoName}/${installChart.name} --version ${installChart.version} --untar -d /tmp && find /tmp -name 'values.schema.json' -delete && helm install ${installName} /tmp/${installChart.name}/ -n ${installNamespace}`
                : `helm install ${installName} ${installChart.repoName}/${installChart.name} -n ${installNamespace} --version ${installChart.version}`}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="primary" onClick={handleInstall} isLoading={installing} isDisabled={!installName || !installNamespace}>
              Install
            </Button>
            <Button variant="link" onClick={() => setInstallChart(null)}>Cancel</Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Install progress modal */}
      {showProgress && progressChart && (
        <HelmInstallProgress
          releaseName={progressChart.releaseName}
          namespace={progressChart.namespace}
          chartName={progressChart.name}
          chartUrl={progressChart.chartUrl}
          repoUrl={progressChart.repoUrl}
          skipSchemaValidation={progressChart.skipSchema}
          valuesYaml={progressChart.valuesYaml}
          onClose={() => { setShowProgress(false); setProgressChart(null); }}
        />
      )}
    </>
  );
}
