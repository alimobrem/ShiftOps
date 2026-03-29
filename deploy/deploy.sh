#!/usr/bin/env bash
# Deploy OpenShift Pulse (UI + Agent) to an OpenShift cluster.
#
# Usage:
#   ./deploy/deploy.sh                                  # UI only (no agent)
#   ./deploy/deploy.sh --agent-repo /path/to/pulse-agent # UI + Agent
#   ANTHROPIC_API_KEY=sk-ant-... ./deploy/deploy.sh --agent-repo ../open
#
# Prerequisites: oc (logged in), helm, npm

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_REPO=""
NO_AGENT=false
NAMESPACE="openshiftpulse"
AGENT_RELEASE="pulse-agent"
# WS token — resolved after namespace is known (see below)
_WS_TOKEN_OVERRIDE="${PULSE_AGENT_WS_TOKEN:-}"
GCP_KEY_FILE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --agent-repo) AGENT_REPO="$2"; shift 2 ;;
    --no-agent)   NO_AGENT=true; shift ;;
    --namespace)  NAMESPACE="$2"; shift 2 ;;
    --ws-token)   WS_TOKEN="$2"; shift 2 ;;
    --gcp-key)    GCP_KEY_FILE="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--agent-repo /path/to/pulse-agent] [options]"
      echo ""
      echo "Options:"
      echo "  --agent-repo PATH   Path to pulse-agent repo (deploys UI + Agent)"
      echo "  --no-agent          Deploy UI only, skip agent"
      echo "  --namespace NS      Target namespace (default: openshiftpulse)"
      echo "  --gcp-key PATH      GCP service account JSON for Vertex AI"
      echo "  --ws-token TOKEN    WebSocket auth token (auto-generated if unset)"
      echo ""
      echo "AI Backend (pick one):"
      echo "  Option A — Vertex AI (recommended for GCP):"
      echo "    ANTHROPIC_VERTEX_PROJECT_ID=proj CLOUD_ML_REGION=us-east5 \\"
      echo "      $0 --agent-repo ../open --gcp-key ~/sa-key.json"
      echo ""
      echo "  Option B — Anthropic API directly:"
      echo "    ANTHROPIC_API_KEY=sk-ant-... $0 --agent-repo ../open"
      echo ""
      echo "Environment variables:"
      echo "  ANTHROPIC_VERTEX_PROJECT_ID  GCP project for Vertex AI"
      echo "  CLOUD_ML_REGION             GCP region (e.g., us-east5)"
      echo "  ANTHROPIC_API_KEY           Direct Anthropic API key (alternative to Vertex)"
      echo "  PULSE_AGENT_WS_TOKEN        WebSocket auth token (auto-generated if unset)"
      exit 0 ;;
    *) echo "ERROR: Unknown argument: $1. Use --help for usage."; exit 1 ;;
  esac
done

# ─── Helper Functions ────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step()  { echo ""; echo -e "═══ $1 ═══"; }

wait_for_rollout() {
  local deploy="$1" ns="$2" timeout="${3:-120}"
  info "Waiting for $deploy to be ready (timeout: ${timeout}s)..."
  if ! oc rollout status "deployment/$deploy" -n "$ns" --timeout="${timeout}s" 2>/dev/null; then
    warn "Rollout not complete within ${timeout}s — continuing anyway"
  fi
}

wait_for_route() {
  local name="$1" ns="$2"
  local host=""
  for i in $(seq 1 10); do
    host=$(oc get route "$name" -n "$ns" -o jsonpath='{.spec.host}' 2>/dev/null || echo "")
    [[ -n "$host" ]] && echo "$host" && return 0
    sleep 2
  done
  echo ""
}

# Cross-platform hash (works on macOS and Linux)
file_hash() {
  if command -v shasum &>/dev/null; then
    shasum -a 256 "$1" | cut -d' ' -f1
  elif command -v sha256sum &>/dev/null; then
    sha256sum "$1" | cut -d' ' -f1
  else
    # Fallback to md5
    md5 -q "$1" 2>/dev/null || md5sum "$1" | cut -d' ' -f1
  fi
}

# ─── Phase 0: Preflight Checks (fail fast) ────────────────────────────────

step "Preflight checks"

# Required tools
for cmd in oc helm npm; do
  command -v "$cmd" &>/dev/null || { error "'$cmd' not found. Install it and try again."; exit 1; }
