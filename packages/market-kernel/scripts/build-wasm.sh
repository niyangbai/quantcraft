#!/usr/bin/env bash
set -euo pipefail
: "${EMSDK_ROOT:?Set EMSDK_ROOT}"
: "${QUANTLIB_SOURCE:?Set QUANTLIB_SOURCE to QuantLib v1.43}"
: "${QUANTLIB_BUILD:?Set QUANTLIB_BUILD}"
: "${BOOST_ROOT:?Set BOOST_ROOT}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$EMSDK_ROOT/emsdk_env.sh" >/dev/null
mkdir -p "$ROOT/wasm"
em++ "$ROOT/cpp/bindings.cpp" "$QUANTLIB_BUILD/ql/libQuantLib.a" -I"$QUANTLIB_BUILD" -I"$QUANTLIB_SOURCE" -I"$BOOST_ROOT" \
 --bind -std=c++17 -O3 -flto -fexceptions -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
 -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 -sASSERTIONS=0 -o "$ROOT/wasm/quantlib.mjs"
