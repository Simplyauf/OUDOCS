import { processText, generateTitle } from "@/lib/rag";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const { text, sessionId } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Limit text size to prevent token exhaustion (50k as per rules)
    const MAX_TEXT_LENGTH = 50000;
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: "Text too long", message: `Free Tier is limited to ${MAX_TEXT_LENGTH.toLocaleString()} characters. Please upgrade for longer documents.` },
        { status: 400 }
      );
    }

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    // 1. Process for RAG
    const result = (await processText(text, sessionId)) as any;

    // 2. Generate Professional Title via Gemini
    const aiTitle = await generateTitle(text);

    // 3. Update session title and metadata
    const { data: updatedSession, error: updateError } = await supabase
      .from("sessions")
      .update({
        title: aiTitle,
        metadata: { 
          charCount: result.charCount, 
          type: 'TEXT',
          snippet: text.substring(0, 500)
        }
      })
      .eq("id", sessionId)
      .select("*, documents(content, metadata), messages(*)")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      ...result,
      session: updatedSession
    });
  } catch (error: any) {
    console.error("Text ingest error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 }
    );
  }
}
