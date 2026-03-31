#!/usr/bin/env bash
# Deploy OpenShift Pulse (UI + Agent) to an OpenShift cluster.
#
# Builds images locally with Podman, pushes to Quay.io, deploys via Helm.
# Never uses S2I or on-cluster builds.
#
# Usage:
#   ./deploy/deploy.sh                                  # UI only (no agent)
#   ./deploy/deploy.sh --agent-repo /path/to/pulse-agent # UI + Agent
#   ./deploy/deploy.sh --uninstall                       # Remove everything
#   ./deploy/deploy.sh --dry-run --agent-repo ../pulse-agent  # Preview
#
# Prerequisites: oc (logged in), helm, npm, podman (logged in to quay.io)

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_REPO=""
NO_AGENT=false
NAMESPACE="openshiftpulse"
AGENT_RELEASE="pulse-agent"
UI_IMAGE="quay.io/amobrem/openshiftpulse"
AGENT_IMAGE="quay.io/amobrem/pulse-agent"
UI_TAG=""
AGENT_TAG=""
_WS_TOKEN_OVERRIDE="${PULSE_AGENT_WS_TOKEN:-}"
GCP_KEY_FILE=""
DRY_RUN=false
UNINSTALL=false
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --agent-repo) AGENT_REPO="$2"; shift 2 ;;
    --no-agent)   NO_AGENT=true; shift ;;
    --namespace)  NAMESPACE="$2"; shift 2 ;;
    --ws-token)   _WS_TOKEN_OVERRIDE="$2"; shift 2 ;;
    --gcp-key)    GCP_KEY_FILE="$2"; shift 2 ;;
    --ui-tag)     UI_TAG="$2"; shift 2 ;;
    --agent-tag)  AGENT_TAG="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=true; shift ;;
    --uninstall)  UNINSTALL=true; shift ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --help|-h)
      cat <<HELP
Usage: $0 [--agent-repo /path/to/pulse-agent] [options]

Options:
  --agent-repo PATH   Path to pulse-agent repo (deploys UI + Agent)
  --no-agent          Deploy UI only, skip agent
  --namespace NS      Target namespace (default: openshiftpulse)
  --gcp-key PATH      GCP service account JSON for Vertex AI
  --ws-token TOKEN    WebSocket auth token (auto-generated if unset)
  --ui-tag TAG        UI image tag (default: git SHA short)
  --agent-tag TAG     Agent image tag (default: git SHA short)
  --dry-run           Preview what will be deployed without deploying
  --uninstall         Remove all Pulse resources from the cluster
  --skip-build        Skip image builds, use existing images

Images (built locally, pushed to Quay.io):
  UI:    $UI_IMAGE:<tag>
  Agent: $AGENT_IMAGE:<tag>

AI Backend (pick one):
  Vertex AI:     ANTHROPIC_VERTEX_PROJECT_ID=proj CLOUD_ML_REGION=us-east5 \\
                   $0 --agent-repo ../pulse-agent --gcp-key ~/sa-key.json
  Anthropic API: ANTHROPIC_API_KEY=sk-ant-... $0 --agent-repo ../pulse-agent
HELP
      exit 0 ;;
    *) echo "ERROR: Unknown argument: $1. Use --help for usage."; exit 1 ;;
  esac
done

# ─── Helper Functions ────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step()  { echo ""; echo -e "${CYAN}═══ $1 ═══${NC}"; }

wait_for_rollout() {
  local deploy="$1" ns="$2" timeout="${3:-120}"
  info "Waiting for $deploy to be ready (timeout: ${timeout}s)..."
  if ! oc rollout status "deployment/$deploy" -n "$ns" --timeout="${timeout}s" 2>/dev/null; then
    warn "Rollout not complete within ${timeout}s — continuing anyway"
  fi
}

wait_for_route() {
  local name="$1" ns="$2"
  for i in $(seq 1 10); do
    local host
    host=$(oc get route "$name" -n "$ns" -o jsonpath='{.spec.host}' 2>/dev/null || echo "")
    [[ -n "$host" ]] && echo "$host" && return 0
    sleep 2
  done
  echo ""
}

# Compute git-based image tag: short SHA + dirty suffix
git_tag() {
  local dir="$1"
  local sha
  sha=$(git -C "$dir" rev-parse --short=8 HEAD 2>/dev/null || echo "unknown")
  if ! git -C "$dir" diff --quiet HEAD 2>/dev/null; then
    echo "${sha}-dirty"
  else
    echo "$sha"
  fi
}

