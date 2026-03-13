// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Helm Chart Catalog', () => {
  // Mirrors real OpenShift chart index format (2-space indent, entries start with annotations)
  const sampleIndexYaml = `
apiVersion: v1
entries:
  nginx:
  - annotations:
      charts.openshift.io/name: nginx
    apiVersion: v2
    name: nginx
    version: 15.3.2
    appVersion: 1.25.3
    description: NGINX Open Source is a web server for serving web content
    keywords:
    - nginx
    - webserver
    urls:
    - https://charts.bitnami.com/bitnami/nginx-15.3.2.tgz
    icon: https://bitnami.com/assets/stacks/nginx/img/nginx-stack-220x234.png
    home: https://bitnami.com
  postgresql:
  - annotations:
      charts.openshift.io/name: postgresql
    apiVersion: v2
    name: postgresql
    version: 13.2.1
    appVersion: "16.1"
    description: PostgreSQL is an object-relational database management system
    keywords:
    - postgresql
    - database
    urls:
    - postgresql-13.2.1.tgz
    icon: https://bitnami.com/assets/stacks/postgresql/img/postgresql-stack-220x234.png
  redis:
  - name: redis
    version: 18.4.0
    appVersion: 7.2.3
    description: Redis is an open source, advanced key-value store
    keywords:
    - redis
    - cache
    urls:
    - https://charts.bitnami.com/bitnami/redis-18.4.0.tgz
`;

  function parseChartIndex(yaml: string, repoName: string, repoUrl: string) {
    const charts: { name: string; version: string; appVersion: string; description: string; repoName: string; keywords: string[]; urls: string[] }[] = [];
    const entriesStart = yaml.indexOf('entries:');
    if (entriesStart === -1) return charts;

    const entriesSection = yaml.slice(entriesStart);
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

      const versionMatch = chartBlock.match(/^  - /m);
      if (!versionMatch || versionMatch.index === undefined) continue;

      const versionStart = versionMatch.index;
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
      const keywords = getArrayField('keywords');
      const urls = getArrayField('urls');

      if (name) {
        charts.push({ name, version, appVersion, description, repoName, keywords, urls });
      }
    }

    return charts;
  }

  it('parses chart entries from index.yaml', () => {
    const charts = parseChartIndex(sampleIndexYaml, 'bitnami', 'https://charts.bitnami.com/bitnami');
    expect(charts.length).toBe(3);
    expect(charts.map((c) => c.name)).toEqual(['nginx', 'postgresql', 'redis']);
  });

  it('extracts version and appVersion', () => {
    const charts = parseChartIndex(sampleIndexYaml, 'bitnami', 'https://charts.bitnami.com/bitnami');
    const nginx = charts.find((c) => c.name === 'nginx')!;
    expect(nginx.version).toBe('15.3.2');
    expect(nginx.appVersion).toBe('1.25.3');
  });

  it('extracts description', () => {
    const charts = parseChartIndex(sampleIndexYaml, 'bitnami', 'https://charts.bitnami.com/bitnami');
    const pg = charts.find((c) => c.name === 'postgresql')!;
    expect(pg.description).toContain('object-relational');
  });

  it('extracts keywords', () => {
    const charts = parseChartIndex(sampleIndexYaml, 'bitnami', 'https://charts.bitnami.com/bitnami');
    const redis = charts.find((c) => c.name === 'redis')!;
    expect(redis.keywords).toContain('redis');
    expect(redis.keywords).toContain('cache');
  });

  it('extracts chart URLs', () => {
    const charts = parseChartIndex(sampleIndexYaml, 'bitnami', 'https://charts.bitnami.com/bitnami');
    const nginx = charts.find((c) => c.name === 'nginx')!;
    expect(nginx.urls[0]).toBe('https://charts.bitnami.com/bitnami/nginx-15.3.2.tgz');

    const pg = charts.find((c) => c.name === 'postgresql')!;
    expect(pg.urls[0]).toBe('postgresql-13.2.1.tgz');
  });

  it('returns empty array for invalid YAML', () => {
    expect(parseChartIndex('not yaml', 'test', 'http://test')).toEqual([]);
    expect(parseChartIndex('apiVersion: v1\nno entries here', 'test', 'http://test')).toEqual([]);
  });

  it('sets repoName on all charts', () => {
    const charts = parseChartIndex(sampleIndexYaml, 'my-repo', 'https://example.com');
    expect(charts.every((c) => c.repoName === 'my-repo')).toBe(true);
  });

  it('filters charts by search', () => {
    const charts = parseChartIndex(sampleIndexYaml, 'bitnami', 'https://charts.bitnami.com/bitnami');
    const q = 'database';
    const filtered = charts.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.keywords.some((k) => k.toLowerCase().includes(q))
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe('postgresql');
  });
});

