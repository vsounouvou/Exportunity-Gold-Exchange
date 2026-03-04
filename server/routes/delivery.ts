import { Router } from "express";
import { z } from "zod";
import { deliveryService } from "../lib/deliveryService";

const router = Router();

const agentRegistrationSchema = z.object({
  userId: z.number(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  vehicleType: z.enum(['motorcycle', 'bicycle', 'car', 'van', 'truck', 'walking']).optional(),
  vehiclePlate: z.string().optional()
});

const depositSchema = z.object({
  agentId: z.number(),
  amount: z.number().positive(),
  paymentMethod: z.string(),
  paymentProvider: z.string().optional(),
  externalTransactionId: z.string().optional()
});

const withdrawalSchema = z.object({
  agentId: z.number(),
  amount: z.number().positive(),
  paymentMethod: z.string()
});

const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number()
});

const orderSchema = z.object({
  companyId: z.number().optional(),
  orderValue: z.number().positive(),
  deliveryFee: z.number().positive(),
  pickupAddress: z.string(),
  pickupLatitude: z.number(),
  pickupLongitude: z.number(),
  pickupContactName: z.string().optional(),
  pickupContactPhone: z.string().optional(),
  pickupInstructions: z.string().optional(),
  dropoffAddress: z.string(),
  dropoffLatitude: z.number(),
  dropoffLongitude: z.number(),
  dropoffContactName: z.string().optional(),
  dropoffContactPhone: z.string().optional(),
  dropoffInstructions: z.string().optional(),
  packageDescription: z.string().optional(),
  packageWeight: z.number().optional(),
  packageSize: z.enum(['small', 'medium', 'large', 'extra_large']).optional(),
  isFragile: z.boolean().optional(),
  requiresSignature: z.boolean().optional(),
  scheduledPickupTime: z.string().datetime().optional()
});

const scanSchema = z.object({
  qrCode: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  signatureUrl: z.string().optional(),
  photoUrl: z.string().optional()
});

const issueReportSchema = z.object({
  type: z.enum(['loss', 'damage', 'refund', 'insurance_claim', 'manual_adjustment']),
  reason: z.string(),
  evidenceUrls: z.array(z.string()).optional()
});

router.post("/agents/register", async (req, res) => {
  try {
    const data = agentRegistrationSchema.parse(req.body);
    const result = await deliveryService.registerAgent(data);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/agents/:agentId", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const agent = await deliveryService.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }
    res.json(agent);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/agents/user/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const agent = await deliveryService.getAgentByUserId(userId);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }
    res.json(agent);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.patch("/agents/:agentId/location", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const { latitude, longitude } = locationSchema.parse(req.body);
    await deliveryService.updateAgentLocation(agentId, latitude, longitude);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.patch("/agents/:agentId/online", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const { isOnline } = z.object({ isOnline: z.boolean() }).parse(req.body);
    await deliveryService.setAgentOnlineStatus(agentId, isOnline);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.patch("/agents/:agentId/kyc", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const { status, documents, rejectionReason } = req.body;
    await deliveryService.updateKycStatus(agentId, status, documents, rejectionReason);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/agents/:agentId/stats", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const stats = await deliveryService.getAgentStats(agentId);
    res.json(stats);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/wallets/:agentId", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const wallet = await deliveryService.getWallet(agentId);
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }
    res.json(wallet);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/wallets/deposit", async (req, res) => {
  try {
    const data = depositSchema.parse(req.body);
    const transaction = await deliveryService.deposit(data);
    res.json(transaction);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/wallets/withdraw", async (req, res) => {
  try {
    const data = withdrawalSchema.parse(req.body);
    const transaction = await deliveryService.withdraw(data);
    res.json(transaction);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/wallets/:agentId/transactions", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const transactions = await deliveryService.getTransactionHistory(agentId, limit, offset);
    res.json(transactions);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/insurance/plans", async (req, res) => {
  try {
    const plans = await deliveryService.getInsurancePlans();
    res.json(plans);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/insurance/subscribe", async (req, res) => {
  try {
    const { agentId, planId } = z.object({
      agentId: z.number(),
      planId: z.number()
    }).parse(req.body);
    const subscription = await deliveryService.subscribeToInsurance(agentId, planId);
    res.json(subscription);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/insurance/:agentId", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const result = await deliveryService.cancelInsurance(agentId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/orders", async (req, res) => {
  try {
    const data = orderSchema.parse(req.body);
    const order = await deliveryService.createOrder({
      ...data,
      scheduledPickupTime: data.scheduledPickupTime ? new Date(data.scheduledPickupTime) : undefined
    });
    res.json(order);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/orders/:orderId", async (req, res) => {
  try {
    const order = await deliveryService.getOrder(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(order);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/orders/:orderId/eligible-agents", async (req, res) => {
  try {
    const order = await deliveryService.getOrder(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    const maxDistance = parseFloat(req.query.maxDistance as string) || 10;
    const agents = await deliveryService.findEligibleAgents(
      Number(order.orderValue),
      Number(order.pickupLatitude),
      Number(order.pickupLongitude),
      maxDistance
    );
    res.json(agents);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/orders/:orderId/offer", async (req, res) => {
  try {
    const order = await deliveryService.getOrder(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    const { agentId, requiredDeposit } = z.object({
      agentId: z.number(),
      requiredDeposit: z.number()
    }).parse(req.body);
    const assignment = await deliveryService.offerOrderToAgent(order.id, agentId, requiredDeposit);
    res.json(assignment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/assignments/:assignmentId/accept", async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.assignmentId);
    const result = await deliveryService.acceptOrder(assignmentId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/assignments/:assignmentId/reject", async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.assignmentId);
    const { reason } = req.body;
    const result = await deliveryService.rejectOrder(assignmentId, reason);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/orders/:orderId/scan/pickup", async (req, res) => {
  try {
    const order = await deliveryService.getOrder(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    const { agentId } = z.object({ agentId: z.number() }).parse(req.body);
    const scanData = scanSchema.parse(req.body);
    const result = await deliveryService.scanPickup(
      req.params.orderId,
      agentId,
      scanData.qrCode,
      scanData.latitude,
      scanData.longitude,
      scanData.photoUrl
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/orders/:orderId/scan/delivery", async (req, res) => {
  try {
    const order = await deliveryService.getOrder(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    const { agentId } = z.object({ agentId: z.number() }).parse(req.body);
    const scanData = scanSchema.parse(req.body);
    const result = await deliveryService.scanDelivery(
      req.params.orderId,
      agentId,
      scanData.qrCode,
      scanData.latitude,
      scanData.longitude,
      scanData.signatureUrl,
      scanData.photoUrl
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/risk/report", async (req, res) => {
  try {
    const { orderId, agentId } = z.object({
      orderId: z.number(),
      agentId: z.number()
    }).parse(req.body);
    const issueData = issueReportSchema.parse(req.body);
    const adjustment = await deliveryService.reportIssue(
      orderId,
      agentId,
      issueData.type,
      issueData.reason,
      issueData.evidenceUrls
    );
    res.json(adjustment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/risk/:adjustmentId/resolve", async (req, res) => {
  try {
    const adjustmentId = parseInt(req.params.adjustmentId);
    const { approved, reviewNotes, reviewerId } = z.object({
      approved: z.boolean(),
      reviewNotes: z.string().optional(),
      reviewerId: z.number().optional()
    }).parse(req.body);
    const result = await deliveryService.processRiskAdjustment(
      adjustmentId,
      approved,
      reviewNotes,
      reviewerId
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/dashboard/stats", async (req, res) => {
  try {
    const stats = await deliveryService.getPlatformStats();
    res.json(stats);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