# ─── Uninstall Mode ─────────────────────────────────────────────────────────

if [[ "$UNINSTALL" == "true" ]]; then
  step "Uninstalling OpenShift Pulse"

  oc whoami &>/dev/null || { error "Not logged in to OpenShift. Run 'oc login' first."; exit 1; }

  info "Removing Helm releases..."
  helm uninstall "$AGENT_RELEASE" -n "$NAMESPACE" 2>/dev/null && info "Removed: $AGENT_RELEASE" || info "Not found: $AGENT_RELEASE"
  helm uninstall openshiftpulse -n "$NAMESPACE" 2>/dev/null && info "Removed: openshiftpulse" || info "Not found: openshiftpulse"

  info "Removing cluster-scoped resources..."
  oc delete clusterrole openshiftpulse-reader 2>/dev/null || true
  oc delete clusterrolebinding openshiftpulse-reader 2>/dev/null || true
  oc delete clusterrole "${AGENT_RELEASE}-openshift-sre-agent" 2>/dev/null || true
  oc delete clusterrolebinding "${AGENT_RELEASE}-openshift-sre-agent" 2>/dev/null || true
  oc delete oauthclient openshiftpulse 2>/dev/null || true

  info "Removing namespace..."
  oc delete namespace "$NAMESPACE" 2>/dev/null && info "Removed: $NAMESPACE" || info "Not found: $NAMESPACE"

  echo ""
  echo "════════════════════════════════════════════"
  info "Uninstall complete"
  echo "════════════════════════════════════════════"
  exit 0
fi

# ─── Phase 0: Preflight Checks ──────────────────────────────────────────────

step "Preflight checks"

for cmd in oc helm npm podman; do
  command -v "$cmd" &>/dev/null || { error "'$cmd' not found. Install it and try again."; exit 1; }
done
oc whoami &>/dev/null || { error "Not logged in to OpenShift. Run 'oc login' first."; exit 1; }

if [[ "$SKIP_BUILD" == "false" ]]; then
  if ! podman info &>/dev/null; then
    error "Podman machine not running. Start it: podman machine start"
    exit 1
  fi
  if ! podman login --get-login quay.io &>/dev/null; then
    error "Not logged in to Quay.io. Run: podman login quay.io"
    exit 1
  fi
fi

info "Tools: oc, helm, npm, podman — OK"
CLUSTER_API=$(oc whoami --show-server)
info "Cluster: $CLUSTER_API"

# Agent repo validation
if [[ -z "$AGENT_REPO" ]]; then
  NO_AGENT=true
  warn "No --agent-repo provided — deploying UI only"
fi

if [[ "$NO_AGENT" == "false" ]]; then
  if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${ANTHROPIC_VERTEX_PROJECT_ID:-}" ]]; then
    error "No AI backend configured. Set ANTHROPIC_API_KEY or ANTHROPIC_VERTEX_PROJECT_ID."
    exit 1
  fi
  if [[ ! -d "$AGENT_REPO" ]]; then
    error "Agent repo not found: $AGENT_REPO"
    exit 1
  fi
  [[ -d "$AGENT_REPO/chart" ]] || { error "Agent repo missing chart/: $AGENT_REPO"; exit 1; }
  AGENT_REPO="$(cd "$AGENT_REPO" && pwd)"
  info "Agent repo: $AGENT_REPO"
fi

# GCP key for Vertex AI
GCP_KEY=""
if [[ -n "${ANTHROPIC_VERTEX_PROJECT_ID:-}" ]]; then
  if [[ -z "$GCP_KEY_FILE" ]]; then
    GCP_KEY_FILE="$HOME/.config/gcloud/application_default_credentials.json"
  fi
  [[ -f "$GCP_KEY_FILE" ]] || { error "GCP key not found: $GCP_KEY_FILE"; exit 1; }
  GCP_KEY="$GCP_KEY_FILE"
  info "GCP credentials: $GCP_KEY"
fi

# Resolve image tags (git SHA if not overridden)
if [[ -z "$UI_TAG" ]]; then
  UI_TAG=$(git_tag "$PROJECT_DIR")
fi
if [[ -z "$AGENT_TAG" && "$NO_AGENT" == "false" ]]; then
  AGENT_TAG=$(git_tag "$AGENT_REPO")
