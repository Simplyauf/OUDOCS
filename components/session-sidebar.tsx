"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, 
  MessageSquare, 
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Activity,
  History as HistoryIcon,
  FileText,
  FileCode,
  Type,
  Trash2,
  Chrome,
  X
} from "lucide-react";

interface Session {
  id: string;
  title: string;
  created_at: string;
  metadata?: any;
  documents?: { content: string; metadata: any }[];
  messages?: { id: string; role: "user" | "assistant"; content: string }[];
}

interface SessionSidebarProps {
  userId: string;
  activeSessionId?: string;
  onSelectSession: (session: Session) => void;
  onNewSession: () => void;
  activeDataInfo: { chunks: number; type: string; name?: string } | null;
  refreshTrigger?: number;
  isCreating?: boolean;
}

export function SessionSidebar({ 
  userId, 
  activeSessionId, 
  onSelectSession, 
  onNewSession,
  isGuest,
  signInWithGoogle,
  activeDataInfo,
  refreshTrigger,
  isCreating = false
}: SessionSidebarProps & { isGuest?: boolean; signInWithGoogle?: () => void; activeDataInfo: { chunks: number; type: string } | null; refreshTrigger?: number; isCreating?: boolean }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);

  const fetchSessions = async () => {
    try {
      const res = await fetch(`/api/session?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (error) {
      console.error("Failed to fetch sessions", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (userId) fetchSessions();
  }, [userId, activeSessionId, refreshTrigger]);

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this workspace?")) return;

    try {
      const res = await fetch(`/api/session?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setSessions(sessions.filter(s => s.id !== id));
      }
    } catch (error) {
      console.error("Delete failed", error);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed top-4 left-4 z-[60] p-3 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-2xl transition-transform active:scale-90 lg:hidden`}
      >
        {isOpen ? <ChevronLeft className="h-5 w-5" /> : <HistoryIcon className="h-5 w-5" />}
      </button>

      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="fixed inset-y-0 left-0 lg:relative z-50 w-72 bg-white dark:bg-[#0c0c0e] border-r border-zinc-200 dark:border-zinc-800 flex flex-col shadow-2xl"
          >
            {/* Sidebar Header */}
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center justify-between">
               <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-indigo-500" />
                  <span className="text-xs font-black uppercase tracking-widest text-zinc-400">Workspaces</span>
               </div>
               <button onClick={() => setIsOpen(false)} className="lg:hidden p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                 <ChevronLeft className="h-4 w-4" />
               </button>
            </div>

            {/* New Session Button */}
            <div className="p-4">
              <button 
                onClick={onNewSession}
                disabled={isCreating}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 transition-all font-bold text-sm disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                New Workspace
              </button>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto px-3 space-y-1 custom-scrollbar pb-32">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-32 gap-3">
                   <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-zinc-400">No workspaces yet.</div>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSelectSession(s)}
                    className={`w-full group relative flex flex-col gap-1 p-3.5 rounded-2xl text-left transition-all ${
                      activeSessionId === s.id 
                      ? "bg-indigo-50 dark:bg-indigo-500/10 border-l-4 border-indigo-500" 
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50 border-l-4 border-transparent"
                    }`}
                  >
                     <div className="flex items-start justify-between gap-2 pr-6">
                        <div className="flex items-center gap-2 min-w-0">
                            {(() => {
                               const meta = typeof s.metadata === 'string' ? (s.metadata ? JSON.parse(s.metadata) : {}) : (s.metadata || {});
                               const type = meta?.type?.toUpperCase();
                               
                               // Check session metadata type or any linked document for pdf type
                               let isPDF = type === 'PDF';
                               if (!isPDF && s.documents && s.documents.length > 0) {
                                  const docMeta = typeof s.documents[0].metadata === 'string' ? JSON.parse(s.documents[0].metadata) : s.documents[0].metadata;
                                  if (docMeta?.source_type === 'pdf') isPDF = true;
                               }

                               const iconClass = `h-3.5 w-3.5 shrink-0 ${activeSessionId === s.id ? "text-indigo-500" : "text-zinc-400"}`;
                               
                               if (isPDF) return <FileText className={iconClass} />;
                               if (type === 'DOCX' || type === 'DOC') return <FileText className={iconClass} />;
                               if (type === 'MD') return <FileCode className={iconClass} />;
                               if (type === 'TXT' || type === 'RTF') return <Type className={iconClass} />;
                               if (type === 'TEXT') return <Type className={iconClass} />;
                               return <MessageSquare className={iconClass} />;
                            })()}
                           <span className={`text-sm font-bold truncate ${
                             activeSessionId === s.id ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-700 dark:text-zinc-300"
                           }`}>
                             {s.title}
                           </span>
                        </div>
                     </div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-tighter">
                           {new Date(s.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </div>
                        {s.metadata && (
                          <div className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                            {s.metadata.type === 'PDF' && s.metadata.pageCount ? `${s.metadata.pageCount} Pages` : 
                             s.metadata.type === 'TEXT' && s.metadata.charCount ? `${s.metadata.charCount} Chars` : ''}
                          </div>
                        )}
                      </div>

                      {activeSessionId === s.id && (activeDataInfo || (s.documents && s.documents.length > 0)) && (
                         <motion.div 
                           initial={{ opacity: 0, x: -5 }}
                           animate={{ opacity: 1, x: 0 }}
                           className="mt-2.5 flex items-center gap-2 px-2 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                         >
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest leading-none">
                              {activeDataInfo ? activeDataInfo.chunks : s.documents?.length} Knowledge Parts Active
                            </span>
                         </motion.div>
                      )}

                    {/* Delete Icon */}
                    <div 
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all"
                    >
                       <X className="h-3.5 w-3.5 text-zinc-400 hover:text-red-500" />
                    </div>
                  </button>
                ))
              )}
            </div>

             {/* Sidebar Footer: Upgrade CTA */}
             <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white dark:from-[#0c0c0e] via-white dark:via-[#0c0c0e] to-transparent pt-10">
                <div className="flex flex-col gap-3">
                  {isGuest && (
                    <button 
                      onClick={signInWithGoogle}
                      className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-white dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 hover:border-indigo-500 dark:hover:border-indigo-500 font-bold text-sm transition-all shadow-sm active:scale-[0.98]"
                    >
                        <svg className="h-4 w-4" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span className="text-zinc-900 dark:text-zinc-100">Sign in with Google</span>
                    </button>
                  )}
                  
                  {!isGuest && (
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 dark:from-zinc-100 dark:to-zinc-200 text-white dark:text-zinc-900 shadow-xl shadow-zinc-500/10 overflow-hidden relative group border border-zinc-200 dark:border-zinc-700">
                        <div className="absolute top-0 right-0 -mr-4 -mt-4 p-8 bg-indigo-500/20 rounded-full blur-xl group-hover:scale-150 transition-transform duration-700" />
                        <div className="flex flex-col gap-1 relative z-10">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60">Professional Tier</span>
                          <span className="text-sm font-black leading-tight">Get Higher Credits</span>
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-1.5 text-[9px] font-bold opacity-80">
                              <Plus className="h-2.5 w-2.5" /> 50MB File Size & 50 Pages
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] font-bold opacity-80">
                              <Plus className="h-2.5 w-2.5" /> 100,000 Characters
                            </div>
                          </div>
                          <a 
                            href="mailto:azeezumarfaruk@gmail.com?subject=DocMind%20Premium%20Upgrade"
                            className="mt-3 w-full py-2 bg-indigo-500 hover:bg-indigo-400 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest text-center rounded-lg transition-colors"
                          >
                            Email Azeezumar
                          </a>
                        </div>
                    </div>
                  )}
                </div>
             </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
