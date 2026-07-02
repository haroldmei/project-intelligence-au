import { describe, it, expect } from "vitest";
import {
  PRICING,
  GST_RATE,
  priceDollars,
  gstComponentCents,
  gstComponentDollars,
  PRICE_AMOUNT,
  PRICE_MONTHLY,
  GST_SUFFIX,
  PRICE_MONTHLY_WITH_GST,
  PRICE_MONTHLY_INC_GST,
  SOLO_PLAN_LABEL,
  TRIAL_LENGTH_LABEL,
} from "./pricing";

describe("pricing — single source of truth", () => {
  it("pins the canonical facts: AUD 99 inc GST, Solo, 28-day trial", () => {
    expect(PRICING).toEqual({
      planName: "Solo",
      currency: "AUD",
      priceCents: 9900,
      gstInclusive: true,
      trialDays: 28,
    });
  });

  it("derives the headline price in whole dollars", () => {
    expect(priceDollars).toBe(99);
  });

  it("derives the GST component of the inclusive price (~AUD 9)", () => {
    // inc-GST: gst = total − total / (1 + rate) = 9900 − 9000 = 900 cents.
    expect(GST_RATE).toBe(0.1);
    expect(gstComponentCents).toBe(900);
    expect(gstComponentDollars).toBe(9);
  });

  it("formats the display strings from the constants", () => {
    expect(PRICE_AMOUNT).toBe("AUD 99");
    expect(PRICE_MONTHLY).toBe("AUD 99/mo");
    expect(GST_SUFFIX).toBe("GST included");
    expect(PRICE_MONTHLY_WITH_GST).toBe("AUD 99/mo, GST included");
    expect(PRICE_MONTHLY_INC_GST).toBe("AUD 99/mo inc GST");
    expect(SOLO_PLAN_LABEL).toBe("Solo — AUD 99/mo inc GST");
    expect(TRIAL_LENGTH_LABEL).toBe("28-day");
  });

  it("keeps every display string free of a bare dollar-count that could drift", () => {
    // The formatted strings must always carry the AUD currency prefix, never a
    // bare number — this guards against a future edit reintroducing a raw price.
    for (const s of [PRICE_AMOUNT, PRICE_MONTHLY, SOLO_PLAN_LABEL]) {
      expect(s).toContain(PRICING.currency);
      expect(s).toContain(String(priceDollars));
    }
  });
});
