import { extractText, getDocumentProxy } from "unpdf";
import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";
import { Document } from "@langchain/core/documents";
import { TaskType } from "@google/generative-ai";
import mammoth from "mammoth";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const client = createClient(supabaseUrl, supabaseKey);

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);
  const result = await extractText(pdf);
  
  if (typeof result.text === 'string') {
    return result.text;
  } else if (Array.isArray(result.text)) {
    return (result.text as string[]).join("\n\n");
  }
  
  return "";
}

/**
 * Extract text from DOCX files using mammoth
 */
async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Process any document type (PDF, DOCX, TXT, MD, RTF)
 */
export async function processDocument(buffer: Buffer, fileType: string, sessionId?: string, fileName: string = "Document") {
  try {
    let text = "";
    let metadata: any = { source_name: fileName, source_type: fileType.toLowerCase() };

    // Extract text based on file type
    if (fileType === 'pdf') {
      const data = new Uint8Array(buffer);
      const pdf = await getDocumentProxy(data);
      metadata.pageCount = pdf.numPages;
      const result = await extractText(pdf);
      text = typeof result.text === 'string' ? result.text : (Array.isArray(result.text) ? result.text.join("\n\n") : "");
    } else if (fileType === 'docx' || fileType === 'doc') {
      text = await extractTextFromDOCX(buffer);
      metadata.wordCount = text.split(/\s+/).length;
      metadata.pageEstimate = Math.ceil(metadata.wordCount / 250); // ~250 words per page
    } else if (fileType === 'txt' || fileType === 'md' || fileType === 'rtf') {
      text = buffer.toString('utf-8');
      metadata.wordCount = text.split(/\s+/).length;
      metadata.charCount = text.length;
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }

    if (!text || text.trim().length === 0) {
      throw new Error(`No text could be extracted from the ${fileType.toUpperCase()} file.`);
    }

    // ENFORCE LIMITS BEFORE EMBEDDING (to avoid wasting API credits)
    const FREE_TIER_WORD_LIMIT = 30000;
    const FREE_TIER_PAGE_LIMIT = 20;
    
    if (fileType === 'pdf' && metadata.pageCount > FREE_TIER_PAGE_LIMIT) {
      throw new Error(`Page limit exceeded: This PDF has ${metadata.pageCount} pages. Free Tier is limited to ${FREE_TIER_PAGE_LIMIT} pages.`);
    } else if (metadata.wordCount && metadata.wordCount > FREE_TIER_WORD_LIMIT) {
      throw new Error(`Word limit exceeded: This document has ${metadata.wordCount.toLocaleString()} words. Free Tier is limited to ${FREE_TIER_WORD_LIMIT.toLocaleString()} words.`);
    }

    // Split text into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 150,
    });
    
    const docs = await splitter.createDocuments([text]);

    // Add sessionId to metadata for every chunk
    if (sessionId) {
      docs.forEach(doc => {
        doc.metadata.session_id = sessionId;
        doc.metadata.source_name = fileName;
        doc.metadata.source_type = fileType.toLowerCase();
      });
    }

    // Store in vector database
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      modelName: "models/gemini-embedding-001",
      taskType: TaskType.RETRIEVAL_DOCUMENT,
    });

    await SupabaseVectorStore.fromDocuments(docs, embeddings, {
      client,
      tableName: "documents",
      queryName: "match_documents",
    });

    return { 
      success: true, 
      chunks: docs.length, 
      textSnippet: text.substring(0, 1000),
      metadata
    };
  } catch (error: any) {
    console.error(`Document processing error (${fileType}):`, error.message);
    throw error;
  }
}