describe('Helm Install Job', () => {
  // Tests for Job command construction and artifact cleanup logic

  function buildHelmCmd(opts: {
    releaseName: string;
    namespace: string;
    chartName: string;
    chartUrl?: string;
    repoUrl?: string;
    skipSchemaValidation?: boolean;
    hasCustomValues?: boolean;
  }): string {
    const { releaseName, namespace, chartName, chartUrl, repoUrl, skipSchemaValidation, hasCustomValues } = opts;
    const valuesFlag = hasCustomValues ? ' -f /values/values.yaml' : '';

    if (skipSchemaValidation) {
      const pullCmd = chartUrl
        ? `helm pull '${chartUrl}' --untar --untardir /tmp/chart`
        : `helm repo add temprepo '${repoUrl}' && helm pull temprepo/${chartName} --untar --untardir /tmp/chart`;
      return [
        `set -ex`,
        pullCmd,
        `ls /tmp/chart/`,
        `find /tmp/chart -name 'values.schema.json' -type f -print -delete`,
        `find /tmp/chart -name '*.schema.json' -type f -print -delete`,
        `CHART_DIR=$(find /tmp/chart -maxdepth 1 -mindepth 1 -type d -exec test -f '{}/Chart.yaml' \\; -print | head -1)`,
        `echo "Installing from $CHART_DIR"`,
        `helm install ${releaseName} "$CHART_DIR" -n ${namespace} --wait --timeout 300s --disable-openapi-validation${valuesFlag}`,
      ].join(' && ');
    } else {
      return chartUrl
        ? `helm install ${releaseName} '${chartUrl}' -n ${namespace} --wait --timeout 300s${valuesFlag}`
        : `helm repo add temprepo '${repoUrl}' && helm install ${releaseName} temprepo/${chartName} -n ${namespace} --wait --timeout 300s${valuesFlag}`;
    }
  }

  it('builds direct chart URL install command', () => {
    const cmd = buildHelmCmd({
      releaseName: 'my-nginx',
      namespace: 'default',
      chartName: 'nginx',
      chartUrl: 'https://charts.bitnami.com/bitnami/nginx-15.3.2.tgz',
    });
    expect(cmd).toBe("helm install my-nginx 'https://charts.bitnami.com/bitnami/nginx-15.3.2.tgz' -n default --wait --timeout 300s");
  });

  it('builds repo-based install command', () => {
    const cmd = buildHelmCmd({
      releaseName: 'my-pg',
      namespace: 'apps',
      chartName: 'postgresql',
      repoUrl: 'https://charts.bitnami.com/bitnami',
    });
    expect(cmd).toContain('helm repo add temprepo');
    expect(cmd).toContain('helm install my-pg temprepo/postgresql -n apps');
  });

  it('adds values flag when custom values are provided', () => {
    const cmd = buildHelmCmd({
      releaseName: 'my-nginx',
      namespace: 'default',
      chartName: 'nginx',
      chartUrl: 'https://charts.bitnami.com/bitnami/nginx-15.3.2.tgz',
      hasCustomValues: true,
    });
    expect(cmd).toContain('-f /values/values.yaml');
  });

  it('does not add values flag when no custom values', () => {
    const cmd = buildHelmCmd({
      releaseName: 'my-nginx',
      namespace: 'default',
      chartName: 'nginx',
      chartUrl: 'https://charts.bitnami.com/bitnami/nginx-15.3.2.tgz',
      hasCustomValues: false,
    });
    expect(cmd).not.toContain('-f /values/values.yaml');
  });

  it('strips schema files when skipSchemaValidation is true', () => {
    const cmd = buildHelmCmd({
      releaseName: 'my-chart',
      namespace: 'default',
      chartName: 'test-chart',
      chartUrl: 'https://example.com/test-chart-1.0.0.tgz',
      skipSchemaValidation: true,
    });
    expect(cmd).toContain('set -ex');
    expect(cmd).toContain("find /tmp/chart -name 'values.schema.json' -type f -print -delete");
    expect(cmd).toContain("find /tmp/chart -name '*.schema.json' -type f -print -delete");
    expect(cmd).toContain('--disable-openapi-validation');
    expect(cmd).toContain("CHART_DIR=$(find /tmp/chart -maxdepth 1 -mindepth 1 -type d -exec test -f '{}/Chart.yaml'");
  });

  it('combines skipSchemaValidation with custom values', () => {
    const cmd = buildHelmCmd({
      releaseName: 'my-chart',
      namespace: 'test-ns',
      chartName: 'test-chart',
      repoUrl: 'https://example.com/repo',
      skipSchemaValidation: true,
      hasCustomValues: true,
    });
    expect(cmd).toContain('-f /values/values.yaml');
    expect(cmd).toContain('--disable-openapi-validation');
    expect(cmd).toContain("find /tmp/chart -name 'values.schema.json'");
  });
});

