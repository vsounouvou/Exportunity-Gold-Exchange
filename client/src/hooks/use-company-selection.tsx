import { createContext, useContext, useState, ReactNode } from "react";

interface CompanySelectionContextType {
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  isAllCompanies: boolean;
}

const CompanySelectionContext = createContext<CompanySelectionContextType | undefined>(undefined);

export function CompanySelectionProvider({ children }: { children: ReactNode }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  return (
    <CompanySelectionContext.Provider
      value={{
        selectedCompanyId,
        setSelectedCompanyId,
        isAllCompanies: selectedCompanyId === null,
      }}
    >
      {children}
    </CompanySelectionContext.Provider>
  );
}

export function useCompanySelection() {
  const context = useContext(CompanySelectionContext);
  if (context === undefined) {
    throw new Error("useCompanySelection must be used within CompanySelectionProvider");
  }
  return context;
}
