import { QuantLibRuntime } from "@quantcraft/market-kernel";
import moduleUrl from "../packages/market-kernel/wasm/quantlib.mjs?url";
import wasmUrl from "../packages/market-kernel/wasm/quantlib.wasm?url";

let runtimePromise: Promise<QuantLibRuntime> | undefined;

export function getQuantLib() {
  runtimePromise ??= QuantLibRuntime.create({ moduleUrl, wasmUrl });
  return runtimePromise;
}