done
oc whoami &>/dev/null || { error "Not logged in to OpenShift. Run 'oc login' first."; exit 1; }
info "Tools: oc, helm, npm — OK"

CLUSTER_API=$(oc whoami --show-server)
info "Cluster: $CLUSTER_API"

# Credentials — require an AI backend when deploying the agent
if [[ -z "$AGENT_REPO" ]]; then
  NO_AGENT=true
  warn "No --agent-repo provided — deploying UI only (use --agent-repo to include the agent)"
fi
if [[ "$NO_AGENT" == "false" ]]; then
  if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${ANTHROPIC_VERTEX_PROJECT_ID:-}" ]]; then
    error "No AI backend configured"
    error "  Set ANTHROPIC_API_KEY=sk-ant-... or ANTHROPIC_VERTEX_PROJECT_ID=..."
    exit 1
  fi
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

# Agent repo validation
if [[ "$NO_AGENT" == "false" ]]; then
  if [[ ! -d "$AGENT_REPO" ]]; then
    error "Agent repo not found: $AGENT_REPO"
    exit 1
  fi
  [[ -d "$AGENT_REPO/chart" ]] || { error "Agent repo missing chart/: $AGENT_REPO"; exit 1; }
  [[ -f "$AGENT_REPO/chart/Chart.yaml" ]] || { error "Agent repo missing chart/Chart.yaml: $AGENT_REPO"; exit 1; }
  helm lint "$AGENT_REPO/chart/" --set vertexAI.projectId=x --set vertexAI.region=y >/dev/null 2>&1 || { error "Helm lint failed for agent chart"; exit 1; }
  AGENT_REPO="$(cd "$AGENT_REPO" && pwd)"
  info "Agent repo: $AGENT_REPO"
else
  info "Agent: skipped (UI-only deploy)"
fi

# ─── Detect Cluster Configuration ───────────────────────────────────────────

step "Detecting cluster configuration"

# Ensure namespace exists
oc get namespace "$NAMESPACE" &>/dev/null || oc create namespace "$NAMESPACE"

# Quota check
QUOTA_CPU=$(oc get resourcequota -n "$NAMESPACE" -o jsonpath='{.items[0].status.hard.limits\.cpu}' 2>/dev/null || echo "")
if [[ -n "$QUOTA_CPU" ]]; then
  CPU_NUM=$(echo "$QUOTA_CPU" | sed 's/[^0-9]//g')
  if [[ "$CPU_NUM" -lt 3 ]]; then
    warn "CPU quota is only ${QUOTA_CPU} — may be insufficient. Recommended: 4+ cores"
  fi
fi

# OAuth proxy image — use the cluster's own oauth-proxy ImageStream
OAUTH_TAG=$(oc get imagestream oauth-proxy -n openshift -o jsonpath='{.status.tags[0].tag}' 2>/dev/null || echo "")
if [[ -z "$OAUTH_TAG" ]]; then
  warn "oauth-proxy ImageStream not found — using registry.redhat.io fallback"
  OAUTH_IMAGE="registry.redhat.io/openshift4/ose-oauth-proxy:v4.17"
else
  OAUTH_IMAGE="image-registry.openshift-image-registry.svc:5000/openshift/oauth-proxy:${OAUTH_TAG}"
fi
info "OAuth proxy: $OAUTH_IMAGE"

# Cluster apps domain (for OAuth redirect URI)
CLUSTER_DOMAIN=$(oc get ingresses.config.openshift.io cluster -o jsonpath='{.spec.domain}' 2>/dev/null || echo "")
if [[ -z "$CLUSTER_DOMAIN" ]]; then
  error "Could not detect cluster apps domain. Set manually:"
  error "  $0 ... # then: oc patch oauthclient openshiftpulse --type merge -p '{\"redirectURIs\":[\"https://<route>/oauth/callback\"]}'"
  exit 1
fi
info "Apps domain: $CLUSTER_DOMAIN"

# Check if monitoring stack is available
PROM_AVAILABLE=$(oc get service thanos-querier -n openshift-monitoring -o name 2>/dev/null || echo "")
if [[ -z "$PROM_AVAILABLE" ]]; then
  warn "Prometheus (thanos-querier) not found in openshift-monitoring — metrics will be disabled"
  MONITORING_ENABLED="false"
else
  MONITORING_ENABLED="true"
