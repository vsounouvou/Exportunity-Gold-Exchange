export const CARRIER_ADAPTER_CAPABILITIES = [
  "connection_check",
  "quote_request",
  "booking_create",
  "booking_cancel",
  "tracking_read",
  "proof_of_delivery_read",
  "webhook_receipts",
] as const;

export type CarrierAdapterCapability =
  (typeof CARRIER_ADAPTER_CAPABILITIES)[number];

export type CarrierAdapterContext = {
  tenantId: number;
  carrierProfileId: string;
  connectionId: string;
  environment: "sandbox" | "test" | "production";
  correlationId: string;
  credentialReference: string | null;
};

export type CarrierRouteAddress = {
  countryCode: string;
  city?: string | null;
  territoryId?: number | null;
  postalCode?: string | null;
  addressLine?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type CarrierCargo = {
  description: string;
  productCategory?: string | null;
  quantity?: number | null;
  unit?: string | null;
  weightKg?: number | null;
  volumeM3?: number | null;
  declaredValueMinor?: number | null;
  currencyCode?: string | null;
  hazardousGoods: boolean;
  coldChainRequired: boolean;
  fragile: boolean;
  packages?: Array<{
    count: number;
    weightKg?: number | null;
    lengthCm?: number | null;
    widthCm?: number | null;
    heightCm?: number | null;
  }>;
};

export type CarrierQuoteRequestInput = {
  requestId: string;
  serviceType: "freight" | "customs" | "last_mile";
  origin: CarrierRouteAddress;
  destination: CarrierRouteAddress;
  cargo: CarrierCargo;
  incoterm?: string | null;
  requestedPickupAt?: string | null;
  requiredDeliveryAt?: string | null;
  requiredCapabilities: string[];
};

export type CarrierProviderReceipt = {
  providerEventId: string;
  eventType: string;
  payloadHash: string;
  providerConfirmedAt: string;
  providerReference: string;
};

export type CarrierConnectionCheck = {
  providerConfirmed: boolean;
  externalAccountReference: string | null;
  capabilities: CarrierAdapterCapability[];
  callbackStatus: "not_configured" | "pending" | "verified" | "failed";
  restrictionStatus: string;
  evidence: Record<string, unknown>;
};

export type CarrierQuoteResult = {
  providerConfirmed: boolean;
  providerQuoteReference: string;
  totalCostMinor: number;
  currencyCode: string;
  costBreakdown: Array<Record<string, unknown>>;
  minimumTransitDays: number | null;
  maximumTransitDays: number | null;
  estimatedDeliveryAt: string | null;
  validUntil: string;
  terms: Record<string, unknown>;
  receipt: CarrierProviderReceipt;
};

export type CarrierBookingRequestInput = {
  authorizationId: string;
  quoteRequestId: string;
  deliveryQuoteId: string;
  providerQuoteReference: string;
  authorizedCostMinor: number;
  currencyCode: string;
  origin: CarrierRouteAddress;
  destination: CarrierRouteAddress;
  cargo: CarrierCargo;
  contactReferences: {
    pickupContactReference?: string | null;
    deliveryContactReference?: string | null;
  };
};

export type CarrierBookingResult = {
  providerConfirmed: boolean;
  providerBookingReference: string;
  trackingReference: string | null;
  status: "submitted" | "confirmed";
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  estimatedDeliveryAt: string | null;
  receipt: CarrierProviderReceipt;
};

export type CarrierTrackingResult = {
  providerConfirmed: boolean;
  providerBookingReference: string;
  trackingReference: string | null;
  currentStatus: string;
  events: Array<{
    providerEventId: string;
    eventType: string;
    occurredAt: string;
    location?: Record<string, unknown> | null;
    publicMessage?: string | null;
    evidence?: Array<Record<string, unknown>>;
  }>;
  proofOfDelivery?: Record<string, unknown> | null;
  receipt: CarrierProviderReceipt;
};

/**
 * Official carrier implementations must resolve credentials from the canonical
 * connection/secret boundary. Tokens, passwords, and API keys are never passed
 * through quote, booking, tracking, or fulfillment records.
 */
export interface CarrierAdapter {
  readonly provider: string;
  readonly capabilities: readonly CarrierAdapterCapability[];
  verifyConnection(context: CarrierAdapterContext): Promise<CarrierConnectionCheck>;
  requestQuote(
    context: CarrierAdapterContext,
    request: CarrierQuoteRequestInput,
  ): Promise<CarrierQuoteResult>;
  createBooking(
    context: CarrierAdapterContext,
    request: CarrierBookingRequestInput,
  ): Promise<CarrierBookingResult>;
  getTracking(
    context: CarrierAdapterContext,
    providerBookingReference: string,
  ): Promise<CarrierTrackingResult>;
  cancelBooking(
    context: CarrierAdapterContext,
    providerBookingReference: string,
    reason: string,
  ): Promise<{ providerConfirmed: boolean; receipt: CarrierProviderReceipt }>;
  verifyWebhookSignature(input: {
    connectionId: string;
    headers: Record<string, string | string[] | undefined>;
    rawBody: Uint8Array;
  }): Promise<boolean>;
}

const adapters = new Map<string, CarrierAdapter>();

export function registerCarrierAdapter(adapter: CarrierAdapter) {
  const provider = String(adapter.provider || "").trim().toLowerCase();
  if (!provider) throw new Error("Carrier adapter provider is required");
  if (adapters.has(provider)) {
    throw new Error(`Carrier adapter already registered for ${provider}`);
  }
  adapters.set(provider, adapter);
}

export function getCarrierAdapter(provider: string) {
  return adapters.get(String(provider || "").trim().toLowerCase()) || null;
}

export function listRegisteredCarrierAdapters() {
  return Array.from(adapters.values()).map((adapter) => ({
    provider: adapter.provider,
    capabilities: [...adapter.capabilities],
  }));
}