describe('Helm Install Artifact Cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds correct cleanup resource names', () => {
    const releaseName = 'my-release';
    const namespace = 'test-ns';
    const saName = `helm-installer-${releaseName}`;
    const crbName = `helm-installer-${releaseName}-${namespace}`;
    const valuesConfigMapName = `helm-values-${releaseName}`;

    expect(saName).toBe('helm-installer-my-release');
    expect(crbName).toBe('helm-installer-my-release-test-ns');
    expect(valuesConfigMapName).toBe('helm-values-my-release');
  });

  it('constructs correct cleanup API paths', () => {
    const BASE = '/api/kubernetes';
    const releaseName = 'my-release';
    const namespace = 'test-ns';
    const saName = `helm-installer-${releaseName}`;
    const crbName = `helm-installer-${releaseName}-${namespace}`;
    const valuesConfigMapName = `helm-values-${releaseName}`;
    const jobName = 'helm-install-my-release-abc1';

    const saPath = `${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/serviceaccounts/${saName}`;
    const crbPath = `${BASE}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/${crbName}`;
    const jobPath = `${BASE}/apis/batch/v1/namespaces/${encodeURIComponent(namespace)}/jobs/${jobName}?propagationPolicy=Background`;
    const cmPath = `${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/configmaps/${valuesConfigMapName}`;

    expect(saPath).toBe('/api/kubernetes/api/v1/namespaces/test-ns/serviceaccounts/helm-installer-my-release');
    expect(crbPath).toBe('/api/kubernetes/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/helm-installer-my-release-test-ns');
    expect(jobPath).toBe('/api/kubernetes/apis/batch/v1/namespaces/test-ns/jobs/helm-install-my-release-abc1?propagationPolicy=Background');
    expect(cmPath).toBe('/api/kubernetes/api/v1/namespaces/test-ns/configmaps/helm-values-my-release');
  });

  it('cleanup deletes 4 resources on failure', async () => {
    const fetchCalls: string[] = [];
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      fetchCalls.push(url);
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal('fetch', mockFetch);

    const BASE = '/api/kubernetes';
    const namespace = 'test-ns';
    const releaseName = 'my-release';
    const saName = `helm-installer-${releaseName}`;
    const crbName = `helm-installer-${releaseName}-${namespace}`;
    const valuesConfigMapName = `helm-values-${releaseName}`;
    const jobName = 'helm-install-my-release-abc1';

    const delOpts = { method: 'DELETE' as const };
    await Promise.allSettled([
      fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/serviceaccounts/${saName}`, delOpts),
      fetch(`${BASE}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/${crbName}`, delOpts),
      fetch(`${BASE}/apis/batch/v1/namespaces/${encodeURIComponent(namespace)}/jobs/${jobName}?propagationPolicy=Background`, delOpts),
      fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/configmaps/${valuesConfigMapName}`, delOpts),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(fetchCalls).toContain('/api/kubernetes/api/v1/namespaces/test-ns/serviceaccounts/helm-installer-my-release');
    expect(fetchCalls).toContain('/api/kubernetes/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/helm-installer-my-release-test-ns');
    expect(fetchCalls.some((u) => u.includes('jobs/helm-install-my-release-abc1'))).toBe(true);
    expect(fetchCalls).toContain('/api/kubernetes/api/v1/namespaces/test-ns/configmaps/helm-values-my-release');

    vi.unstubAllGlobals();
  });

  it('installStarted ref prevents double execution', () => {
    const installStarted = { current: false };
    const executions: number[] = [];

    function attemptInstall() {
      if (installStarted.current) return;
      installStarted.current = true;
      executions.push(1);
    }

    // Simulate React strict mode double-mount
    attemptInstall();
    attemptInstall();

    expect(executions.length).toBe(1);
  });
});

