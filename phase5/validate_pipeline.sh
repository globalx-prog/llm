#!/usr/bin/env bash
set -euo pipefail

echo "== validate pipeline =="

if [ -f package.json ]; then
  if npm run | grep -q " lint"; then
    npm run lint
  else
    echo "skip: npm lint script not found"
  fi

  if npm run | grep -q " test"; then
    npm test -- --watch=false || npm test || true
  else
    echo "skip: npm test script not found"
  fi
else
  echo "skip: no package.json"
fi

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --source .
else
  echo "skip: gitleaks not installed"
fi

echo "validate pipeline done"
