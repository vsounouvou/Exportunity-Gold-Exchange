import { Router } from "express";
import { startOtpHandler, verifyOtpHandler } from "./ece";

const router = Router();

router.post("/otp/send", startOtpHandler);
router.post("/otp/verify", verifyOtpHandler);

export default router;
