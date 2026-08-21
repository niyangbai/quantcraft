import { QuantLibRuntime } from "@quantcraft/quantlibjs";
import moduleUrl from "../packages/quantlibjs/wasm/quantlib.mjs?url";
import wasmUrl from "../packages/quantlibjs/wasm/quantlib.wasm?url";

let runtimePromise: Promise<QuantLibRuntime> | undefined;

export function getQuantLib() {
  runtimePromise ??= QuantLibRuntime.create({ moduleUrl, wasmUrl });
  return runtimePromise;
}
