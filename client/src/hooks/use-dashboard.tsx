import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Agent } from '@db/schema';

interface DashboardContextType {
  selectedAgent: Agent | null;
  setSelectedAgent: (agent: Agent | null) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  return (
    <DashboardContext.Provider value={{ selectedAgent, setSelectedAgent }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  return context;
}
