import { createContext, type ReactNode, useContext } from "react";

import type { AIFormApi, FieldApi } from "./useAIForm";

const AIFormContext = createContext<AIFormApi | null>(null);

export interface AIFormProviderProps {
  api: AIFormApi;
  children: ReactNode;
}

export function AIFormProvider({ api, children }: AIFormProviderProps) {
  return (
    <AIFormContext.Provider value={api}>{children}</AIFormContext.Provider>
  );
}

export function useAIFormApi(): AIFormApi {
  const api = useContext(AIFormContext);
  if (!api) {
    throw new Error("useAIFormApi must be used inside an AIFormProvider");
  }
  return api;
}

export function useField(id: string): FieldApi {
  return useAIFormApi().field(id);
}