fi

# Agent deployment name (derived from helm release name + chart name)
AGENT_DEPLOY="${AGENT_RELEASE}-openshift-sre-agent"

info "Namespace: $NAMESPACE"
if [[ "$NO_AGENT" == "false" ]]; then
  info "Agent deploy: $AGENT_DEPLOY"
fi

# ─── Resolve WS Token ─────────────────────────────────────────────────────
# Priority: env/flag override > existing agent secret > generate new
WS_TOKEN_SECRET="${AGENT_RELEASE}-openshift-sre-agent-ws-token"
if [[ -n "$_WS_TOKEN_OVERRIDE" ]]; then
  WS_TOKEN="$_WS_TOKEN_OVERRIDE"
  info "WS token: from environment/flag"
elif EXISTING_TOKEN=$(oc get secret "$WS_TOKEN_SECRET" -n "$NAMESPACE" -o jsonpath='{.data.token}' 2>/dev/null) && [[ -n "$EXISTING_TOKEN" ]]; then
  WS_TOKEN=$(echo "$EXISTING_TOKEN" | base64 -d 2>/dev/null || echo "$EXISTING_TOKEN")
  info "WS token: read from existing secret ($WS_TOKEN_SECRET)"
else
  WS_TOKEN=$(openssl rand -hex 16 2>/dev/null || echo "pulse-agent-internal-token")
  info "WS token: auto-generated (new install)"
fi

info "All preflight checks passed"

# ─── Phase 1: Build & Deploy UI ──────────────────────────────────────────────

step "Building Pulse UI"
cd "$PROJECT_DIR"
npm run build --silent
info "Build complete"

step "Helm install/upgrade Pulse UI"
AGENT_ENABLED="false"
[[ "$NO_AGENT" == "false" ]] && AGENT_ENABLED="true"

helm upgrade --install openshiftpulse deploy/helm/openshiftpulse/ \
  -n "$NAMESPACE" --create-namespace \
  --set oauthProxy.image="$OAUTH_IMAGE" \
  --set route.clusterDomain="$CLUSTER_DOMAIN" \
  --set agent.enabled="$AGENT_ENABLED" \
  --set agent.serviceName="$AGENT_DEPLOY" \
  --set agent.wsToken="$WS_TOKEN" \
  --set monitoring.prometheus.enabled="$MONITORING_ENABLED" \
  --set monitoring.alertmanager.enabled="$MONITORING_ENABLED" \
  --timeout 120s
info "Helm release: openshiftpulse"

# Fix OAuth redirect URI using actual route host
ROUTE=$(wait_for_route "openshiftpulse" "$NAMESPACE")
if [[ -n "$ROUTE" ]]; then
  oc patch oauthclient openshiftpulse --type merge \
    -p "{\"redirectURIs\":[\"https://${ROUTE}/oauth/callback\"]}" 2>/dev/null || true
  info "OAuth redirect: https://$ROUTE/oauth/callback"
else
  warn "Route not ready — OAuth redirect URI may need manual fix"
fi

# S2I build
step "Building Pulse UI image"
oc start-build openshiftpulse --from-dir=dist --follow -n "$NAMESPACE"
info "UI image built"

if [[ "$NO_AGENT" == "false" ]]; then
# ─── Phase 2: Deploy Agent ───────────────────────────────────────────────────

step "Creating Agent secrets"
cd "$AGENT_REPO"

# Clean up old build pods to free quota
oc delete pod -n "$NAMESPACE" -l openshift.io/build.name --field-selector=status.phase!=Running 2>/dev/null || true

# Create GCP secret BEFORE Helm install
if [[ -n "$GCP_KEY" ]]; then
  oc delete secret gcp-sa-key -n "$NAMESPACE" 2>/dev/null || true
  oc create secret generic gcp-sa-key --from-file=key.json="$GCP_KEY" -n "$NAMESPACE"
  info "GCP secret: created"
fi

# Create Anthropic API key secret BEFORE Helm install
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  oc delete secret anthropic-api-key -n "$NAMESPACE" 2>/dev/null || true
  oc create secret generic anthropic-api-key --from-literal=api-key="${ANTHROPIC_API_KEY}" -n "$NAMESPACE"
  info "Anthropic API key secret: created"
fi

step "Helm install/upgrade Agent"

