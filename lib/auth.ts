import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export const GUEST_COOKIE = "outdocs_guest";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type Caller = { userId: string; isGuest: boolean };

export type GuestProfile = {
  id: string;
  full_name: string;
  is_guest: boolean;
};

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

function readRuntimeEnv(name: string): string | undefined {
  return process.env[name];
}

function guestSecret(): string {
  const secret = readRuntimeEnv("GUEST_COOKIE_SECRET");
  if (!secret || secret.length < 32) {
    console.error(
      "[auth] GUEST_COOKIE_SECRET unusable:",
      JSON.stringify({
        present: secret !== undefined,
        length: secret?.length ?? 0,
        required: 32,
        vercelEnv: process.env.VERCEL_ENV ?? "unset",
        sawOtherServerVars: {
          SUPABASE_SERVICE_ROLE_KEY: readRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY") !== undefined,
          GOOGLE_API_KEY: readRuntimeEnv("GOOGLE_API_KEY") !== undefined,
        },
      })
    );
    throw new Error("Guest authentication is not configured");
  }
  return secret;
}

function mac(profileId: string): string {
  return createHmac("sha256", guestSecret()).update(profileId).digest("base64url");
}

export function signGuestId(profileId: string): string {
  return `${profileId}.${mac(profileId)}`;
}

export function verifySignedGuestCookie(value: string): string | null {
  const split = value.lastIndexOf(".");
  if (split <= 0) return null;

  const profileId = value.slice(0, split);
  const provided = Buffer.from(value.slice(split + 1));
  const expected = Buffer.from(mac(profileId));

  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  return profileId;
}

export function guestCookieOptions() {
  return {
    name: GUEST_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export async function resolveCaller(): Promise<Caller | null> {
  const store = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: () => {},
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  if (data.user) {
    return { userId: data.user.id, isGuest: false };
  }

  const raw = store.get(GUEST_COOKIE)?.value;
  if (!raw) return null;

  const profileId = verifySignedGuestCookie(raw);
  if (!profileId) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, is_guest")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile || !profile.is_guest) return null;

  return { userId: profile.id, isGuest: true };
}

export async function requireCaller(): Promise<Caller> {
  const caller = await resolveCaller();
  if (!caller) throw new AuthError(401, "Authentication required");
  return caller;
}

export async function requireSessionAccess(
  sessionId: unknown
): Promise<{ caller: Caller; sessionId: string }> {
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new AuthError(400, "sessionId is required");
  }

  const caller = await requireCaller();

  const { data: session } = await admin
    .from("sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.user_id !== caller.userId) {
    throw new AuthError(403, "Forbidden");
  }

  return { caller, sessionId };
}

export function authErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}
