import { db } from "@db";
import { eq, and, desc, gte, lte, sql, or } from "drizzle-orm";
import {
  deliveryAgents,
  agentWallets,
  deliveryWalletTransactions,
  insurancePlans,
  agentInsuranceSubscriptions,
  deliveryOrders,
  orderAssignments,
  orderScans,
  riskAdjustments,
  deliveryFeeRevenue
} from "@db/schema";
import { nanoid } from "nanoid";
import QRCode from "qrcode";

const DEPOSIT_FEE_PERCENTAGE = 0.015;
const WITHDRAWAL_FEE_PERCENTAGE = 0.02;
const DELIVERY_COMMISSION_PERCENTAGE = 0.15;

export interface AgentRegistrationInput {
  userId: number;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  vehicleType?: string;
  vehiclePlate?: string;
}

export interface DepositInput {
  agentId: number;
  amount: number;
  paymentMethod: string;
  paymentProvider?: string;
  externalTransactionId?: string;
}

export interface WithdrawalInput {
  agentId: number;
  amount: number;
  paymentMethod: string;
}

export interface OrderInput {
  externalOrderId?: string;
  companyId?: number;
  orderValue: number;
  deliveryFee: number;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupContactName?: string;
  pickupContactPhone?: string;
  pickupInstructions?: string;
  dropoffAddress: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
  dropoffContactName?: string;
  dropoffContactPhone?: string;
  dropoffInstructions?: string;
  packageDescription?: string;
  packageWeight?: number;
  packageSize?: string;
  isFragile?: boolean;
  requiresSignature?: boolean;
  scheduledPickupTime?: Date;
  metadata?: Record<string, unknown>;
}

