import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const { userId, email, fullName, guestId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // 1. Upsert Profile (Idempotent creation)
    const { data: profile, error: upsertError } = await supabase
      .from("profiles")
      .upsert({
        id: userId,
        email,
        full_name: fullName,
        is_guest: false,
        quota_limit: 5, // Quota boost for Google Users
        // We don't overwrite quota_used if it exists
      }, { 
        onConflict: 'id',
        ignoreDuplicates: false // We want to update email/name but not quota
      })
      .select()
      .single();

    if (upsertError) throw upsertError;

    // 2. Merge Logic: Transfer guest sessions to this account
    if (guestId && guestId !== userId) {
      console.log(`Merging guest ${guestId} into auth user ${userId}`);
      
      // Transfer sessions
      const { error: sessionError } = await supabase
        .from("sessions")
        .update({ user_id: userId })
        .eq("user_id", guestId);

      if (!sessionError) {
          // Count all sessions now owned by this user
          const { count } = await supabase
              .from("sessions")
              .select("*", { count: 'exact', head: true })
              .eq("user_id", userId);
          
          await supabase
              .from("profiles")
              .update({ quota_used: count || 0 })
              .eq("id", userId);
          
          // Delete the old ghost guest profile
          await supabase.from("profiles").delete().eq("id", guestId);
      }
    }

    return NextResponse.json(profile);
  } catch (error: any) {
    console.error("Profile Ensure Error:", error);
    return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
  }
}