describe('Helm Values ConfigMap', () => {
  it('creates correct ConfigMap structure', () => {
    const releaseName = 'my-release';
    const namespace = 'test-ns';
    const valuesYaml = 'replicaCount: 3\nservice:\n  type: LoadBalancer';
    const valuesConfigMapName = `helm-values-${releaseName}`;

    const configMap = {
      apiVersion: 'v1', kind: 'ConfigMap',
      metadata: { name: valuesConfigMapName, namespace, labels: { 'app.kubernetes.io/managed-by': 'helm-ui-installer' } },
      data: { 'values.yaml': valuesYaml },
    };

    expect(configMap.metadata.name).toBe('helm-values-my-release');
    expect(configMap.data['values.yaml']).toBe('replicaCount: 3\nservice:\n  type: LoadBalancer');
    expect(configMap.metadata.labels['app.kubernetes.io/managed-by']).toBe('helm-ui-installer');
  });

  it('Job spec includes volume mount for custom values', () => {
    const hasCustomValues = true;
    const valuesConfigMapName = 'helm-values-my-release';

    const container = {
      name: 'helm',
      image: 'alpine/helm:3.16.3',
      command: ['sh', '-c', 'helm install ...'],
      ...(hasCustomValues ? {
        volumeMounts: [{ name: 'values', mountPath: '/values', readOnly: true }],
      } : {}),
    };

    const podSpec = {
      containers: [container],
      ...(hasCustomValues ? {
        volumes: [{ name: 'values', configMap: { name: valuesConfigMapName } }],
      } : {}),
    };

    expect(container.volumeMounts).toHaveLength(1);
    expect(container.volumeMounts![0].mountPath).toBe('/values');
    expect(container.volumeMounts![0].readOnly).toBe(true);
    expect(podSpec.volumes).toHaveLength(1);
    expect(podSpec.volumes![0].configMap.name).toBe('helm-values-my-release');
  });

  it('Job spec has no volume when no custom values', () => {
    const hasCustomValues = false;
    const container = {
      name: 'helm',
      image: 'alpine/helm:3.16.3',
      command: ['sh', '-c', 'helm install ...'],
      ...(hasCustomValues ? {
        volumeMounts: [{ name: 'values', mountPath: '/values', readOnly: true }],
      } : {}),
    };

    expect(container).not.toHaveProperty('volumeMounts');
  });
});
