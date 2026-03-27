# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

OpenShift Pulse — a React/TypeScript dashboard for OpenShift Day-2 operations. All data comes from live Kubernetes APIs (no mock data in production code). v5.12.0, ~180 source files, 1888 tests.

## Commands

```bash
# Dev server (requires `oc proxy --port=8001` running separately)
npm run dev              # rspack dev server on port 9000

# Build
npm run build            # production build (~1s)

# Tests
npx vitest --run         # run all tests (~8s)
npx vitest --run src/kubeview/views/__tests__/WorkloadsView.test.tsx  # single file
npx vitest --run -t "test name pattern"  # single test by name

# Type checking
npm run type-check       # tsc --noEmit

# Full verify
npm run verify           # type-check + strict + lint + test + build

# Lint & format
npm run lint             # eslint with --fix
npm run format           # prettier
```

## Architecture

### Entry & Routing
- **Entry**: `src/index.tsx` → `src/kubeview/App.tsx` (`OpenshiftPulseApp`)
- **Shell**: `components/Shell.tsx` wraps all routes (CommandBar + TabBar + Dock + StatusBar)
- **Routes**: `routes/resourceRoutes.tsx` (generic CRUD), `routes/domainRoutes.tsx` (views like Workloads, Storage), `routes/redirects.tsx`
- URL pattern for resources: `/r/{group~version~plural}/{namespace}/{name}` (GVR encoding uses `~` separator)
- **Feature-gated routes**: `/incidents`, `/identity`, `/onboarding` — gated by `engine/featureFlags.ts` (localStorage-based). Toggle in Admin > Overview > Feature Flags.

### Navigation Structure (target)
```
Home:     Welcome (smart launchpad)
Operate:  Pulse, Incident Center, Workloads, Compute, Networking, Storage, Fleet
Govern:   Identity & Access, Security, GitOps
Platform: Admin, Onboarding
```

### Data Layer
- **API proxy**: All K8s calls go through `/api/kubernetes` → rspack dev proxy → `oc proxy :8001`
- **Query**: `engine/query.ts` — CRUD functions (`k8sList`, `k8sGet`, `k8sCreate`, `k8sPatch`, `k8sDelete`, `k8sSubresource`) with TanStack Query
- **List+Watch**: `hooks/useK8sListWatch.ts` — REST list + WebSocket watch with 60s safety polling
- **Watch manager**: `engine/watch.ts` — singleton WebSocket manager with heartbeat/reconnect
- **Discovery**: `engine/discovery.ts` — discovers all resource types from `/apis` endpoint, builds `ResourceRegistry` (Map<string, ResourceType>)
- **Impersonation**: `getImpersonationHeaders()` in `engine/query.ts` — added to ALL fetch calls from `uiStore` state

### State Management (Zustand stores)
- **`store/uiStore.ts`** — tabs, toasts, dock panel, namespace, impersonation, connection status, degradedReasons. Persisted to localStorage
- **`store/clusterStore.ts`** — cluster discovery, version info, HyperShift detection
- **`store/monitorStore.ts`** — findings, predictions, pending/recent actions, fix history (from agent WebSocket)
- **`store/agentStore.ts`** — chat messages, streaming, tool execution, pending confirmations
- **`store/trustStore.ts`** — agent trust level (0-4), auto-fix categories
- **`store/errorStore.ts`** — tracked K8s API errors by category with suggestions
- **`store/fleetStore.ts`** — multi-cluster connections, ACM detection
- **`store/argoCDStore.ts`** — ArgoCD availability, apps, sync status
- **`store/onboardingStore.ts`** — readiness gate results, waivers, wizard/checklist mode, scheduled rechecks

### Canonical Data Models
- **`engine/types/incident.ts`** — `IncidentItem`, `PrometheusAlert`, `FleetAlert` + mapper functions. Single source of truth for all incident-related types.
- **`engine/readiness/types.ts`** — `ReadinessGate`, `GateResult`, `GateStatus`, `ReadinessReport`, `CategorySummary`. Single source of truth for readiness types.
- **`engine/monitorClient.ts`** — `Finding`, `ResourceRef`, `ActionReport`, `Prediction`, `MonitorEvent`. Agent WebSocket types.
- **`engine/fixHistory.ts`** — `ActionRecord`, `FixHistoryResponse`. Agent REST types.

### Agent Integration
- **Monitor WebSocket**: `engine/monitorClient.ts` → `store/monitorStore.ts` — single connection managed by `agentNotifications.ts`
- **Agent Chat WebSocket**: `engine/agentClient.ts` → `store/agentStore.ts` — interactive SRE/security agent
- **Degraded mode**: `engine/degradedMode.ts` — 5 failure reasons tracked in `uiStore.degradedReasons`, displayed via `primitives/DegradedBanner.tsx`
- **Confirmation flow**: `confirm_request` → UI shows approval dialog → `confirm_response` with nonce for replay prevention

