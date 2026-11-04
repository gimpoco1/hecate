import { createContext } from "react";
import type { Coordinate } from "./types";

export const OnboardingLocationContext = createContext<Coordinate | undefined>(undefined);
