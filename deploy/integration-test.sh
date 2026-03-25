#!/usr/bin/env bash
# Integration test — verifies Pulse UI + Agent are deployed and connected.
# Run after deploy.sh. Exits 0 if all checks pass, 1 on failure.
#
# Usage: ./deploy/integration-test.sh [--namespace openshiftpulse]

set -euo pipefail

NAMESPACE="${1:-openshiftpulse}"
FAILURES=0

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAILURES=$((FAILURES + 1)); }

echo "=== Pulse Integration Test ==="
echo "Namespace: $NAMESPACE"
echo ""

# 1. Pods running
echo "[Pods]"
UI_PODS=$(oc get pods -n "$NAMESPACE" -l app=openshiftpulse --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l | tr -d ' ')
AGENT_PODS=$(oc get pods -n "$NAMESPACE" -l app.kubernetes.io/instance=pulse-agent --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l | tr -d ' ')
[[ "$UI_PODS" -ge 1 ]] && pass "Pulse UI: $UI_PODS pod(s) running" || fail "Pulse UI: no pods running"
[[ "$AGENT_PODS" -ge 1 ]] && pass "Agent: $AGENT_PODS pod(s) running" || fail "Agent: no pods running"

# 2. Agent health endpoint
echo ""
echo "[Agent Health]"
HEALTH=$(oc exec deployment/pulse-agent-openshift-sre-agent -n "$NAMESPACE" -- curl -sf http://localhost:8080/healthz 2>/dev/null || echo "")
[[ "$HEALTH" == *'"ok"'* ]] && pass "GET /healthz → ok" || fail "GET /healthz failed"

# 3. Agent version endpoint
VERSION=$(oc exec deployment/pulse-agent-openshift-sre-agent -n "$NAMESPACE" -- curl -sf http://localhost:8080/version 2>/dev/null || echo "")
[[ "$VERSION" == *'"protocol"'* ]] && pass "GET /version → $(echo "$VERSION" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(f"protocol={d[\"protocol\"]}, tools={d[\"tools\"]}")' 2>/dev/null || echo "$VERSION")" || fail "GET /version failed"

# 4. Agent tools endpoint
TOOLS=$(oc exec deployment/pulse-agent-openshift-sre-agent -n "$NAMESPACE" -- curl -sf http://localhost:8080/tools 2>/dev/null || echo "")
[[ "$TOOLS" == *'"sre"'* ]] && pass "GET /tools → SRE tools available" || fail "GET /tools failed"

# 5. WebSocket connectivity (via nginx proxy)
echo ""
echo "[WebSocket Auth]"
WS_TOKEN=$(oc get deployment/pulse-agent-openshift-sre-agent -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="PULSE_AGENT_WS_TOKEN")].value}' 2>/dev/null || echo "")
[[ -n "$WS_TOKEN" ]] && pass "PULSE_AGENT_WS_TOKEN is set" || fail "PULSE_AGENT_WS_TOKEN not set — WS auth will fail"

# 6. Nginx proxy config
echo ""
echo "[Nginx Proxy]"
NGINX_CONF=$(oc exec deployment/openshiftpulse -c openshiftpulse -n "$NAMESPACE" -- cat /etc/nginx/nginx.conf 2>/dev/null || echo "")
[[ "$NGINX_CONF" == *"/api/agent/"* ]] && pass "nginx proxies /api/agent/" || fail "nginx missing /api/agent/ proxy"
[[ "$NGINX_CONF" == *"ws/sre"* ]] && pass "nginx has /ws/sre location" || fail "nginx missing /ws/sre location"
[[ "$NGINX_CONF" == *"token="* ]] && pass "nginx injects WS token" || fail "nginx not injecting WS token"

# 7. OAuth redirect
echo ""
echo "[OAuth]"
ROUTE=$(oc get route openshiftpulse -n "$NAMESPACE" -o jsonpath='{.spec.host}' 2>/dev/null || echo "")
REDIRECT=$(oc get oauthclient openshiftpulse -o jsonpath='{.redirectURIs[0]}' 2>/dev/null || echo "")
[[ "$REDIRECT" == *"$ROUTE"* ]] && pass "OAuth redirectURI matches route" || fail "OAuth redirectURI ($REDIRECT) does not match route ($ROUTE)"

# 8. GCP credentials (if Vertex AI)
echo ""
echo "[Vertex AI]"
PROJECT=$(oc get deployment/pulse-agent-openshift-sre-agent -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="ANTHROPIC_VERTEX_PROJECT_ID")].value}' 2>/dev/null || echo "")
[[ -n "$PROJECT" ]] && pass "Vertex AI project: $PROJECT" || echo "  - Vertex AI not configured (using Anthropic API key?)"
GCP_CREDS=$(oc get deployment/pulse-agent-openshift-sre-agent -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="GOOGLE_APPLICATION_CREDENTIALS")].value}' 2>/dev/null || echo "")
[[ -n "$GCP_CREDS" ]] && pass "GCP credentials mounted at $GCP_CREDS" || echo "  - GCP credentials not mounted"

# 9. NetworkPolicy check
echo ""
echo "[Network]"
NP=$(oc get networkpolicy pulse-agent-openshift-sre-agent -n "$NAMESPACE" 2>/dev/null && echo "exists" || echo "none")
[[ "$NP" == "none" ]] && pass "No restrictive NetworkPolicy (egress allowed)" || fail "NetworkPolicy exists — may block GCP/DNS egress"

# Results
echo ""
echo "========================"
if [[ $FAILURES -eq 0 ]]; then
  echo "ALL CHECKS PASSED"
  echo "URL: https://$ROUTE"
  exit 0
else
  echo "$FAILURES CHECK(S) FAILED"
  exit 1
fi
