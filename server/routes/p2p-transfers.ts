import { Router, Request, Response } from 'express';
import { db } from '@db';
import { users, buyerWallets, buyerWalletTransactions, p2pTransfers } from '@db/schema';
import { eq, or, ilike, and, desc, sql } from 'drizzle-orm';
import QRCode from 'qrcode';

const router = Router();

async function getWalletForRequest(req: Request): Promise<{ wallet: any; userId: number | null; guestSessionId: string | null } | null> {
  const tenantId = req.tenant?.id;
  if (!tenantId) return null;

  const session = (req as any).session;
  const guestSessionId = req.headers['x-guest-session'] as string;
  
  if (session?.userId) {
    let wallet = await db.query.buyerWallets.findFirst({
      where: and(eq(buyerWallets.tenantId, tenantId), eq(buyerWallets.userId, session.userId)),
      with: { user: true }
    });
    
    if (!wallet) {
      const [newWallet] = await db.insert(buyerWallets).values({
        tenantId,
        userId: session.userId,
        balance: "0.00",
        currency: "XOF",
        totalDeposited: "0.00",
        totalSpent: "0.00"
      }).returning();
      wallet = { ...newWallet, user: null };
    }
    return { wallet, userId: session.userId, guestSessionId: null };
  }
  
  if (guestSessionId) {
    let wallet = await db.query.buyerWallets.findFirst({
      where: and(eq(buyerWallets.tenantId, tenantId), eq(buyerWallets.visitorId, guestSessionId)),
      with: { user: true }
    });
    
    if (!wallet) {
      const [newWallet] = await db.insert(buyerWallets).values({
        tenantId,
        visitorId: guestSessionId,
        balance: "0.00",
        currency: "XOF",
        totalDeposited: "0.00",
        totalSpent: "0.00"
      }).returning();
      wallet = { ...newWallet, user: null };
    }
    return { wallet, userId: null, guestSessionId };
  }
  
  return null;
}

router.get('/wallet/my', async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const guestSessionId = req.headers['x-guest-session'] as string;
    const tenantId = req.tenant?.id;

    if (!tenantId) {
      return res.status(500).json({ error: 'Tenant not resolved' });
    }

    if (!guestSessionId && !session?.userId) {
      return res.status(400).json({ error: 'No wallet identifier provided' });
    }

    let wallet = session?.userId
      ? await db.query.buyerWallets.findFirst({
          where: and(eq(buyerWallets.tenantId, tenantId), eq(buyerWallets.userId, session.userId)),
          with: { user: true }
        })
      : await db.query.buyerWallets.findFirst({
          where: and(eq(buyerWallets.tenantId, tenantId), eq(buyerWallets.visitorId, guestSessionId)),
          with: { user: true }
        });

    if (!wallet && guestSessionId) {
      const [newWallet] = await db.insert(buyerWallets).values({
        tenantId,
        visitorId: guestSessionId,
        userId: null,
        balance: "0.00",
        currency: "XOF",
        totalDeposited: "0.00",
        totalSpent: "0.00"
      }).returning();
      
      wallet = { ...newWallet, user: null };
    }

    res.json(wallet);
  } catch (error) {
    console.error('Error getting wallet:', error);
    res.status(500).json({ error: 'Failed to get wallet' });
  }
});

router.get('/wallet/lookup', async (req: Request, res: Response) => {
  try {
    const walletInfo = await getWalletForRequest(req);
    if (!walletInfo) {
      return res.status(401).json({ error: 'Wallet authentication required' });
    }

    const { query, type } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query required' });
    }

    let user = null;

    if (type === 'username') {
      user = await db.query.users.findFirst({
        where: ilike(users.username, query.replace('@', ''))
      });
    } else if (type === 'phone') {
      const cleanPhone = query.replace(/\D/g, '');
      user = await db.query.users.findFirst({
        where: or(
          eq(users.phoneNumber, cleanPhone),
          eq(users.phoneNumber, query),
          ilike(users.phoneNumber, `%${cleanPhone.slice(-9)}`)
        )
      });
    } else {
      const cleanQuery = query.replace('@', '').replace(/\D/g, '');
      user = await db.query.users.findFirst({
        where: or(
          ilike(users.username, query.replace('@', '')),
          eq(users.phoneNumber, cleanQuery),
          ilike(users.phoneNumber, `%${cleanQuery.slice(-9)}`)
        )
      });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(500).json({ error: 'Tenant not resolved' });
    }

    let wallet = await db.query.buyerWallets.findFirst({
      where: and(eq(buyerWallets.tenantId, tenantId), eq(buyerWallets.userId, user.id))
    });

    if (!wallet) {
      const [newWallet] = await db.insert(buyerWallets).values({
        tenantId,
        userId: user.id,
        balance: "0.00",
        currency: "XOF",
        totalDeposited: "0.00",
        totalSpent: "0.00"
      }).returning();
      wallet = newWallet;
    }

    res.json({
      id: user.id,
      displayName: user.displayName,
      username: user.username,
      phoneNumber: user.phoneNumber ? `***${user.phoneNumber.slice(-4)}` : null,
      walletId: wallet.id
    });
  } catch (error) {
    console.error('Error looking up user:', error);
    res.status(500).json({ error: 'Failed to lookup user' });
  }
});

