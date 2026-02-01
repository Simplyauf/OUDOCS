import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Initialize Supabase Admin Client (Service Role) to bypass RLS for creation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const { name, deviceFingerprint } = await req.json();

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Get Client IP
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    // 1. RESUME: Try to find an existing guest profile for this device fingerprint
    if (deviceFingerprint) {
       const { data: existingGuest } = await supabase
         .from("profiles")
         .select("*")
         .eq("is_guest", true)
         .contains("metadata", { device_fingerprint: deviceFingerprint })
         .order('created_at', { ascending: false })
         .limit(1)
         .maybeSingle();

       if (existingGuest) {
         return NextResponse.json(existingGuest);
       }
    }

    // 2. LIMIT: If no existing session to resume, check strict limits (IP based)
    if (ip !== "unknown") {
      const { count, error: countError } = await supabase
        .from("profiles")
        .select("*", { count: 'exact', head: true })
        .eq("is_guest", true)
        .contains("metadata", { ip: ip });

      if (countError) {
        console.error("Abuse check error:", countError);
      } else {
        // Limit: Max 1 guest account per IP (Strict)
        const MAX_GUEST_ACCOUNTS = 1;
        if (count !== null && count >= MAX_GUEST_ACCOUNTS) {
           return NextResponse.json(
            { error: "Limit reached", message: "You already have a guest account. We resumed it for you, or your network limit is reached." },
            { status: 403 }
          );
        }
      }
    }

    // 3. CREATE: New "shadow" profile
    const { data, error } = await supabase
      .from("profiles")
      .insert({
        full_name: name,
        is_guest: true,
        quota_limit: 2, 
        quota_used: 0,
        metadata: { 
          device_fingerprint: deviceFingerprint || null,
          ip: ip 
        }
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Guest API Error:", error);
    return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
  }
}
