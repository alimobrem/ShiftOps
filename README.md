# ShiftOps

A next-generation OpenShift Console — scored **84/100** by a Senior SysAdmin reviewer and recommended as **"primary tool for single-cluster day-2 operations."** Built with React, TypeScript, and real-time Kubernetes APIs. Every view is auto-generated from the API — browse any resource type, see what needs attention, and take action in seconds.

## Highlights

- **55 automated health checks** across cluster readiness and domain-specific audits
- **24 workload/storage/networking/compute checks** with per-resource pass/fail, YAML fix examples, and "Edit YAML" links
- **RBAC-aware UI** — actions hidden/disabled based on user permissions
- **User impersonation** — test as any user or service account
- **Metrics sparklines** on every overview page with threshold-based colors
- **Alert silence lifecycle** — create, pre-fill from alerts, expire
- **Operator lifecycle** — install, progress tracking, post-install guidance, uninstall
- **1030+ tests** across 65 test files

## Features

### Cluster Pulse — Your Landing Page
Failing pods, degraded operators, unhealthy deployments, unready nodes, CPU/memory sparklines, network I/O, and disk throughput — all in one view. Namespace-scoped and cluster-wide stats clearly separated.

### Health Audits (24 Checks)
Each overview page has an expandable audit with score %, per-resource pass/fail, "Why it matters" explanations, YAML fix examples, and direct "Edit YAML" links.

- **Workloads (6)**: Resource limits, liveness probes, readiness probes, PDBs, replicas, rolling update strategy
- **Storage (6)**: Default StorageClass, PVC binding, reclaim policy, WaitForFirstConsumer, volume snapshots, storage quotas
- **Networking (6)**: Route TLS, network policies, NodePort avoidance, ingress controller health, route admission, egress policies
- **Compute (6)**: HA control plane, dedicated workers, MachineHealthChecks, node pressure, kubelet version consistency, cluster autoscaling

### Production Readiness (31 Cluster Checks)
Automated checks across 6 categories — HA, storage, security, networking, observability, reliability. Failed checks link directly to fix actions.

### Operator Catalog & Lifecycle
Browse 500+ operators. One-click install with 4-step progress tracking. Post-install guidance for 9+ operators. Full uninstall flow. Channel selector, namespace auto-suggestion.

### Alerts & Silence Management
Severity filters (Critical/Warning/Info), group by namespace or alertname, firing duration display, silenced indicators, runbook links, silence creation from any alert, silence expiration with confirmation.

### User Management & Impersonation
Users, groups, service accounts with role bindings. One-click impersonation — all API requests include `Impersonate-User` headers. Amber banner shows active impersonation across all pages.

### RBAC-Aware UI
SelfSubjectAccessReview checks hide Create/Delete buttons and disable Edit YAML when the user lacks permission. Fails open to avoid hiding features from admins.

### Metrics Charts
Pure SVG sparkline charts (no chart library) on Pulse, Workloads, Storage, Networking, Compute, and Alerts pages. Threshold-based color changes (green/yellow/red).

### Auto-Generated Resource Tables
Every resource type gets sortable columns, search, per-column filters, bulk delete (parallel via Promise.allSettled), keyboard navigation (j/k), CSV/JSON export, Edit YAML + Delete on every row, and inline scale controls for deployments.

### Overview Pages
- **Workloads**: Pod status breakdown, high-restart pods, failed jobs, deployment list with logs
- **Networking**: Exposed endpoints with TLS badges, service type breakdown, ingress controller health, not-admitted routes
- **Compute**: Node table with CPU/memory usage bars, taints, pressure badges, instance type, age. MachineConfigPools, Machine Configuration links
- **Storage**: Capacity breakdown by storage class, CSI drivers, pending PVC troubleshooting, volume snapshots

### Smart Diagnosis with Log Analysis
10 error patterns detected from pod logs: Permission denied, Connection refused, OOM, DNS failure, read-only filesystem, wrong architecture — each with specific fix suggestions.

### Create Resource
- **Quick Deploy**: Form-based deploy with env vars, resource limits, creates Deployment + Service + Route
- **Helm Charts**: 12 featured charts, install via Job, shows installed releases
- **Templates**: All 23 YAML templates searchable, grouped by 7 categories
- **Import YAML**: Paste/upload with real-time validation (apiVersion, kind, tabs, multi-document)

### YAML Editor
CodeMirror with K8s autocomplete, YAML linting, Schema panel (from CRD OpenAPI), context-aware snippets, inline diff view, keyboard shortcuts help, and 23 templates.

### Administration
- **Production Readiness**: 31 automated checks with fix links
- **Operators**: ClusterOperator health, Browse Catalog button
- **Cluster Config**: Edit OAuth, Proxy, Image registries, Ingress, Scheduler, TLS
- **Updates**: Available versions, channel management, initiate upgrades
- **Snapshots**: Capture/compare cluster state
- **Quotas**: Resource quotas and limit ranges

### And More
- **Troubleshooting**: 6 interactive runbooks with affected resources inline
- **Timeline**: Chronological event feed with namespace filtering
- **Dependency Graph**: Interactive SVG with blast radius analysis
- **Deployment Logs**: All pods in a deployment with tabs and merged view
- **Command Palette**: Cmd+K searches all resource types, pages, favorites, recents

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 19 + TypeScript 5.9 |
| **Bundler** | Rspack 1.7 (Rust-based, ~1s builds) |
| **State** | Zustand (client) + TanStack Query (server) |
| **Real-time** | WebSocket watches + 60s polling fallback |
| **Styling** | Tailwind CSS 3.4 |
| **Testing** | Vitest + jsdom + MSW (1030+ tests) |
| **Icons** | Lucide React (icon registry, ~50 icons) |
| **Charts** | Pure SVG sparklines (no chart library) |

## Getting Started

```bash
# Install dependencies
npm install

# Log in to your cluster
oc login --server=https://api.your-cluster.example.com:6443

# Start the API proxy
oc proxy --port=8001 &

# Start the dev server (port 9000)
npm run dev
```

Open http://localhost:9000. Clear `shiftops-ui-storage` from localStorage on first run to get default pinned tabs.

## Testing

```bash
npm test              # Run 1030+ tests
npm run type-check    # TypeScript checking
```

## Architecture

```
src/kubeview/
├── engine/              # Query (with impersonation), discovery, diagnosis, renderers
├── views/               # 17 page components + health audits
├── components/          # Shared UI (ClusterConfig, Sparkline, YamlEditor, etc.)
├── hooks/               # useK8sListWatch, useCanI (RBAC), useNavigateTab
├── store/               # Zustand (uiStore with impersonation, clusterStore)
└── App.tsx              # 24 routes
```

## Stats

- **100+** production files
- **1030+** tests across 65 files
- **24** routes
- **23** YAML templates
- **55** automated health checks (31 cluster + 24 domain)
- **500+** operators in catalog
- **10** error pattern detections
- **84/100** SysAdmin review score

## SysAdmin Review Scores

| Dimension | Score |
|-----------|-------|
| Day-1 Usefulness | 9/10 |
| Incident Response | 9/10 |
| Operational Efficiency | 9/10 |
| Learning & Discovery | 10/10 |
| Production Readiness | 10/10 |
| Operator Management | 9/10 |
| Multi-cluster / Enterprise | 4/10 |
| Trust & Safety | 8/10 |
| Completeness vs OCP Console | 7/10 |
| Would Recommend | 9/10 |

> "Primary tool for single-cluster day-2 operations. ShiftOps would be my default tab."

## License

MIT