router.post('/wallet/send', async (req: Request, res: Response) => {
  try {
    const { recipientWalletId, amount, note, method } = req.body;
    
    const walletInfo = await getWalletForRequest(req);
    if (!walletInfo) {
      return res.status(401).json({ error: 'Wallet authentication required' });
    }

    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(500).json({ error: 'Tenant not resolved' });
    }

    if (!recipientWalletId || !amount) {
      return res.status(400).json({ error: 'Recipient and amount required' });
    }

    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const senderWallet = walletInfo.wallet;

    const senderBalance = parseFloat(senderWallet.balance || "0");
    if (senderBalance < transferAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    if (senderWallet.id === recipientWalletId) {
      return res.status(400).json({ error: 'Cannot send to yourself' });
    }

    const recipientWallet = await db.query.buyerWallets.findFirst({
      where: and(eq(buyerWallets.tenantId, tenantId), eq(buyerWallets.id, recipientWalletId)),
      with: { user: true }
    });

    if (!recipientWallet) {
      return res.status(404).json({ error: 'Recipient wallet not found' });
    }

    const recipientBalance = parseFloat(recipientWallet.balance || "0");
    const newSenderBalance = senderBalance - transferAmount;
    const newRecipientBalance = recipientBalance + transferAmount;

    const result = await db.transaction(async (tx) => {
      await tx.update(buyerWallets)
        .set({ 
          balance: newSenderBalance.toFixed(2),
          totalSpent: (parseFloat(senderWallet.totalSpent || "0") + transferAmount).toFixed(2)
        })
        .where(and(eq(buyerWallets.tenantId, tenantId), eq(buyerWallets.id, senderWallet.id)));

      await tx.update(buyerWallets)
        .set({ 
          balance: newRecipientBalance.toFixed(2),
          totalDeposited: (parseFloat(recipientWallet.totalDeposited || "0") + transferAmount).toFixed(2)
        })
        .where(and(eq(buyerWallets.tenantId, tenantId), eq(buyerWallets.id, recipientWallet.id)));

      await tx.insert(buyerWalletTransactions).values({
        tenantId,
        walletId: senderWallet.id,
        type: "p2p_sent",
        amount: (-transferAmount).toFixed(2),
        balanceBefore: senderBalance.toFixed(2),
        balanceAfter: newSenderBalance.toFixed(2),
        description: `Sent to ${recipientWallet.user?.displayName || 'User'}${note ? `: ${note}` : ''}`,
        status: "completed"
      });

      await tx.insert(buyerWalletTransactions).values({
        tenantId,
        walletId: recipientWallet.id,
        type: "p2p_received",
        amount: transferAmount.toFixed(2),
        balanceBefore: recipientBalance.toFixed(2),
        balanceAfter: newRecipientBalance.toFixed(2),
        description: `Received from transfer${note ? `: ${note}` : ''}`,
        status: "completed"
      });

      const [transfer] = await tx.insert(p2pTransfers).values({
        tenantId,
        senderWalletId: senderWallet.id,
        recipientWalletId: recipientWallet.id,
        amount: transferAmount.toFixed(2),
        currency: "XOF",
        senderBalanceBefore: senderBalance.toFixed(2),
        senderBalanceAfter: newSenderBalance.toFixed(2),
        recipientBalanceBefore: recipientBalance.toFixed(2),
        recipientBalanceAfter: newRecipientBalance.toFixed(2),
        note: note || null,
        transferMethod: method || "username",
        status: "completed"
      }).returning();

      return transfer;
    });

    res.json({
      success: true,
      transfer: {
        id: result.id,
        amount: transferAmount,
        recipientName: recipientWallet.user?.displayName || 'User',
        newBalance: newSenderBalance
      }
    });
  } catch (error) {
    console.error('Error sending credits:', error);
    res.status(500).json({ error: 'Transfer failed' });
  }
});

