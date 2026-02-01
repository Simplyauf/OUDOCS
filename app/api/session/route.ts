import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const { userId, title } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // 1. Check Quota (Optional/Later strict enforcement can go here)
    const { data: profile } = await supabase
      .from("profiles")
      .select("quota_used, quota_limit")
      .eq("id", userId)
      .single();
    
    if (profile && profile.quota_used >= profile.quota_limit) {
      return NextResponse.json(
        { error: "Quota exceeded", message: "Session quota exceeded. Please sign in for more." },
        { status: 403 }
      );
    }

    // 2. Create Session
    const { data: session, error } = await supabase
      .from("sessions")
      .insert({
        user_id: userId,
        title: title || "New Session",
      })
      .select()
      .single();

    if (error) throw error;

    // 3. Increment usage
    await supabase.rpc('increment_quota', { user_uuid: userId }); // We might need to write this RPC or just do a raw update
    // For now, raw update is fine for MVP
    await supabase
      .from("profiles")
      .update({ quota_used: (profile?.quota_used || 0) + 1 })
      .eq("id", userId);

    return NextResponse.json(session);
  } catch (error: any) {
    console.error("Session Create Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("sessions")
    .select("*, documents(content, metadata), messages(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("created_at", { foreignTable: "messages", ascending: true });

  if (error) {
    return NextResponse.json({ error: "Fetch error", message: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("id");

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("id", sessionId);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error("Delete Error:", error);
    return NextResponse.json({ error: "Delete error", message: error.message }, { status: 500 });
  }
}
