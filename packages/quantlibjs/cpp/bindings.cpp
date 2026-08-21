/*
 * Explicit QuantLib includes. The <ql/quantlib.hpp> umbrella header pulls in
 * the whole library and its file layout is not stable across QuantLib
 * installations, so each header below is pinned to the QuantLib 1.43 layout.
 * (The callable-bond classes and engine live under ql/experimental in 1.43.)
 */
#include <ql/compounding.hpp>
#include <ql/errors.hpp>
#include <ql/exercise.hpp>
#include <ql/handle.hpp>
#include <ql/interestrate.hpp>
#include <ql/option.hpp>
#include <ql/quote.hpp>
#include <ql/settings.hpp>
#include <ql/shared_ptr.hpp>
#include <ql/types.hpp>
#include <ql/version.hpp>

#include <ql/indexes/ibor/euribor.hpp>
#include <ql/cashflow.hpp>
#include <ql/cashflows/iborcoupon.hpp>

#include <ql/instruments/barrieroption.hpp>
#include <ql/instruments/bond.hpp>
#include <ql/instruments/bonds/fixedratebond.hpp>
#include <ql/instruments/bonds/zerocouponbond.hpp>
#include <ql/instruments/callabilityschedule.hpp>
#include <ql/instruments/capfloor.hpp>
#include <ql/instruments/payoffs.hpp>
#include <ql/instruments/stock.hpp>
#include <ql/instruments/vanillaoption.hpp>
#include <ql/instruments/vanillaswap.hpp>

#include <ql/math/distributions/normaldistribution.hpp>
#include <ql/math/interpolations/linearinterpolation.hpp>
#include <ql/math/interpolations/loginterpolation.hpp>
#include <ql/math/matrix.hpp>
#include <ql/math/solvers1d/brent.hpp>
#include <ql/methods/lattices/binomialtree.hpp>
#include <ql/models/shortrate/onefactormodels/hullwhite.hpp>

#include <ql/pricingengines/barrier/analyticbarrierengine.hpp>
#include <ql/pricingengines/bond/discountingbondengine.hpp>
#include <ql/pricingengines/capfloor/blackcapfloorengine.hpp>
#include <ql/pricingengines/swap/discountingswapengine.hpp>
#include <ql/pricingengines/vanilla/analyticeuropeanengine.hpp>
#include <ql/pricingengines/vanilla/binomialengine.hpp>

#include <ql/processes/blackscholesprocess.hpp>

#include <ql/termstructures/volatility/equityfx/blackconstantvol.hpp>
#include <ql/termstructures/volatility/equityfx/blackvariancesurface.hpp>
#include <ql/termstructures/volatility/equityfx/blackvoltermstructure.hpp>
#include <ql/termstructures/yield/flatforward.hpp>
#include <ql/termstructures/yield/zerocurve.hpp>
#include <ql/termstructures/yieldtermstructure.hpp>

#include <ql/time/businessdayconvention.hpp>
#include <ql/time/calendars/target.hpp>
#include <ql/time/date.hpp>
#include <ql/time/dategenerationrule.hpp>
#include <ql/time/daycounter.hpp>
#include <ql/time/daycounters/actual360.hpp>
#include <ql/time/daycounters/actual365fixed.hpp>
#include <ql/time/daycounters/thirty360.hpp>
#include <ql/time/frequency.hpp>
#include <ql/time/period.hpp>
#include <ql/time/schedule.hpp>

#include <ql/experimental/callablebonds/callablebond.hpp>
#include <ql/experimental/callablebonds/treecallablebondengine.hpp>

#include <ql/quotes/simplequote.hpp>

#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <limits>
#include <sstream>
#include <string>
#include <vector>
#include <functional>
using namespace QuantLib;
using emscripten::val;
namespace
{
    Date qd(int y, int m, int d) { return Date(d, static_cast<Month>(m), y); }
    std::string quantLibVersion() { return QL_VERSION; }
    void evaluation(int y, int m, int d) { Settings::instance().evaluationDate() = qd(y, m, d); }
    val failure(const std::exception &e)
    {
        val r = val::object();
        r.set("ok", false);
        r.set("error", std::string(e.what()));
        return r;
    }

    enum class InterpolationKind
    {
        Linear,
        LogLinear
    };

    InterpolationKind interpolationKind(const std::string &name)
    {
        if (name == "linear")
            return InterpolationKind::Linear;
        if (name == "log-linear")
            return InterpolationKind::LogLinear;
        QL_FAIL("unsupported curve interpolation: " << name);
    }

    BusinessDayConvention businessConvention(const std::string &name)
    {
        if (name == "following")
            return Following;
        if (name == "modified-following")
            return ModifiedFollowing;
        if (name == "preceding")
            return Preceding;
        if (name == "modified-preceding")
            return ModifiedPreceding;
        if (name == "unadjusted")
            return Unadjusted;
        QL_FAIL("unsupported business-day convention: " << name);
    }

    DateGeneration::Rule dateRule(const std::string &name)
    {
        if (name == "forward")
            return DateGeneration::Forward;
        if (name == "backward")
            return DateGeneration::Backward;
        QL_FAIL("unsupported date generation rule: " << name);
    }

    /* ------------------------------------------------------------------ */
    /* Standard normal distribution (QuantLib numeric routines)            */
    /* ------------------------------------------------------------------ */
    /* CumulativeNormalDistribution / NormalDistribution are the same      */
    /* routines QuantLib's own pricing engines use, so downstream code     */
    /* (e.g. the market-making fill model) no longer needs its own erf.    */

    val normalCdf(double x)
    {
        val out = val::object();
        out.set("ok", true);
        out.set("value", CumulativeNormalDistribution()(x));
        return out;
    }

    val normalPdf(double x)
    {
        val out = val::object();
        out.set("ok", true);
        out.set("value", NormalDistribution()(x));
        return out;
    }

