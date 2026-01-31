'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type ExpedienteContextValue = {
  timezone: string;
  isLoading: boolean;
};

const ExpedienteContext = createContext<ExpedienteContextValue>({
  timezone: 'America/Belem',
  isLoading: true,
});

export function useInstitutionalTimezone(): string {
  const { timezone } = useContext(ExpedienteContext);
  return timezone;
}

export function ExpedienteConfigProvider({ children }: { children: React.ReactNode }) {
  const [timezone, setTimezone] = useState('America/Belem');
  const [isLoading, setIsLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config/expediente', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = await res.json();
        setTimezone(data.timezone ?? 'America/Belem');
      }
    } catch {
      // mantém default
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return (
    <ExpedienteContext.Provider value={{ timezone, isLoading }}>
      {children}
    </ExpedienteContext.Provider>
  );
}
