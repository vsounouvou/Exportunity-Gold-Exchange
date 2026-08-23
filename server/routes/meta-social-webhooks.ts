import { Router, type Request, type Response } from "express";

import {
  metaWebhookSecurityStatus,
  verifyMetaWebhookChallenge,
} from "../lib/integrations/metaWebhookSecurity";
import {
  ingestMetaSocialWebhookNotification,
  MetaSocialWebhookRequestError,
} from "../lib/territory-media/metaSocialWebhook";
import { metaSocialWebhookFeatureStatus } from "../lib/territory-media/metaSocialWebhookPolicy";

type RawBodyRequest = Request & { rawBody?: Buffer };

const router = Router();

router.get("/", (req: Request, res: Response) => {
  const feature = metaSocialWebhookFeatureStatus();
  if (!feature.enabled) {
    return res.status(503).json({
      ok: false,
      code: "feature_disabled",
      message: "Meta social webhook ingestion is disabled",
    });
  }
  const verification = verifyMetaWebhookChallenge({
    purpose: "social",
    mode: req.query["hub.mode"],
    verifyToken: req.query["hub.verify_token"],
    challenge: req.query["hub.challenge"],
  });
  if (verification.ok) {
    return res.status(200).type("text/plain").send(verification.challenge);
  }
  if (!metaWebhookSecurityStatus("social").verifyTokenConfigured) {
    return res.status(503).json({
      ok: false,
      code: verification.reason,
      message: "Meta social webhook verification is not configured",
    });
  }
  return res.status(403).json({
    ok: false,
    code: verification.reason,
    message: "Meta social webhook verification failed",
  });
});

router.post("/", async (req: RawBodyRequest, res: Response) => {
  try {
    const result = await ingestMetaSocialWebhookNotification({
      rawBody: req.rawBody,
      signatureHeader: req.headers["x-hub-signature-256"],
      payload: req.body,
    });
    return res.status(200).json({
      ok: true,
      accepted: result.accepted,
      durableReceiptCount: result.durableReceiptCount,
      statusCounts: result.statusCounts,
      credentialsExposed: false,
      externalReplyPerformed: false,
      providerMutationPerformed: false,
    });
  } catch (error: any) {
    if (error instanceof MetaSocialWebhookRequestError) {
      return res.status(error.httpStatus).json({
        ok: false,
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return res.status(500).json({
      ok: false,
      code: "durable_receipt_failed",
      message: "Signed Meta webhook notification was not durably retained",
      retryable: true,
    });
  }
});

export default router;