router.get('/wallet/qr', async (req: Request, res: Response) => {
  try {
    const walletInfo = await getWalletForRequest(req);
    if (!walletInfo) {
      return res.status(401).json({ error: 'Wallet authentication required' });
    }

    const wallet = walletInfo.wallet;

    const qrData = JSON.stringify({
      type: 'ece_wallet',
      walletId: wallet.id,
      userId: wallet.userId,
      name: wallet.user?.displayName || 'Guest',
      username: wallet.user?.username
    });

    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    res.json({
      qrCode: qrCodeDataUrl,
      walletId: wallet.id,
      displayName: wallet.user?.displayName || 'Guest Wallet',
      username: wallet.user?.username
    });
  } catch (error) {
    console.error('Error generating QR:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

router.get('/wallet/transfers', async (req: Request, res: Response) => {
  try {
    const walletInfo = await getWalletForRequest(req);
    const limitCount = parseInt(req.query.limit as string) || 20;

    if (!walletInfo) {
      return res.json([]);
    }

    const wallet = walletInfo.wallet;
    const tenantId = req.tenant?.id;

    if (!tenantId) {
      return res.status(500).json({ error: 'Tenant not resolved' });
    }

    const transfers = await db.query.p2pTransfers.findMany({
      where: and(
        eq(p2pTransfers.tenantId, tenantId),
        or(eq(p2pTransfers.senderWalletId, wallet.id), eq(p2pTransfers.recipientWalletId, wallet.id))
      ),
      orderBy: desc(p2pTransfers.createdAt),
      limit: limitCount,
      with: {
        senderWallet: {
          with: { user: true }
        },
        recipientWallet: {
          with: { user: true }
        }
      }
    });

    const formattedTransfers = transfers.map(t => ({
      id: t.id,
      type: t.senderWalletId === wallet.id ? 'sent' : 'received',
      amount: parseFloat(t.amount),
      counterparty: t.senderWalletId === wallet.id 
        ? t.recipientWallet?.user?.displayName || 'User'
        : t.senderWallet?.user?.displayName || 'User',
      counterpartyUsername: t.senderWalletId === wallet.id
        ? t.recipientWallet?.user?.username
        : t.senderWallet?.user?.username,
      note: t.note,
      method: t.transferMethod,
      createdAt: t.createdAt
    }));

    res.json(formattedTransfers);
  } catch (error) {
    console.error('Error getting transfers:', error);
    res.status(500).json({ error: 'Failed to get transfers' });
  }
});

router.post('/wallet/username', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).session?.userId;
    const { username } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Must be logged in to set username' });
    }

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username required' });
    }

    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters (letters, numbers, underscore)' });
    }

    const existing = await db.query.users.findFirst({
      where: eq(users.username, cleanUsername)
    });

    if (existing && existing.id !== userId) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    await db.update(users)
      .set({ username: cleanUsername })
      .where(eq(users.id, userId));

    res.json({ success: true, username: cleanUsername });
  } catch (error) {
    console.error('Error setting username:', error);
    res.status(500).json({ error: 'Failed to set username' });
  }
});

router.post('/wallet/parse-qr', async (req: Request, res: Response) => {
  try {
    const { qrData } = req.body;

    if (!qrData) {
      return res.status(400).json({ error: 'QR data required' });
    }

    let parsed;
    try {
      parsed = JSON.parse(qrData);
    } catch {
      return res.status(400).json({ error: 'Invalid QR code format' });
    }

    if (parsed.type !== 'ece_wallet' || !parsed.walletId) {
      return res.status(400).json({ error: 'Not a valid ECE wallet QR code' });
    }

    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(500).json({ error: 'Tenant not resolved' });
    }

    const wallet = await db.query.buyerWallets.findFirst({
      where: and(eq(buyerWallets.tenantId, tenantId), eq(buyerWallets.id, parsed.walletId)),
      with: { user: true }
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json({
      walletId: wallet.id,
      displayName: wallet.user?.displayName || 'Guest Wallet',
      username: wallet.user?.username
    });
  } catch (error) {
    console.error('Error parsing QR:', error);
    res.status(500).json({ error: 'Failed to parse QR code' });
  }
});

export default router;
