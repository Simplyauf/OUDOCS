import { askQuestion } from "@/lib/rag";
import { NextRequest, NextResponse } from "next/server";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const { question, sessionId } = await req.json();
    console.log("Asking question:", question, "Session:", sessionId);

    // Fetch recent history for context (Last 6 messages)
    let history: any[] = [];
    if (sessionId) {
      const { data: messages } = await supabase
        .from("messages")
        .select("role, content")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false }) // Get latest first
        .limit(6);
      
      if (messages) {
        history = messages.reverse(); // Flip back to chronological order
      }
    }

    const context = await askQuestion(question, sessionId, history);
    console.log("Context retrieved:", context ? context.substring(0, 100) + "..." : "EMPTY");

    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.0-flash", 
      apiKey: process.env.GOOGLE_API_KEY,
      maxOutputTokens: 2048,
      apiVersion: "v1beta",
    });

    const prompt = `
You are an expert document analyst and helpful AI assistant designed to extract insights from user documents.

Instructions:
1. Answer the question using ONLY the provided context below.
2. If the answer is not present in the context, say: "I don't know based on the provided document." 
3. Do not make up information or use outside knowledge.
4. Format your answer nicely using Markdown. Use bullet points for lists, bold text for key terms, and code blocks if relevant.
5. Be concise but thorough.

Context:
${context}

Question:
${question}
`;

    const res = await model.invoke(prompt);
    const answer = res.content;

    // Persist messages if sessionId is present
    if (sessionId) {
      await supabase.from("messages").insert([
        { session_id: sessionId, role: "user", content: question },
        { session_id: sessionId, role: "assistant", content: answer }
      ]);
    }

    return NextResponse.json({
      answer: answer,
    });
  } catch (error: any) {
    console.error("Chat error details:", error);
    const status = error.status === 429 || error.message?.includes("429") ? 429 : 500;
    return NextResponse.json(
      { error: status === 429 ? "Rate Limit Exceeded" : "Internal Server Error", message: error.message }, 
      { status: status }
    );
  }
}
