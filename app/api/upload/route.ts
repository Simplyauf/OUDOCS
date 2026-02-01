import { processPDF, processDocument, generateTitle } from "@/lib/rag";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Limit file size (15MB as per new rules)
    const MAX_FILE_SIZE = 15 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large", message: "Maximum file size is 15MB for Free Tier." },
        { status: 400 }
      );
    }

    const sessionId = formData.get("sessionId") as string;

    // Validate file type
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const supportedTypes = ['pdf', 'docx', 'doc', 'txt', 'md', 'rtf'];
    
    if (!fileExtension || !supportedTypes.includes(fileExtension)) {
      return NextResponse.json(
        { error: "Unsupported file type", message: `Supported formats: ${supportedTypes.join(', ').toUpperCase()}` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 1. Process document based on file type
    let result;
    try {
      result = (await processDocument(buffer, fileExtension, sessionId, file.name)) as any;
      
      // Check for zero chunks/text
      if (!result.chunks || result.chunks === 0) {
        return NextResponse.json(
          { error: "No text detected", message: `This ${fileExtension.toUpperCase()} file appears to be empty or unreadable.` },
          { status: 400 }
        );
      }

      // Check for page/size limits (PDF: 20 pages, DOCX: 10k words)
      if (fileExtension === 'pdf' && result.metadata?.pageCount > 20) {
         return NextResponse.json(
          { error: "Page limit exceeded", message: "Free Tier is limited to 20 pages. Please upgrade for longer documents." },
          { status: 400 }
        );
      } else if (['docx', 'doc'].includes(fileExtension) && result.metadata?.wordCount > 30000) {
         return NextResponse.json(
          { error: "Word limit exceeded", message: "Free Tier is limited to 30,000 words for Word documents." },
          { status: 400 }
        );
      } else if (['txt', 'md', 'rtf'].includes(fileExtension) && result.metadata?.wordCount > 30000) {
         return NextResponse.json(
          { error: "Word limit exceeded", message: "Free Tier is limited to 30,000 words for text documents." },
          { status: 400 }
        );
      }
    } catch (e: any) {
      return NextResponse.json(
        { error: "Processing Error", message: e.message },
        { status: 400 }
      );
    }

    if (sessionId) {
      // 2. Upload to Supabase Storage (for download/viewing)
      const fileName = `${sessionId}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: true
        });

      if (uploadError) {
        console.warn("Storage upload failed (bucket might be missing):", uploadError);
        // We don't throw here so RAG still works, but download will fail.
      }

      console.log("Updating session metadata for ID:", sessionId);

      // 3. Update session title and metadata
      let displayTitle = file.name;
      const docType = fileExtension.toUpperCase();
      
      // Force AI title for generic names
      if (displayTitle.toLowerCase().includes('document') || 
          displayTitle.toLowerCase().includes('resume') || 
          displayTitle.length < 5) {
        try {
          console.log(`Generating AI Title for ${docType}...`);
          const aiTitle = await generateTitle(result.textSnippet);
          if (aiTitle && aiTitle !== "New Analysis" && !aiTitle.includes("Text snippet")) {
            displayTitle = aiTitle;
          }
        } catch (e) {
          console.error("AI Title generation failed, using filename:", e);
        }
      }
      // Build metadata based on file type
      const sessionMetadata: any = {
        type: docType,
        fileName: file.name,
        storagePath: fileName,
        storageError: !!uploadError
      };

      if (fileExtension === 'pdf') {
        sessionMetadata.pageCount = result.metadata?.pageCount;
      } else if (['docx', 'doc'].includes(fileExtension)) {
        sessionMetadata.wordCount = result.metadata?.wordCount;
        sessionMetadata.pageEstimate = result.metadata?.pageEstimate;
      } else {
        sessionMetadata.wordCount = result.metadata?.wordCount;
        sessionMetadata.charCount = result.metadata?.charCount;
      }

      // Perform the update
      const { data: updatedSession, error: updateError } = await supabase
        .from("sessions")
        .update({
          title: displayTitle,
          metadata: sessionMetadata
        })
        .eq("id", sessionId)
        .select("*, documents(content, metadata), messages(*)")
        .single();

      if (updateError) {
        console.error("Session Update Error:", updateError);
        throw updateError;
      }

      console.log("Successfully updated session:", updatedSession?.id, "New Title:", updatedSession?.title);

      return NextResponse.json({
        ...result,
        session: updatedSession
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 }
    );
  }
}
