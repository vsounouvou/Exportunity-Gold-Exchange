type Bucket = {
  minuteStartedAt: number;
  minuteCount: number;
  dayStartedAt: number;
  dayCount: number;
};

const buckets = new Map<string, Bucket>();

function getBucket(key: string): Bucket {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) {
    const next = { minuteStartedAt: now, minuteCount: 0, dayStartedAt: now, dayCount: 0 };
    buckets.set(key, next);
    return next;
  }
  if (now - bucket.minuteStartedAt >= 60_000) {
    bucket.minuteStartedAt = now;
    bucket.minuteCount = 0;
  }
  if (now - bucket.dayStartedAt >= 24 * 60 * 60_000) {
    bucket.dayStartedAt = now;
    bucket.dayCount = 0;
  }
  return bucket;
}

export function assertGooglePlacesImportAllowed(key = "default") {
  const perMinute = Math.max(1, Number(process.env.GOOGLE_PLACES_RATE_LIMIT_PER_MINUTE || 20));
  const perDay = Math.max(1, Number(process.env.GOOGLE_PLACES_DAILY_IMPORT_LIMIT || 500));
  const bucket = getBucket(key);
  if (bucket.minuteCount >= perMinute) {
    const retryInMs = Math.max(0, 60_000 - (Date.now() - bucket.minuteStartedAt));
    const error = new Error(`Google Places minute limit reached. Retry in ${Math.ceil(retryInMs / 1000)}s.`);
    (error as any).statusCode = 429;
    throw error;
  }
  if (bucket.dayCount >= perDay) {
    const error = new Error("Google Places daily import limit reached.");
    (error as any).statusCode = 429;
    throw error;
  }
  bucket.minuteCount += 1;
  bucket.dayCount += 1;
}

export function getGooglePlacesImportLimits(key = "default") {
  const bucket = getBucket(key);
  return {
    minute: {
      limit: Math.max(1, Number(process.env.GOOGLE_PLACES_RATE_LIMIT_PER_MINUTE || 20)),
      used: bucket.minuteCount,
      resetsAt: new Date(bucket.minuteStartedAt + 60_000).toISOString(),
    },
    day: {
      limit: Math.max(1, Number(process.env.GOOGLE_PLACES_DAILY_IMPORT_LIMIT || 500)),
      used: bucket.dayCount,
      resetsAt: new Date(bucket.dayStartedAt + 24 * 60 * 60_000).toISOString(),
    },
  };
}
