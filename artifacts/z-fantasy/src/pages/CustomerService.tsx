import { useState, useEffect, useRef } from "react";
import { ChevronLeft, Plus, X, SendHorizonal, MessageCircle, CheckCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

function getToken() {
  return (window as typeof window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData ?? "mock_init_data_for_dev";
}

interface Thread {
  id: string;
  title: string;
  status: "open" | "closed";
  createdAt: string;
  lastMessageAt: string;
}

interface Message {
  id: string;
  senderType: "user" | "agent";
  message: string;
  createdAt: string;
}

export function CustomerService() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cs/threads", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setThreads(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (threadId: string) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/cs/threads/${threadId}/messages`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setMessages(await res.json());
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => { fetchThreads(); }, []);

  useEffect(() => {
    if (activeThread) fetchMessages(activeThread.id);
  }, [activeThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newMessage.trim()) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/cs/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ title: newTitle.trim(), initialMessage: newMessage.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Conversation started!" });
      setNewTitle("");
      setNewMessage("");
      setShowNewThread(false);
      fetchThreads();
    } catch (e) {
      toast({ title: "Failed", description: String(e), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async () => {
    if (!reply.trim() || !activeThread) return;
    setSending(true);
    const text = reply.trim();
    setReply("");
    try {
      const res = await fetch(`/api/cs/threads/${activeThread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error(await res.text());
      const msg: Message = await res.json();
      setMessages(prev => [...prev, msg]);
    } catch (e) {
      toast({ title: "Failed to send", description: String(e), variant: "destructive" });
      setReply(text);
    } finally {
      setSending(false);
    }
  };

  if (activeThread) {
    return (
      <div className="flex flex-col h-[100dvh]">
        <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-md px-4 py-3 border-b border-border flex items-center gap-3">
          <button onClick={() => setActiveThread(null)} className="p-2 rounded-full hover:bg-card transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">{activeThread.title}</p>
            <p className={`text-xs ${activeThread.status === "open" ? "text-green-400" : "text-muted-foreground"}`}>
              {activeThread.status === "open" ? "● Open" : "● Closed"}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messagesLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`h-14 bg-card rounded-xl border border-border animate-pulse ${i % 2 === 0 ? "ml-8" : "mr-8"}`} />
            ))
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.senderType === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  msg.senderType === "user"
                    ? "bg-primary text-white rounded-br-sm"
                    : "bg-card border border-border text-white rounded-bl-sm"
                }`}>
                  {msg.senderType === "agent" && (
                    <p className="text-[10px] text-accent font-bold mb-1 uppercase tracking-wider">Support Agent</p>
                  )}
                  <p className="text-sm leading-relaxed">{msg.message}</p>
                  <p className="text-[10px] opacity-50 mt-1 text-right">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {activeThread.status === "open" ? (
          <div className="p-4 border-t border-border bg-background flex items-end gap-2">
            <input
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Type your message..."
              className="flex-1 h-10 rounded-xl border border-border bg-card px-3 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-all"
            />
            <button
              onClick={handleSend}
              disabled={sending || !reply.trim()}
              className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center box-glow-pink disabled:opacity-50 shrink-0"
            >
              <SendHorizonal size={16} className="text-white" />
            </button>
          </div>
        ) : (
          <div className="p-4 border-t border-border bg-background text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
              <CheckCircle size={14} className="text-green-400" /> This conversation is closed.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="sticky top-14 z-20 bg-background/90 backdrop-blur-md px-4 py-3 border-b border-border flex items-center gap-3">
        <button onClick={() => setLocation("/")} className="p-2 rounded-full hover:bg-card transition-colors">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-lg font-bold uppercase tracking-wider text-glow-pink flex-1">Customer Service</h1>
        <button
          onClick={() => setShowNewThread(v => !v)}
          className={`p-2 rounded-full transition-colors ${showNewThread ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary hover:bg-primary/30"}`}
        >
          {showNewThread ? <X size={18} /> : <Plus size={18} />}
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {showNewThread && (
          <div className="p-4 rounded-xl bg-card border border-primary/40 space-y-3 box-glow-pink">
            <h2 className="text-sm font-bold uppercase tracking-wider text-primary">Start Conversation</h2>
            <Input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="What do you need help with?"
              maxLength={200}
              className="bg-background border-border"
            />
            <textarea
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Describe your issue in detail..."
              maxLength={2000}
              rows={3}
              className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/60"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim() || !newMessage.trim()}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 box-glow-pink disabled:opacity-50 transition-all"
            >
              <MessageCircle size={16} />
              {creating ? "Starting..." : "Start Conversation"}
            </button>
          </div>
        )}

        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-card rounded-xl border border-border animate-pulse" />
          ))
        ) : threads.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-muted-foreground">No conversations yet.</p>
            <p className="text-xs text-muted-foreground/60">Tap <span className="text-primary">+</span> to start one.</p>
          </div>
        ) : (
          threads.map(thread => (
            <button
              key={thread.id}
              onClick={() => setActiveThread(thread)}
              className="w-full p-4 rounded-xl bg-card border border-border hover:border-accent/50 transition-colors text-left flex items-center gap-3"
            >
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${thread.status === "open" ? "bg-green-400" : "bg-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{thread.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(thread.lastMessageAt).toLocaleDateString()}
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                thread.status === "open"
                  ? "text-green-400 border-green-500/50 bg-green-500/10"
                  : "text-muted-foreground border-border bg-muted/20"
              }`}>
                {thread.status === "open" ? "Open" : "Closed"}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