export async function processPDF(buffer: Buffer, sessionId?: string, fileName: string = "Document.pdf") {
  try {
    // 1. Extract Text
    const data = new Uint8Array(buffer);
    const pdf = await getDocumentProxy(data);
    const pageCount = pdf.numPages;
    const result = await extractText(pdf);
    const text = typeof result.text === 'string' ? result.text : (Array.isArray(result.text) ? result.text.join("\n\n") : "");

    if (!text) {
      throw new Error("No text could be extracted from the PDF.");
    }

    // 2. Split Text
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 150,
    });
    
    const docs = await splitter.createDocuments([text]);

    // Add sessionId to metadata for every chunk explicitly
    if (sessionId) {
      docs.forEach(doc => {
        doc.metadata.session_id = sessionId;
        doc.metadata.source_name = fileName;
        doc.metadata.source_type = 'pdf';
      });
    }

    // 3. Generate Embeddings via Google Gemini
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      modelName: "models/gemini-embedding-001", // Confirmed available model
    });

    // 4. Save to Supabase
    await SupabaseVectorStore.fromDocuments(docs, embeddings, {
      client,
      tableName: "documents",
      queryName: "match_documents",
    });

    return { success: true, chunks: docs.length, pageCount, textSnippet: text.substring(0, 1000) };
  } catch (error: any) {
    console.error("Upload error in lib/rag.ts:", error.message);
    throw error;
  }
}

export async function processText(text: string, sessionId?: string) {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error("No text provided.");
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 150,
    });

    const docs = await splitter.createDocuments([text]);


    if (sessionId) {
      docs.forEach(doc => {
        doc.metadata.session_id = sessionId;
        doc.metadata.source_name = "Pasted Text";
        doc.metadata.source_type = "text";
      });
    }

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      modelName: "models/gemini-embedding-001",
    });

    await SupabaseVectorStore.fromDocuments(docs, embeddings, {
      client,
      tableName: "documents",
      queryName: "match_documents",
    });

    return { success: true, chunks: docs.length, charCount: text.length, textSnippet: text.substring(0, 1000) };
  } catch (error: any) {
    console.error("Ingest error in lib/rag.ts:", error.message);
    throw error;
  }
}

export async function askQuestion(question: string, sessionId?: string, history: any[] = []) {
  // 1. Contextualize the question if history exists
  let searchParam = question;
  
  if (history.length > 0) {
    try {
      const historyContext = history.map((msg: any) => `${msg.role}: ${msg.content}`).join("\n");
      
      const contextualizeModel = new ChatGoogleGenerativeAI({
        model: "gemini-2.0-flash",
        apiKey: process.env.GOOGLE_API_KEY,
        temperature: 0.1, // Low temp for precision
        apiVersion: "v1beta",
      });
      
      const contextualizePrompt = `
Given a chat history and the latest user question which might reference context in the chat history, formulate a standalone question which can be understood without the chat history.

Rules:
1. REPLACE specific pronouns (it, this, he, she, they) with the actual nouns they refer to from the history.
2. If the user asks "how much?", "what is the total?", "who is he?", SPECIFY what they are asking about based on previous messages.
3. If the question is already standalone, return it exactly as is.
4. Do NOT answer the question.

Chat History:
${historyContext}

Latest Question: ${question}

Standalone Question:`;

      const res = await contextualizeModel.invoke(contextualizePrompt);
      searchParam = res.content.toString().trim();
      console.log(`Contextualized Query: "${question}" -> "${searchParam}"`);
    } catch (e) {
      console.error("Contextualization failed, fallback to original:", e);
    }
  }

  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    modelName: "models/gemini-embedding-001",
  });

  const vectorStore = new SupabaseVectorStore(embeddings, {
    client,
    tableName: "documents",
    queryName: "match_documents",
  });

  const filter = sessionId ? { session_id: sessionId } : undefined;
  
  // Use the refined searchParam instead of the raw question
  const results = await vectorStore.similaritySearch(searchParam, 15, filter);

  if (results.length === 0) {
    return null; 
  }

  const context = results.map((r: Document) => r.pageContent).join("\n\n");
  return context;
}

export async function generateTitle(text: string): Promise<string> {
  try {
    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.0-flash",
      apiKey: process.env.GOOGLE_API_KEY,
      maxOutputTokens: 20,
      apiVersion: "v1beta",
    });

    const prompt = `
Generate a very short, professional title (max 4-5 words) for the following text. 
Return ONLY the title, no quotes or prefix.

Text:
${text.substring(0, 1000)}
`;

    const res = await model.invoke(prompt);
    return res.content.toString().trim().replace(/^"|"$/g, '');
  } catch (error) {
    console.error("Failed to generate title:", error);
    return "New Analysis";
  }
}
