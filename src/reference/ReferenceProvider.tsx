import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type LevelKey = "excelente" | "bueno" | "regular" | "malo";

export interface SexRules {
  unisex: string | null;
  male: string | null;
  female: string | null;
}

export interface BiomarkerEntry {
  id: string;
  name: string;
  units: string | null;
  category: "cardiovascular" | "metabolic" | "immune" | "hormonal" | "general";
  levels: Record<LevelKey, SexRules>;
  raw: Record<LevelKey, string>;
}

export interface ReferenceData {
  version: number;
  biomarkers: BiomarkerEntry[];
  by_id: Record<string, BiomarkerEntry>;
  generated_at: string;
}

type ReferenceContextType = {
  data: ReferenceData | null;
  loading: boolean;
  reload: () => Promise<void>;
};

const ReferenceContext = createContext<ReferenceContextType>({
  data: null,
  loading: true,
  reload: async () => {},
});

const STORAGE_KEY = "reference_ranges";

export const ReferenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<ReferenceData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFromLocalStorage = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ReferenceData;
    } catch {
      return null;
    }
  };

  const fetchAndPersist = async () => {
    const res = await fetch("/reference_ranges.dashboard.json");
    const json = (await res.json()) as ReferenceData;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
    return json;
  };

  const boot = async () => {
    setLoading(true);
    try {
      const local = loadFromLocalStorage();
      if (local) {
        setData(local);
        setLoading(false);
        return;
      }
      const fresh = await fetchAndPersist();
      setData(fresh);
    } catch (e) {
      console.error("Error cargando referencias:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void boot();
  }, []);

  const value = useMemo(
    () => ({
      data,
      loading,
      reload: async () => {
        setLoading(true);
        try {
          const fresh = await fetchAndPersist();
          setData(fresh);
        } finally {
          setLoading(false);
        }
      },
    }),
    [data, loading]
  );

  return (
    <ReferenceContext.Provider value={value}>
      {children}
    </ReferenceContext.Provider>
  );
};

export const useReferenceContext = () => useContext(ReferenceContext);
