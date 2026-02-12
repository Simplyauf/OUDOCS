"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  profile: any | null;
  isGuest: boolean;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setGuestProfile: (profile: any) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const handleSession = async (session: Session | null) => {
    if (session?.user) {
      // Check for guestId before we clear it
      const guestId = localStorage.getItem("oudocs_user_id");

      // Ensure Profile exists and Merge Guest data
      try {
        const res = await fetch("/api/profile/ensure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: session.user.id,
                email: session.user.email,
                fullName: session.user.user_metadata?.full_name || session.user.email?.split("@")[0],
                guestId: guestId // Pass to merge
            })
        });
        const fullProfile = await res.json();
        setProfile(fullProfile);
        setUser(session.user);
        setIsGuest(false);

        // Success! Clear guest indicator
        localStorage.removeItem("oudocs_user_id");
        localStorage.removeItem("oudocs_user_name");

      } catch (err) {
        console.error("Failed to ensure profile", err);
      }
    } else {
      // Check for Guest in LocalStorage
      const guestId = localStorage.getItem("oudocs_user_id");
      const guestName = localStorage.getItem("oudocs_user_name");

      if (guestId && guestName) {
        setUser(null);
        setIsGuest(true);
        setProfile({
          id: guestId,
          full_name: guestName,
          is_guest: true
        });
      } else {
        setUser(null);
        setIsGuest(false);
        setProfile(null);
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    // 1. Initial Session Check
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      handleSession(session);
    };

    checkUser();

    // 2. Listen for Auth Changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        handleSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("oudocs_user_id");
    localStorage.removeItem("oudocs_user_name");
    setUser(null);
    setProfile(null);
    setIsGuest(false);
  };

  const setGuestProfile = (newProfile: any) => {
    setProfile(newProfile);
    setIsGuest(true);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isGuest,
        isLoading,
        signInWithGoogle,
        signOut,
        setGuestProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
