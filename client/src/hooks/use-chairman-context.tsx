import { createContext, useContext, ReactNode } from "react";
import { useCompany } from "./use-company";

interface ChairmanContextType {
  currentCompanyId: number | null;
  setCurrentCompanyId: (id: number | null) => void;
  currentCompanyName: string | null;
  setCurrentCompanyName: (name: string | null) => void;
  chairmanChatRoomId: string;
}

const ChairmanContext = createContext<ChairmanContextType | undefined>(undefined);

export function ChairmanProvider({ children }: { children: ReactNode }) {
  const { selectedCompanyId, setSelectedCompanyId, selectedCompany, companies } = useCompany();
  
  const chairmanChatRoomId = "chairman-main";

  return (
    <ChairmanContext.Provider
      value={{
        currentCompanyId: selectedCompanyId,
        setCurrentCompanyId: setSelectedCompanyId,
        currentCompanyName: selectedCompany?.name ?? null,
        setCurrentCompanyName: (name: string | null) => {
          const targetName = String(name ?? "").trim();
          if (!targetName) return;
          const match = companies.find((c) => String(c?.name || "").trim() === targetName);
          if (match?.id) setSelectedCompanyId(match.id);
        },
        chairmanChatRoomId,
      }}
    >
      {children}
    </ChairmanContext.Provider>
  );
}

export function useChairmanContext() {
  const context = useContext(ChairmanContext);
  if (context === undefined) {
    throw new Error("useChairmanContext must be used within a ChairmanProvider");
  }
  return context;
}
