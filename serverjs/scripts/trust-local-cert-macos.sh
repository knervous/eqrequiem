#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script is for macOS only."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_PEM="$ROOT_DIR/certs/wt-dev-localhost-cert.pem"

if [[ ! -f "$CERT_PEM" ]]; then
  echo "Missing cert: $CERT_PEM"
  echo "Run: npm run cert:dev:generate"
  exit 1
fi

security add-trusted-cert \
  -d \
  -r trustRoot \
  -k "$HOME/Library/Keychains/login.keychain-db" \
  "$CERT_PEM"

echo "Trusted local cert in login keychain:"
echo "  $CERT_PEM"
