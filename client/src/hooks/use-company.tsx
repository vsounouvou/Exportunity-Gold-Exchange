import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from "@/lib/tenant";

interface Company {
  id: number;
  tenantId?: number | null;
  name: string;
  userId: number | null;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_COMPANY_NAMES = ["Bourse de l'Or", "Exportunity"];
const LEGACY_STORAGE_KEY = "selectedCompanyId";

function getTenantCompanyStorageKey(tenantKey: string) {
  return `selectedCompanyId:${tenantKey}`;
}

function readCompanyIdFromStorage(storageKey: string): number | null {
  if (typeof window === "undefined") return null;
  const scoped = localStorage.getItem(storageKey);
  if (scoped) {
    const parsed = parseInt(scoped, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function normalizeCompanyName(name: string) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

interface CompanyContextType {
  selectedCompanyId: number | null;
  setSelectedCompanyId: (id: number | null) => void;
  companies: Company[];
  selectedCompany: Company | null;
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant();
  const storageKey = useMemo(() => getTenantCompanyStorageKey(String(tenant.key || "default")), [tenant.key]);

  const [selectedCompanyId, setSelectedCompanyIdState] = useState<number | null>(() => {
    return readCompanyIdFromStorage(storageKey);
  });

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ['/api/companies'],
    staleTime: 5 * 60 * 1000,
  });

  const tenantId = Number(tenant?.id || 0) > 0 ? Number(tenant.id) : null;
  const scopedCompanies = useMemo(() => {
    if (!tenantId) return companies;
    return companies.filter((company) => Number(company?.tenantId || 0) === tenantId);
  }, [companies, tenantId]);

  const selectedCompany = scopedCompanies.find(c => c.id === selectedCompanyId) || null;

  useEffect(() => {
    setSelectedCompanyIdState(readCompanyIdFromStorage(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (!isLoading && scopedCompanies.length > 0) {
      if (!selectedCompanyId || !scopedCompanies.find(c => c.id === selectedCompanyId)) {
        const preferredNames =
          tenant.key === "exportunity" ? ["Exportunity", "Bourse de l'Or"] : DEFAULT_COMPANY_NAMES;
        const preferred = scopedCompanies.find(
          (c) => preferredNames.some((name) => normalizeCompanyName(c.name) === normalizeCompanyName(name))
        );
        const fallback = scopedCompanies.find(c => c.name === 'Default Company') || scopedCompanies[0];
        const defaultCompany = preferred || fallback;
        setSelectedCompanyIdState(defaultCompany.id);
        localStorage.setItem(storageKey, defaultCompany.id.toString());
      }
      return;
    }
    if (!isLoading && scopedCompanies.length === 0) {
      setSelectedCompanyIdState(null);
      localStorage.removeItem(storageKey);
    }
  }, [isLoading, selectedCompanyId, scopedCompanies, storageKey, tenant.key]);

  const setSelectedCompanyId = (id: number | null) => {
    setSelectedCompanyIdState(id);
    if (id !== null) {
      localStorage.setItem(storageKey, id.toString());
    } else {
      localStorage.removeItem(storageKey);
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  };

  return (
    <CompanyContext.Provider value={{ 
      selectedCompanyId, 
      setSelectedCompanyId,
      companies: scopedCompanies,
      selectedCompany,
      isLoading
    }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