### Readiness Engine
- **Gates**: `engine/readiness/gates.ts` — 30 gates across 6 categories (prerequisites, security, reliability, observability, operations, gitops)
- **Scoring**: `engine/readiness/scoring.ts` — weighted scoring, `isProductionReady()` with 80% threshold
- **UI bridge**: `components/onboarding/types.ts` — `CategoryView` + `buildCategoryViews()` bridges engine data → UI components

### Engine (src/kubeview/engine/)
- **renderers/** — `K8sResource` type definition, `ColumnDef` for list tables, `kindToPlural()`, status color mapping
- **enhancers/** — per-kind column/action extensions (pods, deployments, nodes, services, secrets). Register via `enhancers/register.ts`
- **actions.ts** — `ResourceAction` registry (quick/navigate/danger categories)
- **gvr.ts** — `K8S_BASE` constant (`/api/kubernetes`), GVR↔URL encoding utilities
- **featureFlags.ts** — localStorage-based feature flags: `incidentCenter`, `identityView`, `welcomeLaunchpad`, `onboarding`
- **degradedMode.ts** — `DegradedReason` type + `DEGRADED_MESSAGES` for 5 failure modes

### Unified Incident Feed
- **`hooks/useIncidentFeed.ts`** — merges 4 sources (monitor findings, tracked errors, Prometheus alerts, timeline) into `IncidentItem[]` via canonical mappers. Deduplicates by correlationKey, sorts by severity.
- Used by `views/incidents/NowTab.tsx` in the Incident Center

### UI Components
- **Primitives**: `components/primitives/` — Panel, Card, DataTable, Badge, Dropdown, SearchInput, StatusBadge, ActionMenu, EmptyState, DegradedBanner
- **Feedback**: `components/feedback/` — Toast, ConfirmDialog, ProgressModal, InlineFeedback
- **YAML**: `components/yaml/` — YamlEditor (CodeMirror), DryRunPanel, DiffPreview
- **Onboarding**: `components/onboarding/` — ReadinessWizard, ReadinessChecklist, GateCard, ReadinessScore, WaiverDialog, CategoryStep

### Views (src/kubeview/views/)
- **Operate**: Pulse, IncidentCenter (Now/Investigate/Actions/History tabs), Workloads, Compute, Networking, Storage, Fleet
- **Govern**: Identity (Users/Groups/RBAC/Impersonation), Security, GitOps (ArgoCD)
- **Platform**: Admin (11 tabs), Onboarding (wizard/checklist modes)
- **Legacy**: Monitor, Alerts, UserManagement, AccessControl (redirect to new views when feature flags on)

### Testing
- **Framework**: vitest + jsdom + @testing-library/react
- **Config**: `vitest.config.ts` — excludes `.claude/worktrees/**` from test discovery
- **Test setup**: `src/kubeview/__tests__/setup.tsx` — factories, mock server, renderWithProviders
- **Mocking**: `vi.mock` with `_mockListWatchData`, MSW handlers for integration tests
- `__APP_VERSION__` defined in both `rspack.config.ts` and `vitest.config.ts`

### Key Conventions
- Path alias: `@/` maps to `src/`
- CSS: Tailwind + PatternFly 6. Main class `.openshiftpulse` in `styles/index.css`
- Icons: lucide-react
- State: zustand (no Redux). Persisted stores use `persist` middleware with `openshiftpulse-` prefix
- Routing: react-router-dom v7
- Types: define once in `engine/types/` or `engine/readiness/`, import everywhere. Never duplicate interfaces.
- Feature flags: `engine/featureFlags.ts` — check with `isFeatureEnabled(flag)`, toggle in Admin
- Degraded mode: set via `uiStore.addDegradedReason()`, display via `DegradedBanner`
- Agent confirmation: always pass `nonce` from `confirm_request` back in `confirm_response`

### Environment Variables (dev server)
- `K8S_API_URL` — K8s API target (default: `http://localhost:8001`)
- `OC_TOKEN` — bearer token (auto-detected from `oc whoami -t`)
- `THANOS_URL` — Prometheus/Thanos endpoint for metrics
- `ALERTMANAGER_URL` — Alertmanager endpoint
- `CONSOLE_URL` — OpenShift console URL for Helm proxy

### Deploy to OpenShift
```bash
# UI only
npm run build && oc start-build openshiftpulse --from-dir=dist --follow -n openshiftpulse && oc rollout restart deployment/openshiftpulse -n openshiftpulse

# Full stack (UI + Agent)
./deploy/deploy.sh --agent-repo ../pulse-agent
```
Helm chart in `deploy/helm/openshiftpulse/`. OAuth proxy, 2 replicas, PDB, topology spread. WS token auto-synced from agent secret on re-deploys.
