#!/usr/bin/env bash
set -Eeuo pipefail

readonly PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

usage() {
  cat <<'EOF'
Usage: ./manage.sh <command> [options]

Commands:
  run            Build the workspace packages and start the development server
  build          Create a production build in dist/
  test           Run the full test suite (games + finmath + quantlibjs)
  lint           Lint the source
  compile        Build the workspace packages and type-check the application
  preview        Preview the production build
  help           Show this help

Extra options after run are passed to Vite, for example:
  ./manage.sh run --host 0.0.0.0
EOF
}

require_node() {
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "error: Node.js 18+ and npm are required" >&2
    exit 1
  fi

  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if (( node_major < 18 )); then
    echo "error: Node.js 18+ is required (found $(node --version))" >&2
    exit 1
  fi
}

require_dependencies() {
  if [[ ! -d node_modules ]]; then
    echo "Dependencies are missing; run 'npm install' first." >&2
    exit 1
  fi
}

command="${1:-help}"
if (( $# > 0 )); then
  shift
fi

case "$command" in
  run)
    require_node
    require_dependencies
    npm run dev -- "$@"
    ;;
  build)
    require_node
    require_dependencies
    npm run build -- "$@"
    ;;
  test)
    require_node
    require_dependencies
    npm test
    ;;
  lint)
    require_node
    require_dependencies
    npm run lint
    ;;
  compile)
    require_node
    require_dependencies
    npm run build:packages
    npm exec -- tsc -b "$@"
    ;;
  preview)
    require_node
    require_dependencies
    npm run preview -- "$@"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "error: unknown command '$command'" >&2
    echo >&2
    usage >&2
    exit 2
    ;;
esac
