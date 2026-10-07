import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireCaller, requireSessionAccess } from "@/lib/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const caller = await requireCaller();
    const { title } = await req.json().catch(() => ({ title: null }));

    const { data: profile } = await supabase
      .from("profiles")
      .select("quota_used, quota_limit")
      .eq("id", caller.userId)
      .single();

    if (profile && profile.quota_used >= profile.quota_limit) {
      return NextResponse.json(
        { error: "Quota exceeded", message: "Session quota exceeded. Please sign in for more." },
        { status: 403 }
      );
    }

    const { data: session, error } = await supabase
      .from("sessions")
      .insert({
        user_id: caller.userId,
        title: title || "New Session",
      })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from("profiles")
      .update({ quota_used: (profile?.quota_used || 0) + 1 })
      .eq("id", caller.userId);

    return NextResponse.json(session);
  } catch (error: any) {
    const authFailure = authErrorResponse(error);
    if (authFailure) return authFailure;

    console.error("Session Create Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const caller = await requireCaller();

    const { data, error } = await supabase
      .from("sessions")
      .select("*, documents(content, metadata), messages(*)")
      .eq("user_id", caller.userId)
      .order("created_at", { ascending: false })
      .order("created_at", { foreignTable: "messages", ascending: true });

    if (error) {
      return NextResponse.json({ error: "Fetch error" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    const authFailure = authErrorResponse(error);
    if (authFailure) return authFailure;

    console.error("Session Fetch Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { sessionId } = await requireSessionAccess(searchParams.get("id"));

    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("id", sessionId);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    const authFailure = authErrorResponse(error);
    if (authFailure) return authFailure;

    console.error("Delete Error:", error);
    return NextResponse.json({ error: "Delete error" }, { status: 500 });
  }
}
