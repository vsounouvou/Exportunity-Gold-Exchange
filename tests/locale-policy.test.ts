import assert from "node:assert/strict";
import test from "node:test";

import { resolveLocalePolicy, type Currency, type Language } from "../client/src/contexts/LocaleContext";

function baseInput(overrides?: Partial<Parameters<typeof resolveLocalePolicy>[0]>) {
  return {
    browserLanguage: "en" as Language,
    browserCurrency: "USD" as Currency,
    detectedCountry: null as string | null,
    manualLanguage: null as Language | null,
    manualCurrency: null as Currency | null,
    urlLanguage: null as Language | null,
    urlCurrency: null as Currency | null,
    ...(overrides || {}),
  };
}

test("locale policy: URL overrides manual + geo", () => {
  const resolved = resolveLocalePolicy(
    baseInput({
      detectedCountry: "CI",
      manualLanguage: "fr",
      manualCurrency: "XOF",
      urlLanguage: "en",
      urlCurrency: "GBP",
    }),
  );
  assert.equal(resolved.language, "en");
  assert.equal(resolved.currency, "GBP");
  assert.equal(resolved.source, "url");
  assert.equal(resolved.manualOverride, true);
});

test("locale policy: manual override wins over geo", () => {
  const resolved = resolveLocalePolicy(
    baseInput({
      detectedCountry: "GH",
      manualLanguage: "fr",
      manualCurrency: "EUR",
    }),
  );
  assert.equal(resolved.language, "fr");
  assert.equal(resolved.currency, "EUR");
  assert.equal(resolved.source, "manual");
  assert.equal(resolved.manualOverride, true);
});

test("locale policy: KE geo resolves to EN/KES", () => {
  const resolved = resolveLocalePolicy(
    baseInput({
      detectedCountry: "KE",
    }),
  );
  assert.equal(resolved.language, "en");
  assert.equal(resolved.currency, "KES");
  assert.equal(resolved.source, "geo");
});
