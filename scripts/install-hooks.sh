#!/bin/bash
# Install git hooks for OpenshiftPulse
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_DIR="$SCRIPT_DIR/.git/hooks"

echo "Installing pre-commit hook..."

cat > "$HOOK_DIR/pre-commit" << 'HOOK'
#!/bin/bash
# Pre-commit hook: type-check + test + build
echo "Running pre-commit checks..."
npm run type-check || exit 1
npm run test || exit 1
echo "Pre-commit checks passed."
HOOK

chmod +x "$HOOK_DIR/pre-commit"
echo "Done. Pre-commit hook installed."
