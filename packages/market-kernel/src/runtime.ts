export interface EuropeanOptionInput { evaluationDate: string; maturityDate: string; spot: number; strike: number; riskFreeRate: number; dividendYield?: number; volatility: number; type: "call" | "put"; }
export interface DigitalOptionInput extends EuropeanOptionInput { cashPayoff: number; }
export interface BarrierOptionInput extends EuropeanOptionInput { barrier: number; rebate?: number; barrierType: "down-in" | "up-in" | "down-out" | "up-out"; }
export interface FixedRateBondInput { evaluationDate: string; issueDate: string; maturityDate: string; settlementDays: number; faceAmount?: number; couponRate: number; frequency: 1 | 2 | 4 | 12; redemption?: number; flatDiscountRate: number; }
export interface ZeroCouponBondInput { evaluationDate: string; maturityDate: string; settlementDays: number; faceAmount?: number; redemption?: number; flatDiscountRate: number; }
export interface OptionResult { value: number; delta: number; gamma: number; vega: number; theta: number; rho: number; }
export interface PriceResult { value: number; }
export interface EquityDistributionInput { evaluationDate: string; maturityDate: string; spot: number; riskFreeRate: number; dividendYield?: number; volatility: number; }
export interface EquityDistributionResult { upProbability: number; downProbability: number; forward: number; }
export interface BondResult { value: number; settlementValue: number; cleanPrice: number; dirtyPrice: number; accruedAmount?: number; cashflowCount?: number; }
export interface TerminalPayoffLeg { kind: "equity" | "bond" | "coupon" | "call" | "put" | "digital" | "barrier"; quantity: number; strike: number; call: boolean; cashPayoff: number; redemption: number; rebate: number; }
export interface MinimumPayoffResult { value: number; bounded: boolean; }
type Raw = { ok: boolean; error?: string;[key: string]: unknown };
type Module = { quantLibVersion(): string; priceStock(spot: number): Raw; priceEuropean(...x: Array<number | boolean>): Raw; priceDigital(...x: Array<number | boolean>): Raw; equityMoveProbabilities(...x: number[]): Raw; priceBarrier(...x: Array<number | boolean>): Raw; priceFixedRateBond(...x: number[]): Raw; priceZeroCouponBond(...x: number[]): Raw; minimumBookPayoff(legs: TerminalPayoffLeg[]): Raw };
const ymd = (value: string): [number, number, number] => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!m) throw new Error(`Date must be ISO YYYY-MM-DD: ${value}`); return [Number(m[1]), Number(m[2]), Number(m[3])]; };
const checked = <T>(r: Raw): T => { if (!r.ok) throw new Error(r.error ?? "QuantLib WASM pricing failed"); const { ok: _ok, error: _error, ...value } = r; return value as T; };
export interface QuantLibRuntimeOptions { wasmUrl?: string | URL; moduleUrl?: string | URL; }
export class QuantLibRuntime {
    private constructor(private readonly ql: Module) { }
    static async create(options: QuantLibRuntimeOptions = {}): Promise<QuantLibRuntime> {
        const url = String(options.moduleUrl ?? new URL("../wasm/quantlib.mjs", import.meta.url));
        const load = new Function("url", "return import(url)") as (url: string) => Promise<{ default: (o: object) => Promise<Module> }>;
        const factory = (await load(url)).default; const wasm = options.wasmUrl;
        return new QuantLibRuntime(await factory(wasm ? { locateFile: (p: string) => p.endsWith(".wasm") ? String(wasm) : p } : {}));
    }
    version(): string { return this.ql.quantLibVersion(); }
    priceStock(spot: number): PriceResult { return checked(this.ql.priceStock(spot)); }
    priceEuropean(i: EuropeanOptionInput): OptionResult { return checked(this.ql.priceEuropean(...ymd(i.evaluationDate), ...ymd(i.maturityDate), i.spot, i.strike, i.riskFreeRate, i.dividendYield ?? 0, i.volatility, i.type === "call")); }
    priceDigital(i: DigitalOptionInput): OptionResult { return checked(this.ql.priceDigital(...ymd(i.evaluationDate), ...ymd(i.maturityDate), i.spot, i.strike, i.riskFreeRate, i.dividendYield ?? 0, i.volatility, i.type === "call", i.cashPayoff)); }
    equityMoveProbabilities(i: EquityDistributionInput): EquityDistributionResult { return checked(this.ql.equityMoveProbabilities(...ymd(i.evaluationDate), ...ymd(i.maturityDate), i.spot, i.riskFreeRate, i.dividendYield ?? 0, i.volatility)); }
    priceBarrier(i: BarrierOptionInput): PriceResult { const types = { "down-in": 0, "up-in": 1, "down-out": 2, "up-out": 3 } as const; return checked(this.ql.priceBarrier(...ymd(i.evaluationDate), ...ymd(i.maturityDate), i.spot, i.strike, i.barrier, i.rebate ?? 0, i.riskFreeRate, i.dividendYield ?? 0, i.volatility, i.type === "call", types[i.barrierType])); }
    priceFixedRateBond(i: FixedRateBondInput): BondResult { return checked(this.ql.priceFixedRateBond(...ymd(i.evaluationDate), ...ymd(i.issueDate), ...ymd(i.maturityDate), i.settlementDays, i.faceAmount ?? 100, i.couponRate, i.frequency, i.redemption ?? 100, i.flatDiscountRate)); }
    priceZeroCouponBond(i: ZeroCouponBondInput): BondResult { return checked(this.ql.priceZeroCouponBond(...ymd(i.evaluationDate), ...ymd(i.maturityDate), i.settlementDays, i.faceAmount ?? 100, i.redemption ?? 100, i.flatDiscountRate)); }
    minimumBookPayoff(legs: TerminalPayoffLeg[]): MinimumPayoffResult { return checked(this.ql.minimumBookPayoff(legs)); }
}
