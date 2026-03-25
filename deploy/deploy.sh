#!/usr/bin/env bash
# Deploy OpenShift Pulse + Pulse Agent to an OpenShift cluster.
# Usage: ./deploy/deploy.sh [--agent-repo /path/to/pulse-agent]
#
# Prerequisites: oc login, helm, npm

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_REPO="${AGENT_REPO:-/tmp/pulse-agent}"
NAMESPACE="openshiftpulse"
WS_TOKEN="${PULSE_AGENT_WS_TOKEN:-pulse-agent-internal-token}"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --agent-repo) AGENT_REPO="$2"; shift 2 ;;
    --namespace) NAMESPACE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "=== OpenShift Pulse Deployer ==="
echo "Namespace:  $NAMESPACE"
echo "Agent repo: $AGENT_REPO"
echo "Cluster:    $(oc whoami --show-server)"
echo ""

# 1. Detect cluster oauth-proxy image
echo "[1/8] Detecting oauth-proxy image..."
OAUTH_TAG=$(oc get imagestream oauth-proxy -n openshift -o jsonpath='{.status.tags[0].tag}' 2>/dev/null || echo "v4.4")
OAUTH_IMAGE="image-registry.openshift-image-registry.svc:5000/openshift/oauth-proxy:${OAUTH_TAG}"
echo "  Using: $OAUTH_IMAGE"

# 2. Build Pulse UI
echo "[2/8] Building Pulse UI..."
cd "$PROJECT_DIR"
npm run build --silent

# 3. Helm install/upgrade Pulse UI
echo "[3/8] Helm install/upgrade Pulse..."
if helm status openshiftpulse -n "$NAMESPACE" &>/dev/null; then
  helm upgrade openshiftpulse deploy/helm/openshiftpulse/ -n "$NAMESPACE" \
    --set oauthProxy.image="$OAUTH_IMAGE" \
    --set agent.serviceName=pulse-agent-openshift-sre-agent \
    --set agent.wsToken="$WS_TOKEN" --quiet
else
  helm install openshiftpulse deploy/helm/openshiftpulse/ -n "$NAMESPACE" --create-namespace \
    --set oauthProxy.image="$OAUTH_IMAGE" \
    --set agent.serviceName=pulse-agent-openshift-sre-agent \
    --set agent.wsToken="$WS_TOKEN"
fi

# 4. S2I build for Pulse UI
echo "[4/8] Building Pulse UI image..."
oc start-build openshiftpulse --from-dir=dist --follow -n "$NAMESPACE" 2>&1 | tail -2

# 5. Helm install/upgrade Agent
echo "[5/8] Helm install/upgrade Agent..."
cd "$AGENT_REPO"
if helm status pulse-agent -n "$NAMESPACE" &>/dev/null; then
  helm upgrade pulse-agent chart/ -n "$NAMESPACE" \
    --set rbac.allowWriteOperations=true \
    --set rbac.allowSecretAccess=true --quiet
else
  helm install pulse-agent chart/ -n "$NAMESPACE" \
    --set rbac.allowWriteOperations=true \
    --set rbac.allowSecretAccess=true
fi

# 6. Build Agent image
echo "[6/8] Building Agent image..."
oc get bc pulse-agent -n "$NAMESPACE" &>/dev/null || \
  oc new-build --binary --name=pulse-agent --to=pulse-agent:latest -n "$NAMESPACE" 2>&1 | tail -1
oc start-build pulse-agent --from-dir=. --follow -n "$NAMESPACE" 2>&1 | tail -2

# 7. Configure Agent
echo "[7/8] Configuring Agent..."
AGENT_DIGEST=$(oc get istag pulse-agent:latest -n "$NAMESPACE" -o jsonpath='{.image.dockerImageReference}')
oc set image deployment/pulse-agent-openshift-sre-agent sre-agent="$AGENT_DIGEST" -n "$NAMESPACE" 2>&1 | tail -1
oc set env deployment/pulse-agent-openshift-sre-agent \
  PULSE_AGENT_WS_TOKEN="$WS_TOKEN" \
  ANTHROPIC_VERTEX_PROJECT_ID="${ANTHROPIC_VERTEX_PROJECT_ID:-}" \
  CLOUD_ML_REGION="${CLOUD_ML_REGION:-}" \
  -n "$NAMESPACE" 2>&1 | tail -1

# Mount GCP creds if available
if [[ -f "$HOME/.config/gcloud/application_default_credentials.json" ]]; then
  oc get secret gcp-sa-key -n "$NAMESPACE" &>/dev/null || \
    oc create secret generic gcp-sa-key --from-file=key.json="$HOME/.config/gcloud/application_default_credentials.json" -n "$NAMESPACE"
  oc set volume deployment/pulse-agent-openshift-sre-agent --add --name=gcp-sa-key --secret-name=gcp-sa-key --mount-path=/var/secrets/google --read-only -n "$NAMESPACE" 2>/dev/null || true
  oc set env deployment/pulse-agent-openshift-sre-agent GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/key.json -n "$NAMESPACE" 2>&1 | tail -1
fi

# Delete restrictive NetworkPolicy if it exists
oc delete networkpolicy pulse-agent-openshift-sre-agent -n "$NAMESPACE" 2>/dev/null || true

# Fix OAuth redirect URI
ROUTE=$(oc get route openshiftpulse -n "$NAMESPACE" -o jsonpath='{.spec.host}')
oc patch oauthclient openshiftpulse --type merge -p "{\"redirectURIs\":[\"https://${ROUTE}/oauth/callback\"]}" 2>&1 | tail -1

# 8. Restart and verify
echo "[8/8] Restarting deployments..."
oc rollout restart deployment/openshiftpulse -n "$NAMESPACE"
oc rollout restart deployment/pulse-agent-openshift-sre-agent -n "$NAMESPACE"

echo ""
echo "Waiting for pods..."
sleep 20
oc get pods -n "$NAMESPACE" --field-selector=status.phase=Running --no-headers

# Verify agent health
echo ""
AGENT_HEALTH=$(oc exec deployment/pulse-agent-openshift-sre-agent -n "$NAMESPACE" -- curl -s http://localhost:8080/healthz 2>/dev/null || echo '{"status":"unknown"}')
echo "Agent health: $AGENT_HEALTH"

echo ""
echo "=== Deploy Complete ==="
echo "URL: https://$ROUTE"
echo "Agent: $(oc exec deployment/pulse-agent-openshift-sre-agent -n "$NAMESPACE" -- curl -s http://localhost:8080/version 2>/dev/null || echo 'version check unavailable')"
