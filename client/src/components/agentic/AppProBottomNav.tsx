import { Activity, Bot, Package, UserCircle2, Wallet } from "lucide-react";
import { useLocation } from "wouter";

import { MobileBottomNav } from "@/components/marketplace/MobileBottomNav";

type AppProBottomNavKey = "operations" | "money" | "orders" | "agents" | "account";

type AppProBottomNavProps = {
  activeKey: AppProBottomNavKey;
};

export function AppProBottomNav({ activeKey }: AppProBottomNavProps) {
  const [, setLocation] = useLocation();

  const items = [
    {
      key: "operations" as const,
      label: "Operations",
      icon: <Activity className="h-4 w-4" />,
      onPress: () => setLocation("/pro/operations"),
      primary: true,
    },
    {
      key: "money" as const,
      label: "Money",
      icon: <Wallet className="h-4 w-4" />,
      onPress: () => setLocation("/pro/money"),
    },
    {
      key: "orders" as const,
      label: "Orders",
      icon: <Package className="h-4 w-4" />,
      onPress: () => setLocation("/pro/orders"),
    },
    {
      key: "agents" as const,
      label: "Agents",
      icon: <Bot className="h-4 w-4" />,
      onPress: () => setLocation("/pro/agents"),
    },
    {
      key: "account" as const,
      label: "Account",
      icon: <UserCircle2 className="h-4 w-4" />,
      onPress: () => setLocation("/pro/account"),
    },
  ];

  return (
    <MobileBottomNav
      activeKey={activeKey}
      items={items}
      theme="gtn"
    />
  );
}
