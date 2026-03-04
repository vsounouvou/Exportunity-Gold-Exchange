import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getLocation as getBdoLocation } from "@/services/location";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { useTenant } from "@/lib/tenant";
import { formatPageTitle } from "@/lib/brand";
import { AuthModal } from "@/components/AuthModal";
import "leaflet/dist/leaflet.css";
import {
  Send,
  Loader2,
  MapPin,
  User,
  LogOut,
  Store,
  Coffee,
  Wheat,
  Hammer,
  ChefHat,
  Star,
  Navigation,
  MessageSquare,
  X,
  Menu,
  CheckCircle,
  Clock,
  Phone,
  Globe,
  Sparkles,
  ShoppingCart,
  Package,
  Truck,
  ArrowLeft,
  Bot,
  Zap,
  ArrowRightLeft
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const producerIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const userIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface AgentExchange {
  agent: "user" | "shop";
  agentName: string;
  message: string;
}

interface Product {
  id: number;
  name: string;
  description?: string;
  price?: string;
  currency?: string;
  unit?: string;
  imageUrl?: string;
  inStock: boolean;
}

interface Producer {
  id: number;
  name: string;
  slug: string;
  type: "producer" | "reseller" | "hybrid";
  categoryName?: string;
  shortDescription?: string;
  latitude: string;
  longitude: string;
  city?: string;
  country: string;
  rating?: string;
  isVerified: boolean;
  phone?: string;
  deliveryOptions?: string[];
  products?: Product[];
}

const categoryIcons: Record<string, any> = {
  coffee: Coffee,
  bakery: ChefHat,
  agriculture: Wheat,
  metalworks: Hammer,
  default: Store
};

const demoMessages: ChatMessage[] = [
  {
    id: "demo-1",
    role: "assistant",
    content: "Welcome to Exportunity! I'm here to help you discover local producers around you.\n\nTell me what you're looking for - coffee, bread, handmade furniture, or anything else. I'll find the best producers near you!",
    createdAt: new Date().toISOString()
  }
];

const quickActions = [
  { label: "Fresh bread", prompt: "I'm looking for fresh bread from a local bakery" },
  { label: "Local coffee", prompt: "Where can I find locally roasted coffee?" },
  { label: "Handmade furniture", prompt: "I need a carpenter for custom furniture" },
  { label: "Fresh produce", prompt: "Where are the nearest farms or vegetable producers?" }
];

function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13);
  }, [center, map]);
  return null;
}

