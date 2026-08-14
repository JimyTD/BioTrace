import { createContext, useContext } from "react";
import type { Location } from "react-router-dom";

export const RealLocationContext = createContext<Location | null>(null);

export function useRealLocation(): Location | null {
  return useContext(RealLocationContext);
}
