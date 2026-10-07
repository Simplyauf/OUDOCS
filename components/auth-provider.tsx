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

type GuestProfile = { id: string; full_name: string; is_guest: boolean };

async function loadGuestProfile(): Promise<GuestProfile | null> {
  const res = await fetch("/api/guest");
  if (res.ok) return res.json();

  const savedName = localStorage.getItem("oudocs_user_name");
  if (!savedName) return null;

  const { getDeviceFingerprint } = await import("@/lib/fingerprint");
  const resumed = await fetch("/api/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: savedName, deviceFingerprint: await getDeviceFingerprint() }),
  });

  return resumed.ok ? resumed.json() : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const handleSession = async (session: Session | null) => {
    if (session?.user) {
      // Ensure Profile exists and Merge Guest data
      try {
        const res = await fetch("/api/profile/ensure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: session.user.email,
                fullName: session.user.user_metadata?.full_name || session.user.email?.split("@")[0],
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
      const guestProfile = await loadGuestProfile();

      if (guestProfile) {
        setUser(null);
        setIsGuest(true);
        setProfile(guestProfile);
        localStorage.setItem("oudocs_user_id", guestProfile.id);
        localStorage.setItem("oudocs_user_name", guestProfile.full_name);
      } else {
        localStorage.removeItem("oudocs_user_id");
        localStorage.removeItem("oudocs_user_name");
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
