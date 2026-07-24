#!/usr/bin/env bash
set -euo pipefail

NODE_BIN="/opt/homebrew/opt/node@20/bin/node"
NPM_BIN="/opt/homebrew/opt/node@20/bin/npm"
DRIZZLE_BIN="./node_modules/drizzle-kit/bin.cjs"
ESBUILD_DIR="/tmp/treeschool-esbuild-fix"
ESBUILD_BIN="${ESBUILD_DIR}/node_modules/.bin/esbuild"

if [[ ! -x "${NODE_BIN}" ]]; then
  echo "Node 20 is required at ${NODE_BIN}. Install it first." >&2
  exit 1
fi

if [[ ! -x "${ESBUILD_BIN}" ]]; then
  mkdir -p "${ESBUILD_DIR}"
  PATH="/opt/homebrew/opt/node@20/bin:${PATH}" "${NPM_BIN}" --prefix "${ESBUILD_DIR}" install esbuild@0.19.12 >/dev/null
fi

ESBUILD_BINARY_PATH="${ESBUILD_BIN}" "${NODE_BIN}" "${DRIZZLE_BIN}" "$@"
