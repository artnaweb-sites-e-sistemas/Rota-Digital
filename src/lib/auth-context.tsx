"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./firebase";
import { isGeneralAdminEmail } from "./general-admin";

interface AuthContextProps {
  user: User | null;
  loading: boolean;
  /** Utilizador com o e-mail definido em `GENERAL_ADMIN_EMAIL`. */
  isGeneralAdmin: boolean;
}

const AuthContext = createContext<AuthContextProps>({
  user: null,
  loading: true,
  isGeneralAdmin: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const isGeneralAdmin = useMemo(() => isGeneralAdminEmail(user?.email), [user?.email]);

  return (
    <AuthContext.Provider value={{ user, loading, isGeneralAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};