fi

info "UI tag: $UI_TAG"
[[ "$NO_AGENT" == "false" ]] && info "Agent tag: $AGENT_TAG"
info "All preflight checks passed"

# ─── Phase 1: Detect Cluster Configuration ──────────────────────────────────

step "Detecting cluster configuration"

# Ensure namespace exists
oc get namespace "$NAMESPACE" &>/dev/null || oc create namespace "$NAMESPACE"

# OAuth proxy image
OAUTH_TAG=$(oc get imagestream oauth-proxy -n openshift -o jsonpath='{.status.tags[0].tag}' 2>/dev/null || echo "")
if [[ -z "$OAUTH_TAG" ]]; then
  warn "oauth-proxy ImageStream not found — using registry.redhat.io fallback"
  OAUTH_IMAGE="registry.redhat.io/openshift4/ose-oauth-proxy:v4.17"
else
  OAUTH_IMAGE="image-registry.openshift-image-registry.svc:5000/openshift/oauth-proxy:${OAUTH_TAG}"
fi
info "OAuth proxy: $OAUTH_IMAGE"

# Cluster apps domain
CLUSTER_DOMAIN=$(oc get ingresses.config.openshift.io cluster -o jsonpath='{.spec.domain}' 2>/dev/null || echo "")
if [[ -z "$CLUSTER_DOMAIN" ]]; then
  error "Could not detect cluster apps domain."
  exit 1
fi
info "Apps domain: $CLUSTER_DOMAIN"

# Monitoring stack
MONITORING_ENABLED="false"
if oc get service thanos-querier -n openshift-monitoring -o name &>/dev/null; then
  MONITORING_ENABLED="true"
fi

# Agent deployment name
AGENT_DEPLOY="${AGENT_RELEASE}-openshift-sre-agent"

info "Namespace: $NAMESPACE"

# ─── Dry Run Mode ───────────────────────────────────────────────────────────