# Build Helm args with ALL credentials — no post-deploy patching needed
HELM_AGENT_ARGS="--set rbac.allowWriteOperations=true --set rbac.allowSecretAccess=true"
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

# Build agent image (two-stage: deps base + code overlay)
step "Building Agent image"

INTERNAL_REGISTRY="image-registry.openshift-image-registry.svc:5000"
BASE_IMAGE="${INTERNAL_REGISTRY}/${NAMESPACE}/pulse-agent-deps:latest"

# Check if deps image exists — if not, use Dockerfile.full directly
DEPS_EXISTS=true
if ! oc get istag pulse-agent-deps:latest -n "$NAMESPACE" &>/dev/null; then
  DEPS_EXISTS=false
  info "No deps image found — will use Dockerfile.full"
fi

if [[ "$DEPS_EXISTS" == "true" ]]; then
  # Ensure deps base image is up-to-date
  DEPS_HASH=$(file_hash "$AGENT_REPO/pyproject.toml")
  CURRENT_HASH=$(oc get istag pulse-agent-deps:latest -n "$NAMESPACE" \
    -o jsonpath='{.image.dockerImageMetadata.Config.Labels.deps-hash}' 2>/dev/null || echo "none")

  if [[ "$DEPS_HASH" != "$CURRENT_HASH" ]]; then
    info "Deps image needs rebuild (pyproject.toml changed)..."
    oc create imagestream pulse-agent-deps -n "$NAMESPACE" 2>/dev/null || true
    if ! oc get bc pulse-agent-deps -n "$NAMESPACE" &>/dev/null; then
      cat <<EOF | oc apply -f - -n "$NAMESPACE"
apiVersion: build.openshift.io/v1
kind: BuildConfig
metadata:
  name: pulse-agent-deps
  namespace: $NAMESPACE
spec:
  output:
    to:
      kind: ImageStreamTag
      name: "pulse-agent-deps:latest"
  source:
    type: Binary
  strategy:
    type: Docker
    dockerStrategy:
      dockerfilePath: Dockerfile.deps
EOF
    fi
    oc start-build pulse-agent-deps --from-dir=. --build-arg="DEPS_HASH=$DEPS_HASH" --follow -n "$NAMESPACE"
    info "Deps image rebuilt"
  else
    info "Deps image up-to-date (hash: ${DEPS_HASH:0:12}...)"
  fi
fi

# Ensure code BC exists
oc get bc pulse-agent -n "$NAMESPACE" &>/dev/null || \
  oc new-build --binary --name=pulse-agent --to=pulse-agent:latest -n "$NAMESPACE"

if [[ "$DEPS_EXISTS" == "true" ]]; then
  # Use deps as base
  oc patch bc pulse-agent -n "$NAMESPACE" --type=json \
    -p="[{\"op\":\"replace\",\"path\":\"/spec/strategy/dockerStrategy\",\"value\":{\"from\":{\"kind\":\"ImageStreamTag\",\"name\":\"pulse-agent-deps:latest\"},\"buildArgs\":[{\"name\":\"BASE_IMAGE\",\"value\":\"$BASE_IMAGE\"}]}}]" \
    2>/dev/null || true
else
  # Use Dockerfile.full for first deploy
  oc patch bc pulse-agent -n "$NAMESPACE" --type=json \
    -p='[{"op":"replace","path":"/spec/strategy/dockerStrategy","value":{"dockerfilePath":"Dockerfile.full"}}]' \
    2>/dev/null || true
fi

# Build code image with timeout
info "Building code image..."
if ! oc start-build pulse-agent --from-dir=. --follow -n "$NAMESPACE"; then
  if [[ "$DEPS_EXISTS" == "true" ]]; then
    # Deps image exists but build failed — try full build as fallback
    warn "Code build failed — falling back to full single-stage build..."
    oc patch bc pulse-agent -n "$NAMESPACE" --type=json \
      -p='[{"op":"replace","path":"/spec/strategy/dockerStrategy","value":{"dockerfilePath":"Dockerfile.full"}}]'
    oc start-build pulse-agent --from-dir=. --follow -n "$NAMESPACE"
    # Restore for next time
    oc patch bc pulse-agent -n "$NAMESPACE" --type=json \
      -p="[{\"op\":\"replace\",\"path\":\"/spec/strategy/dockerStrategy\",\"value\":{\"from\":{\"kind\":\"ImageStreamTag\",\"name\":\"pulse-agent-deps:latest\"}}}]"
  else
    error "Full build failed. Check build logs:"
    error "  oc logs bc/pulse-agent -n $NAMESPACE"
    exit 1
  fi
