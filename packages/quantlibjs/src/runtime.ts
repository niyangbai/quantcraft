export interface EuropeanOptionInput { evaluationDate: string; maturityDate: string; spot: number; strike: number; riskFreeRate: number; dividendYield?: number; volatility: number; type: "call" | "put"; }
export interface DigitalOptionInput extends EuropeanOptionInput { cashPayoff: number; }
export interface BarrierOptionInput extends EuropeanOptionInput { barrier: number; rebate?: number; barrierType: "down-in" | "up-in" | "down-out" | "up-out"; }
export interface FixedRateBondInput { evaluationDate: string; issueDate: string; maturityDate: string; settlementDays: number; faceAmount?: number; couponRate: number; frequency: 1 | 2 | 4 | 12; redemption?: number; flatDiscountRate: number; }
export interface CurveInput { evaluationDate: string; dates: string[]; zeroRates: number[]; }
export interface CurveBondInput { evaluationDate: string; issueDate: string; maturityDate: string; settlementDays: number; faceAmount?: number; couponRate: number; frequency: 1 | 2 | 4 | 12; redemption?: number; }
export interface CurveBondPositionInput { issueDate: string; maturityDate: string; settlementDays: number; faceAmount?: number; couponRate: number; frequency: 1 | 2 | 4 | 12; redemption?: number; }
export interface CurveBondResult extends BondResult { dv01: number; convexity: number; }
export interface CurveRepriceResult { before: number; after: number; pnl: number; }
export interface ImpliedVolatilityInput { evaluationDate: string; maturityDate: string; spot: number; strike: number; riskFreeRate: number; dividendYield?: number; targetValue: number; type: "call" | "put"; }
export interface ImpliedVolatilityResult { value: number; }
export interface ScheduleInput { startDate: string; endDate: string; months: number; convention?: "following" | "modified-following" | "preceding" | "modified-preceding" | "unadjusted"; rule?: "forward" | "backward"; }
export interface ScheduleResult { dates: string[]; }
export interface SwapInput { evaluationDate: string; startDate: string; maturityDate: string; nominal: number; fixedRate: number; fixedMonths: number; floatMonths: number; spread?: number; payer: boolean; }
export interface SwapResult { value: number; fairRate: number; fixedLegBps: number; floatingLegBps: number; }
export interface CapFloorInput { evaluationDate: string; startDate: string; maturityDate: string; nominal: number; strike: number; floatMonths: number; volatility: number; cap: boolean; }
export interface CapFloorResult { value: number; }
export interface CallablePutableBondInput extends CurveBondInput { exerciseDate: string; exercisePrice: number; callability: boolean; meanReversion?: number; shortRateVolatility?: number; timeSteps?: number; }
export interface CallablePutableBondResult { value: number; cleanPrice: number; dirtyPrice: number; accruedAmount: number; }
export interface ZeroCouponBondInput { evaluationDate: string; maturityDate: string; settlementDays: number; faceAmount?: number; redemption?: number; flatDiscountRate: number; }
export interface VolSurfaceInput { evaluationDate: string; expiries: string[]; strikes: number[]; vols: number[][]; }
export interface CreateVolSurfaceResult { handle: number; }
export interface CurveHandleResult { handle: number; }
export interface OptionResult { value: number; delta: number; gamma: number; vega: number; theta: number; rho: number; }
export interface PriceResult { value: number; }
export interface EquityDistributionInput { evaluationDate: string; maturityDate: string; spot: number; riskFreeRate: number; dividendYield?: number; volatility: number; }
export interface EquityDistributionResult { upProbability: number; downProbability: number; forward: number; }
export interface BondResult { value: number; settlementValue: number; cleanPrice: number; dirtyPrice: number; accruedAmount?: number; cashflowCount?: number; }
export interface TerminalPayoffLeg { kind: "equity" | "forward" | "bond" | "coupon" | "call" | "put" | "digital" | "barrier"; quantity: number; strike: number; call: boolean; cashPayoff: number; redemption: number; rebate: number; }
export interface TerminalPayoffInput extends TerminalPayoffLeg { couponRate?: number; barrierTouched?: boolean; barrierType?: string; }
export interface MinimumPayoffResult { value: number; bounded: boolean; }
export interface PayoffExtremesResult { min: number; max: number; boundedBelow: boolean; boundedAbove: boolean; }
export interface PayoffBreakevensResult { roots: number[]; }
export interface NormalDistributionResult { value: number; }
type Raw = { ok: boolean; error?: string;[key: string]: unknown };
type Module = { quantLibVersion(): string; priceStock(spot: number): Raw; priceEuropean(...x: Array<number | boolean>): Raw; impliedVolatility(...x: Array<number | boolean>): Raw; solveRoot(f: (x: number) => number, lower: number, upper: number, guess: number, accuracy: number, maxEvaluations: number): Raw; priceAmerican(...x: Array<number | boolean>): Raw; priceDigital(...x: Array<number | boolean>): Raw; equityMoveProbabilities(...x: number[]): Raw; priceBarrier(...x: Array<number | boolean>): Raw; priceFixedRateBond(...x: number[]): Raw; priceZeroCouponBond(...x: number[]): Raw; scheduleDates(...x: Array<number | string>): Raw; thirty360DayCount(...x: number[]): Raw; createZeroCurve(ey: number, em: number, ed: number, dates: string[], rates: number[]): Raw; createZeroCurveAdvanced(ey: number, em: number, ed: number, dates: string[], rates: number[], interpolation: string, extrapolation: boolean): Raw; curveDiscount(handle: number, y: number, m: number, d: number): Raw; curveZeroRate(handle: number, y: number, m: number, d: number): Raw; curveForwardRate(handle: number, y1: number, m1: number, d1: number, y2: number, m2: number, d2: number): Raw; bumpCurveNode(handle: number, nodeIndex: number, shift: number): Raw; priceBondWithCurve(...x: number[]): Raw; repriceBondBetweenCurves(...x: number[]): Raw; repriceBondsBetweenCurves(beforeHandle: number, afterHandle: number, ey: number, em: number, ed: number, positions: object[]): Raw; priceVanillaSwap(...x: Array<number | boolean>): Raw; priceCapFloor(...x: Array<number | boolean>): Raw; priceCallablePutableBond(...x: Array<number | boolean>): Raw; destroyCurve(handle: number): void; terminalPayoff(leg: TerminalPayoffInput, underlying: number): Raw; minimumBookPayoff(legs: TerminalPayoffLeg[]): Raw; payoffExtremes(legs: TerminalPayoffLeg[]): Raw; payoffBreakevens(legs: TerminalPayoffLeg[]): Raw; normalCdf(x: number): Raw; normalPdf(x: number): Raw; millsRatio(x: number): Raw; createVolSurface(ey: number, em: number, ed: number, dates: string[], strikes: number[], vols: number[]): Raw; volSurfaceBlackVol(handle: number, y: number, m: number, d: number, strike: number): Raw; priceEuropeanUnderSurface(...x: Array<number | boolean>): Raw; destroyVolSurface(handle: number): void };
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
    impliedVolatility(i: ImpliedVolatilityInput): ImpliedVolatilityResult { return checked(this.ql.impliedVolatility(...ymd(i.evaluationDate), ...ymd(i.maturityDate), i.spot, i.strike, i.riskFreeRate, i.dividendYield ?? 0, i.targetValue, i.type === "call")); }
    solveRoot(f: (x: number) => number, lower: number, upper: number, guess = (lower + upper) / 2, accuracy = 1e-10, maxEvaluations = 100): number { return checked<{ value: number }>(this.ql.solveRoot(f, lower, upper, guess, accuracy, maxEvaluations)).value; }
    priceAmerican(i: EuropeanOptionInput & { timeSteps?: number }): OptionResult { return checked(this.ql.priceAmerican(...ymd(i.evaluationDate), ...ymd(i.maturityDate), i.spot, i.strike, i.riskFreeRate, i.dividendYield ?? 0, i.volatility, i.type === "call", i.timeSteps ?? 200)); }
    priceDigital(i: DigitalOptionInput): OptionResult { return checked(this.ql.priceDigital(...ymd(i.evaluationDate), ...ymd(i.maturityDate), i.spot, i.strike, i.riskFreeRate, i.dividendYield ?? 0, i.volatility, i.type === "call", i.cashPayoff)); }
    equityMoveProbabilities(i: EquityDistributionInput): EquityDistributionResult { return checked(this.ql.equityMoveProbabilities(...ymd(i.evaluationDate), ...ymd(i.maturityDate), i.spot, i.riskFreeRate, i.dividendYield ?? 0, i.volatility)); }
    priceBarrier(i: BarrierOptionInput): PriceResult { const types = { "down-in": 0, "up-in": 1, "down-out": 2, "up-out": 3 } as const; return checked(this.ql.priceBarrier(...ymd(i.evaluationDate), ...ymd(i.maturityDate), i.spot, i.strike, i.barrier, i.rebate ?? 0, i.riskFreeRate, i.dividendYield ?? 0, i.volatility, i.type === "call", types[i.barrierType])); }
    priceFixedRateBond(i: FixedRateBondInput): BondResult { return checked(this.ql.priceFixedRateBond(...ymd(i.evaluationDate), ...ymd(i.issueDate), ...ymd(i.maturityDate), i.settlementDays, i.faceAmount ?? 100, i.couponRate, i.frequency, i.redemption ?? 100, i.flatDiscountRate)); }
    priceZeroCouponBond(i: ZeroCouponBondInput): BondResult { return checked(this.ql.priceZeroCouponBond(...ymd(i.evaluationDate), ...ymd(i.maturityDate), i.settlementDays, i.faceAmount ?? 100, i.redemption ?? 100, i.flatDiscountRate)); }
    scheduleDates(i: ScheduleInput): ScheduleResult { const [sy, sm, sd] = ymd(i.startDate); const [ey, em, ed] = ymd(i.endDate); return checked(this.ql.scheduleDates(sy, sm, sd, ey, em, ed, i.months, i.convention ?? "modified-following", i.rule ?? "forward")); }
    thirty360DayCount(startDate: string, endDate: string): number { return checked<{ yearFraction: number }>(this.ql.thirty360DayCount(...ymd(startDate), ...ymd(endDate))).yearFraction; }
    createZeroCurve(i: CurveInput & { interpolation?: "linear" | "log-linear"; extrapolation?: boolean }): number { const [ey, em, ed] = ymd(i.evaluationDate); return checked<CurveHandleResult>(this.ql.createZeroCurveAdvanced(ey, em, ed, i.dates, i.zeroRates, i.interpolation ?? "linear", i.extrapolation ?? false)).handle; }
    curveDiscount(handle: number, date: string): number { const [y, m, d] = ymd(date); return checked<{ value: number }>(this.ql.curveDiscount(handle, y, m, d)).value; }
    curveZeroRate(handle: number, date: string): number { const [y, m, d] = ymd(date); return checked<{ value: number }>(this.ql.curveZeroRate(handle, y, m, d)).value; }
    curveForwardRate(handle: number, from: string, to: string): number { return checked<{ value: number }>(this.ql.curveForwardRate(handle, ...ymd(from), ...ymd(to))).value; }
    bumpCurveNode(handle: number, nodeIndex: number, shift: number): number { return checked<CurveHandleResult>(this.ql.bumpCurveNode(handle, nodeIndex, shift)).handle; }
    priceBondWithCurve(handle: number, i: CurveBondInput): CurveBondResult { return checked(this.ql.priceBondWithCurve(handle, ...ymd(i.evaluationDate), ...ymd(i.issueDate), ...ymd(i.maturityDate), i.settlementDays, i.faceAmount ?? 100, i.couponRate, i.frequency, i.redemption ?? 100)); }
    repriceBondBetweenCurves(beforeHandle: number, afterHandle: number, i: CurveBondInput): CurveRepriceResult { return checked(this.ql.repriceBondBetweenCurves(beforeHandle, afterHandle, ...ymd(i.evaluationDate), ...ymd(i.issueDate), ...ymd(i.maturityDate), i.settlementDays, i.faceAmount ?? 100, i.couponRate, i.frequency, i.redemption ?? 100)); }
    repriceBondsBetweenCurves(beforeHandle: number, afterHandle: number, evaluationDate: string, positions: CurveBondPositionInput[]): CurveRepriceResult[] {
        const [ey, em, ed] = ymd(evaluationDate);
        const raw = positions.map((position) => ({
            ...(() => { const [issueYear, issueMonth, issueDay] = ymd(position.issueDate); return { issueYear, issueMonth, issueDay }; })(),
            ...(() => { const [maturityYear, maturityMonth, maturityDay] = ymd(position.maturityDate); return { maturityYear, maturityMonth, maturityDay }; })(),
            settlementDays: position.settlementDays,
            faceAmount: position.faceAmount ?? 100,
            couponRate: position.couponRate,
            frequency: position.frequency,
            redemption: position.redemption ?? 100,
        }));
        return checked<{ results: CurveRepriceResult[] }>(this.ql.repriceBondsBetweenCurves(beforeHandle, afterHandle, ey, em, ed, raw)).results;
    }
    priceVanillaSwap(discountHandle: number, forwardHandle: number, i: SwapInput): SwapResult { const [ey, em, ed] = ymd(i.evaluationDate); const [sy, sm, sd] = ymd(i.startDate); const [my, mm, md] = ymd(i.maturityDate); return checked(this.ql.priceVanillaSwap(discountHandle, forwardHandle, ey, em, ed, sy, sm, sd, my, mm, md, i.nominal, i.fixedRate, i.fixedMonths, i.floatMonths, i.spread ?? 0, i.payer)); }
    priceCapFloor(discountHandle: number, forwardHandle: number, i: CapFloorInput): CapFloorResult { const [ey, em, ed] = ymd(i.evaluationDate); const [sy, sm, sd] = ymd(i.startDate); const [my, mm, md] = ymd(i.maturityDate); return checked(this.ql.priceCapFloor(discountHandle, forwardHandle, ey, em, ed, sy, sm, sd, my, mm, md, i.nominal, i.strike, i.floatMonths, i.volatility, i.cap)); }
    priceCallablePutableBond(discountHandle: number, i: CallablePutableBondInput): CallablePutableBondResult { const [ey, em, ed] = ymd(i.evaluationDate); const [iy, im, id] = ymd(i.issueDate); const [my, mm, md] = ymd(i.maturityDate); const [cy, cm, cd] = ymd(i.exerciseDate); return checked(this.ql.priceCallablePutableBond(discountHandle, ey, em, ed, iy, im, id, my, mm, md, i.settlementDays, i.faceAmount ?? 100, i.couponRate, i.frequency, i.redemption ?? 100, cy, cm, cd, i.exercisePrice, i.callability, i.meanReversion ?? 0.03, i.shortRateVolatility ?? 0.01, i.timeSteps ?? 100)); }
    destroyCurve(handle: number): void { this.ql.destroyCurve(handle); }
    terminalPayoff(leg: TerminalPayoffInput, underlying: number): number { return checked<{ value: number }>(this.ql.terminalPayoff(leg, underlying)).value; }
    minimumBookPayoff(legs: TerminalPayoffLeg[]): MinimumPayoffResult { return checked(this.ql.minimumBookPayoff(legs)); }
    payoffExtremes(legs: TerminalPayoffLeg[]): PayoffExtremesResult { return checked(this.ql.payoffExtremes(legs)); }
    payoffBreakevens(legs: TerminalPayoffLeg[]): number[] { return checked<PayoffBreakevensResult>(this.ql.payoffBreakevens(legs)).roots; }
    normalCdf(x: number): number { return checked<NormalDistributionResult>(this.ql.normalCdf(x)).value; }
    normalPdf(x: number): number { return checked<NormalDistributionResult>(this.ql.normalPdf(x)).value; }
    millsRatio(x: number): number { return checked<NormalDistributionResult>(this.ql.millsRatio(x)).value; }
    createVolSurface(i: VolSurfaceInput): number {
        const [ey, em, ed] = ymd(i.evaluationDate);
        // BlackVarianceSurface wants one row per strike, one column per date:
        // flatten strike-major so the C++ side can build the matrix directly.
        const nDates = i.expiries.length;
        const nStrikes = i.strikes.length;
        const vols: number[] = [];
        for (let s = 0; s < nStrikes; s += 1) {
            for (let d = 0; d < nDates; d += 1) {
                const row = i.vols[d];
                const value = row?.[s];
                if (value === undefined) throw new Error("vol surface matrix is incomplete");
                vols.push(value);
            }
        }
        return checked<CreateVolSurfaceResult>(this.ql.createVolSurface(ey, em, ed, i.expiries, i.strikes, vols)).handle;
    }
    volSurfaceBlackVol(handle: number, date: string, strike: number): number {
        const [y, m, d] = ymd(date);
        return checked<{ value: number }>(this.ql.volSurfaceBlackVol(handle, y, m, d, strike)).value;
    }
    priceEuropeanUnderSurface(handle: number, i: Omit<EuropeanOptionInput, "volatility">): OptionResult {
        return checked(this.ql.priceEuropeanUnderSurface(handle, ...ymd(i.evaluationDate), ...ymd(i.maturityDate), i.spot, i.strike, i.riskFreeRate, i.dividendYield ?? 0, i.type === "call"));
    }
    destroyVolSurface(handle: number): void { this.ql.destroyVolSurface(handle); }
}
