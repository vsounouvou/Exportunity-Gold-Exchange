import assert from "node:assert/strict";
import test from "node:test";

import { mergeEffectiveFxRates, normalizeAndValidateOverrides, type FxRates } from "../server/lib/fx";

const BASE_RATES: FxRates = {
  USD: 1,
  EUR: 0.9,
  GBP: 0.8,
  XOF: 600,
  GHS: 12,
  NGN: 1400,
  KES: 125,
  AED: 3.67,
};

test("fx merge applies tenant overrides and keeps USD fixed", () => {
  const merged = mergeEffectiveFxRates(BASE_RATES, {
    EUR: 0.95,
    XOF: 610,
    USD: 9 as any,
  });

  assert.equal(merged.USD, 1);
  assert.equal(merged.EUR, 0.95);
  assert.equal(merged.XOF, 610);
  assert.equal(merged.GBP, BASE_RATES.GBP);
});

test("fx override validation rejects extreme drift", () => {
  assert.throws(
    () =>
      normalizeAndValidateOverrides(
        { EUR: 2.5 },
        BASE_RATES,
        {
          maxDriftPercent: 20,
        },
      ),
    /exceeds limit/i,
  );
});

test("fx override validation accepts positive bounded values", () => {
  const valid = normalizeAndValidateOverrides({ EUR: 0.92, KES: 130 }, BASE_RATES, { maxDriftPercent: 50 });
  assert.equal(valid.EUR, 0.92);
  assert.equal(valid.KES, 130);
});
