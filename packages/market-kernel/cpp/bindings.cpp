#include <ql/quantlib.hpp>
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <algorithm>
#include <limits>
#include <vector>
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

    double terminalLegPayoff(const val &leg, double underlying)
    {
        const std::string kind = leg["kind"].as<std::string>();
        const double quantity = leg["quantity"].as<double>();
        if (kind == "equity")
            return quantity * underlying;
        if (kind == "bond" || kind == "coupon")
            return quantity * leg["redemption"].as<double>();

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
        return active;
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
}
EMSCRIPTEN_BINDINGS(quantcraft_quantlib)
{
    emscripten::function("quantLibVersion", &quantLibVersion);
    emscripten::function("priceEuropean", &european);
    emscripten::function("priceStock", &stock);
    emscripten::function("priceDigital", &digital);
    emscripten::function("equityMoveProbabilities", &equityMoveProbabilities);
    emscripten::function("priceBarrier", &barrier);
    emscripten::function("priceFixedRateBond", &fixedBond);
    emscripten::function("priceZeroCouponBond", &zeroBond);
    emscripten::function("minimumBookPayoff", &minimumBookPayoff);
}