if [[ "$DRY_RUN" == "true" ]]; then
  step "Dry Run Summary"
  echo ""
  echo "  Cluster:       $CLUSTER_API"
  echo "  Namespace:     $NAMESPACE"
  echo "  UI image:      ${UI_IMAGE}:${UI_TAG}"
  if [[ "$NO_AGENT" == "false" ]]; then
    echo "  Agent image:   ${AGENT_IMAGE}:${AGENT_TAG}"
    if [[ -n "${ANTHROPIC_VERTEX_PROJECT_ID:-}" ]]; then
      echo "  AI backend:    Vertex AI (${ANTHROPIC_VERTEX_PROJECT_ID} / ${CLOUD_ML_REGION:-us-east5})"
    elif [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
      echo "  AI backend:    Anthropic API (direct)"
    fi
  else
    echo "  Agent:         not deployed"
  fi
  echo "  OAuth proxy:   $OAUTH_IMAGE"
  echo "  Monitoring:    $MONITORING_ENABLED"
  echo "  Apps domain:   $CLUSTER_DOMAIN"
  echo ""
  echo "  Deploy order:"
  echo "    1. Build UI image (npm build + podman)"
  [[ "$NO_AGENT" == "false" ]] && echo "    2. Build Agent image (podman) — parallel with UI"
  [[ "$NO_AGENT" == "false" ]] && echo "    3. Helm install Agent (creates WS token)"
  [[ "$NO_AGENT" == "false" ]] && echo "    4. Read WS token from agent secret"
  echo "    5. Helm install UI (with agent token)"
  echo "    6. Restart + health check + token sync verify"
  echo ""
  info "Dry run complete — no changes made"
  exit 0
fi

# ─── Phase 2: Build & Push Images (parallel) ────────────────────────────────

if [[ "$SKIP_BUILD" == "false" ]]; then
  step "Building & pushing images"

  # Build UI: npm first (must complete before podman), then podman
  cd "$PROJECT_DIR"
  npm run build --silent
  info "UI built (dist/)"

  if [[ "$NO_AGENT" == "false" ]]; then
    # Build UI and Agent images in parallel
    info "Building UI and Agent images in parallel..."

    # UI image build in background
    podman build --platform linux/amd64 -t "${UI_IMAGE}:${UI_TAG}" "$PROJECT_DIR" &>/tmp/pulse-ui-build.log &
    UI_BUILD_PID=$!

    # Agent image build in foreground (shows progress)
    cd "$AGENT_REPO"
    AGENT_DOCKERFILE="Dockerfile"
    [[ -f "Dockerfile.full" ]] && AGENT_DOCKERFILE="Dockerfile.full"
    podman build --platform linux/amd64 -t "${AGENT_IMAGE}:${AGENT_TAG}" -f "$AGENT_DOCKERFILE" .
    info "Agent image built"

    # Wait for UI build
    if wait $UI_BUILD_PID; then
      info "UI image built"
    else
      error "UI image build failed. Logs:"
      cat /tmp/pulse-ui-build.log
      exit 1
    fi

    # Push both (also tag as latest for convenience)
    info "Pushing images..."
    podman tag "${UI_IMAGE}:${UI_TAG}" "${UI_IMAGE}:latest"
    podman tag "${AGENT_IMAGE}:${AGENT_TAG}" "${AGENT_IMAGE}:latest"

    podman push "${UI_IMAGE}:${UI_TAG}" &>/tmp/pulse-ui-push.log &
    UI_PUSH_PID=$!

    podman push "${AGENT_IMAGE}:${AGENT_TAG}"
    podman push "${AGENT_IMAGE}:latest"
    info "Pushed ${AGENT_IMAGE}:${AGENT_TAG} + latest"

    if wait $UI_PUSH_PID; then
      podman push "${UI_IMAGE}:latest"
      info "Pushed ${UI_IMAGE}:${UI_TAG} + latest"
    else
      error "UI image push failed"
      cat /tmp/pulse-ui-push.log
      exit 1
    fi
  else
    # UI only — sequential
    podman build --platform linux/amd64 -t "${UI_IMAGE}:${UI_TAG}" .
    podman tag "${UI_IMAGE}:${UI_TAG}" "${UI_IMAGE}:latest"
    podman push "${UI_IMAGE}:${UI_TAG}"
    podman push "${UI_IMAGE}:latest"
    info "Pushed ${UI_IMAGE}:${UI_TAG} + latest"
  fi
else
  info "Skipping image builds (--skip-build)"
fi

# ─── Phase 3: Deploy Agent FIRST (it generates the WS token) ────────────────

WS_TOKEN=""

if [[ "$NO_AGENT" == "false" ]]; then
  step "Deploying Agent via Helm (creates WS token)"
  cd "$AGENT_REPO"

  # Create secrets BEFORE Helm install
  if [[ -n "$GCP_KEY" ]]; then
    oc delete secret gcp-sa-key -n "$NAMESPACE" 2>/dev/null || true
    oc create secret generic gcp-sa-key --from-file=key.json="$GCP_KEY" -n "$NAMESPACE"
    info "GCP secret: created"
  fi
  if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    oc delete secret anthropic-api-key -n "$NAMESPACE" 2>/dev/null || true
    oc create secret generic anthropic-api-key --from-literal=api-key="${ANTHROPIC_API_KEY}" -n "$NAMESPACE"
    info "Anthropic API key secret: created"
  fi

  HELM_AGENT_ARGS="--set rbac.allowWriteOperations=true --set rbac.allowSecretAccess=true"
  HELM_AGENT_ARGS="$HELM_AGENT_ARGS --set image.repository=$AGENT_IMAGE"
  HELM_AGENT_ARGS="$HELM_AGENT_ARGS --set image.tag=$AGENT_TAG"
  HELM_AGENT_ARGS="$HELM_AGENT_ARGS --set image.internalRegistry=false"

  if [[ -n "${ANTHROPIC_VERTEX_PROJECT_ID:-}" ]]; then
    HELM_AGENT_ARGS="$HELM_AGENT_ARGS --set vertexAI.projectId=${ANTHROPIC_VERTEX_PROJECT_ID}"
    HELM_AGENT_ARGS="$HELM_AGENT_ARGS --set vertexAI.region=${CLOUD_ML_REGION:-us-east5}"
    HELM_AGENT_ARGS="$HELM_AGENT_ARGS --set vertexAI.existingSecret=gcp-sa-key"
    AI_BACKEND="vertex"
    info "AI backend: Vertex AI (project: ${ANTHROPIC_VERTEX_PROJECT_ID})"
  elif [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    HELM_AGENT_ARGS="$HELM_AGENT_ARGS --set anthropicApiKey.existingSecret=anthropic-api-key"
    AI_BACKEND="anthropic"
    info "AI backend: Anthropic API (direct)"
  fi

  helm upgrade --install "$AGENT_RELEASE" chart/ \
    -n "$NAMESPACE" \
    $HELM_AGENT_ARGS \
    --timeout 120s
  info "Helm release: $AGENT_RELEASE"

  # Read the token the agent chart generated
  WS_TOKEN_SECRET="${AGENT_RELEASE}-openshift-sre-agent-ws-token"
  step "Reading WS token from agent secret"
  for i in $(seq 1 5); do
    EXISTING_TOKEN=$(oc get secret "$WS_TOKEN_SECRET" -n "$NAMESPACE" -o jsonpath='{.data.token}' 2>/dev/null || echo "")
    if [[ -n "$EXISTING_TOKEN" ]]; then
      WS_TOKEN=$(echo "$EXISTING_TOKEN" | base64 -d 2>/dev/null || echo "$EXISTING_TOKEN")
      info "WS token: read from agent secret ($WS_TOKEN_SECRET)"
      break
    fi
    sleep 2
  done
  if [[ -z "$WS_TOKEN" ]]; then
    if [[ -n "$_WS_TOKEN_OVERRIDE" ]]; then
      WS_TOKEN="$_WS_TOKEN_OVERRIDE"
      info "WS token: from environment/flag override"
    else
      WS_TOKEN=$(openssl rand -hex 16)
      warn "WS token: auto-generated (could not read agent secret)"
    fi
  fi
fi

# ─── Phase 4: Deploy UI (with agent's token) ────────────────────────────────

step "Deploying Pulse UI via Helm"
cd "$PROJECT_DIR"

AGENT_ENABLED="false"
[[ "$NO_AGENT" == "false" ]] && AGENT_ENABLED="true"

# Label namespace for Helm ownership (prevents conflict if namespace was pre-created)
oc label namespace "$NAMESPACE" app.kubernetes.io/managed-by=Helm --overwrite 2>/dev/null || true
oc annotate namespace "$NAMESPACE" meta.helm.sh/release-name=openshiftpulse meta.helm.sh/release-namespace="$NAMESPACE" --overwrite 2>/dev/null || true

HELM_UI_ARGS=""
HELM_UI_ARGS="$HELM_UI_ARGS --set image.repository=$UI_IMAGE"
HELM_UI_ARGS="$HELM_UI_ARGS --set image.tag=$UI_TAG"
HELM_UI_ARGS="$HELM_UI_ARGS --set oauthProxy.image=$OAUTH_IMAGE"
HELM_UI_ARGS="$HELM_UI_ARGS --set route.clusterDomain=$CLUSTER_DOMAIN"
HELM_UI_ARGS="$HELM_UI_ARGS --set agent.enabled=$AGENT_ENABLED"
HELM_UI_ARGS="$HELM_UI_ARGS --set agent.serviceName=$AGENT_DEPLOY"
HELM_UI_ARGS="$HELM_UI_ARGS --set monitoring.prometheus.enabled=$MONITORING_ENABLED"
HELM_UI_ARGS="$HELM_UI_ARGS --set monitoring.alertmanager.enabled=$MONITORING_ENABLED"
if [[ -n "$WS_TOKEN" ]]; then
  HELM_UI_ARGS="$HELM_UI_ARGS --set agent.wsToken=$WS_TOKEN"
fi

helm upgrade --install openshiftpulse deploy/helm/openshiftpulse/ \
  -n "$NAMESPACE" --create-namespace \
  $HELM_UI_ARGS \
  --timeout 120s
info "Helm release: openshiftpulse"

# Fix OAuth redirect URI
ROUTE=$(wait_for_route "openshiftpulse" "$NAMESPACE")
if [[ -n "$ROUTE" ]]; then
  oc patch oauthclient openshiftpulse --type merge \
    -p "{\"redirectURIs\":[\"https://${ROUTE}/oauth/callback\"]}" 2>/dev/null || true
  info "OAuth redirect: https://$ROUTE/oauth/callback"
else
  warn "Route not ready — OAuth redirect URI may need manual fix"
fi

# ─── Phase 5: Restart & Verify ───────────────────────────────────────────────

step "Restarting deployments"
oc rollout restart "deployment/openshiftpulse" -n "$NAMESPACE"
wait_for_rollout "openshiftpulse" "$NAMESPACE" 120

if [[ "$NO_AGENT" == "false" ]]; then
  oc rollout restart "deployment/$AGENT_DEPLOY" -n "$NAMESPACE"
  wait_for_rollout "$AGENT_DEPLOY" "$NAMESPACE" 120
fi

# ─── Phase 6: Health & Token Verification ────────────────────────────────────

HEALTHY="n/a"
AI_BACKEND="${AI_BACKEND:-none}"

if [[ "$NO_AGENT" == "false" ]]; then
  step "Health verification"

  HEALTHY=false
  for i in $(seq 1 12); do
    sleep 10
    HEALTH=$(oc exec "deployment/$AGENT_DEPLOY" -n "$NAMESPACE" -- curl -sf http://localhost:8080/healthz 2>/dev/null || echo "")
    if [[ "$HEALTH" == *"ok"* ]]; then
      HEALTHY=true
      info "Agent healthy!"
      VERSION=$(oc exec "deployment/$AGENT_DEPLOY" -n "$NAMESPACE" -- curl -sf http://localhost:8080/version 2>/dev/null || echo "")
      [[ -n "$VERSION" ]] && info "Agent: $VERSION"
      break
    fi
    [[ $i -eq 12 ]] && warn "Agent health check failed after 120s"
  done

  # Verify WS token sync
  step "Verifying WS token sync"
  WS_TOKEN_AGENT=$(oc exec "deployment/$AGENT_DEPLOY" -n "$NAMESPACE" -- env 2>/dev/null | grep PULSE_AGENT_WS_TOKEN | cut -d= -f2 || echo "")
  WS_TOKEN_NGINX=$(oc get configmap openshiftpulse-nginx -n "$NAMESPACE" -o jsonpath='{.data.nginx\.conf}' 2>/dev/null | grep -o 'token=[a-zA-Z0-9]*' | head -1 | cut -d= -f2 || echo "")
  if [[ -n "$WS_TOKEN_AGENT" && -n "$WS_TOKEN_NGINX" ]]; then
    if [[ "$WS_TOKEN_AGENT" == "$WS_TOKEN_NGINX" ]]; then
      info "WS token: synced ✓"
    else
      warn "WS token mismatch — auto-fixing..."
      oc get configmap openshiftpulse-nginx -n "$NAMESPACE" -o json | \
        sed "s/$WS_TOKEN_NGINX/$WS_TOKEN_AGENT/g" | oc replace -f -
      oc rollout restart deployment/openshiftpulse -n "$NAMESPACE"
      wait_for_rollout "openshiftpulse" "$NAMESPACE" 60
      info "WS token: patched and restarted UI ✓"
    fi
  fi
fi

# ─── Phase 7: Cleanup ───────────────────────────────────────────────────────

# Clean up old build pods if any remain from previous S2I deploys
oc delete pod -n "$NAMESPACE" -l openshift.io/build.name --field-selector=status.phase!=Running 2>/dev/null || true
# Clean up orphaned S2I BuildConfigs/ImageStreams from previous deploys
oc delete bc -n "$NAMESPACE" --all 2>/dev/null || true
oc delete is openshiftpulse pulse-agent pulse-agent-deps -n "$NAMESPACE" 2>/dev/null || true

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════"
if [[ "$HEALTHY" == "true" ]]; then
  info "Deploy complete! (UI + Agent)"
elif [[ "$NO_AGENT" == "true" ]]; then
  info "Deploy complete! (UI only)"
else
  warn "Agent health check did not pass — it may still be starting"
fi
echo ""
echo "  URL:       https://$ROUTE"
echo "  Cluster:   $CLUSTER_API"
echo "  NS:        $NAMESPACE"
echo "  UI image:  ${UI_IMAGE}:${UI_TAG}"
if [[ "$NO_AGENT" == "false" ]]; then
  echo "  Agent img: ${AGENT_IMAGE}:${AGENT_TAG}"
  echo "  AI:        $AI_BACKEND"
  VERSION=$(oc exec "deployment/$AGENT_DEPLOY" -n "$NAMESPACE" -- curl -sf http://localhost:8080/version 2>/dev/null || echo "unknown")
  echo "  Agent:     $VERSION"
fi
echo ""
echo "  Uninstall:         $0 --uninstall"
echo "  Integration tests: ./deploy/integration-test.sh --namespace $NAMESPACE"
echo "════════════════════════════════════════════"
