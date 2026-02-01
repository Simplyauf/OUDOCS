"use client";

import { useState, useRef, useEffect } from "react";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Upload, 
  MessageSquare, 
  Plus, 
  ChevronUp, 
  Loader2,
  Sparkles,
  ArrowRight,
  User,
  History,
  LogOut,
  Chrome,
  Type,
  ClipboardList,
  FileText,
  X,
  Maximize2,
  Cpu,
  Layers
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { SessionSidebar } from "@/components/session-sidebar";
import { toast } from "react-hot-toast";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Session {
  id: string;
  title: string;
  metadata?: any;
  documents?: { content: string; metadata: any }[];
  messages?: Message[];
}

export default function Home() {
  const { user: authUser, profile, isGuest, isLoading: isAuthLoading, signInWithGoogle, signOut, setGuestProfile } = useAuth();
  
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [guestName, setGuestName] = useState("");
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>("");

  // Landing Page Interactive States
  const [highlightLogin, setHighlightLogin] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  useEffect(() => {
    getDeviceFingerprint().then(fp => setDeviceFingerprint(fp));
  }, []);

  const [ingestMode, setIngestMode] = useState<"pdf" | "text">("pdf");
  const [pastedText, setPastedText] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestProgress, setIngestProgress] = useState(0); 
  const [activeDataInfo, setActiveDataInfo] = useState<{chunks: number, type: string, name?: string} | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploaded, setIsUploaded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showSourcePanel, setShowSourcePanel] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-create/load session when user state is ready
  useEffect(() => {
    if (profile && !activeSession) {
      const savedSessionId = localStorage.getItem("oudocs_last_session_id");

      const loadInitialSession = async () => {
        const res = await fetch(`/api/session?userId=${profile.id}`);
        if (res.ok) {
            const sessions = await res.json();
            if (sessions.length > 0) {
                const sessionToLoad = savedSessionId 
                    ? sessions.find((s: Session) => s.id === savedSessionId) || sessions[0]
                    : sessions[0];
                setActiveSession(sessionToLoad);
                
                // Persistence: If session has data, skip to chat
                if (sessionToLoad.documents && sessionToLoad.documents.length > 0) {
                    setIsUploaded(true);
                    if (sessionToLoad.messages) {
                      setMessages(sessionToLoad.messages);
                    }
                }
            } else {
                createNewSession(profile.id);
            }
        }
      };
      loadInitialSession();
    }
  }, [profile]);

  useEffect(() => {
    if (activeSession) {
        localStorage.setItem("oudocs_last_session_id", activeSession.id);
    }
  }, [activeSession]);

  const handleSelectSession = (session: Session) => {
    setActiveSession(session);
    // Reset internal state for the selected session
    setFile(null);
    setMessages(session.messages || []);
    setIsUploaded(session.documents && session.documents.length > 0 ? true : false); 
    setActiveDataInfo(null);
  };
  const startIngestProgress = () => {
    setIngestProgress(0);
    const interval = setInterval(() => {
      setIngestProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + Math.random() * 15;
      });
    }, 400);
    return interval;
  };

  const handleGuestLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    setIsCreatingProfile(true);

    try {
      const res = await fetch("/api/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: guestName,
          deviceFingerprint 
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        if (res.status === 403) {
          toast.error(errorData.message);
          return;
        }
        throw new Error("Failed to create guest profile");
      }
      
      const guestProfile = await res.json();
      setGuestProfile(guestProfile);
      
      localStorage.setItem("oudocs_user_id", guestProfile.id);
      localStorage.setItem("oudocs_user_name", guestProfile.full_name);
      
    } catch (error) {
      console.error("Login failed", error);
    } finally {
      setIsCreatingProfile(false);
    }
  };

  const createNewSession = async (userId: string) => {
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, title: "New Analysis" }),
      });
      
      if (res.ok) {
        const session = await res.json();
        setActiveSession(session);
        setIsUploaded(false);
        setFile(null);
        setMessages([]);
        setActiveDataInfo(null);
      } else {
        const error = await res.json();
        if (res.status === 403) {
          toast.error(error.message || "Session limit reached. Sign in with Google for more!");
        } else {
          toast.error(error.message || "Failed to create session");
        }
      }
    } catch (error: any) {
      console.error("Session creation failed", error);
      toast.error("Failed to create session. Please try again.");
    }
  };

  const refreshActiveSession = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`/api/session?userId=${profile.id}`);
      if (res.ok) {
        const sessions = await res.json();
        const updated = sessions.find((s: Session) => s.id === activeSession.id);
        if (updated) {
          setActiveSession(updated);
          if (updated.messages) setMessages(updated.messages);
          if (updated.documents && updated.documents.length > 0) {
            setIsUploaded(true);
          }
        }
      }
    } catch (error) {
      console.error("Failed to refresh session", error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      // 15MB limit check (Updated from 5MB)
      if (selectedFile.size > 15 * 1024 * 1024) {
        alert("File is too large (Max 15MB for Free Tier)");
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === "application/pdf") {
        // 15MB check
        if (droppedFile.size > 15 * 1024 * 1024) {
          alert("File is too large (Max 15MB)");
          return;
        }
        setFile(droppedFile);
      }
    }
  };

  const handleUpload = async () => {
    if (!file || !activeSession) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("sessionId", activeSession.id); 
    
    setIsUploading(true);
    const interval = startIngestProgress();

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        setIngestProgress(100);
        setActiveDataInfo({ chunks: data.chunks, type: 'PDF', name: file.name });
        
        console.log("Upload Success Data:", data);

        // 1. Instantly apply the updated session from the backend
        if (data.session) {
          console.log("Setting Active Session safely:", data.session);
          setActiveSession(data.session);
          if (data.session.messages) setMessages(data.session.messages);
          
          const meta = typeof data.session.metadata === 'string' ? JSON.parse(data.session.metadata) : data.session.metadata;
          if (meta?.storageError) {
             toast.error("PDF analyzed but viewer might fail. Check bucket permissions.");
          } else {
             toast.success(`Analysis Complete: ${data.session.title || "Untitled"}`);
          }
          setIsUploaded(true);
        } else {
          toast("Analysis complete. Refreshing workspace...");
          setIsUploaded(true);
        }

        // 2. Trigger sidebar refresh
        setRefreshTrigger(prev => prev + 1);
      } else {
        const errorText = data.message || data.error || "Analysis failed";
        toast.error(`Analysis Error: ${errorText}`);
      }
    } catch (error: any) {
      console.error("Upload failed", error);
      toast.error(error.message || "Something went wrong during analysis");
    } finally {
      setIsUploading(false);
      clearInterval(interval);
    }
  };

  const handleIngestText = async () => {
    if (!pastedText.trim() || !activeSession) return;
    setIsIngesting(true);
    const interval = startIngestProgress();

    try {
      const res = await fetch("/api/ingest-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: pastedText,
          sessionId: activeSession.id
        }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setIngestProgress(100);
        setActiveDataInfo({ chunks: data.chunks, type: 'Text', name: 'Pasted Text' });
        
        // 1. Instantly apply the updated session from the backend
        if (data.session) {
          setActiveSession(data.session);
          if (data.session.messages) setMessages(data.session.messages);
          toast.success("Text analyzed successfully!");
        }

        // 2. Trigger sidebar refresh for workspaces list
        setRefreshTrigger(prev => prev + 1);
        setIsUploaded(true);
      } else {
        toast.error(data.message || data.error || "Analysis failed");
      }
    } catch (error: any) {
      console.error("Text ingest failed", error);
      toast.error(error.message || "Something went wrong during analysis");
    } finally {
      setIsIngesting(false);
      clearInterval(interval);
    }
  };

  const generateId = () => Math.random().toString(36).substring(2, 11);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isThinking || !activeSession) return;

    const userMessage: Message = { 
      id: generateId(),
      role: "user", 
      content: input 
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsThinking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          question: input,
          sessionId: activeSession.id
        }),
      });
      const data = await res.json();

      if (res.status === 429) {
        toast.error("Rate limit hit! Gemini Free Tier is cooling down. Try again in 60s.");
        return;
      }

      if (!res.ok) {
        throw new Error(data.message || "Failed to get answer");
      }

      const assistantMessage: Message = { 
        id: generateId(),
        role: "assistant", 
        content: data.answer 
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat failed", error);
      toast.error("Failed to get answer. Please try again.");
    } finally {
      setIsThinking(false);
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }
  };

  const triggerLoginHighlight = () => {
    const input = document.getElementById("guest-name-input");
    if (input) input.focus();
    setHighlightLogin(true);
    setTimeout(() => setHighlightLogin(false), 800);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-[#09090b]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-50 font-sans dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 selection:bg-indigo-100 dark:selection:bg-indigo-500/30 overflow-hidden">
      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white/70 backdrop-blur-xl px-6 dark:border-zinc-800/50 dark:bg-[#09090b]/70 sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <motion.div 
            initial={{ rotate: -10, scale: 0.9 }}
            animate={{ rotate: 0, scale: 1 }}
            className="h-9 w-9 rounded-xl overflow-hidden shadow-lg shadow-indigo-500/20"
          >
            <img src="/logo.png" alt="OuDocs Logo" className="h-full w-full object-cover" />
          </motion.div>
          <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-500 dark:from-white dark:to-zinc-400">
            OuDocs
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          {profile ? (
            <div className="flex items-center gap-3">
              {/* Logged In User Nav */}
              <div className="hidden sm:flex flex-col items-end mr-1">
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 leading-tight">
                  {profile.full_name}
                </span>
                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter">
                  {isGuest ? `Guest Quota: ${profile.quota_used || 0}/${profile.quota_limit || 2}` : `Quota: ${profile.quota_used || 0}/${profile.quota_limit || 5}`}
                </span>
              </div>
              
              <button 
                onClick={() => profile && createNewSession(profile.id)}
                className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all shadow-sm active:scale-95"
                title="New Session"
              >
                <Plus className="h-4 w-4" />
              </button>
              
              <button 
                onClick={signOut}
                className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-200 dark:hover:border-red-900/50 transition-all shadow-sm group active:scale-95"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4 text-zinc-400 group-hover:text-red-500 transition-colors" />
              </button>

              <div className="h-10 w-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-500/30">
                {profile.full_name.charAt(0).toUpperCase()}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Sidebar integration (Only when logged in) */}
        {profile && (
          <SessionSidebar 
            userId={profile.id}
            activeSessionId={activeSession?.id}
            onSelectSession={handleSelectSession}
            onNewSession={() => createNewSession(profile.id)}
            isGuest={isGuest}
            signInWithGoogle={signInWithGoogle}
            activeDataInfo={activeDataInfo}
            refreshTrigger={refreshTrigger}
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden relative">
            <AnimatePresence mode="wait">
              
              {/* STATE 1: LANDING PAGE (Not Logged In) */}
              {!profile ? (
                <div className="relative w-full h-full flex flex-col overflow-x-hidden overflow-y-auto custom-scrollbar">
                    
                  {/* TOP RIGHT LOGIN WIDGET (Desktop/Tablet) */}
                  <motion.div 
                    animate={highlightLogin ? { x: [0, -10, 10, -10, 10, 0], scale: 1.05 } : {}}
                    transition={{ duration: 0.5 }}
                    className={`
                        hidden md:block absolute top-4 right-4 lg:right-8 z-40 w-[300px] lg:w-[340px] 
                        bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl 
                        border-2 ${highlightLogin ? 'border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.3)]' : 'border-zinc-200 dark:border-zinc-800'} 
                        p-5 lg:p-6 rounded-3xl shadow-2xl transition-colors duration-300
                    `}
                  >
                        <div className="space-y-5">
                            <div className="space-y-1 text-center border-b border-zinc-100 dark:border-zinc-800 pb-4">
                                <h3 className="font-black text-lg">Try It Free</h3>
                                <p className="text-xs text-zinc-400 font-medium">No account needed for guest access</p>
                            </div>

                            <form onSubmit={handleGuestLogin} className="space-y-3">
                                <div className="relative group">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                                <input 
                                    id="guest-name-input"
                                    type="text" 
                                    placeholder="What should we call you?"
                                    value={guestName}
                                    onChange={(e) => setGuestName(e.target.value)}
                                    className="w-full rounded-xl bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 py-3 pl-10 pr-4 text-sm font-bold focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-zinc-500"
                                />
                                </div>
                                <button 
                                type="submit"
                                disabled={!guestName.trim() || isCreatingProfile}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 text-sm"
                                >
                                {isCreatingProfile ? (
                                    <Loader2 className="h-4 w-4 animate-spin" /> 
                                ) : (
                                    <>
                                    Analyze My Documents <ArrowRight className="h-4 w-4" />
                                    </>
                                )}
                                </button>
                            </form>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
                                </div>
                                <div className="relative flex justify-center text-[10px] uppercase">
                                <span className="bg-white/0 px-2 text-zinc-400 font-bold tracking-widest bg-white dark:bg-zinc-900">or</span>
                                </div>
                            </div>

                            <button 
                                onClick={signInWithGoogle}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-white border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 py-3 font-bold text-zinc-900 dark:text-white shadow-sm transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800 active:scale-[0.98] text-sm"
                            >
                                <Chrome className="h-4 w-4 text-red-500" />
                                Sign in with Google
                            </button>
                        </div>
                  </motion.div>

                  {/* MAIN HERO CONTENT */}
                  <div className="flex-1 flex flex-col items-center justify-center py-12 md:py-20 px-6">
                    <motion.div 
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col md:flex-row items-center gap-12 lg:gap-16 max-w-7xl w-full"
                    >
                        {/* Text Column */}
                        <div className="flex-1 space-y-8 lg:space-y-10 max-w-xl text-center md:text-left">
                            <div className="space-y-6">
                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                                    <motion.div 
                                        initial={{ scale: 0.5, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ type: "spring", stiffness: 200 }}
                                        className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-500/30"
                                    >
                                        <Sparkles className="h-6 w-6 text-white" />
                                    </motion.div>
                                    <div className="px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">RAG Intelligence Active</span>
                                    </div>
                                </div>
                                
                                <h1 className="text-5xl lg:text-7xl font-black tracking-tighter leading-[0.9]">
                                    Start <br />
                                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-violet-500">
                                        Analyzing.
                                    </span>
                                </h1>

                                <div className="space-y-4">
                                    <p className="text-lg lg:text-2xl font-medium text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-md mx-auto md:mx-0">
                                        Transform your <span className="text-zinc-900 dark:text-white font-bold decoration-indigo-500/30 underline decoration-4 underline-offset-4">meeting notes</span>, 
                                        <span className="text-zinc-900 dark:text-white font-bold decoration-amber-500/30 underline decoration-4 underline-offset-4 mx-1">articles</span>, 
                                        and <span className="text-zinc-900 dark:text-white font-bold decoration-green-500/30 underline decoration-4 underline-offset-4">research papers</span> into an interactive intelligence engine.
                                    </p>
                                    <p className="text-xs lg:text-sm font-bold text-zinc-400 dark:text-zinc-500 flex items-center justify-center md:justify-start gap-2 border-none md:border-l-2 md:border-indigo-500/30 md:pl-4">
                                        Powered by RAG for accurate, source-grounded answers.
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-4 max-w-sm mx-auto md:mx-0">
                                {[
                                    { icon: "Upload", text: "Upload PDFs, Docs, or Raw Text", color: "text-blue-500", bg: "bg-blue-500/10" },
                                    { icon: "Sparkles", text: "Instant AI Summaries & Answers", color: "text-amber-500", bg: "bg-amber-500/10" },
                                    { icon: "MessageSquare", text: "Deep Contextual Chat", color: "text-green-500", bg: "bg-green-500/10" }
                                ].map((feature, i) => (
                                    <div key={i} className="flex items-center gap-4 text-zinc-700 dark:text-zinc-200 font-bold text-sm lg:text-base">
                                        <div className={`h-8 lg:h-10 w-8 lg:w-10 rounded-xl ${feature.bg} ${feature.color} flex items-center justify-center shrink-0`}>
                                            {feature.icon === "Upload" && <Upload className="h-4 lg:h-5 w-4 lg:w-5" />}
                                            {feature.icon === "Sparkles" && <Sparkles className="h-4 lg:h-5 w-4 lg:w-5" />}
                                            {feature.icon === "MessageSquare" && <MessageSquare className="h-4 lg:h-5 w-4 lg:w-5" />}
                                        </div>
                                        <span className="text-left">{feature.text}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-6">
                                <button 
                                    onClick={() => {
                                        if (window.innerWidth < 768) {
                                            document.getElementById("mobile-form")?.scrollIntoView({ behavior: "smooth" });
                                        } else {
                                            triggerLoginHighlight();
                                        }
                                    }}
                                    className="group flex items-center justify-center md:justify-start gap-3 px-8 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full font-black text-lg shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all mx-auto md:mx-0 w-full md:w-auto"
                                >
                                    Analyze My Documents
                                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                                </button>

                                <div className="flex items-center justify-center md:justify-start gap-6 pt-2">
                                    <div className="flex items-center gap-2">
                                        <Cpu className="h-4 w-4 text-zinc-400" />
                                        <span className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-zinc-400">LangChain v0.3</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Layers className="h-4 w-4 text-zinc-400" />
                                        <span className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-zinc-400">Vector Embeddings</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Image Column - Stacked View */}
                        <div className="flex-1 w-full relative max-w-2xl overflow-hidden md:overflow-visible">
                            <div className="relative aspect-[16/10] w-full">
                                {/* Demo 1 (Bottom) */}
                                <motion.div 
                                    initial={{ opacity: 0, x: 20, y: 20 }}
                                    animate={{ opacity: 1, x: 0, y: 0 }}
                                    onClick={() => setExpandedImage("/demo.png")}
                                    className="absolute top-8 md:top-12 left-8 md:left-12 right-0 bottom-0 z-0 cursor-pointer group"
                                >
                                    <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border-2 border-zinc-100 dark:border-zinc-800 transition-all duration-500 group-hover:border-indigo-500/50 group-hover:scale-[1.02]">
                                        <img 
                                            src="/demo.png" 
                                            alt="Viewer Preview" 
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                                    </div>
                                </motion.div>

                                {/* Demo 2 (Top) */}
                                <motion.div 
                                    initial={{ opacity: 0, x: -20, y: -20 }}
                                    animate={{ opacity: 1, x: 0, y: 0 }}
                                    onClick={() => setExpandedImage("/demo2.jpeg")}
                                    className="absolute top-0 left-0 right-8 md:right-12 bottom-8 md:bottom-12 z-10 cursor-pointer group"
                                >
                                    <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border-4 border-white dark:border-zinc-700 transition-all duration-500 group-hover:border-indigo-500 group-hover:scale-[1.02] group-hover:-rotate-1">
                                        <img 
                                            src="/demo2.jpeg" 
                                            alt="Chat Preview" 
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                            <div className="bg-white/20 backdrop-blur-md p-3 rounded-full text-white">
                                                <Maximize2 className="h-6 w-6" />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Feature Tag */}
                                    <div className="absolute -bottom-3 md:-bottom-4 left-4 md:left-6 px-3 md:px-4 py-1.5 md:py-2 bg-indigo-600 rounded-lg md:rounded-xl shadow-lg border border-white/20 text-white flex items-center gap-2">
                                        <MessageSquare className="h-3 md:h-4 w-3 md:w-4" />
                                        <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">Q&A Moment</span>
                                    </div>
                                </motion.div>
                            </div>

                            {/* Glows */}
                            <div className="absolute -top-10 md:-top-20 -right-10 md:-right-20 w-48 md:w-96 h-48 md:h-96 bg-indigo-500/10 rounded-full blur-[60px] md:blur-[100px] -z-10" />
                            <div className="absolute -bottom-10 md:-bottom-20 -left-10 md:-left-20 w-48 md:w-96 h-48 md:h-96 bg-violet-500/10 rounded-full blur-[60px] md:blur-[100px] -z-10" />
                        </div>
                    </motion.div>
                  </div>

                  {/* MOBILE LOGIN FALLBACK */}
                  <div id="mobile-form" className="md:hidden p-6 pb-24 max-w-md mx-auto w-full">
                       <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-xl border border-zinc-200 dark:border-zinc-800">
                            <h3 className="font-black text-xl mb-6 text-center">Start Your Analysis</h3>
                            <form onSubmit={handleGuestLogin} className="space-y-4">
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                                    <input 
                                        type="text" 
                                        placeholder="What should we call you?"
                                        value={guestName}
                                        onChange={(e) => setGuestName(e.target.value)}
                                        className="w-full rounded-xl bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 py-4 pl-10 pr-4 text-base font-bold focus:outline-none focus:border-indigo-500/50"
                                    />
                                </div>
                                <button type="submit" className="w-full bg-indigo-600 text-white rounded-xl py-4 font-bold shadow-lg active:scale-95 transition-transform">
                                    Analyze My Documents
                                </button>
                            </form>
                            <div className="my-6 text-center text-xs font-bold text-zinc-400 uppercase tracking-widest">or</div>
                            <button onClick={signInWithGoogle} className="w-full border border-zinc-200 dark:border-zinc-800 rounded-xl py-4 font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform">
                                <Chrome className="h-5 w-5 text-red-500" /> Sign in with Google
                            </button>
                       </div>
                  </div>

                  {/* EXPANDED IMAGE MODAL */}
                  <AnimatePresence>
                    {expandedImage && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 md:p-10"
                            onClick={() => setExpandedImage(null)}
                        >
                            <motion.div 
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="relative max-w-7xl w-full max-h-full overflow-hidden rounded-3xl shadow-2xl"
                            >
                                <img src={expandedImage} alt="Full Preview" className="w-full h-full object-contain" />
                                <button className="absolute top-4 right-4 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white backdrop-blur-md transition-colors">
                                    <X className="h-6 w-6" />
                                </button>
                            </motion.div>
                        </motion.div>
                    )}
                  </AnimatePresence>

                </div>
              ) : !isUploaded ? (
                /* STATE 2: UPLOAD (Scoped to Session) */
                <motion.div 
                  key="upload"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={{ duration: 0.4, ease: "circOut" }}
                  className="flex-1 flex flex-col items-center justify-center p-6 space-y-8 overflow-y-auto custom-scrollbar"
                >
                  {!activeSession ? (
                     <div className="flex flex-col items-center">
                        <Loader2 className="h-8 w-8 animate-spin text-zinc-400 mb-4" />
                        <p className="text-zinc-500">Initializing Session...</p>
                        <button onClick={() => profile && createNewSession(profile.id)} className="mt-4 text-xs text-indigo-500 underline">
                          Click to retry
                        </button>
                     </div>
                  ) : (
                    <>
                      {/* Mode Toggle */}
                      <div className="flex p-1.5 bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 shadow-inner">
                        <button 
                          onClick={() => setIngestMode("pdf")}
                          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                            ingestMode === "pdf" 
                            ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-md" 
                            : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                          }`}
                        >
                          <Plus className="h-4 w-4" /> PDF Document
                        </button>
                        <button 
                          onClick={() => setIngestMode("text")}
                          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                            ingestMode === "text" 
                            ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-md" 
                            : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                          }`}
                        >
                          <Type className="h-4 w-4" /> Paste Text
                        </button>
                      </div>

                      <motion.div 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`w-full max-w-2xl group relative space-y-8 rounded-[2.5rem] border-2 border-dashed p-12 text-center transition-all duration-500 ${
                          isDragging 
                          ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-500/5 scale-[1.01]' 
                          : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-[#0c0c0e] hover:shadow-2xl hover:shadow-zinc-200/50 dark:hover:shadow-none'
                        }`}
                      >
                        {ingestMode === "pdf" ? (
                          <div className="space-y-8">
                            <div className="space-y-6">
                              <motion.div 
                                animate={isDragging ? { y: -10, scale: 1.1 } : { y: 0 }}
                                className={`mx-auto flex h-20 w-20 items-center justify-center rounded-3xl transition-all duration-500 shadow-xl ${
                                  isDragging 
                                  ? 'bg-indigo-600 text-white' 
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400'
                                }`}
                              >
                                <Upload className="h-8 w-8" />
                              </motion.div>
                              <div className="space-y-2">
                                <h2 className="text-3xl font-extrabold tracking-tight">Drop your PDF</h2>
                                <p className="text-zinc-500 dark:text-zinc-400 font-medium">Max size 15MB</p>
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-black mt-1">PDF, DOCX, DOC, TXT, MD, RTF</p>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-center gap-6">
                              <label className="cursor-pointer w-full">
                                <span className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-zinc-900 border border-zinc-800 px-8 py-4 font-bold text-white shadow-xl hover:bg-zinc-800 transition-all active:scale-95 text-sm uppercase tracking-widest">
                                  {file ? file.name : "Select Document (Max 15MB)"}
                                </span>
                                <input type="file" accept=".pdf,.docx,.doc,.txt,.md,.rtf" onChange={handleFileChange} className="sr-only" />
                              </label>
                              
                              {file && !isUploading && (
                                <motion.button
                                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                  onClick={handleUpload}
                                  className="w-full max-w-xs rounded-2xl bg-indigo-600 py-4 font-bold text-white shadow-xl shadow-indigo-500/25 transition-all hover:bg-indigo-700 active:scale-95 uppercase tracking-widest text-sm"
                                >
                                  Process PDF
                                </motion.button>
                              )}

                              {isUploading && (
                                <div className="flex flex-col items-center gap-4 w-full px-12">
                                  <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${ingestProgress}%` }}
                                      className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                                    <span className="font-black text-indigo-500 uppercase tracking-widest text-[10px]">
                                      {ingestProgress < 30 ? "Extracting Pages..." : 
                                       ingestProgress < 70 ? "Generating Knowledge Embeddings..." : 
                                       "Saving to Brain..."} {Math.round(ingestProgress)}%
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <div className="space-y-4">
                                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 shadow-xl">
                                    <ClipboardList className="h-8 w-8" />
                                </div>
                                <h2 className="text-3xl font-extrabold tracking-tight">Paste anything</h2>
                            </div>
                            
                            <textarea 
                              placeholder="Paste meeting notes, articles, or any text here..."
                              value={pastedText}
                              onChange={(e) => setPastedText(e.target.value)}
                              className="w-full min-h-[200px] rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-6 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-lg font-medium resize-none custom-scrollbar"
                            />
                            <div className="flex justify-between pr-2">
                               <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">~20 Pages Max</span>
                               <span className={`text-[10px] font-black uppercase tracking-widest ${pastedText.length > 50000 ? "text-red-500" : "text-zinc-400"}`}>
                                 Characters: {pastedText.length.toLocaleString()} / 50,000
                               </span>
                            </div>

                            <button
                              disabled={!pastedText.trim() || isIngesting}
                              onClick={handleIngestText}
                              className="w-full rounded-2xl bg-indigo-600 py-4 font-bold text-white shadow-xl shadow-indigo-500/25 transition-all hover:bg-indigo-700 active:scale-95 uppercase tracking-widest text-sm disabled:opacity-50"
                            >
                              {isIngesting ? (
                                <div className="flex flex-col items-center gap-4 w-full">
                                    <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                                        <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${ingestProgress}%` }}
                                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-600"
                                        />
                                    </div>
                                    <span className="font-black text-indigo-500 uppercase tracking-widest text-[10px]">Processing Knowledge... {Math.round(ingestProgress)}%</span>
                                </div>
                              ) : "Process Raw Text"}
                            </button>
                          </div>
                        )}
                      </motion.div>
                    </>
                  )}
                </motion.div>
              ) : (
                /* STATE 3: CHAT */
                <motion.div 
                  key="chat"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6 }}
                  className="flex-1 flex flex-col lg:flex-row w-full overflow-hidden border-t border-zinc-100 dark:border-zinc-800/50"
                >
                  {/* Left Pane: Document Viewer */}
                  <div className="w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/10 flex flex-col overflow-hidden relative">
                    <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-950 z-10">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                          {activeDataInfo?.type === 'TEXT' ? <Type className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          {(() => {
                            const meta = typeof activeSession?.metadata === 'string' 
                              ? (activeSession.metadata ? JSON.parse(activeSession.metadata) : {}) 
                              : (activeSession?.metadata || {});
                            const type = meta?.type?.toUpperCase();
                            const isPDF = type === 'PDF' || activeSession?.documents?.[0]?.metadata?.source_type === 'pdf';
                            
                            return (
                              <>
                                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[150px] sm:max-w-[200px]">
                                  {activeSession?.title || "Active Document"}
                                </h3>
                                <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest leading-none mt-0.5">
                                  {isPDF ? `${meta?.pageCount || '?'} Pages Loaded` : 
                                   (type === 'DOCX' || type === 'DOC') ? `${meta?.wordCount || '?'} Words • ${meta?.pageEstimate || '?'} Pages` :
                                   (type === 'TXT' || type === 'MD' || type === 'RTF') ? `${meta?.wordCount || '?'} Words` :
                                   type === 'TEXT' ? `${meta?.charCount || '?'} Chars Indexed` : 'Workspace Ready'}
                                </p>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      <button 
                        onClick={() => setShowSourcePanel(true)}
                        className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-all hover:text-indigo-500"
                        title="Full Raw Source"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                    
                        {/* Document View: PDF or Index Parts */}
                        <div className="flex-1 overflow-hidden relative bg-white dark:bg-zinc-950">
                          {(() => {
                            const meta = typeof activeSession?.metadata === 'string' 
                              ? (activeSession.metadata ? JSON.parse(activeSession.metadata) : {}) 
                              : (activeSession?.metadata || {});
                            
                            // Primary check: Session metadata type
                            let isPDF = meta?.type?.toUpperCase() === 'PDF';
                            let storagePath = meta?.storagePath;

                            // Secondary fallback: Check document metadata if primary is missing
                            if (!isPDF && activeSession?.documents && activeSession.documents.length > 0) {
                               const firstDoc = activeSession.documents[0];
                               const docMeta = typeof firstDoc.metadata === 'string' ? JSON.parse(firstDoc.metadata) : firstDoc.metadata;
                               if (docMeta?.source_type === 'pdf') {
                                  isPDF = true;
                                  // Approximate storage path if missing
                                  if (!storagePath) {
                                    storagePath = `${activeSession.id}-${docMeta.source_name?.replace(/[^a-zA-Z0-9.]/g, '_')}`;
                                  }
                               }
                            }

                            if (isPDF && storagePath) {
                              return (
                                <iframe 
                                  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/${storagePath}#toolbar=0&navpanes=0&scrollbar=1`}
                                  className="w-full h-full border-none"
                                  title="PDF Viewer"
                                  onError={() => toast.error("Failed to load PDF iframe.")}
                                />
                              );
                            }
                            
                            return (
                              <div className="h-full overflow-y-auto p-8 lg:p-12 space-y-6 custom-scrollbar bg-white/50 dark:bg-black/5">
                                 <div className="max-w-2xl mx-auto">
                                    <div className="space-y-6 text-zinc-800 dark:text-zinc-200 leading-relaxed text-sm font-medium whitespace-pre-wrap">
                                      {activeSession?.documents && activeSession.documents.length > 0 
                                        ? activeSession.documents.map(d => d.content).join("\n\n") 
                                        : "Synchronizing intelligence layers..."}
                                    </div>
                                 </div>
                              </div>
                            );
                          })()}
                        </div>
                  </div>

                  {/* Right Pane: Chat interface */}
                  <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950 relative">
                    <div 
                      ref={scrollRef}
                      className="flex-1 overflow-y-auto space-y-8 p-6 lg:p-10 custom-scrollbar"
                    >
                      <AnimatePresence mode="popLayout">
                        {messages.length === 0 && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.4 }}
                            className="flex flex-col items-center justify-center h-full text-center space-y-6 opacity-30"
                          >
                            <div className="h-20 w-20 rounded-3xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center">
                              <MessageSquare className="h-8 w-8 text-indigo-500" />
                            </div>
                            <div className="space-y-2">
                              <h3 className="text-xl font-bold tracking-tight">Intelligence Ready</h3>
                              <p className="text-zinc-500 text-sm font-medium">Ask anything about the document on the left.</p>
                            </div>
                          </motion.div>
                        )}

                        {messages.map((m) => (
                          <motion.div 
                            key={m.id} 
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-[90%] rounded-2xl px-5 py-3.5 shadow-sm text-base leading-relaxed ${
                              m.role === 'user' 
                              ? 'bg-zinc-900 dark:bg-zinc-700 text-white rounded-tr-none' 
                              : 'bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-tl-none'
                            }`}>
                              <div className={`prose prose-sm max-w-none ${
                                m.role === 'user' 
                                ? 'prose-invert text-white' 
                                : 'text-zinc-900 dark:text-zinc-100 dark:prose-invert'
                              }`}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {m.content}
                                </ReactMarkdown>
                              </div>
                            </div>
                          </motion.div>
                        ))}

                        {isThinking && (
                          <motion.div 
                            key="thinking"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex justify-start"
                          >
                            <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl rounded-tl-none px-5 py-3.5 flex gap-2 items-center">
                              <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                              <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '200ms' }} />
                              <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '400ms' }} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="p-6 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-black/20">
                      <form 
                        onSubmit={handleSend}
                        className="relative group max-w-2xl mx-auto"
                      >
                        <input
                          type="text"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder="Ask a question..."
                          className="w-full rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 py-4 pl-6 pr-14 shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium text-base"
                        />
                        <button
                          type="submit"
                          disabled={!input.trim() || isThinking}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-xl bg-indigo-600 text-white disabled:opacity-50 transition-all hover:bg-indigo-700 active:scale-95"
                        >
                          {isThinking ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <ChevronUp className="h-5 w-5" strokeWidth={3} />
                          )}
                        </button>
                      </form>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Source Content Preview Overlay */}
            <AnimatePresence>
              {showSourcePanel && (
                <>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowSourcePanel(false)}
                    className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 cursor-pointer"
                  />
                  <motion.div 
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-[#0c0c0e] border-l border-zinc-200 dark:border-zinc-800 z-[60] shadow-2xl flex flex-col"
                  >
                    <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                      <div className="flex flex-col">
                        <h3 className="text-lg font-black tracking-tight">Source Material</h3>
                        <p className="text-xs text-zinc-500">Full context available in this session</p>
                      </div>
                      <button 
                        onClick={() => setShowSourcePanel(false)}
                        className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                      >
                        <ArrowRight className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar">
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                            {activeDataInfo?.type === 'PDF' ? <Upload className="h-6 w-6" /> : <ClipboardList className="h-6 w-6" />}
                          </div>
                          <div>
                            <p className="text-sm font-black uppercase tracking-widest text-indigo-500 mb-0.5">Source Identity</p>
                            <p className="font-bold text-xl dark:text-zinc-100 leading-tight">
                               {activeDataInfo?.name || (activeSession?.documents?.[0]?.metadata?.source_name) || "Connected Knowledge"}
                            </p>
                          </div>
                        </div>
                        
                        <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/10 p-6">
                           <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed font-medium">
                             "To provide precise answers, this document has been broken down and indexed into <span className="text-indigo-500 font-bold">{activeDataInfo?.chunks || activeSession?.documents?.length || 0} searchable parts</span>."
                           </p>
                        </div>

                        <div className="space-y-4">
                           <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Original Documentation Text</p>
                           <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-sm text-zinc-500 dark:text-zinc-400 font-mono max-h-[400px] overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                              {activeSession?.documents?.map(d => d.content).join("\n\n") || pastedText || "Synchronizing content..."}
                           </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#09090b]/50">
                      <button 
                        onClick={() => setShowSourcePanel(false)}
                        className="w-full py-4 rounded-xl bg-zinc-900 dark:bg-white dark:text-zinc-900 text-white font-black text-sm uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                      >
                        Close Preview
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
        </div>
      </main>
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e4e4e7;
          border-radius: 20px;
          border: 2px solid transparent;
          background-clip: content-box;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          background-clip: content-box;
        }
      `}</style>
    </div>
  );
}
