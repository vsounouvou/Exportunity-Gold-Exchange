import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { 
  Send, User, Phone, QrCode, ArrowUpRight, ArrowDownLeft, 
  Search, Loader2, CheckCircle2, X, Camera, History,
  Wallet, Copy, Share2
} from "lucide-react";
import { format } from "date-fns";

interface Recipient {
  id: number;
  displayName: string;
  username?: string;
  phoneNumber?: string;
  walletId: number;
}

interface Transfer {
  id: number;
  type: 'sent' | 'received';
  amount: number;
  counterparty: string;
  counterpartyUsername?: string;
  note?: string;
  method: string;
  createdAt: string;
}

interface SendMoneyProps {
  guestSessionId?: string;
  authToken?: string;
}

export function SendMoney({ guestSessionId, authToken }: SendMoneyProps) {
  const [open, setOpen] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<"username" | "phone" | "qr">("username");
  const [searchQuery, setSearchQuery] = useState("");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"search" | "confirm" | "success">("search");
  
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const qrInputRef = useRef<HTMLInputElement>(null);

  const hasWalletAccess = !!(guestSessionId || authToken);

  const getHeaders = () => {
    const headers: Record<string, string> = {};
    if (guestSessionId) {
      headers['x-guest-session'] = guestSessionId;
    }
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
  };

  const { data: wallet } = useQuery({
    queryKey: ['/api/p2p/wallet/my', guestSessionId, authToken],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl('/api/p2p/wallet/my'), {
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch wallet');
      return res.json();
    },
    enabled: hasWalletAccess
  });

  const { data: qrData } = useQuery({
    queryKey: ['/api/p2p/wallet/qr', guestSessionId, authToken],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl('/api/p2p/wallet/qr'), {
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch QR');
      return res.json();
    },
    enabled: showReceive && hasWalletAccess
  });

  const { data: transfers } = useQuery<Transfer[]>({
    queryKey: ['/api/p2p/wallet/transfers', guestSessionId, authToken],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl('/api/p2p/wallet/transfers'), {
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch transfers');
      return res.json();
    },
    enabled: showHistory && hasWalletAccess
  });

  const lookupMutation = useMutation({
    mutationFn: async ({ query, type }: { query: string; type: string }) => {
      const res = await fetch(resolveApiUrl(`/api/p2p/wallet/lookup?query=${encodeURIComponent(query)}&type=${type}`), {
        headers: getHeaders()
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'User not found');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setRecipient(data);
    },
    onError: (error: Error) => {
      toast({
        title: "Not found",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(resolveApiUrl('/api/p2p/wallet/send'), {
        method: 'POST',
        body: JSON.stringify({
          recipientWalletId: recipient?.walletId,
          amount: parseFloat(amount),
          note: note || undefined,
          method: activeTab
        }),
        headers: { 
          'Content-Type': 'application/json',
          ...getHeaders() 
        }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Transfer failed');
      }
      return res.json();
    },
    onSuccess: () => {
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ['/api/p2p/wallet/my'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2p/wallet/transfers'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Transfer failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const parseQRMutation = useMutation({
    mutationFn: async (qrData: string) => {
      const res = await fetch(resolveApiUrl('/api/p2p/wallet/parse-qr'), {
        method: 'POST',
        body: JSON.stringify({ qrData }),
        headers: { 
          'Content-Type': 'application/json',
          ...getHeaders() 
        }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to parse QR');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setRecipient({
        id: 0,
        displayName: data.displayName,
        username: data.username,
        walletId: data.walletId
      });
    },
    onError: () => {
      toast({
        title: "Invalid QR",
        description: "This QR code is not valid",
        variant: "destructive"
      });
    }
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    lookupMutation.mutate({ 
      query: searchQuery, 
      type: activeTab === "phone" ? "phone" : "username" 
    });
  };

  const handleSend = () => {
    if (!recipient || !amount || parseFloat(amount) <= 0) return;
    sendMutation.mutate();
  };

  const resetForm = () => {
    setRecipient(null);
    setAmount("");
    setNote("");
    setSearchQuery("");
    setStep("search");
    setOpen(false);
  };

  const balance = parseFloat(wallet?.balance || "0");

  const quickAmounts = [1000, 5000, 10000, 25000];

  const SendContent = () => (
    <div className="flex flex-col h-full">
      {step === "search" && (
        <>
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-500/15 to-amber-600/5 rounded-xl mb-3 border border-amber-500/20">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-amber-400" />
              <span className="text-xs text-white/60">Balance</span>
            </div>
            <p className="text-lg font-bold text-amber-400">{balance.toLocaleString()} <span className="text-xs font-normal text-white/50">XOF</span></p>
          </div>

          <div className="flex gap-1 p-1 bg-white/5 rounded-xl mb-3">
            <button
              onClick={() => setActiveTab("username")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${activeTab === "username" ? "bg-amber-500 text-black" : "text-white/60 hover:text-white"}`}
            >
              <User className="h-3.5 w-3.5" />
              @
            </button>
            <button
              onClick={() => setActiveTab("phone")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${activeTab === "phone" ? "bg-amber-500 text-black" : "text-white/60 hover:text-white"}`}
            >
              <Phone className="h-3.5 w-3.5" />
              Phone
            </button>
            <button
              onClick={() => setActiveTab("qr")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${activeTab === "qr" ? "bg-amber-500 text-black" : "text-white/60 hover:text-white"}`}
            >
              <QrCode className="h-3.5 w-3.5" />
              QR
            </button>
          </div>

          {activeTab === "username" && (
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 font-medium text-sm">@</span>
              <Input
                placeholder="username"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="h-11 pl-7 pr-12 bg-white/5 border-white/10 text-white rounded-xl"
              />
              <Button
                size="icon"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 bg-amber-500 hover:bg-amber-600 text-black rounded-lg"
                onClick={handleSearch}
                disabled={lookupMutation.isPending}
              >
                {lookupMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}

          {activeTab === "phone" && (
            <div className="relative mb-3">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                placeholder="Phone number"
                type="tel"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="h-11 pl-9 pr-12 bg-white/5 border-white/10 text-white rounded-xl"
              />
              <Button
                size="icon"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 bg-amber-500 hover:bg-amber-600 text-black rounded-lg"
                onClick={handleSearch}
                disabled={lookupMutation.isPending}
              >
                {lookupMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}

          {activeTab === "qr" && (
            <div className="mb-3">
              <div className="aspect-[2/1] bg-white/5 rounded-xl border border-dashed border-white/20 flex items-center justify-center gap-3">
                <Camera className="h-6 w-6 text-white/30" />
                <div>
                  <p className="text-xs text-white/50">Scan QR code</p>
                  <p className="text-[10px] text-white/30">Coming soon</p>
                </div>
              </div>
            </div>
          )}

          {recipient && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm truncate">{recipient.displayName}</p>
                  <p className="text-xs text-emerald-400">{recipient.username ? `@${recipient.username}` : recipient.phoneNumber}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-white/40" onClick={() => setRecipient(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="relative mb-2">
                <Input
                  type="number"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-12 text-xl font-bold bg-black/30 border-white/10 text-white text-center rounded-xl"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40">XOF</span>
              </div>

              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {quickAmounts.map(amt => (
                  <button
                    key={amt}
                    onClick={() => setAmount(amt.toString())}
                    className="py-1.5 bg-white/5 hover:bg-amber-500/20 text-white/70 hover:text-amber-400 text-xs rounded-lg transition-colors border border-white/5 hover:border-amber-500/30"
                  >
                    {(amt / 1000)}K
                  </button>
                ))}
              </div>

              <Input
                placeholder="Add a note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-9 bg-black/30 border-white/10 text-white text-xs rounded-xl placeholder:text-white/30"
              />
            </div>
          )}
        </>
      )}

      {step === "confirm" && recipient && (
        <div className="text-center py-4">
          <div className="h-14 w-14 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-3">
            <Send className="h-7 w-7 text-amber-400" />
          </div>
          <p className="text-3xl font-bold text-white">{parseFloat(amount).toLocaleString()}</p>
          <p className="text-sm text-white/50 mb-1">XOF</p>
          <p className="text-white/70 text-sm">to <span className="text-white font-medium">{recipient.displayName}</span></p>
          {note && <p className="text-xs text-white/40 mt-1 italic">"{note}"</p>}
          
          <div className="mt-5 space-y-2">
            <Button
              className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-xl"
              onClick={handleSend}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>Confirm & Send</>
              )}
            </Button>
            <Button
              variant="ghost"
              className="w-full h-10 text-white/50 text-sm"
              onClick={() => setStep("search")}
            >
              Go Back
            </Button>
          </div>
        </div>
      )}

      {step === "success" && (
        <div className="text-center py-4">
          <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 animate-in zoom-in duration-300">
            <CheckCircle2 className="h-9 w-9 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-400 mb-1">Sent!</p>
          <p className="text-2xl font-bold text-white">{parseFloat(amount).toLocaleString()} XOF</p>
          <p className="text-white/60 text-sm mt-1">to {recipient?.displayName}</p>
          
          <Button
            className="w-full h-11 mt-5 bg-white/10 hover:bg-white/15 text-white rounded-xl"
            onClick={resetForm}
          >
            Done
          </Button>
        </div>
      )}

      {step === "search" && recipient && (
        <div className="mt-3">
          <Button
            className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-xl"
            onClick={() => setStep("confirm")}
            disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance}
          >
            <Send className="h-4 w-4 mr-2" />
            {amount ? `Send ${parseFloat(amount).toLocaleString()} XOF` : 'Enter amount'}
          </Button>
          {parseFloat(amount) > balance && (
            <p className="text-center text-red-400 text-xs mt-1.5">Insufficient balance</p>
          )}
        </div>
      )}
    </div>
  );

  const ReceiveContent = () => (
    <div className="flex flex-col items-center py-3">
      <p className="text-white/50 text-xs mb-3">Share your QR code to receive money</p>
      
      {qrData?.qrCode ? (
        <div className="bg-white p-3 rounded-xl mb-3">
          <img src={qrData.qrCode} alt="Your QR Code" className="w-[160px] h-[160px]" />
        </div>
      ) : (
        <div className="w-[184px] h-[184px] bg-white/10 rounded-xl flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      )}
      
      <p className="text-lg font-semibold text-white">{qrData?.displayName || 'Your Wallet'}</p>
      {qrData?.username && (
        <p className="text-amber-400 text-sm">@{qrData.username}</p>
      )}

      <div className="flex gap-2 mt-4 w-full">
        <Button
          variant="outline"
          className="flex-1 h-10 border-white/10 text-white hover:bg-white/10 rounded-xl text-sm"
          onClick={() => {
            if (qrData?.username) {
              navigator.clipboard.writeText(`@${qrData.username}`);
              toast({ title: "Copied!", description: "Username copied to clipboard" });
            }
          }}
        >
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Copy
        </Button>
        <Button
          variant="outline"
          className="flex-1 h-10 border-white/10 text-white hover:bg-white/10 rounded-xl text-sm"
          onClick={() => {
            if (navigator.share && qrData?.username) {
              navigator.share({
                title: 'Send me money on ECE',
                text: `Send me money on ECE: @${qrData.username}`
              });
            }
          }}
        >
          <Share2 className="h-3.5 w-3.5 mr-1.5" />
          Share
        </Button>
      </div>
    </div>
  );

  const HistoryContent = () => (
    <ScrollArea className="h-[300px]">
      <div className="space-y-1.5">
        {!transfers?.length ? (
          <div className="text-center py-8 text-white/40">
            <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No transfers yet</p>
          </div>
        ) : (
          transfers.map((t) => (
            <div key={t.id} className="flex items-center gap-2.5 p-2.5 bg-white/5 rounded-xl">
              <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                t.type === 'sent' ? 'bg-red-500/20' : 'bg-emerald-500/20'
              }`}>
                {t.type === 'sent' ? (
                  <ArrowUpRight className="h-4 w-4 text-red-400" />
                ) : (
                  <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white text-sm truncate">{t.counterparty}</p>
                <p className="text-[10px] text-white/40">{format(new Date(t.createdAt), 'MMM d, h:mm a')}</p>
              </div>
              <p className={`font-semibold text-sm ${t.type === 'sent' ? 'text-red-400' : 'text-emerald-400'}`}>
                {t.type === 'sent' ? '-' : '+'}{t.amount.toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );

  const Trigger = (
    <div className="flex gap-1.5">
      <Button
        className="h-10 px-3.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-xl text-sm"
        onClick={() => { setOpen(true); setShowReceive(false); setShowHistory(false); }}
      >
        <Send className="h-3.5 w-3.5 mr-1.5" />
        Send
      </Button>
      <Button
        variant="outline"
        className="h-10 px-3.5 border-white/15 text-white hover:bg-white/10 rounded-xl text-sm"
        onClick={() => { setOpen(true); setShowReceive(true); setShowHistory(false); }}
      >
        <QrCode className="h-3.5 w-3.5 mr-1.5" />
        Receive
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 text-white/50 hover:text-white hover:bg-white/10 rounded-xl"
        onClick={() => { setOpen(true); setShowHistory(true); setShowReceive(false); }}
      >
        <History className="h-4 w-4" />
      </Button>
    </div>
  );

  const content = showHistory ? <HistoryContent /> : showReceive ? <ReceiveContent /> : <SendContent />;
  const title = showHistory ? "Transfer History" : showReceive ? "Receive Money" : "Send Money";

  if (isMobile) {
    return (
      <>
        {Trigger}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="bg-[#0f1419] border-amber-900/30 w-[calc(100%-32px)] max-w-md rounded-2xl p-0 gap-0 top-[45%] translate-y-[-50%] shadow-2xl shadow-black/60">
            <DialogHeader className="p-4 pb-2 border-b border-amber-900/20">
              <DialogTitle className="text-white text-base">{title}</DialogTitle>
            </DialogHeader>
            <div className="p-4 overflow-y-auto max-h-[55vh]">
              {content}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {Trigger}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="bg-gray-900 border-white/10 w-[400px]">
          <SheetHeader>
            <SheetTitle className="text-white">{title}</SheetTitle>
          </SheetHeader>
          <div className="py-4">
            {content}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
