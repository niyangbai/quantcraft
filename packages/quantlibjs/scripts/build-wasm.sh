#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
TOOLCHAIN_ROOT="${TOOLCHAIN_ROOT:-$REPO_ROOT/.wasm-toolchain}"

EMSDK_ROOT="${EMSDK_ROOT:-${EMSDK:-$TOOLCHAIN_ROOT/emsdk}}"
QUANTLIB_SOURCE="${QUANTLIB_SOURCE:-$TOOLCHAIN_ROOT/quantlib}"
QUANTLIB_BUILD="${QUANTLIB_BUILD:-$TOOLCHAIN_ROOT/quantlib-build}"
BOOST_ROOT="${BOOST_ROOT:-$TOOLCHAIN_ROOT/boost_1_88_0}"

test -f "$EMSDK_ROOT/emsdk_env.sh" || {
  echo "Emscripten SDK not found: $EMSDK_ROOT" >&2
  exit 1
}

test -d "$QUANTLIB_SOURCE" || {
  echo "QuantLib source not found: $QUANTLIB_SOURCE" >&2
  exit 1
}

test -d "$QUANTLIB_BUILD" || {
  echo "QuantLib build directory not found: $QUANTLIB_BUILD" >&2
  exit 1
}

test -d "$BOOST_ROOT" || {
  echo "Boost not found: $BOOST_ROOT" >&2
  exit 1
}

source "$EMSDK_ROOT/emsdk_env.sh" >/dev/null

command -v em++ >/dev/null || {
  echo "em++ is not available after loading EMSDK: $EMSDK_ROOT" >&2
  exit 1
}

test -f "$QUANTLIB_BUILD/ql/libQuantLib.a" || {
  echo "QuantLib static library not found: $QUANTLIB_BUILD/ql/libQuantLib.a" >&2
  exit 1
}

test -f "$ROOT/cpp/bindings.cpp" || {
  echo "Bindings source not found: $ROOT/cpp/bindings.cpp" >&2
  exit 1
}

mkdir -p "$ROOT/wasm"

echo "Building QuantLib WASM..."
echo "  EMSDK:     $EMSDK_ROOT"
echo "  QuantLib:  $QUANTLIB_SOURCE"
echo "  Build:     $QUANTLIB_BUILD"
echo "  Boost:     $BOOST_ROOT"

em++ \
  "$ROOT/cpp/bindings.cpp" \
  "$QUANTLIB_BUILD/ql/libQuantLib.a" \
  -I"$QUANTLIB_BUILD" \
  -I"$QUANTLIB_SOURCE" \
  -I"$BOOST_ROOT" \
  --bind \
  -std=c++17 \
  -O3 \
  -flto \
  -fexceptions \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 \
  -sFILESYSTEM=0 \
  -sASSERTIONS=0 \
  -o "$ROOT/wasm/quantlib.mjs"

printf 'Built QuantLib WASM at %s\n' "$ROOT/wasm/quantlib.mjs"