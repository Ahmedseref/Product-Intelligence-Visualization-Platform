import React, { createContext, useContext } from 'react';

interface RefreshContextValue {
  lockEditing: () => void;
  unlockEditing: () => void;
}

const RefreshContext = createContext<RefreshContextValue>({
  lockEditing: () => {},
  unlockEditing: () => {},
});

export const RefreshProvider = RefreshContext.Provider;

export function useRefreshContext(): RefreshContextValue {
  return useContext(RefreshContext);
}
