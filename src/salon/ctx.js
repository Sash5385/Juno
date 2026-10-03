import { createContext, useContext } from "react";
export const SalonCtx = createContext(null);
export const useSalon = () => useContext(SalonCtx);
