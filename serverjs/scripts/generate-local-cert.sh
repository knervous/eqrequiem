#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$ROOT_DIR/certs"
CERT_PEM="$CERT_DIR/wt-dev-localhost-cert.pem"
KEY_PEM="$CERT_DIR/wt-dev-localhost-key.pem"
EXTFILE="$CERT_DIR/wt-dev-localhost-ext.cnf"
CSR_FILE="$CERT_DIR/wt-dev-localhost.csr"

mkdir -p "$CERT_DIR"

cat > "$EXTFILE" <<'EOF'
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = localhost

[v3_req]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth,clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

openssl req \
  -nodes \
  -newkey rsa:2048 \
  -keyout "$KEY_PEM" \
  -out "$CSR_FILE" \
  -sha256 \
  -config "$EXTFILE"

openssl x509 \
  -req \
  -in "$CSR_FILE" \
  -signkey "$KEY_PEM" \
  -out "$CERT_PEM" \
  -sha256 \
  -days 825 \
  -extensions v3_req \
  -extfile "$EXTFILE"

rm -f "$EXTFILE" "$CSR_FILE"

echo "Generated:"
echo "  $CERT_PEM"
echo "  $KEY_PEM"
echo ""
echo "Next (macOS trust):"
echo "  npm run cert:dev:trust:mac"