fi
info "Agent image built"

# Pin image digest
AGENT_DIGEST=$(oc get istag pulse-agent:latest -n "$NAMESPACE" -o jsonpath='{.image.dockerImageReference}')
oc set image "deployment/$AGENT_DEPLOY" "sre-agent=$AGENT_DIGEST" -n "$NAMESPACE"

fi # end NO_AGENT check

# ─── Restart & Verify ───────────────────────────────────────────────────────

step "Restarting deployments"
oc rollout restart "deployment/openshiftpulse" -n "$NAMESPACE"
wait_for_rollout "openshiftpulse" "$NAMESPACE" 120

if [[ "$NO_AGENT" == "false" ]]; then
  oc rollout restart "deployment/$AGENT_DEPLOY" -n "$NAMESPACE"
  wait_for_rollout "$AGENT_DEPLOY" "$NAMESPACE" 120
fi

# ─── Phase 3: Health Verification ────────────────────────────────────────────

HEALTHY="n/a"
AI_BACKEND="${AI_BACKEND:-none}"

if [[ "$NO_AGENT" == "false" ]]; then
  step "Health verification"

  # Wait for agent health
  HEALTHY=false
  for i in $(seq 1 12); do
    sleep 10
    HEALTH=$(oc exec "deployment/$AGENT_DEPLOY" -n "$NAMESPACE" -- curl -sf http://localhost:8080/healthz 2>/dev/null || echo "")
    if [[ "$HEALTH" == *"ok"* ]]; then
      HEALTHY=true
      info "Agent healthy!"
      VERSION=$(oc exec "deployment/$AGENT_DEPLOY" -n "$NAMESPACE" -- curl -sf http://localhost:8080/version 2>/dev/null || echo "")
      if [[ -n "$VERSION" ]]; then
        info "Agent: $VERSION"
      fi
      break
    fi
    [[ $i -eq 12 ]] && warn "Agent health check failed after 120s"
  done

  # Verify WS connectivity and auto-fix token mismatch
  WS_TOKEN_AGENT=$(oc exec "deployment/$AGENT_DEPLOY" -n "$NAMESPACE" -- env 2>/dev/null | grep PULSE_AGENT_WS_TOKEN | cut -d= -f2 || echo "")
  WS_TOKEN_NGINX=$(oc get configmap openshiftpulse-nginx -n "$NAMESPACE" -o jsonpath='{.data.nginx\.conf}' 2>/dev/null | grep -o 'token=[a-zA-Z0-9]*' | head -1 | cut -d= -f2 || echo "")
  if [[ -n "$WS_TOKEN_AGENT" && -n "$WS_TOKEN_NGINX" ]]; then
    if [[ "$WS_TOKEN_AGENT" == "$WS_TOKEN_NGINX" ]]; then
      info "WS token: synced"
    else
      warn "WS token mismatch — auto-fixing..."
      oc get configmap openshiftpulse-nginx -n "$NAMESPACE" -o json | \
        sed "s/$WS_TOKEN_NGINX/$WS_TOKEN_AGENT/g" | oc replace -f -
      oc rollout restart deployment/openshiftpulse -n "$NAMESPACE"
      info "WS token: patched nginx config and restarted UI"
    fi
  fi
fi

# ─── Phase 4: Cleanup ────────────────────────────────────────────────────────

# Clean up completed/failed build pods
oc delete pod -n "$NAMESPACE" -l openshift.io/build.name --field-selector=status.phase!=Running 2>/dev/null || true

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
if [[ "$NO_AGENT" == "false" ]]; then
  echo "  AI:        $AI_BACKEND"
  VERSION=$(oc exec "deployment/$AGENT_DEPLOY" -n "$NAMESPACE" -- curl -sf http://localhost:8080/version 2>/dev/null || echo "")
  if [[ -n "$VERSION" ]]; then
    echo "  Agent:     $VERSION"
  fi
else
  echo "  Agent:     not deployed (use --agent-repo to include)"
fi
echo ""
echo "  Run integration tests: ./deploy/integration-test.sh --namespace $NAMESPACE"
echo "════════════════════════════════════════════"
