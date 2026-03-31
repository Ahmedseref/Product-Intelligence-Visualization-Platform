import React, { createContext, useContext } from 'react';

interface RefreshContextValue {
  setIsEditing: (editing: boolean) => void;
}

const RefreshContext = createContext<RefreshContextValue>({
  setIsEditing: () => {},
});

export const RefreshProvider = RefreshContext.Provider;

export function useRefreshContext(): RefreshContextValue {
  return useContext(RefreshContext);
}