export const deliveryService = {
  async registerAgent(input: AgentRegistrationInput) {
    const [agent] = await db.insert(deliveryAgents).values({
      userId: input.userId,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email,
      vehicleType: input.vehicleType as any,
      vehiclePlate: input.vehiclePlate,
      status: "pending_kyc",
      insuranceTier: "basic",
      kycStatus: "pending"
    }).returning();

    const [wallet] = await db.insert(agentWallets).values({
      agentId: agent.id,
      balance: "0.00",
      heldAmount: "0.00",
      availableBalance: "0.00",
      currency: "XOF"
    }).returning();

    return { agent, wallet };
  },

  async getAgent(agentId: number) {
    return db.query.deliveryAgents.findFirst({
      where: eq(deliveryAgents.id, agentId),
      with: {
        wallet: true,
        subscriptions: {
          with: {
            plan: true
          }
        }
      }
    });
  },

  async getAgentByUserId(userId: number) {
    return db.query.deliveryAgents.findFirst({
      where: eq(deliveryAgents.userId, userId),
      with: {
        wallet: true,
        subscriptions: {
          with: {
            plan: true
          }
        }
      }
    });
  },

  async updateAgentLocation(agentId: number, latitude: number, longitude: number) {
    await db.update(deliveryAgents)
      .set({
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        lastLocationUpdate: new Date(),
        updatedAt: new Date()
      })
      .where(eq(deliveryAgents.id, agentId));
  },

  async setAgentOnlineStatus(agentId: number, isOnline: boolean) {
    await db.update(deliveryAgents)
      .set({
        isOnline,
        updatedAt: new Date()
      })
      .where(eq(deliveryAgents.id, agentId));
  },

  async updateKycStatus(agentId: number, status: string, documents?: any, rejectionReason?: string) {
    const updateData: any = {
      kycStatus: status,
      updatedAt: new Date()
    };

    if (documents) {
      updateData.kycDocuments = documents;
    }

    if (status === "verified") {
      updateData.status = "active";
      if (updateData.kycDocuments) {
        updateData.kycDocuments.verifiedAt = new Date().toISOString();
      }
    } else if (status === "rejected" && rejectionReason) {
      if (!updateData.kycDocuments) updateData.kycDocuments = {};
      updateData.kycDocuments.rejectionReason = rejectionReason;
    }

    await db.update(deliveryAgents)
      .set(updateData)
      .where(eq(deliveryAgents.id, agentId));
  },

  async getWallet(agentId: number) {
    return db.query.agentWallets.findFirst({
      where: eq(agentWallets.agentId, agentId)
    });
  },

  async deposit(input: DepositInput) {
    const wallet = await this.getWallet(input.agentId);
    if (!wallet) throw new Error("Wallet not found");

    const fee = Number((input.amount * DEPOSIT_FEE_PERCENTAGE).toFixed(2));
    const netAmount = Number((input.amount - fee).toFixed(2));
    const balanceBefore = Number(wallet.balance);
    const balanceAfter = Number((balanceBefore + netAmount).toFixed(2));

    const [transaction] = await db.insert(deliveryWalletTransactions).values({
      walletId: wallet.id,
      agentId: input.agentId,
      type: "deposit",
      amount: input.amount.toString(),
      fee: fee.toString(),
      netAmount: netAmount.toString(),
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
      status: "completed",
      paymentMethod: input.paymentMethod,
      paymentProvider: input.paymentProvider,
      externalTransactionId: input.externalTransactionId,
      description: `Deposit via ${input.paymentMethod}`,
      completedAt: new Date()
    }).returning();

    await db.update(agentWallets)
      .set({
        balance: balanceAfter.toString(),
        availableBalance: (balanceAfter - Number(wallet.heldAmount)).toString(),
        totalDeposited: (Number(wallet.totalDeposited) + netAmount).toString(),
        lastDepositAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(agentWallets.id, wallet.id));

    if (fee > 0) {
      await db.insert(deliveryFeeRevenue).values({
        source: "deposit_fee",
        agentId: input.agentId,
        walletTransactionId: transaction.id,
        amount: fee.toString(),
        description: `Deposit fee (${DEPOSIT_FEE_PERCENTAGE * 100}%)`
      });
    }

    const agent = await this.getAgent(input.agentId);
    if (agent?.status === "low_balance" && balanceAfter >= Number(wallet.minimumBalance)) {
      await db.update(deliveryAgents)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(deliveryAgents.id, input.agentId));
    }

    return transaction;
  },

  async withdraw(input: WithdrawalInput) {
    const wallet = await this.getWallet(input.agentId);
    if (!wallet) throw new Error("Wallet not found");

    const availableBalance = Number(wallet.availableBalance);
    if (input.amount > availableBalance) {
      throw new Error(`Insufficient available balance. Available: ${availableBalance}`);
    }

    const fee = Number((input.amount * WITHDRAWAL_FEE_PERCENTAGE).toFixed(2));
    const netAmount = Number((input.amount - fee).toFixed(2));
    const balanceBefore = Number(wallet.balance);
    const balanceAfter = Number((balanceBefore - input.amount).toFixed(2));

    const [transaction] = await db.insert(deliveryWalletTransactions).values({
      walletId: wallet.id,
      agentId: input.agentId,
      type: "withdrawal",
      amount: input.amount.toString(),
      fee: fee.toString(),
      netAmount: netAmount.toString(),
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
      status: "completed",
      paymentMethod: input.paymentMethod,
      description: `Withdrawal via ${input.paymentMethod}`,
      completedAt: new Date()
    }).returning();

    await db.update(agentWallets)
      .set({
        balance: balanceAfter.toString(),
        availableBalance: (balanceAfter - Number(wallet.heldAmount)).toString(),
        totalWithdrawn: (Number(wallet.totalWithdrawn) + input.amount).toString(),
        lastWithdrawalAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(agentWallets.id, wallet.id));

    if (fee > 0) {
      await db.insert(deliveryFeeRevenue).values({
        source: "withdrawal_fee",
        agentId: input.agentId,
        walletTransactionId: transaction.id,
        amount: fee.toString(),
        description: `Withdrawal fee (${WITHDRAWAL_FEE_PERCENTAGE * 100}%)`
      });
    }

    if (balanceAfter < Number(wallet.minimumBalance)) {
      await db.update(deliveryAgents)
        .set({ status: "low_balance", updatedAt: new Date() })
        .where(eq(deliveryAgents.id, input.agentId));
    }

    return transaction;
  },

  async getTransactionHistory(agentId: number, limit = 50, offset = 0) {
    return db.query.deliveryWalletTransactions.findMany({
      where: eq(deliveryWalletTransactions.agentId, agentId),
      orderBy: desc(deliveryWalletTransactions.createdAt),
      limit,
      offset
    });
  },

  async getInsurancePlans() {
    return db.query.insurancePlans.findMany({
      where: eq(insurancePlans.isActive, true)
    });
  },

  async subscribeToInsurance(agentId: number, planId: number) {
    const plan = await db.query.insurancePlans.findFirst({
      where: eq(insurancePlans.id, planId)
    });
    if (!plan) throw new Error("Insurance plan not found");

    const existingSubscription = await db.query.agentInsuranceSubscriptions.findFirst({
      where: and(
        eq(agentInsuranceSubscriptions.agentId, agentId),
        eq(agentInsuranceSubscriptions.status, "active")
      )
    });

    if (existingSubscription) {
      await db.update(agentInsuranceSubscriptions)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(agentInsuranceSubscriptions.id, existingSubscription.id));
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    const nextBillingDate = new Date(endDate);

    const [subscription] = await db.insert(agentInsuranceSubscriptions).values({
      agentId,
      planId,
      status: "active",
      startDate,
      endDate,
      nextBillingDate,
      autoRenew: true
    }).returning();

    await db.update(deliveryAgents)
      .set({
        insuranceTier: plan.tier,
        updatedAt: new Date()
      })
      .where(eq(deliveryAgents.id, agentId));

    if (Number(plan.monthlyFee) > 0) {
      await db.insert(deliveryFeeRevenue).values({
        source: "insurance_premium",
        agentId,
        subscriptionId: subscription.id,
        amount: plan.monthlyFee,
        description: `${plan.name} subscription`
      });
    }

    return subscription;
  },

  async cancelInsurance(agentId: number) {
    const subscription = await db.query.agentInsuranceSubscriptions.findFirst({
      where: and(
        eq(agentInsuranceSubscriptions.agentId, agentId),
        eq(agentInsuranceSubscriptions.status, "active")
      )
    });

    if (!subscription) throw new Error("No active subscription found");

    await db.update(agentInsuranceSubscriptions)
      .set({
        status: "cancelled",
        autoRenew: false,
        updatedAt: new Date()
      })
      .where(eq(agentInsuranceSubscriptions.id, subscription.id));

    await db.update(deliveryAgents)
      .set({
        insuranceTier: "basic",
        updatedAt: new Date()
      })
      .where(eq(deliveryAgents.id, agentId));

    return { success: true };
  },

  async createOrder(input: OrderInput) {
    const orderId = input.externalOrderId || `DEL-${nanoid(10).toUpperCase()}`;
    const pickupQrCode = await QRCode.toDataURL(`pickup:${orderId}`);
    const deliveryQrCode = await QRCode.toDataURL(`delivery:${orderId}`);

    const platformFee = Number((input.deliveryFee * DELIVERY_COMMISSION_PERCENTAGE).toFixed(2));
    const agentEarnings = Number((input.deliveryFee - platformFee).toFixed(2));

    const [createdOrder] = await db.insert(deliveryOrders).values({
      orderId,
      companyId: input.companyId,
      status: "pending",
      orderValue: input.orderValue.toString(),
      deliveryFee: input.deliveryFee.toString(),
      platformFee: platformFee.toString(),
      agentEarnings: agentEarnings.toString(),
      pickupAddress: input.pickupAddress,
      pickupLatitude: input.pickupLatitude.toString(),
      pickupLongitude: input.pickupLongitude.toString(),
      pickupContactName: input.pickupContactName,
      pickupContactPhone: input.pickupContactPhone,
      pickupInstructions: input.pickupInstructions,
      dropoffAddress: input.dropoffAddress,
      dropoffLatitude: input.dropoffLatitude.toString(),
      dropoffLongitude: input.dropoffLongitude.toString(),
      dropoffContactName: input.dropoffContactName,
      dropoffContactPhone: input.dropoffContactPhone,
      dropoffInstructions: input.dropoffInstructions,
      pickupQrCode,
      deliveryQrCode,
      packageDescription: input.packageDescription,
      packageWeight: input.packageWeight?.toString(),
      packageSize: input.packageSize as any,
      isFragile: input.isFragile,
      requiresSignature: input.requiresSignature,
      scheduledPickupTime: input.scheduledPickupTime,
      metadata: input.metadata || {}
    }).onConflictDoNothing({ target: deliveryOrders.orderId }).returning();

    let order: typeof deliveryOrders.$inferSelect | undefined = createdOrder;

    if (!order && input.externalOrderId) {
      order = await db.query.deliveryOrders.findFirst({
        where: eq(deliveryOrders.orderId, input.externalOrderId),
      });
    }
    if (!order) throw new Error("Delivery order could not be created");

    return order;
  },

  async getOrder(orderId: string) {
    return db.query.deliveryOrders.findFirst({
      where: eq(deliveryOrders.orderId, orderId),
      with: {
        assignments: {
          with: {
            agent: true
          }
        },
        scans: true
      }
    });
  },

  async findEligibleAgents(orderValue: number, pickupLat: number, pickupLng: number, maxDistance = 10) {
    const agents = await db.query.deliveryAgents.findMany({
      where: and(
        eq(deliveryAgents.status, "active"),
        eq(deliveryAgents.isOnline, true)
      ),
      with: {
        wallet: true,
        subscriptions: {
          where: eq(agentInsuranceSubscriptions.status, "active"),
          with: {
            plan: true
          }
        }
      }
    });

    const eligibleAgents = [];

    for (const agent of agents) {
      if (!agent.wallet || !agent.latitude || !agent.longitude) continue;

      const plan = agent.subscriptions?.[0]?.plan;
      const depositMultiplier = plan ? Number(plan.depositMultiplier) : 1;
      const requiredDeposit = orderValue * depositMultiplier;
      const availableBalance = Number(agent.wallet.availableBalance);

      if (availableBalance >= requiredDeposit) {
        const distance = this.calculateDistance(
          pickupLat, pickupLng,
          Number(agent.latitude), Number(agent.longitude)
        );

        if (distance <= maxDistance) {
          eligibleAgents.push({
            agent,
            distance,
            requiredDeposit,
            availableBalance,
            insuranceTier: agent.insuranceTier,
            coveragePercentage: plan?.coveragePercentage || 0
          });
        }
      }
    }

    return eligibleAgents.sort((a, b) => {
      const ratingDiff = Number(b.agent.rating) - Number(a.agent.rating);
      if (Math.abs(ratingDiff) > 0.5) return ratingDiff;
      return a.distance - b.distance;
    });
  },

  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  },

  async offerOrderToAgent(orderId: number, agentId: number, requiredDeposit: number) {
    const agent = await this.getAgent(agentId);
    if (!agent?.wallet) throw new Error("Agent or wallet not found");

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 2);

    const [assignment] = await db.insert(orderAssignments).values({
      orderId,
      agentId,
      status: "offered",
      requiredDeposit: requiredDeposit.toString(),
      expiresAt,
      agentDistanceAtOffer: agent.latitude ? "0" : null,
      agentRatingAtOffer: agent.rating
    }).returning();

    await db.update(deliveryOrders)
      .set({ status: "matching", updatedAt: new Date() })
      .where(eq(deliveryOrders.id, orderId));

    return assignment;
  },

  async acceptOrder(assignmentId: number) {
    const assignment = await db.query.orderAssignments.findFirst({
      where: eq(orderAssignments.id, assignmentId),
      with: {
        order: true,
        agent: {
          with: {
            wallet: true
          }
        }
      }
    });

    if (!assignment) throw new Error("Assignment not found");
    if (assignment.status !== "offered") throw new Error("Assignment is no longer available");
    if (new Date() > assignment.expiresAt!) throw new Error("Offer has expired");

    const wallet = assignment.agent.wallet;
    if (!wallet) throw new Error("Wallet not found");

    const requiredDeposit = Number(assignment.requiredDeposit);
    const availableBalance = Number(wallet.availableBalance);

    if (availableBalance < requiredDeposit) {
      throw new Error(`Insufficient balance. Required: ${requiredDeposit}, Available: ${availableBalance}`);
    }

    await db.insert(deliveryWalletTransactions).values({
      walletId: wallet.id,
      agentId: assignment.agentId,
      type: "hold",
      amount: requiredDeposit.toString(),
      fee: "0",
      netAmount: requiredDeposit.toString(),
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance,
      status: "completed",
      referenceType: "order_assignment",
      referenceId: assignmentId,
      description: `Deposit hold for order ${assignment.order.orderId}`,
      completedAt: new Date()
    });

    await db.update(agentWallets)
      .set({
        heldAmount: (Number(wallet.heldAmount) + requiredDeposit).toString(),
        availableBalance: (availableBalance - requiredDeposit).toString(),
        updatedAt: new Date()
      })
      .where(eq(agentWallets.id, wallet.id));

    await db.update(orderAssignments)
      .set({
        status: "accepted",
        heldAmount: requiredDeposit.toString(),
        respondedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(orderAssignments.id, assignmentId));

    await db.update(deliveryOrders)
      .set({ status: "assigned", updatedAt: new Date() })
      .where(eq(deliveryOrders.id, assignment.orderId));

    return { success: true, assignment };
  },

  async rejectOrder(assignmentId: number, reason?: string) {
    await db.update(orderAssignments)
      .set({
        status: "rejected",
        rejectionReason: reason,
        respondedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(orderAssignments.id, assignmentId));

    return { success: true };
  },

  async scanPickup(orderId: string, agentId: number, qrCode: string, latitude?: number, longitude?: number, photoUrl?: string) {
    const order = await this.getOrder(orderId);
    if (!order) throw new Error("Order not found");

    const expectedQr = `pickup:${orderId}`;
    const isValid = qrCode.includes(expectedQr);

    const activeAssignment = order.assignments?.find(a => 
      a.agentId === agentId && a.status === "accepted"
    );
    if (!activeAssignment) throw new Error("No active assignment for this agent");

    const [scan] = await db.insert(orderScans).values({
      orderId: order.id,
      assignmentId: activeAssignment.id,
      agentId,
      scanType: "pickup",
      scannedBy: "agent",
      qrCode,
      isValid,
      latitude: latitude?.toString(),
      longitude: longitude?.toString(),
      photoUrl
    }).returning();

    if (isValid) {
      await db.update(deliveryOrders)
        .set({
          status: "picked_up",
          actualPickupTime: new Date(),
          updatedAt: new Date()
        })
        .where(eq(deliveryOrders.id, order.id));
    }

    return { scan, isValid };
  },

  async scanDelivery(orderId: string, agentId: number, qrCode: string, latitude?: number, longitude?: number, signatureUrl?: string, photoUrl?: string) {
    const order = await this.getOrder(orderId);
    if (!order) throw new Error("Order not found");

    const expectedQr = `delivery:${orderId}`;
    const isValid = qrCode.includes(expectedQr);

    const activeAssignment = order.assignments?.find(a => 
      a.agentId === agentId && a.status === "accepted"
    );
    if (!activeAssignment) throw new Error("No active assignment for this agent");

    const [scan] = await db.insert(orderScans).values({
      orderId: order.id,
      assignmentId: activeAssignment.id,
      agentId,
      scanType: "delivery",
      scannedBy: "agent",
      qrCode,
      isValid,
      latitude: latitude?.toString(),
      longitude: longitude?.toString(),
      signatureUrl,
      photoUrl
    }).returning();

    if (isValid) {
      await this.completeDelivery(order.id, activeAssignment.id);
    }

    return { scan, isValid };
  },

  async completeDelivery(orderId: number, assignmentId: number) {
    const assignment = await db.query.orderAssignments.findFirst({
      where: eq(orderAssignments.id, assignmentId),
      with: {
        order: true,
        agent: {
          with: {
            wallet: true
          }
        }
      }
    });

    if (!assignment || !assignment.agent.wallet) {
      throw new Error("Assignment or wallet not found");
    }

    const wallet = assignment.agent.wallet;
    const heldAmount = Number(assignment.heldAmount);
    const agentEarnings = Number(assignment.order.agentEarnings);

    await db.insert(deliveryWalletTransactions).values({
      walletId: wallet.id,
      agentId: assignment.agentId,
      type: "release",
      amount: heldAmount.toString(),
      fee: "0",
      netAmount: heldAmount.toString(),
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance,
      status: "completed",
      referenceType: "order_assignment",
      referenceId: assignmentId,
      description: `Deposit released for order ${assignment.order.orderId}`,
      completedAt: new Date()
    });

    const newBalance = Number(wallet.balance) + agentEarnings;
    await db.insert(deliveryWalletTransactions).values({
      walletId: wallet.id,
      agentId: assignment.agentId,
      type: "commission",
      amount: agentEarnings.toString(),
      fee: "0",
      netAmount: agentEarnings.toString(),
      balanceBefore: wallet.balance,
      balanceAfter: newBalance.toString(),
      status: "completed",
      referenceType: "delivery_order",
      referenceId: orderId,
      description: `Earnings for order ${assignment.order.orderId}`,
      completedAt: new Date()
    });

    await db.update(agentWallets)
      .set({
        balance: newBalance.toString(),
        heldAmount: (Number(wallet.heldAmount) - heldAmount).toString(),
        availableBalance: (Number(wallet.availableBalance) + heldAmount + agentEarnings).toString(),
        totalEarnings: (Number(wallet.totalEarnings) + agentEarnings).toString(),
        updatedAt: new Date()
      })
      .where(eq(agentWallets.id, wallet.id));

    await db.update(orderAssignments)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(orderAssignments.id, assignmentId));

    await db.update(deliveryOrders)
      .set({
        status: "delivered",
        actualDeliveryTime: new Date(),
        updatedAt: new Date()
      })
      .where(eq(deliveryOrders.id, orderId));

    await db.update(deliveryAgents)
      .set({
        totalDeliveries: sql`${deliveryAgents.totalDeliveries} + 1`,
        successfulDeliveries: sql`${deliveryAgents.successfulDeliveries} + 1`,
        updatedAt: new Date()
      })
      .where(eq(deliveryAgents.id, assignment.agentId));

    await db.insert(deliveryFeeRevenue).values({
      source: "delivery_commission",
      orderId,
      agentId: assignment.agentId,
      amount: assignment.order.platformFee!,
      description: `Commission for order ${assignment.order.orderId}`
    });

    return { success: true };
  },

  async reportIssue(orderId: number, agentId: number, type: string, reason: string, evidenceUrls?: string[]) {
    const order = await db.query.deliveryOrders.findFirst({
      where: eq(deliveryOrders.id, orderId),
      with: {
        assignments: {
          where: and(
            eq(orderAssignments.agentId, agentId),
            eq(orderAssignments.status, "accepted")
          )
        }
      }
    });

    if (!order) throw new Error("Order not found");

    const assignment = order.assignments?.[0];
    if (!assignment) throw new Error("No active assignment found");

    const [adjustment] = await db.insert(riskAdjustments).values({
      orderId,
      agentId,
      assignmentId: assignment.id,
      type: type as any,
      amount: order.orderValue,
      reason,
      evidenceUrls: evidenceUrls || [],
      status: "pending"
    }).returning();

    return adjustment;
  },

  async processRiskAdjustment(adjustmentId: number, approved: boolean, reviewNotes?: string, reviewerId?: number) {
    const adjustment = await db.query.riskAdjustments.findFirst({
      where: eq(riskAdjustments.id, adjustmentId),
      with: {
        agent: {
          with: {
            wallet: true,
            subscriptions: {
              where: eq(agentInsuranceSubscriptions.status, "active"),
              with: {
                plan: true
              }
            }
          }
        },
        order: true,
        assignment: true
      }
    });

    if (!adjustment) throw new Error("Adjustment not found");
    if (adjustment.status !== "pending") throw new Error("Adjustment already processed");

    if (!approved) {
      await db.update(riskAdjustments)
        .set({
          status: "rejected",
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNotes
        })
        .where(eq(riskAdjustments.id, adjustmentId));
      return { success: true, status: "rejected" };
    }

    const wallet = adjustment.agent.wallet;
    if (!wallet) throw new Error("Wallet not found");

    const orderValue = Number(adjustment.amount);
    const plan = adjustment.agent.subscriptions?.[0]?.plan;
    const coveragePercentage = plan?.coveragePercentage || 0;
    
    const insuranceClaim = Number((orderValue * coveragePercentage / 100).toFixed(2));
    const agentDeduction = Number((orderValue - insuranceClaim).toFixed(2));

    if (agentDeduction > 0) {
      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore - agentDeduction;

      const [transaction] = await db.insert(deliveryWalletTransactions).values({
        walletId: wallet.id,
        agentId: adjustment.agentId,
        type: "deduction",
        amount: agentDeduction.toString(),
        fee: "0",
        netAmount: agentDeduction.toString(),
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        status: "completed",
        referenceType: "risk_adjustment",
        referenceId: adjustmentId,
        description: `Deduction for ${adjustment.reason}`,
        completedAt: new Date()
      }).returning();

      await db.update(agentWallets)
        .set({
          balance: balanceAfter.toString(),
          availableBalance: (balanceAfter - Number(wallet.heldAmount)).toString(),
          totalDeductions: (Number(wallet.totalDeductions) + agentDeduction).toString(),
          updatedAt: new Date()
        })
        .where(eq(agentWallets.id, wallet.id));

      if (balanceAfter < Number(wallet.minimumBalance)) {
        await db.update(deliveryAgents)
          .set({ status: "low_balance", updatedAt: new Date() })
          .where(eq(deliveryAgents.id, adjustment.agentId));
      }

      await db.update(riskAdjustments)
        .set({
          status: "processed",
          agentDeduction: agentDeduction.toString(),
          insuranceClaim: insuranceClaim.toString(),
          clientRefund: orderValue.toString(),
          walletTransactionId: transaction.id,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNotes,
          processedAt: new Date()
        })
        .where(eq(riskAdjustments.id, adjustmentId));
    }

    if (adjustment.assignment) {
      await db.update(orderAssignments)
        .set({
          status: "failed",
          failureReason: adjustment.reason,
          updatedAt: new Date()
        })
        .where(eq(orderAssignments.id, adjustment.assignment.id));
    }

    await db.update(deliveryOrders)
      .set({
        status: "failed",
        updatedAt: new Date()
      })
      .where(eq(deliveryOrders.id, adjustment.orderId));

    return { success: true, status: "processed", agentDeduction, insuranceClaim };
  },

  async getAgentStats(agentId: number) {
    const agent = await this.getAgent(agentId);
    if (!agent) throw new Error("Agent not found");

    const recentDeliveries = await db.query.orderAssignments.findMany({
      where: and(
        eq(orderAssignments.agentId, agentId),
        eq(orderAssignments.status, "completed")
      ),
      orderBy: desc(orderAssignments.completedAt),
      limit: 10,
      with: {
        order: true
      }
    });

    const totalEarnings = agent.wallet?.totalEarnings || "0";
    const totalDeliveries = agent.totalDeliveries || 0;
    const successfulDeliveries = agent.successfulDeliveries || 0;
    const successRate = totalDeliveries > 0 
      ? ((successfulDeliveries / totalDeliveries) * 100).toFixed(1)
      : "100";

    return {
      agent,
      stats: {
        totalEarnings,
        totalDeliveries,
        successfulDeliveries,
        successRate,
        rating: agent.rating,
        insuranceTier: agent.insuranceTier,
        walletBalance: agent.wallet?.balance || "0",
        availableBalance: agent.wallet?.availableBalance || "0",
        heldAmount: agent.wallet?.heldAmount || "0"
      },
      recentDeliveries
    };
  },

  async getPlatformStats() {
    const totalAgents = await db.select({ count: sql`count(*)` })
      .from(deliveryAgents);
    
    const activeAgents = await db.select({ count: sql`count(*)` })
      .from(deliveryAgents)
      .where(eq(deliveryAgents.status, "active"));
    
    const onlineAgents = await db.select({ count: sql`count(*)` })
      .from(deliveryAgents)
      .where(and(
        eq(deliveryAgents.status, "active"),
        eq(deliveryAgents.isOnline, true)
      ));

    const totalOrders = await db.select({ count: sql`count(*)` })
      .from(deliveryOrders);
    
    const completedOrders = await db.select({ count: sql`count(*)` })
      .from(deliveryOrders)
      .where(eq(deliveryOrders.status, "delivered"));

    const totalRevenue = await db.select({ sum: sql`sum(amount)` })
      .from(deliveryFeeRevenue);

    const revenueBySource = await db.select({
      source: deliveryFeeRevenue.source,
      total: sql`sum(amount)`
    })
      .from(deliveryFeeRevenue)
      .groupBy(deliveryFeeRevenue.source);

    return {
      agents: {
        total: Number(totalAgents[0]?.count || 0),
        active: Number(activeAgents[0]?.count || 0),
        online: Number(onlineAgents[0]?.count || 0)
      },
      orders: {
        total: Number(totalOrders[0]?.count || 0),
        completed: Number(completedOrders[0]?.count || 0)
      },
      revenue: {
        total: Number(totalRevenue[0]?.sum || 0),
        bySource: revenueBySource.map(r => ({
          source: r.source,
          total: Number(r.total || 0)
        }))
      }
    };
  }
};

export default deliveryService;
