import { createContext, useContext } from "react";

export interface ActiveBranchValue {
  /** Currently selected branch id (admins can switch; branch staff are fixed). */
  activeBranchId: string;
  setActiveBranchId: (id: string) => void;
}

const ActiveBranchContext = createContext<ActiveBranchValue>({
  activeBranchId: "",
  setActiveBranchId: () => {},
});

export const ActiveBranchProvider = ActiveBranchContext.Provider;

export function useActiveBranch(): ActiveBranchValue {
  return useContext(ActiveBranchContext);
}