export function MarketplacePage() {
  const { isAuthenticated, isGuest, user, logout, guestSessionId } = useSession();
  const { tenant, brand } = useTenant();
  const isGoldTenant = tenant.key === "bdo";
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>(demoMessages);
  const [inputMessage, setInputMessage] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [selectedProducer, setSelectedProducer] = useState<Producer | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number]>([6.3654, 2.4183]);
  const [shopMessages, setShopMessages] = useState<ChatMessage[]>([]);
  const [shopInputMessage, setShopInputMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"products" | "chat" | "agent">("products");
  const [agentExchanges, setAgentExchanges] = useState<AgentExchange[]>([]);
  const [agentRequest, setAgentRequest] = useState("");
  const [agentConversationHistory, setAgentConversationHistory] = useState<any[]>([]);
  const [isAgentNegotiating, setIsAgentNegotiating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shopMessagesEndRef = useRef<HTMLDivElement>(null);
  const agentMessagesEndRef = useRef<HTMLDivElement>(null);
  const locationToastShownRef = useRef(false);
  const { toast } = useToast();
  const agentQuoteSubtitle = `Request a quote from ${brand.name}`;
  const agentQuoteDescription = isGoldTenant
    ? `Tell us what you want, and your AI assistant will coordinate with ${brand.name} to confirm pricing, availability, and delivery options. You buy from ${brand.name}; supplier details are shown as provenance only.`
    : `Tell us what you want, and your AI assistant will coordinate with sellers to confirm pricing, availability, and delivery options. You can buy directly from verified suppliers on ${brand.name}.`;

  useEffect(() => {
    document.title = formatPageTitle("Marketplace (Map)", brand);
  }, [brand]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const result = await getBdoLocation({ force: false });
        if (cancelled) return;
        setUserLocation([result.location.lat, result.location.lon]);

        if (result.error && !locationToastShownRef.current) {
          locationToastShownRef.current = true;
          toast({
            title: "Location not available",
            description: "Using an approximate location. Use the main marketplace to set your city or enable GPS.",
          });
        }
      } catch {
        if (cancelled) return;
        if (!locationToastShownRef.current) {
          locationToastShownRef.current = true;
          toast({
            title: "Location not available",
            description: "Showing a default area. Use the main marketplace to set your city.",
          });
        }
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    shopMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [shopMessages]);

  useEffect(() => {
    if (selectedProducer) {
      setShopMessages([{
        id: "welcome-1",
        role: "assistant",
        content: `Welcome to ${selectedProducer.name}! I'm here to help you explore our products and place orders. Feel free to ask me anything!`,
        createdAt: new Date().toISOString()
      }]);
      setActiveTab("products");
      setAgentExchanges([]);
      setAgentRequest("");
      setAgentConversationHistory([]);
      setIsAgentNegotiating(false);
    }
  }, [selectedProducer]);

  useEffect(() => {
    agentMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentExchanges]);

  const { data: producers = [], isLoading: loadingProducers } = useQuery<Producer[]>({
    queryKey: ["/api/marketplace/producers", userLocation[0], userLocation[1]],
    enabled: true
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest("/api/marketplace/chat", {
        method: "POST",
        body: JSON.stringify({
          content,
          guestSessionId: isGuest ? guestSessionId : undefined,
          location: { lat: userLocation[0], lng: userLocation[1] }
        })
      });
    },
    onSuccess: (data) => {
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: data.response,
        createdAt: new Date().toISOString()
      };
      setMessages((prev) => [...prev, assistantMessage]);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive"
      });
    }
  });

  const sendShopMessageMutation = useMutation({
    mutationFn: async ({ content, producerId }: { content: string; producerId: number }) => {
      return await apiRequest(`/api/marketplace/producers/${producerId}/chat`, {
        method: "POST",
        body: JSON.stringify({
          content,
          guestSessionId: isGuest ? guestSessionId : undefined
        })
      });
    },
    onSuccess: (data) => {
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: data.response,
        createdAt: new Date().toISOString()
      };
      setShopMessages((prev) => [...prev, assistantMessage]);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive"
      });
    }
  });

  const agentChatMutation = useMutation({
    mutationFn: async ({ producerId, userRequest, conversationHistory }: { producerId: number; userRequest: string; conversationHistory: any[] }) => {
      return await apiRequest(`/api/marketplace/producers/${producerId}/agent-chat`, {
        method: "POST",
        body: JSON.stringify({
          userRequest,
          conversationHistory,
          guestSessionId: isGuest ? guestSessionId : undefined
        })
      });
    },
    onSuccess: (data) => {
      setAgentExchanges((prev) => [...prev, ...data.exchanges]);
      setAgentConversationHistory(data.conversationHistory || []);
      setIsAgentNegotiating(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start agent negotiation",
        variant: "destructive"
      });
      setIsAgentNegotiating(false);
    }
  });

  const handleSendMessage = (content: string) => {
    if (!content.trim()) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    sendMessageMutation.mutate(content);
  };

  const handleSendShopMessage = (content: string) => {
    if (!content.trim() || !selectedProducer) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };
    setShopMessages((prev) => [...prev, userMessage]);
    setShopInputMessage("");
    sendShopMessageMutation.mutate({ content, producerId: selectedProducer.id });
  };

  const handleStartAgentNegotiation = () => {
    if (!agentRequest.trim() || !selectedProducer || isAgentNegotiating) return;
    setIsAgentNegotiating(true);
    agentChatMutation.mutate({ 
      producerId: selectedProducer.id, 
      userRequest: agentRequest,
      conversationHistory: agentConversationHistory
    });
  };

  const formatPrice = (price?: string, currency?: string, unit?: string) => {
    if (!price) return "Contact for price";
    const formatted = new Intl.NumberFormat("fr-FR").format(parseFloat(price));
    return `${formatted} ${currency || "XOF"}${unit ? ` / ${unit}` : ""}`;
  };

  const getCategoryIcon = (category?: string) => {
    const Icon = categoryIcons[category?.toLowerCase() || "default"] || Store;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <div className="h-screen w-full flex flex-col bg-background">
      <header className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2">
          <Store className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg">Exportunity</span>
          <Badge variant="secondary" className="hidden sm:inline-flex">Market</Badge>
        </div>
        
        <p className="text-sm text-muted-foreground hidden md:block">
          Commodities & creators around you — direct from producers
        </p>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setShowChat(!showChat)}
          >
            <MessageSquare className="h-5 w-5" />
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setLocation("/admin")}
            className="hidden sm:flex items-center gap-1.5 border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
          >
            <Bot className="h-4 w-4" />
            Admin Portal
          </Button>
          
          {isAuthenticated && !isGuest ? (
            <div className="flex items-center gap-2">
              <span className="text-sm hidden sm:inline">{user?.displayName}</span>
              <Button variant="ghost" size="icon" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowAuthModal(true)}>
              Sign In
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <MapContainer
            center={userLocation}
            zoom={13}
            className="h-full w-full"
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapController center={userLocation} />
            
            <Marker position={userLocation} icon={userIcon}>
              <Popup>
                <div className="text-center">
                  <Navigation className="h-4 w-4 mx-auto mb-1" />
                  <p className="font-medium">You are here</p>
                </div>
              </Popup>
            </Marker>

            {producers.map((producer) => (
              <Marker
                key={producer.id}
                position={[parseFloat(producer.latitude), parseFloat(producer.longitude)]}
                icon={producerIcon}
                eventHandlers={{
                  click: () => setSelectedProducer(producer)
                }}
              >
                <Popup>
                  <div className="min-w-[200px]">
                    <div className="flex items-center gap-2 mb-2">
                      {getCategoryIcon(producer.categoryName)}
                      <span className="font-semibold">{producer.name}</span>
                      {producer.isVerified && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                    {producer.shortDescription && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {producer.shortDescription}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      {producer.rating && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          {producer.rating}
                        </span>
                      )}
                      <Badge variant={producer.type === "producer" ? "default" : "secondary"}>
                        {producer.type}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => setSelectedProducer(producer)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Talk to Shop
                    </Button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {loadingProducers && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-background/90 px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Finding producers...</span>
            </div>
          )}
        </div>

        <div
          className={`${
            showChat ? "w-full md:w-[400px]" : "w-0"
          } transition-all duration-300 border-l bg-background flex flex-col overflow-hidden absolute md:relative right-0 top-0 h-full z-40`}
        >
          {showChat && (
            <>
              <div className="p-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="font-semibold">
                    {selectedProducer ? selectedProducer.name : "AI Assistant"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedProducer && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedProducer(null)}
                    >
                      Back
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    onClick={() => setShowChat(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {selectedProducer ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-3 border-b bg-muted/30">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        {getCategoryIcon(selectedProducer.categoryName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{selectedProducer.name}</h3>
                          {selectedProducer.isVerified && (
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          {selectedProducer.rating && (
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              {selectedProducer.rating}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {selectedProducer.city || selectedProducer.country}
                          </span>
                          {selectedProducer.deliveryOptions && (
                            <span className="flex items-center gap-1">
                              <Truck className="h-3 w-3" />
                              Delivery
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "products" | "chat" | "agent")} className="flex-1 flex flex-col overflow-hidden">
                    <TabsList className="w-full grid grid-cols-3 rounded-none border-b h-10">
                      <TabsTrigger value="products" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs">
                        <Package className="h-3.5 w-3.5 mr-1" />
                        Products
                      </TabsTrigger>
                      <TabsTrigger value="chat" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs">
                        <MessageSquare className="h-3.5 w-3.5 mr-1" />
                        Chat
                      </TabsTrigger>
                      <TabsTrigger value="agent" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs">
                        <Bot className="h-3.5 w-3.5 mr-1" />
                        AI Agents
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="products" className="flex-1 overflow-auto m-0 p-0">
                      <ScrollArea className="h-full">
                        <div className="p-3 space-y-3">
                          {selectedProducer.products && selectedProducer.products.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                              {selectedProducer.products.map((product) => (
                                <Card key={product.id} className="overflow-hidden">
                                  <div className="aspect-square bg-muted/50 flex items-center justify-center">
                                    {product.imageUrl ? (
                                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <Package className="h-8 w-8 text-muted-foreground/50" />
                                    )}
                                  </div>
                                  <CardContent className="p-2">
                                    <h4 className="font-medium text-sm truncate">{product.name}</h4>
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                      {product.description || "Fresh from the producer"}
                                    </p>
                                    <div className="flex items-center justify-between mt-2">
                                      <span className="text-sm font-semibold text-primary">
                                        {formatPrice(product.price, product.currency, product.unit)}
                                      </span>
                                      {product.inStock ? (
                                        <Badge variant="secondary" className="text-xs">In Stock</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs text-muted-foreground">Out of Stock</Badge>
                                      )}
                                    </div>
                                    <Button 
                                      size="sm" 
                                      className="w-full mt-2 h-8 text-xs"
                                      onClick={() => {
                                        setActiveTab("chat");
                                        handleSendShopMessage(`I'm interested in ${product.name}. Is it available?`);
                                      }}
                                    >
                                      <ShoppingCart className="h-3 w-3 mr-1" />
                                      Ask about this
                                    </Button>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-muted-foreground">
                              <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                              <p>No products listed yet</p>
                              <p className="text-sm mt-1">Chat with the shop to ask about available products</p>
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden m-0 p-0">
                      <ScrollArea className="flex-1 p-3">
                        <div className="space-y-3">
                          {shopMessages.map((message) => (
                            <div
                              key={message.id}
                              className={`flex gap-2 ${message.role === "user" ? "justify-end" : ""}`}
                            >
                              {message.role === "assistant" && (
                                <Avatar className="h-7 w-7 shrink-0">
                                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                    {getCategoryIcon(selectedProducer.categoryName)}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <div
                                className={`max-w-[85%] rounded-lg p-2.5 ${
                                  message.role === "user"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                                }`}
                              >
                                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                              </div>
                              {message.role === "user" && (
                                <Avatar className="h-7 w-7 shrink-0">
                                  <AvatarFallback className="text-xs">
                                    <User className="h-3.5 w-3.5" />
                                  </AvatarFallback>
                                </Avatar>
                              )}
                            </div>
                          ))}
                          {sendShopMessageMutation.isPending && (
                            <div className="flex gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                  {getCategoryIcon(selectedProducer.categoryName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="bg-muted rounded-lg p-2.5">
                                <Loader2 className="h-4 w-4 animate-spin" />
                              </div>
                            </div>
                          )}
                          <div ref={shopMessagesEndRef} />
                        </div>
                      </ScrollArea>

                      <div className="p-3 border-t">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSendShopMessage(shopInputMessage);
                          }}
                          className="flex gap-2"
                        >
                          <Input
                            value={shopInputMessage}
                            onChange={(e) => setShopInputMessage(e.target.value)}
                            placeholder={`Ask ${selectedProducer.name}...`}
                            disabled={sendShopMessageMutation.isPending}
                            className="flex-1"
                          />
                          <Button
                            type="submit"
                            size="icon"
                            disabled={!shopInputMessage.trim() || sendShopMessageMutation.isPending}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </form>
                      </div>
                    </TabsContent>

                    <TabsContent value="agent" className="flex-1 flex flex-col overflow-hidden m-0 p-0">
                      {agentExchanges.length === 0 ? (
                        <div className="flex-1 flex flex-col p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                              <Bot className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-sm">AI Assisted Quote</h3>
                              <p className="text-xs text-muted-foreground">{agentQuoteSubtitle}</p>
                            </div>
                          </div>

                          <div className="bg-muted/50 rounded-lg p-4 mb-4">
                            <div className="flex items-center gap-2 mb-2">
                              <ArrowRightLeft className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">How it works</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {agentQuoteDescription}
                            </p>
                          </div>

                          <div className="space-y-3">
                            <textarea
                              value={agentRequest}
                              onChange={(e) => setAgentRequest(e.target.value)}
                              placeholder="Example: I want to buy 3kg of fresh bread for a party tomorrow. I need delivery to the city center."
                              className="w-full h-24 p-3 text-sm rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <Button
                              className="w-full"
                              onClick={handleStartAgentNegotiation}
                              disabled={!agentRequest.trim() || isAgentNegotiating}
                            >
                              {isAgentNegotiating ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  AI agents negotiating...
                                </>
                              ) : (
                                <>
                                  <Zap className="h-4 w-4 mr-2" />
                                  Start AI Negotiation
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <ScrollArea className="flex-1 p-3">
                            <div className="space-y-4">
                              {agentExchanges.map((exchange, index) => (
                                <div
                                  key={index}
                                  className={`flex gap-2 ${exchange.agent === "user" ? "" : "justify-end"}`}
                                >
                                  {exchange.agent === "user" && (
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center shrink-0">
                                      <Bot className="h-4 w-4 text-white" />
                                    </div>
                                  )}
                                  <div className={`max-w-[80%] ${exchange.agent === "user" ? "" : ""}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-medium text-muted-foreground">
                                        {exchange.agentName}
                                      </span>
                                    </div>
                                    <div
                                      className={`rounded-lg p-2.5 ${
                                        exchange.agent === "user"
                                          ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
                                          : "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
                                      }`}
                                    >
                                      <p className="text-sm whitespace-pre-wrap">{exchange.message}</p>
                                    </div>
                                  </div>
                                  {exchange.agent === "shop" && (
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center shrink-0">
                                      <Store className="h-4 w-4 text-white" />
                                    </div>
                                  )}
                                </div>
                              ))}
                              {isAgentNegotiating && (
                                <div className="flex items-center justify-center gap-2 py-4">
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                  <span className="text-sm text-muted-foreground">AI agents are negotiating...</span>
                                </div>
                              )}
                              <div ref={agentMessagesEndRef} />
                            </div>
                          </ScrollArea>

                          <div className="p-3 border-t">
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  setAgentExchanges([]);
                                  setAgentRequest("");
                                  setAgentConversationHistory([]);
                                }}
                              >
                                New Request
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1"
                                onClick={handleStartAgentNegotiation}
                                disabled={isAgentNegotiating}
                              >
                                {isAgentNegotiating ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <ArrowRightLeft className="h-4 w-4 mr-1" />
                                    Continue
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <>
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${
                            message.role === "user" ? "justify-end" : ""
                          }`}
                        >
                          {message.role === "assistant" && (
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-primary text-primary-foreground">
                                <Sparkles className="h-4 w-4" />
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div
                            className={`max-w-[85%] rounded-lg p-3 ${
                              message.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          </div>
                          {message.role === "user" && (
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                <User className="h-4 w-4" />
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      ))}
                      {sendMessageMutation.isPending && (
                        <div className="flex gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              <Sparkles className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="bg-muted rounded-lg p-3">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {messages.length === 1 && (
                    <div className="p-4 border-t">
                      <p className="text-sm text-muted-foreground mb-2">Quick searches:</p>
                      <div className="flex flex-wrap gap-2">
                        {quickActions.map((action) => (
                          <Button
                            key={action.label}
                            variant="outline"
                            size="sm"
                            onClick={() => handleSendMessage(action.prompt)}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-4 border-t">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendMessage(inputMessage);
                      }}
                      className="flex gap-2"
                    >
                      <Input
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        placeholder="What are you looking for?"
                        disabled={sendMessageMutation.isPending}
                        className="flex-1"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        disabled={!inputMessage.trim() || sendMessageMutation.isPending}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </form>
                    {isGuest && (
                      <p className="text-xs text-muted-foreground mt-2 text-center">
                        <button
                          className="text-primary hover:underline"
                          onClick={() => setShowAuthModal(true)}
                        >
                          Sign in
                        </button>
                        {" "}to save conversations and place orders
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <AuthModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        title="Join Exportunity"
        description="Create an account to save your favorites and place orders"
      />
    </div>
  );
}
