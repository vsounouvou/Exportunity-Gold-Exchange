import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { resolveApiUrl } from "@/lib/runtimeConfig";

interface User {
  id: number;
  displayName: string;
  email?: string;
  role: 'chairman' | 'investor' | 'admin';
  accountType: string;
  language: string;
  timezone: string;
  phoneNumber?: string;
  phoneCountryCode?: string;
  phoneVerified?: boolean;
  phoneVerifiedAt?: string;
  neighborhoodId?: number;
  qrCode?: string;
  qrCodeUrl?: string;
  preferences: {
    vision?: string;
    preferredMarkets?: string[];
    preferredStyle?: string;
    riskAppetite?: string;
    keyProjects?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

interface UserContextType {
  user: User | null;
  isLoading: boolean;
  updateUser: (data: Partial<User>) => Promise<void>;
  refetch: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user, isLoading, refetch } = useQuery<User>({
    queryKey: ["/api/user"],
    staleTime: 5 * 60 * 1000,
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: Partial<User>) => {
      const response = await fetch(resolveApiUrl("/api/user"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        if (response.status >= 500) {
          throw new Error(`${response.status}: ${response.statusText}`);
        }
        throw new Error(`${response.status}: ${await response.text()}`);
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
  });

  return (
    <UserContext.Provider
      value={{
        user: user || null,
        isLoading,
        updateUser: updateUserMutation.mutateAsync,
        refetch: () => refetch(),
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