    /*! Inverse Mills ratio E[X | X >= z] = phi(z) / (1 - Phi(z)). */
    val millsRatio(double z)
    {
        val out = val::object();
        out.set("ok", true);
        out.set("value", NormalDistribution()(z) / (1.0 - CumulativeNormalDistribution()(z)));
        return out;
    }
    val stock(double spot)
    {
        try
        {
            auto quote = ext::make_shared<SimpleQuote>(spot);
            Stock instrument{Handle<Quote>(quote)};
            val out = val::object();
            out.set("ok", true);
            out.set("value", instrument.NPV());
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }
    val european(int ey, int em, int ed, int my, int mm, int md, double spot, double strike, double r, double q, double vol, bool call)
    {
        try
        {
            evaluation(ey, em, ed);
            Date today = qd(ey, em, ed), maturity = qd(my, mm, md);
            DayCounter dc = Actual365Fixed();
            auto s = ext::make_shared<SimpleQuote>(spot);
            auto rf = ext::make_shared<FlatForward>(today, r, dc);
            auto div = ext::make_shared<FlatForward>(today, q, dc);
            auto v = ext::make_shared<BlackConstantVol>(today, TARGET(), vol, dc);
            auto process = ext::make_shared<BlackScholesMertonProcess>(Handle<Quote>(s), Handle<YieldTermStructure>(div), Handle<YieldTermStructure>(rf), Handle<BlackVolTermStructure>(v));
            VanillaOption option(ext::make_shared<PlainVanillaPayoff>(call ? Option::Call : Option::Put, strike), ext::make_shared<EuropeanExercise>(maturity));
            option.setPricingEngine(ext::make_shared<AnalyticEuropeanEngine>(process));
            val out = val::object();
            out.set("ok", true);
            out.set("value", option.NPV());
            out.set("delta", option.delta());
            out.set("gamma", option.gamma());
            out.set("vega", option.vega());
            out.set("theta", option.theta());
            out.set("rho", option.rho());
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val impliedVolatility(int ey, int em, int ed, int my, int mm, int md, double spot, double strike,
                          double r, double q, double targetValue, bool call)
    {
        try
        {
            evaluation(ey, em, ed);
            QL_REQUIRE(std::isfinite(targetValue) && targetValue >= 0.0, "target option value must be non-negative and finite");
            Date today = qd(ey, em, ed), maturity = qd(my, mm, md);
            DayCounter dc = Actual365Fixed();
            auto s = ext::make_shared<SimpleQuote>(spot);
            auto rf = ext::make_shared<FlatForward>(today, r, dc);
            auto div = ext::make_shared<FlatForward>(today, q, dc);
            auto v = ext::make_shared<BlackConstantVol>(today, TARGET(), 0.2, dc);
            auto process = ext::make_shared<BlackScholesMertonProcess>(Handle<Quote>(s), Handle<YieldTermStructure>(div), Handle<YieldTermStructure>(rf), Handle<BlackVolTermStructure>(v));
            VanillaOption option(ext::make_shared<PlainVanillaPayoff>(call ? Option::Call : Option::Put, strike), ext::make_shared<EuropeanExercise>(maturity));
            val out = val::object();
            out.set("ok", true);
            out.set("value", option.impliedVolatility(targetValue, process));
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val solveRoot(val function, double lower, double upper, double guess, double accuracy, int maxEvaluations)
    {
        try
        {
            QL_REQUIRE(lower < upper && accuracy > 0 && maxEvaluations > 0, "invalid root solver bounds");
            Brent solver;
            solver.setMaxEvaluations(maxEvaluations);
            auto objective = [&](Real x)
            { return function(x).as<double>(); };
            const double root = solver.solve(objective, accuracy, guess, lower, upper);
            val out = val::object();
            out.set("ok", true);
            out.set("value", root);
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }
    val digital(int ey, int em, int ed, int my, int mm, int md, double spot, double strike, double r, double q, double vol, bool call, double cashPayoff)
    {
        try
        {
            evaluation(ey, em, ed);
            Date today = qd(ey, em, ed), maturity = qd(my, mm, md);
            DayCounter dc = Actual365Fixed();
            auto s = ext::make_shared<SimpleQuote>(spot);
            auto rf = ext::make_shared<FlatForward>(today, r, dc);
            auto div = ext::make_shared<FlatForward>(today, q, dc);
            auto v = ext::make_shared<BlackConstantVol>(today, TARGET(), vol, dc);
            auto process = ext::make_shared<BlackScholesMertonProcess>(Handle<Quote>(s), Handle<YieldTermStructure>(div), Handle<YieldTermStructure>(rf), Handle<BlackVolTermStructure>(v));
            VanillaOption option(ext::make_shared<CashOrNothingPayoff>(call ? Option::Call : Option::Put, strike, cashPayoff), ext::make_shared<EuropeanExercise>(maturity));
            option.setPricingEngine(ext::make_shared<AnalyticEuropeanEngine>(process));
            val out = val::object();
            out.set("ok", true);
            out.set("value", option.NPV());
            out.set("delta", option.delta());
            out.set("gamma", option.gamma());
            out.set("vega", option.vega());
            out.set("theta", option.theta());
            out.set("rho", option.rho());
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val american(int ey, int em, int ed, int my, int mm, int md, double spot, double strike, double r, double q, double vol, bool call, int timeSteps)
    {
        try
        {
            evaluation(ey, em, ed);
            QL_REQUIRE(timeSteps > 0 && timeSteps <= 1000, "time steps must be between 1 and 1000");
            Date today = qd(ey, em, ed), maturity = qd(my, mm, md);
            DayCounter dc = Actual365Fixed();
            auto s = ext::make_shared<SimpleQuote>(spot);
            auto rf = ext::make_shared<FlatForward>(today, r, dc);
            auto div = ext::make_shared<FlatForward>(today, q, dc);
            auto v = ext::make_shared<BlackConstantVol>(today, TARGET(), vol, dc);
            auto process = ext::make_shared<BlackScholesMertonProcess>(Handle<Quote>(s), Handle<YieldTermStructure>(div), Handle<YieldTermStructure>(rf), Handle<BlackVolTermStructure>(v));
            VanillaOption option(ext::make_shared<PlainVanillaPayoff>(call ? Option::Call : Option::Put, strike), ext::make_shared<AmericanExercise>(today, maturity));
            option.setPricingEngine(ext::make_shared<BinomialVanillaEngine<CoxRossRubinstein>>(process, timeSteps));
            val out = val::object();
            out.set("ok", true);
            out.set("value", option.NPV());
            out.set("delta", option.delta());
            out.set("gamma", option.gamma());
            out.set("theta", option.theta());
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    struct CurveRecord
    {
        ext::shared_ptr<YieldTermStructure> curve;
        Date evaluationDate;
        std::vector<Date> dates;
        std::vector<Rate> rates;
    };

    std::vector<CurveRecord> curves;

    Date parseIsoDate(const std::string &s);

    CurveRecord &curveRef(int handle)
    {
        QL_REQUIRE(handle >= 0 && static_cast<std::size_t>(handle) < curves.size() && curves[handle].curve,
                   "unknown yield curve handle " << handle);
        return curves[handle];
    }

    Frequency frequency(int n)
    {
        switch (n)
        {
        case 1:
            return Annual;
        case 2:
            return Semiannual;
        case 4:
            return Quarterly;
        case 12:
            return Monthly;
        default:
            QL_FAIL("unsupported coupon frequency: " << n);
        }
    }

    val vanillaSwap(int discountHandle, int forwardHandle, int ey, int em, int ed, int sy, int sm, int sd,
                    int my, int mm, int md, double nominal, double fixedRate, int fixedMonths, int floatMonths,
                    double spread, bool payer)
    {
        try
        {
            evaluation(ey, em, ed);
            QL_REQUIRE(nominal > 0 && fixedMonths > 0 && floatMonths > 0, "invalid swap terms");
            auto &discount = curveRef(discountHandle);
            auto &forward = curveRef(forwardHandle);
            QL_REQUIRE(discount.evaluationDate == qd(ey, em, ed) && forward.evaluationDate == qd(ey, em, ed), "curve evaluation date does not match swap evaluation date");
            TARGET calendar;
            const Date start = qd(sy, sm, sd), maturity = qd(my, mm, md);
            Schedule fixedSchedule(start, maturity, Period(fixedMonths, Months), calendar, ModifiedFollowing, ModifiedFollowing, DateGeneration::Forward, false);
            Schedule floatSchedule(start, maturity, Period(floatMonths, Months), calendar, ModifiedFollowing, ModifiedFollowing, DateGeneration::Forward, false);
            auto index = ext::make_shared<Euribor>(Period(floatMonths, Months), Handle<YieldTermStructure>(forward.curve));
            VanillaSwap swap(payer ? VanillaSwap::Payer : VanillaSwap::Receiver, nominal, fixedSchedule, fixedRate,
                             Thirty360(Thirty360::BondBasis), floatSchedule, index, spread, Actual360());
            swap.setPricingEngine(ext::make_shared<DiscountingSwapEngine>(Handle<YieldTermStructure>(discount.curve)));
            val out = val::object();
            out.set("ok", true);
            out.set("value", swap.NPV());
            out.set("fairRate", swap.fairRate());
            out.set("fixedLegBps", swap.fixedLegBPS());
            out.set("floatingLegBps", swap.floatingLegBPS());
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val capFloor(int discountHandle, int forwardHandle, int ey, int em, int ed, int sy, int sm, int sd,
                 int my, int mm, int md, double nominal, double strike, int floatMonths, double volatility, bool cap)
    {
        try
        {
            evaluation(ey, em, ed);
            auto &discount = curveRef(discountHandle);
            auto &forward = curveRef(forwardHandle);
            QL_REQUIRE(discount.evaluationDate == qd(ey, em, ed) && forward.evaluationDate == qd(ey, em, ed), "curve evaluation date does not match cap/floor evaluation date");
            QL_REQUIRE(nominal > 0 && floatMonths > 0 && volatility > 0, "invalid cap/floor terms");
            TARGET calendar;
            Schedule schedule(qd(sy, sm, sd), qd(my, mm, md), Period(floatMonths, Months), calendar, ModifiedFollowing, ModifiedFollowing, DateGeneration::Forward, false);
            auto index = ext::make_shared<Euribor>(Period(floatMonths, Months), Handle<YieldTermStructure>(forward.curve));
            Leg floatingLeg = IborLeg(schedule, index).withNotionals(nominal);
            CapFloor instrument(cap ? CapFloor::Cap : CapFloor::Floor, floatingLeg, std::vector<Rate>{strike});
            auto volQuote = ext::make_shared<SimpleQuote>(volatility);
            instrument.setPricingEngine(ext::make_shared<BlackCapFloorEngine>(Handle<YieldTermStructure>(discount.curve), Handle<Quote>(volQuote)));
            val out = val::object();
            out.set("ok", true);
            out.set("value", instrument.NPV());
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val callablePutableBond(int discountHandle, int ey, int em, int ed, int iy, int im, int id, int my, int mm, int md,
                            int settlementDays, double face, double coupon, int freq, double redemption,
                            int exerciseY, int exerciseM, int exerciseD, double exercisePrice, bool callability,
                            double meanReversion, double shortRateVol, int timeSteps)
    {
        try
        {
            evaluation(ey, em, ed);
            QL_REQUIRE(timeSteps > 0 && timeSteps <= 1000 && meanReversion > 0 && shortRateVol > 0, "invalid callable bond model parameters");
            auto &discount = curveRef(discountHandle);
            QL_REQUIRE(discount.evaluationDate == qd(ey, em, ed), "curve evaluation date does not match bond evaluation date");
            TARGET calendar;
            Date issue = qd(iy, im, id), maturity = qd(my, mm, md);
            Schedule schedule(issue, maturity, Period(frequency(freq)), calendar, Unadjusted, Unadjusted, DateGeneration::Backward, false);
            CallabilitySchedule callabilities;
            callabilities.push_back(ext::make_shared<Callability>(Bond::Price(exercisePrice, Bond::Price::Clean), callability ? Callability::Call : Callability::Put, qd(exerciseY, exerciseM, exerciseD)));
            CallableFixedRateBond bond(settlementDays, face, schedule, {coupon}, Thirty360(Thirty360::BondBasis), ModifiedFollowing, redemption, issue, callabilities);
            auto model = ext::make_shared<HullWhite>(Handle<YieldTermStructure>(discount.curve), meanReversion, shortRateVol);
            bond.setPricingEngine(ext::make_shared<TreeCallableFixedRateBondEngine>(model, timeSteps, Handle<YieldTermStructure>(discount.curve)));
            val out = val::object();
            out.set("ok", true);
            out.set("value", bond.NPV());
            out.set("cleanPrice", bond.cleanPrice());
            out.set("dirtyPrice", bond.dirtyPrice());
            out.set("accruedAmount", bond.accruedAmount());
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }
    val equityMoveProbabilities(int ey, int em, int ed, int my, int mm, int md, double spot, double r, double q, double vol)
    {
        try
        {
            evaluation(ey, em, ed);
            Date today = qd(ey, em, ed), maturity = qd(my, mm, md);
            DayCounter dc = Actual365Fixed();
            auto s = ext::make_shared<SimpleQuote>(spot);
            auto rf = ext::make_shared<FlatForward>(today, r, dc);
            auto div = ext::make_shared<FlatForward>(today, q, dc);
            auto v = ext::make_shared<BlackConstantVol>(today, TARGET(), vol, dc);
            auto process = ext::make_shared<BlackScholesMertonProcess>(Handle<Quote>(s), Handle<YieldTermStructure>(div), Handle<YieldTermStructure>(rf), Handle<BlackVolTermStructure>(v));
            auto exercise = ext::make_shared<EuropeanExercise>(maturity);
            VanillaOption up(ext::make_shared<CashOrNothingPayoff>(Option::Call, spot, 1.0), exercise);
            VanillaOption down(ext::make_shared<CashOrNothingPayoff>(Option::Put, spot, 1.0), exercise);
            auto engine = ext::make_shared<AnalyticEuropeanEngine>(process);
            up.setPricingEngine(engine);
            down.setPricingEngine(engine);
            const DiscountFactor discount = rf->discount(maturity);
            val out = val::object();
            out.set("ok", true);
            out.set("upProbability", up.NPV() / discount);
            out.set("downProbability", down.NPV() / discount);
            out.set("forward", spot * div->discount(maturity) / discount);
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }
    val barrier(int ey, int em, int ed, int my, int mm, int md, double spot, double strike, double barrierLevel, double rebate, double r, double q, double vol, bool call, int barrierType)
    {
        try
        {
            evaluation(ey, em, ed);
            QL_REQUIRE(barrierType >= 0 && barrierType <= 3, "unsupported barrier type: " << barrierType);
            Date today = qd(ey, em, ed), maturity = qd(my, mm, md);
            DayCounter dc = Actual365Fixed();
            auto s = ext::make_shared<SimpleQuote>(spot);
            auto rf = ext::make_shared<FlatForward>(today, r, dc);
            auto div = ext::make_shared<FlatForward>(today, q, dc);
            auto v = ext::make_shared<BlackConstantVol>(today, TARGET(), vol, dc);
            auto process = ext::make_shared<BlackScholesMertonProcess>(Handle<Quote>(s), Handle<YieldTermStructure>(div), Handle<YieldTermStructure>(rf), Handle<BlackVolTermStructure>(v));
            BarrierOption option(static_cast<Barrier::Type>(barrierType), barrierLevel, rebate, ext::make_shared<PlainVanillaPayoff>(call ? Option::Call : Option::Put, strike), ext::make_shared<EuropeanExercise>(maturity));
            option.setPricingEngine(ext::make_shared<AnalyticBarrierEngine>(process));
            val out = val::object();
            out.set("ok", true);
            out.set("value", option.NPV());
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }
    val fixedBond(int ey, int em, int ed, int iy, int im, int id, int my, int mm, int md, int settlementDays, double face, double coupon, int freq, double redemption, double rate)
    {
        try
        {
            evaluation(ey, em, ed);
            Date today = qd(ey, em, ed), issue = qd(iy, im, id), maturity = qd(my, mm, md);
            TARGET cal;
            Schedule schedule(issue, maturity, Period(frequency(freq)), cal, Unadjusted, Unadjusted, DateGeneration::Backward, false);
            FixedRateBond bond(settlementDays, face, schedule, {coupon}, Thirty360(Thirty360::BondBasis), ModifiedFollowing, redemption, issue);
            auto curve = ext::make_shared<FlatForward>(today, rate, Actual365Fixed());
            bond.setPricingEngine(ext::make_shared<DiscountingBondEngine>(Handle<YieldTermStructure>(curve)));
            val out = val::object();
            out.set("ok", true);
            out.set("value", bond.NPV());
            out.set("settlementValue", bond.settlementValue());
            out.set("cleanPrice", bond.cleanPrice());
            out.set("dirtyPrice", bond.dirtyPrice());
            out.set("accruedAmount", bond.accruedAmount());
            out.set("cashflowCount", bond.cashflows().size());
            val cashflows = val::array();
            for (unsigned i = 0; i < bond.cashflows().size(); ++i)
            {
                val cashflow = val::object();
                std::ostringstream iso;
                iso << io::iso_date(bond.cashflows()[i]->date());
                cashflow.set("date", iso.str());
                cashflow.set("amount", bond.cashflows()[i]->amount());
                cashflows.set(i, cashflow);
            }
            out.set("cashflows", cashflows);
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val scheduleDates(int sy, int sm, int sd, int ey, int em, int ed, int months,
                      std::string convention, std::string rule)
    {
        try
        {
            TARGET calendar;
            Schedule schedule(qd(sy, sm, sd), qd(ey, em, ed), Period(months, Months), calendar,
                              businessConvention(convention), businessConvention(convention), dateRule(rule), false);
            val dates = val::array();
            for (Size i = 0; i < schedule.size(); ++i)
            {
                std::ostringstream iso;
                iso << io::iso_date(schedule[i]);
                dates.set(i, iso.str());
            }
            val out = val::object();
            out.set("ok", true);
            out.set("dates", dates);
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val thirty360DayCount(int y1, int m1, int d1, int y2, int m2, int d2)
    {
        try
        {
            const Date first = qd(y1, m1, d1), second = qd(y2, m2, d2);
            val out = val::object();
            out.set("ok", true);
            out.set("yearFraction", Thirty360(Thirty360::BondBasis).yearFraction(first, second));
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }
    val zeroBond(int ey, int em, int ed, int my, int mm, int md, int settlementDays, double face, double redemption, double rate)
    {
        try
        {
            evaluation(ey, em, ed);
            Date today = qd(ey, em, ed);
            ZeroCouponBond bond(settlementDays, TARGET(), face, qd(my, mm, md), Following, redemption, today);
            auto curve = ext::make_shared<FlatForward>(today, rate, Actual365Fixed());
            bond.setPricingEngine(ext::make_shared<DiscountingBondEngine>(Handle<YieldTermStructure>(curve)));
            val out = val::object();
            out.set("ok", true);
            out.set("value", bond.NPV());
            out.set("settlementValue", bond.settlementValue());
            out.set("cleanPrice", bond.cleanPrice());
            out.set("dirtyPrice", bond.dirtyPrice());
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    ext::shared_ptr<YieldTermStructure> makeZeroCurve(const std::vector<Date> &dates, const std::vector<Rate> &rates)
    {
        QL_REQUIRE(dates.size() >= 2 && dates.size() == rates.size(), "yield curve needs at least two dates and matching rates");
        for (std::size_t i = 1; i < dates.size(); ++i)
            QL_REQUIRE(dates[i] > dates[i - 1], "yield curve dates must be strictly increasing");
        for (Rate rate : rates)
            QL_REQUIRE(std::isfinite(rate) && rate > -1.0, "yield curve rates must be finite and greater than -100%");
        return ext::make_shared<ZeroCurve>(dates, rates, Actual365Fixed(), TARGET(), Linear(), Compounded, Annual);
    }

    ext::shared_ptr<YieldTermStructure> makeZeroCurve(const std::vector<Date> &dates, const std::vector<Rate> &rates,
                                                      const std::string &interpolation, bool extrapolation)
    {
        ext::shared_ptr<YieldTermStructure> curve;
        if (interpolationKind(interpolation) == InterpolationKind::Linear)
            curve = ext::make_shared<InterpolatedZeroCurve<Linear>>(dates, rates, Actual365Fixed(), TARGET(), Linear(), Compounded, Annual);
        else
            curve = ext::make_shared<InterpolatedZeroCurve<LogLinear>>(dates, rates, Actual365Fixed(), TARGET(), LogLinear(), Compounded, Annual);
        if (extrapolation)
            curve->enableExtrapolation();
        return curve;
    }

    val createZeroCurve(int ey, int em, int ed, val dates, val rates)
    {
        try
        {
            evaluation(ey, em, ed);
            const unsigned length = dates["length"].as<unsigned>();
            QL_REQUIRE(length == rates["length"].as<unsigned>(), "yield curve dates/rates size mismatch");
            QL_REQUIRE(length > 0, "yield curve needs at least one market node");
            std::vector<Date> curveDates{qd(ey, em, ed)};
            std::vector<Rate> curveRates;
            curveRates.push_back(rates[0].as<double>());
            for (unsigned i = 0; i < length; ++i)
            {
                curveDates.push_back(parseIsoDate(dates[i].as<std::string>()));
                curveRates.push_back(rates[i].as<double>());
            }
            CurveRecord record{makeZeroCurve(curveDates, curveRates), qd(ey, em, ed), curveDates, curveRates};
            curves.push_back(record);
            val out = val::object();
            out.set("ok", true);
            out.set("handle", static_cast<int>(curves.size() - 1));
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val createZeroCurveAdvanced(int ey, int em, int ed, val dates, val rates, std::string interpolation, bool extrapolation)
    {
        try
        {
            evaluation(ey, em, ed);
            const unsigned length = dates["length"].as<unsigned>();
            QL_REQUIRE(length == rates["length"].as<unsigned>() && length > 0, "yield curve nodes are invalid");
            std::vector<Date> curveDates{qd(ey, em, ed)};
            std::vector<Rate> curveRates{rates[0].as<double>()};
            for (unsigned i = 0; i < length; ++i)
            {
                curveDates.push_back(parseIsoDate(dates[i].as<std::string>()));
                curveRates.push_back(rates[i].as<double>());
            }
            CurveRecord record{makeZeroCurve(curveDates, curveRates, interpolation, extrapolation), qd(ey, em, ed), curveDates, curveRates};
            curves.push_back(record);
            val out = val::object();
            out.set("ok", true);
            out.set("handle", static_cast<int>(curves.size() - 1));
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val curveDiscount(int handle, int y, int m, int d)
    {
        try
        {
            val out = val::object();
            out.set("ok", true);
            out.set("value", curveRef(handle).curve->discount(qd(y, m, d)));
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val curveZeroRate(int handle, int y, int m, int d)
    {
        try
        {
            val out = val::object();
            out.set("ok", true);
            out.set("value", curveRef(handle).curve->zeroRate(qd(y, m, d), Actual365Fixed(), Compounded, Annual).rate());
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val curveForwardRate(int handle, int y1, int m1, int d1, int y2, int m2, int d2)
    {
        try
        {
            const Date from = qd(y1, m1, d1), to = qd(y2, m2, d2);
            QL_REQUIRE(to > from, "forward rate end date must be after start date");
            val out = val::object();
            out.set("ok", true);
            out.set("value", curveRef(handle).curve->forwardRate(from, to, Actual365Fixed(), Compounded, Annual).rate());
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val bumpCurveNode(int handle, unsigned nodeIndex, double shift)
    {
        try
        {
            auto &record = curveRef(handle);
            QL_REQUIRE(nodeIndex < record.rates.size() - 1, "curve node index out of range");
            QL_REQUIRE(std::isfinite(shift), "curve shift must be finite");
            std::vector<Rate> rates = record.rates;
            rates[nodeIndex + 1] += shift;
            CurveRecord bumped{makeZeroCurve(record.dates, rates), record.evaluationDate, record.dates, rates};
            curves.push_back(bumped);
            val out = val::object();
            out.set("ok", true);
            out.set("handle", static_cast<int>(curves.size() - 1));
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val priceBondWithCurve(int handle, int ey, int em, int ed, int iy, int im, int id, int my, int mm, int md,
                           int settlementDays, double face, double coupon, int freq, double redemption)
    {
        try
        {
            evaluation(ey, em, ed);
            Date today = qd(ey, em, ed), issue = qd(iy, im, id), maturity = qd(my, mm, md);
            TARGET cal;
            Schedule schedule(issue, maturity, Period(frequency(freq)), cal, Unadjusted, Unadjusted, DateGeneration::Backward, false);
            FixedRateBond bond(settlementDays, face, schedule, {coupon}, Thirty360(Thirty360::BondBasis), ModifiedFollowing, redemption, issue);
            auto &record = curveRef(handle);
            QL_REQUIRE(record.evaluationDate == today, "curve evaluation date does not match bond evaluation date");
            bond.setPricingEngine(ext::make_shared<DiscountingBondEngine>(Handle<YieldTermStructure>(record.curve)));
            const double value = bond.NPV();

            auto bumped = [&](double shift)
            {
                std::vector<Rate> rates = record.rates;
                for (Rate &rate : rates)
                    rate += shift;
                auto curve = makeZeroCurve(record.dates, rates);
                bond.setPricingEngine(ext::make_shared<DiscountingBondEngine>(Handle<YieldTermStructure>(curve)));
                return bond.NPV();
            };
            const double up = bumped(0.0001);
            const double down = bumped(-0.0001);
            bond.setPricingEngine(ext::make_shared<DiscountingBondEngine>(Handle<YieldTermStructure>(record.curve)));
            val out = val::object();
            out.set("ok", true);
            out.set("value", value);
            out.set("settlementValue", bond.settlementValue());
            out.set("cleanPrice", bond.cleanPrice());
            out.set("dirtyPrice", bond.dirtyPrice());
            out.set("accruedAmount", bond.accruedAmount());
            out.set("cashflowCount", bond.cashflows().size());
            out.set("dv01", (value - up) * 10000.0);
            out.set("convexity", (up + down - 2.0 * value) / (value * 1.0e-8));
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val repriceBondBetweenCurves(int beforeHandle, int afterHandle, int ey, int em, int ed, int iy, int im, int id,
                                 int my, int mm, int md, int settlementDays, double face, double coupon, int freq, double redemption)
    {
        try
        {
            val before = priceBondWithCurve(beforeHandle, ey, em, ed, iy, im, id, my, mm, md, settlementDays, face, coupon, freq, redemption);
            QL_REQUIRE(before["ok"].as<bool>(), before["error"].as<std::string>());
            val after = priceBondWithCurve(afterHandle, ey, em, ed, iy, im, id, my, mm, md, settlementDays, face, coupon, freq, redemption);
            QL_REQUIRE(after["ok"].as<bool>(), after["error"].as<std::string>());
            val out = val::object();
            out.set("ok", true);
            const double beforeValue = before["value"].as<double>();
            const double afterValue = after["value"].as<double>();
            out.set("before", beforeValue);
            out.set("after", afterValue);
            out.set("pnl", afterValue - beforeValue);
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val repriceBondsBetweenCurves(int beforeHandle, int afterHandle, int ey, int em, int ed, val positions)
    {
        try
        {
            const unsigned length = positions["length"].as<unsigned>();
            val results = val::array();
            for (unsigned i = 0; i < length; ++i)
            {
                const val position = positions[i];
                const val repriced = repriceBondBetweenCurves(
                    beforeHandle, afterHandle, ey, em, ed,
                    position["issueYear"].as<int>(), position["issueMonth"].as<int>(), position["issueDay"].as<int>(),
                    position["maturityYear"].as<int>(), position["maturityMonth"].as<int>(), position["maturityDay"].as<int>(),
                    position["settlementDays"].as<int>(), position["faceAmount"].as<double>(),
                    position["couponRate"].as<double>(), position["frequency"].as<int>(), position["redemption"].as<double>());
                QL_REQUIRE(repriced["ok"].as<bool>(), repriced["error"].as<std::string>());
                results.set(i, repriced);
            }
            val out = val::object();
            out.set("ok", true);
            out.set("results", results);
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    void destroyCurve(int handle)
    {
        if (handle >= 0 && static_cast<std::size_t>(handle) < curves.size())
        {
            curves[handle].curve.reset();
        }
    }

    double terminalLegPayoff(const val &leg, double underlying)
    {
        const std::string kind = leg["kind"].as<std::string>();
        const double quantity = leg["quantity"].as<double>();
        if (kind == "equity")
            return quantity * underlying;
        if (kind == "forward")
            return quantity * (underlying - leg["strike"].as<double>());
        if (kind == "bond")
            return quantity * leg["redemption"].as<double>();
        if (kind == "coupon")
            return quantity * leg["redemption"].as<double>() * (1.0 + leg["couponRate"].as<double>());

        const double strike = leg["strike"].as<double>();
        const bool call = leg["call"].as<bool>();
        ext::shared_ptr<Payoff> payoff;
        if (kind == "digital")
            payoff = ext::make_shared<CashOrNothingPayoff>(call ? Option::Call : Option::Put, strike, leg["cashPayoff"].as<double>());
        else
            payoff = ext::make_shared<PlainVanillaPayoff>(call ? Option::Call : Option::Put, strike);
        const double active = quantity * (*payoff)(underlying);

        // A barrier's path state is not determined by terminal spot.  Taking the
        // worse of the active and inactive states is deliberately conservative.
        if (kind == "barrier")
            return std::min(active, quantity * leg["rebate"].as<double>());
        QL_REQUIRE(kind == "call" || kind == "put" || kind == "digital", "unsupported terminal payoff kind: " << kind);
        return active;
    }

    val terminalPayoff(val leg, double underlying)
    {
        try
        {
            QL_REQUIRE(std::isfinite(underlying) && underlying >= 0.0, "underlying must be non-negative and finite");
            if (leg["kind"].as<std::string>() == "barrier")
            {
                const double quantity = leg["quantity"].as<double>();
                const bool call = leg["call"].as<bool>();
                const bool touched = leg["barrierTouched"].as<bool>();
                const std::string barrierType = leg["barrierType"].as<std::string>();
                QL_REQUIRE(barrierType == "down-in" || barrierType == "up-in" || barrierType == "down-out" || barrierType == "up-out", "unsupported barrier type: " << barrierType);
                const bool active = barrierType.find("-in") != std::string::npos ? touched : !touched;
                const double option = (*ext::make_shared<PlainVanillaPayoff>(call ? Option::Call : Option::Put, leg["strike"].as<double>()))(underlying);
                const double value = quantity * (active ? option : leg["rebate"].as<double>());
                val out = val::object();
                out.set("ok", true);
                out.set("value", value);
                return out;
            }
            val out = val::object();
            out.set("ok", true);
            out.set("value", terminalLegPayoff(leg, underlying));
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val minimumBookPayoff(val legs)
    {
        try
        {
            const unsigned length = legs["length"].as<unsigned>();
            QL_REQUIRE(length > 0, "book must contain at least one leg");
            std::vector<double> candidates{0.0};
            for (unsigned i = 0; i < length; ++i)
            {
                val leg = legs[i];
                const std::string kind = leg["kind"].as<std::string>();
                if (kind == "call" || kind == "put" || kind == "digital" || kind == "barrier")
                {
                    const double strike = leg["strike"].as<double>();
                    const double epsilon = std::max(1.0, strike) * 1.0e-10;
                    candidates.push_back(std::max(0.0, strike - epsilon));
                    candidates.push_back(strike);
                    candidates.push_back(strike + epsilon);
                }
            }
            auto bookPayoff = [&](double underlying)
            {
                double total = 0.0;
                for (unsigned i = 0; i < length; ++i)
                    total += terminalLegPayoff(legs[i], underlying);
                return total;
            };
            const double tail = 1.0e8;
            const double tailSlope = bookPayoff(tail + 1.0) - bookPayoff(tail);
            val out = val::object();
            out.set("ok", true);
            if (tailSlope < -1.0e-8)
            {
                out.set("bounded", false);
                out.set("value", -std::numeric_limits<double>::infinity());
                return out;
            }
            candidates.push_back(tail);
            double minimum = std::numeric_limits<double>::infinity();
            for (double underlying : candidates)
                minimum = std::min(minimum, bookPayoff(underlying));
            out.set("bounded", true);
            out.set("value", minimum);
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Payoff-book extremes and breakevens                                 */
    /* ------------------------------------------------------------------ */
    /* For continuous books (forward/call/put/equity/bond/coupon legs) the */
    /* book payoff is piecewise linear in the terminal spot, so its max,   */
    /* min and breakevens are exact: evaluate at the kinks (0 and every    */
    /* forward/call/put strike) and inspect the tail slope.                */

    std::vector<double> payoffKinks(const val &legs, unsigned length)
    {
        std::vector<double> kinks{0.0};
        for (unsigned i = 0; i < length; ++i)
        {
            const std::string kind = legs[i]["kind"].as<std::string>();
            if (kind == "forward" || kind == "call" || kind == "put")
                kinks.push_back(legs[i]["strike"].as<double>());
        }
        std::sort(kinks.begin(), kinks.end());
        kinks.erase(std::unique(kinks.begin(), kinks.end()), kinks.end());
        return kinks;
    }

    val payoffExtremes(val legs)
    {
        try
        {
            const unsigned length = legs["length"].as<unsigned>();
            QL_REQUIRE(length > 0, "book must contain at least one leg");
            const std::vector<double> kinks = payoffKinks(legs, length);
            auto bookPayoff = [&](double underlying)
            {
                double total = 0.0;
                for (unsigned i = 0; i < length; ++i)
                    total += terminalLegPayoff(legs[i], underlying);
                return total;
            };
            const double tail = 1.0e8;
            const double tailSlope = bookPayoff(tail + 1.0) - bookPayoff(tail);
            double minimum = std::numeric_limits<double>::infinity();
            double maximum = -std::numeric_limits<double>::infinity();
            for (double spot : kinks)
            {
                const double payoff = bookPayoff(spot);
                minimum = std::min(minimum, payoff);
                maximum = std::max(maximum, payoff);
            }
            val out = val::object();
            out.set("ok", true);
            out.set("boundedBelow", tailSlope >= 0.0);
            out.set("min", tailSlope < 0.0 ? -std::numeric_limits<double>::infinity() : minimum);
            out.set("boundedAbove", tailSlope <= 0.0);
            out.set("max", tailSlope > 0.0 ? std::numeric_limits<double>::infinity() : maximum);
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val payoffBreakevens(val legs)
    {
        try
        {
            const unsigned length = legs["length"].as<unsigned>();
            QL_REQUIRE(length > 0, "book must contain at least one leg");
            const std::vector<double> kinks = payoffKinks(legs, length);
            auto bookPayoff = [&](double underlying)
            {
                double total = 0.0;
                for (unsigned i = 0; i < length; ++i)
                    total += terminalLegPayoff(legs[i], underlying);
                return total;
            };
            std::vector<double> roots;
            auto pushRoot = [&](double root)
            {
                const double value = std::round(root * 1.0e6) / 1.0e6;
                if (!std::isfinite(value))
                    return;
                for (double existing : roots)
                    if (std::abs(existing - value) < 1.0e-6)
                        return;
                roots.push_back(value);
            };
            for (std::size_t index = 0; index + 1 < kinks.size(); ++index)
            {
                const double a = kinks[index], b = kinks[index + 1];
                const double fa = bookPayoff(a), fb = bookPayoff(b);
                if (fa == 0.0 && fb != 0.0)
                    pushRoot(a);
                else if (fa != 0.0 && fb == 0.0)
                    pushRoot(b);
                else if (fa * fb < 0.0)
                    pushRoot(a - (fa * (b - a)) / (fb - fa));
            }
            const double last = kinks.back();
            const double atLast = bookPayoff(last);
            const double tailSlope = bookPayoff(last + 1.0) - atLast;
            if (atLast == 0.0 && tailSlope != 0.0)
                pushRoot(last);
            else if (tailSlope != 0.0)
            {
                const double root = last - atLast / tailSlope;
                if (root > last)
                    pushRoot(root);
            }
            val out = val::object();
            out.set("ok", true);
            val rootArray = val::array();
            for (std::size_t i = 0; i < roots.size(); ++i)
                rootArray.set(i, roots[i]);
            out.set("roots", rootArray);
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Volatility surface (QuantLib BlackVarianceSurface)                  */
    /* ------------------------------------------------------------------ */
    /* The JS side feeds a grid of expiries x strikes and a Black-vol      */
    /* matrix (decimal vols, row-major) and gets back an integer handle.   */
    /* The surface stays alive in C++ so callers can query blackVol(T,K)   */
    /* and price European options (vega included) against the surface's    */
    /* local vol. The runtime destroys the handle when a round is done.    */

    std::vector<ext::shared_ptr<BlackVarianceSurface>> volSurfaces;

    Date parseIsoDate(const std::string &s)
    {
        int y = 0, m = 0, d = 0;
        std::sscanf(s.c_str(), "%d-%d-%d", &y, &m, &d);
        QL_REQUIRE(y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31, "invalid ISO date: " + s);
        return qd(y, m, d);
    }

    ext::shared_ptr<BlackVarianceSurface> &surfaceRef(int handle)
    {
        QL_REQUIRE(handle >= 0 && static_cast<std::size_t>(handle) < volSurfaces.size() && volSurfaces[handle],
                   "unknown vol surface handle " + std::to_string(handle));
        return volSurfaces[handle];
    }

    val createVolSurface(int ey, int em, int ed, val dates, val strikes, val vols)
    {
        try
        {
            evaluation(ey, em, ed);
            Date today = qd(ey, em, ed);
            const unsigned nDates = dates["length"].as<unsigned>();
            const unsigned nStrikes = strikes["length"].as<unsigned>();
            QL_REQUIRE(nDates > 0 && nStrikes > 0, "vol surface needs at least one expiry and one strike");
            QL_REQUIRE(vols["length"].as<unsigned>() == nDates * nStrikes, "vol matrix size mismatch");

            std::vector<Date> expiries;
            expiries.reserve(nDates);
            for (unsigned i = 0; i < nDates; ++i)
                expiries.push_back(parseIsoDate(dates[i].as<std::string>()));
            std::vector<Real> strikeVec;
            strikeVec.reserve(nStrikes);
            for (unsigned j = 0; j < nStrikes; ++j)
                strikeVec.push_back(strikes[j].as<double>());

            // QuantLib's BlackVarianceSurface stores the matrix with one row
            // per strike and one column per expiry date (QL_REQUIRE checks
            // strikes==rows and dates==columns), so the flat JS array is
            // strike-major: [strike][date].
            Matrix volMatrix(nStrikes, nDates);
            for (unsigned i = 0; i < nStrikes; ++i)
                for (unsigned j = 0; j < nDates; ++j)
                    volMatrix[i][j] = vols[i * nDates + j].as<double>();

            volSurfaces.push_back(ext::make_shared<BlackVarianceSurface>(
                today, TARGET(), expiries, strikeVec, volMatrix, Actual365Fixed()));
            val out = val::object();
            out.set("ok", true);
            out.set("handle", static_cast<int>(volSurfaces.size() - 1));
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val volSurfaceBlackVol(int handle, int y, int m, int d, double strike)
    {
        try
        {
            const auto &surface = surfaceRef(handle);
            val out = val::object();
            out.set("ok", true);
            out.set("value", surface->blackVol(qd(y, m, d), strike));
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    val priceEuropeanUnderSurface(int handle, int ey, int em, int ed, int my, int mm, int md,
                                  double spot, double strike, double r, double q, bool call)
    {
        try
        {
            evaluation(ey, em, ed);
            Date today = qd(ey, em, ed), maturity = qd(my, mm, md);
            DayCounter dc = Actual365Fixed();
            auto s = ext::make_shared<SimpleQuote>(spot);
            auto rf = ext::make_shared<FlatForward>(today, r, dc);
            auto div = ext::make_shared<FlatForward>(today, q, dc);
            auto process = ext::make_shared<BlackScholesMertonProcess>(
                Handle<Quote>(s), Handle<YieldTermStructure>(div),
                Handle<YieldTermStructure>(rf),
                Handle<BlackVolTermStructure>(surfaceRef(handle)));
            VanillaOption option(ext::make_shared<PlainVanillaPayoff>(call ? Option::Call : Option::Put, strike),
                                 ext::make_shared<EuropeanExercise>(maturity));
            option.setPricingEngine(ext::make_shared<AnalyticEuropeanEngine>(process));
            val out = val::object();
            out.set("ok", true);
            out.set("value", option.NPV());
            out.set("delta", option.delta());
            out.set("gamma", option.gamma());
            out.set("vega", option.vega());
            out.set("theta", option.theta());
            out.set("rho", option.rho());
            return out;
        }
        catch (const std::exception &e)
        {
            return failure(e);
        }
    }

    void destroyVolSurface(int handle)
    {
        if (handle >= 0 && static_cast<std::size_t>(handle) < volSurfaces.size())
        {
            volSurfaces[handle].reset();
        }
    }
}
EMSCRIPTEN_BINDINGS(quantcraft_quantlib)
{
    emscripten::function("quantLibVersion", &quantLibVersion);
    emscripten::function("priceEuropean", &european);
    emscripten::function("impliedVolatility", &impliedVolatility);
    emscripten::function("solveRoot", &solveRoot);
    emscripten::function("priceAmerican", &american);
    emscripten::function("priceStock", &stock);
    emscripten::function("priceDigital", &digital);
    emscripten::function("equityMoveProbabilities", &equityMoveProbabilities);
    emscripten::function("priceBarrier", &barrier);
    emscripten::function("priceFixedRateBond", &fixedBond);
    emscripten::function("priceZeroCouponBond", &zeroBond);
    emscripten::function("scheduleDates", &scheduleDates);
    emscripten::function("thirty360DayCount", &thirty360DayCount);
    emscripten::function("createZeroCurve", &createZeroCurve);
    emscripten::function("createZeroCurveAdvanced", &createZeroCurveAdvanced);
    emscripten::function("curveDiscount", &curveDiscount);
    emscripten::function("curveZeroRate", &curveZeroRate);
    emscripten::function("curveForwardRate", &curveForwardRate);
    emscripten::function("bumpCurveNode", &bumpCurveNode);
    emscripten::function("priceBondWithCurve", &priceBondWithCurve);
    emscripten::function("repriceBondBetweenCurves", &repriceBondBetweenCurves);
    emscripten::function("repriceBondsBetweenCurves", &repriceBondsBetweenCurves);
    emscripten::function("destroyCurve", &destroyCurve);
    emscripten::function("priceVanillaSwap", &vanillaSwap);
    emscripten::function("priceCapFloor", &capFloor);
    emscripten::function("priceCallablePutableBond", &callablePutableBond);
    emscripten::function("terminalPayoff", &terminalPayoff);
    emscripten::function("minimumBookPayoff", &minimumBookPayoff);
    emscripten::function("payoffExtremes", &payoffExtremes);
    emscripten::function("payoffBreakevens", &payoffBreakevens);
    emscripten::function("normalCdf", &normalCdf);
    emscripten::function("normalPdf", &normalPdf);
    emscripten::function("millsRatio", &millsRatio);
    emscripten::function("createVolSurface", &createVolSurface);
    emscripten::function("volSurfaceBlackVol", &volSurfaceBlackVol);
    emscripten::function("priceEuropeanUnderSurface", &priceEuropeanUnderSurface);
    emscripten::function("destroyVolSurface", &destroyVolSurface);
}
