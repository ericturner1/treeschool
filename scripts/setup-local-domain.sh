#!/usr/bin/env bash
set -euo pipefail

DOMAIN="dev.treehomeschool.com"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${ROOT_DIR}/docker/certs"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert is required. Install it with: brew install mkcert"
  exit 1
fi

mkdir -p "${CERT_DIR}"
mkcert -install
mkcert \
  -cert-file "${CERT_DIR}/${DOMAIN}.pem" \
  -key-file "${CERT_DIR}/${DOMAIN}-key.pem" \
  "${DOMAIN}"

if ! grep -Eq "^[[:space:]]*127\\.0\\.0\\.1[[:space:]]+.*\\b${DOMAIN//./\\.}\\b" /etc/hosts; then
  echo
  echo "Add the local hostname with:"
  echo "  echo '127.0.0.1 ${DOMAIN}' | sudo tee -a /etc/hosts"
fi

echo
echo "Local TLS is ready for https://${DOMAIN}"
