import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useGetMe, GiftInputGiftType } from "@workspace/api-client-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, Gift, Camera, ChevronLeft, ChevronRight, Heart, X, Lock, Unlock, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

function getToken() {
  return (window as typeof window & { Telegram?: { WebApp?: { initData?: string } } })
    .Telegram?.WebApp?.initData ?? "mock_init_data_for_dev";
}

type ChatMsg = {
  role: string;
  content: string;
  imageUrl?: string | null;
  isLocked?: boolean;
  timestamp?: string | null;
  mediaType?: string | null;
};

export function ChatDetail() {
  const { id } = useParams<{ id: string }>();
  const [input, setInput] = useState("");
  const [showGiftTray, setShowGiftTray] = useState(false);
  const [showSelfieModal, setShowSelfieModal] = useState(false);
  const [selfieDesc, setSelfieDesc] = useState("");
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // Unlock confirmation state
  const [unlockTarget, setUnlockTarget] = useState<ChatMsg | null>(null);
  // Chat image fullscreen viewer
  const [chatViewer, setChatViewer] = useState<{ idx: number } | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [convMeta, setConvMeta] = useState<{ character?: any; affectionPoints?: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefetch, setLastRefetch] = useState(0);
  const chatViewerTouchX = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const fetchMessages = async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      console.log('[RAW API DATA]', JSON.stringify({
        messageCount: data.messages?.length,
        firstWithImage: data.messages?.find((m: any) => m.imageUrl),
        lastMessage: data.messages?.[data.messages.length - 1]
      }));
      const mapped = (data.messages ?? []).map((m: any) => ({
        role: m.role,
        content: m.content ?? '',
        imageUrl: m.imageUrl ?? null,
        isLocked: m.isLocked ?? false,
        mediaType: m.mediaType ?? m.media_type ?? null,
        timestamp: m.timestamp ?? null,
      }));
      setMessages(mapped);
      console.log('[RAW FETCH RESULT]', JSON.stringify({
        totalMessages: mapped.length,
        withImageUrl: mapped.filter((m: any) => m.imageUrl).length,
        firstWithImage: mapped.find((m: any) => m.imageUrl),
        lastMessage: mapped[mapped.length - 1]
      }));
      setConvMeta({ character: data.character, affectionPoints: data.affectionPoints });
      console.log('[FETCH COMPLETE] messages:', mapped.length,
        'with images:', mapped.filter((m: any) => m.imageUrl).length);
    } catch (err) {
      console.error('[FETCH ERROR]', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [id, lastRefetch]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: me } = useGetMe();

  const [isSending, setIsSending] = useState(false);
  const [isSendingGift, setIsSendingGift] = useState(false);
  const [isRequestingSelfie, setIsRequestingSelfie] = useState(false);

  const { data: ecoConfig } = useQuery<{ giftSmall: number; giftMedium: number; giftLarge: number }>({
    queryKey: ["economy-config"],
    queryFn: () => fetch("/api/economy-config").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // Unlock cost fetched from server
  const { data: unlockCostData } = useQuery<{ cost: number }>({
    queryKey: ["unlock-cost"],
    queryFn: () => fetch("/api/media/unlock-cost", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }).then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  });
  const unlockCost = unlockCostData?.cost ?? 15;

  // Unlock mutation
  const unlockMutation = useMutation({
    mutationFn: async (messageTimestamp: string) => {
      const res = await fetch(`/api/conversations/${id}/unlock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ messageTimestamp }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to unlock" }));
        throw new Error(err.error ?? "Failed to unlock");
      }
      return res.json() as Promise<{ ok: boolean; imageUrl: string | null; neonCardBalance: number }>;
    },
    onSuccess: async (_data, messageTimestamp) => {
      setUnlockTarget(null);
      setMessages(prev => prev.map(m =>
        m.timestamp === messageTimestamp ? { ...m, isLocked: false } : m
      ));
      setLastRefetch(Date.now());
      console.log('[UNLOCK] Local update + refetch triggered');
    },
    onError: (err: Error) => {
      setUnlockTarget(null);
      const isLowBalance = err.message.toLowerCase().includes("insufficient") || err.message.toLowerCase().includes("neon");
      if (isLowBalance) {
        toast({ title: "❌ Not enough Neon Cards", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Unlock Failed", description: err.message, variant: "destructive" });
      }
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !id || isSending) return;
    const text = input;
    setInput("");
    setIsSending(true);
    try {
      const res = await fetch(`/api/conversations/${id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        console.error('[SEND ERROR] Status:', res.status);
        toast({ title: "Failed to send", variant: "destructive" });
        return;
      }
      console.log('[SEND COMPLETE] Triggering full refetch');
      setLastRefetch(Date.now());
    } catch (err) {
      console.error('[SEND ERROR]', err);
      toast({ title: "Failed to send", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleGift = async (giftType: GiftInputGiftType) => {
    if (!id || isSendingGift) return;
    setShowGiftTray(false);
    setIsSendingGift(true);
    try {
      const res = await fetch(`/api/conversations/${id}/gift`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ giftType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Gift failed" }));
        const msg = err.error ?? "Gift could not be sent";
        const isLowBalance = msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("neon");
        toast({ title: "Gift Failed", description: isLowBalance ? "Not enough Neon Cards" : msg, variant: "destructive" });
        return;
      }
      const data = await res.json();
      toast({ title: "Gift Sent!", description: `+${data.affectionPoints} AP. ${data.aiReaction}` });
      setLastRefetch(Date.now());
    } catch (err) {
      toast({ title: "Gift Failed", description: "Gift could not be sent", variant: "destructive" });
    } finally {
      setIsSendingGift(false);
    }
  };

  const submitSelfie = async () => {
    if (!id || isRequestingSelfie) return;
    const description = selfieDesc.trim() || "Show me yourself";
    setShowSelfieModal(false);
    setSelfieDesc("");
    setIsRequestingSelfie(true);
    try {
      const res = await fetch(`/api/conversations/${id}/selfie`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        const msg = err.error ?? "";
        const isLowBalance = msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("neon");
        if (isLowBalance) {
          toast({ title: "❌ Not enough Neon Cards", description: msg, variant: "destructive" });
        } else {
          toast({ title: "Request Failed", variant: "destructive" });
        }
        return;
      }
      toast({ title: "Selfie Requested!", description: "Generating your image…" });
      setLastRefetch(Date.now());
    } catch (err) {
      toast({ title: "Request Failed", variant: "destructive" });
    } finally {
      setIsRequestingSelfie(false);
    }
  };

  const handleNewChat = async () => {
    if (!id) return;
    setArchiving(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/conversations/${id}/archive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? "Failed");
      }
      setLastRefetch(Date.now());
      setShowNewChatModal(false);
      toast({ title: "🔄 Fresh start!", description: "New conversation started." });
    } catch (e) {
      console.error("Start Fresh failed:", e);
      toast({ title: "Failed", description: String(e), variant: "destructive" });
    }
    setArchiving(false);
  };

  // Tap on lock icon → show confirmation modal
  const handleUnlockTap = useCallback((msg: ChatMsg) => {
    setUnlockTarget(msg);
  }, []);

  // Confirmed unlock
  const confirmUnlock = () => {
    if (!unlockTarget?.timestamp) return;
    unlockMutation.mutate(unlockTarget.timestamp);
  };

  const tier = me?.subscriptionTier ?? "Free";
  const isGold = tier === "Gold";

  const displayMessages = messages.filter(m => m.content || m.imageUrl);
  console.log('[FILTER CHECK]', messages.length, displayMessages?.length, 'lastRefetch:', lastRefetch);
  const chatViewerImages = displayMessages
    .filter(m => !!m.imageUrl)
    .map(m => ({
      ...m,
      imageUrl: m.imageUrl!,
      mediaType: m.mediaType ?? 'auto',
    }));

  // Clamp viewer index when the image list changes — must be before any early return
  useEffect(() => {
    if (chatViewer && chatViewerImages.length > 0) {
      setChatViewer(v => v && { idx: Math.min(v.idx, chatViewerImages.length - 1) });
    } else if (chatViewer && chatViewerImages.length === 0) {
      setChatViewer(null);
    }
  }, [chatViewerImages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="shrink-0 h-16 border-b border-border bg-card/90 backdrop-blur-md flex items-center px-4 gap-3 sticky top-0 z-40">
        <Link href="/chat" className="p-2 -ml-2 text-muted-foreground hover:text-white">
          <ChevronLeft size={24} />
        </Link>
        <Link href={convMeta?.character?.characterId ? `/character/${convMeta.character.characterId}?from=chat&conversationId=${id}` : "#"}
          className="w-10 h-10 rounded-full overflow-hidden border border-secondary box-glow-purple shrink-0 cursor-pointer hover:opacity-80 transition-opacity">
          <img src={convMeta?.character?.avatarUrl || ""} alt="Avatar" className="w-full h-full object-cover" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-white truncate">{convMeta?.character?.name}</h2>
          <div className="text-xs text-primary flex items-center gap-1.5 font-medium">
            <Heart size={10} className="fill-primary" /> {convMeta?.affectionPoints || 0} AP
            <span className="text-muted-foreground">·</span>
            <span className="text-purple-400">{Math.min(100, Math.floor((convMeta?.affectionPoints || 0) / 500 * 100))}% 💜</span>
          </div>
        </div>
        <button onClick={() => setShowNewChatModal(true)}
          className="p-2 text-muted-foreground hover:text-white transition-colors"
          title="New Chat / Fresh Start">
          <RefreshCw size={18} />
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {displayMessages.map((msg, i) => {
          if (msg.imageUrl) console.log(`[RENDER CHECK msg ${i}]`, { hasImage: true, isLocked: msg.isLocked, content: msg.content?.slice(0, 20) });
          console.log(`[MSG ${i}]`, { role: msg.role, content: msg.content?.slice(0, 30), imageUrl: !!msg.imageUrl, isLocked: msg.isLocked });
          const isUser = msg.role === 'user';
          return (
            <div key={i} className="flex flex-col w-full">
              {/* Text bubble — constrained width */}
              {msg.content && (
                <div className={`flex flex-col max-w-[85%] ${isUser ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                  <div className={`p-3 rounded-2xl ${
                    isUser
                      ? 'bg-primary text-primary-foreground rounded-tr-sm box-glow-pink'
                      : 'bg-card text-card-foreground border border-border rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              )}
              {/* Image — single block handles locked and unlocked states */}
              {msg.imageUrl && !isUser && (
                <>
                  {msg.isLocked ? (
                    <div
                      onClick={() => handleUnlockTap(msg)}
                      style={{
                        width: '100%',
                        marginTop: '4px',
                        position: 'relative',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        minHeight: '250px',
                        backgroundColor: '#1a1a2e',
                        cursor: 'pointer',
                      }}
                    >
                      <img
                        src={msg.imageUrl}
                        alt="Locked content"
                        style={{
                          filter: 'blur(20px)',
                          transform: 'scale(1.1)',
                          width: '100%',
                          minHeight: '250px',
                          objectFit: 'cover',
                          display: 'block',
                          opacity: 0.6,
                        }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        onLoad={() => console.log('[BLURRED IMG] Loaded OK')}
                      />
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        background: 'rgba(0,0,0,0.4)',
                      }}>
                        <div style={{
                          padding: '12px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(0,0,0,0.6)',
                          border: '1px solid rgba(255,100,150,0.5)',
                        }}>
                          <Lock size={22} color="#ff6496" />
                        </div>
                        <p style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>
                          🔒 Unlock • {unlockCost} Neon Cards
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: '100%', marginTop: '4px' }}>
                      <img
                        src={msg.imageUrl}
                        alt="Character image"
                        style={{
                          width: '100%',
                          height: 'auto',
                          minHeight: '250px',
                          maxHeight: '400px',
                          borderRadius: '12px',
                          objectFit: 'cover',
                          display: 'block',
                          cursor: 'pointer',
                        }}
                        onClick={() => { const idx = chatViewerImages.findIndex(ci => ci.timestamp === msg.timestamp); if (idx >= 0) setChatViewer({ idx }); }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        onLoad={() => console.log('[CHAT] Image loaded OK')}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        {isSending && (
          <div className="mr-auto p-3 rounded-2xl bg-card border border-border rounded-tl-sm text-muted-foreground text-sm flex gap-1">
            <span className="animate-bounce">.</span><span className="animate-bounce delay-75">.</span><span className="animate-bounce delay-150">.</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 p-3 bg-background border-t border-border flex items-center gap-2 pb-safe">
        <button
          onClick={() => setShowGiftTray(!showGiftTray)}
          className="p-2.5 rounded-full bg-card border border-border text-primary hover:box-glow-pink hover:border-primary transition-all shrink-0"
        >
          <Gift size={20} />
        </button>
        <button
          onClick={() => setShowSelfieModal(true)}
          disabled={isRequestingSelfie}
          className="p-2.5 rounded-full bg-card border border-border text-accent hover:box-glow-blue hover:border-accent transition-all shrink-0 disabled:opacity-50"
        >
          <Camera size={20} />
        </button>
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Message..."
          className="flex-1 bg-card border-secondary/50 rounded-full h-11 focus-visible:ring-primary"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isSending}
          className="p-2.5 rounded-full bg-primary text-white box-glow-pink shrink-0 disabled:opacity-50"
        >
          <Send size={20} className="ml-0.5" />
        </button>
      </div>

      {/* Chat Image Fullscreen Viewer */}
      {chatViewer !== null && chatViewerImages.length > 0 && (() => {
        const currentMsg = chatViewerImages[chatViewer.idx];
        const isViewerLocked = currentMsg.isLocked === true;
        console.log('[VIEWER OPEN] imageUrl:', currentMsg?.imageUrl);
        return (
          <div
            className="fixed inset-0 z-[60] bg-black/95 flex flex-col"
            onTouchStart={e => { chatViewerTouchX.current = e.touches[0].clientX; }}
            onTouchEnd={e => {
              if (chatViewerTouchX.current === null) return;
              const dx = e.changedTouches[0].clientX - chatViewerTouchX.current;
              if (Math.abs(dx) > 40) {
                if (dx < 0) setChatViewer(v => v && { idx: Math.min(v.idx + 1, chatViewerImages.length - 1) });
                else setChatViewer(v => v && { idx: Math.max(v.idx - 1, 0) });
              }
              chatViewerTouchX.current = null;
            }}
          >
            <div className="flex items-center justify-end px-4 py-3 border-b border-white/10">
              <button onClick={() => setChatViewer(null)} className="p-2 text-white/70 hover:text-white transition-colors">
                <X size={22} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center relative px-4">
              {/* Image type label */}
              <div style={{
                position: 'absolute',
                top: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                zIndex: 10,
                whiteSpace: 'nowrap',
              }}>
                {currentMsg.isLocked ? '🔒 Locked' :
                 currentMsg.mediaType === 'trigger' ? '⚡ Trigger' :
                 currentMsg.mediaType === 'selfie' ? '📸 Selfie' :
                 '🔄 Auto'}
              </div>
              {isViewerLocked ? (
                <div className="relative w-full max-w-sm">
                  <div style={{ overflow: "hidden", borderRadius: 12 }}>
                    <img
                      src={currentMsg.imageUrl!}
                      alt="Locked"
                      style={{ filter: "blur(20px)", transform: "scale(1.1)", width: "100%" }}
                      className="h-auto brightness-50 select-none pointer-events-none"
                      draggable={false}
                    />
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl">
                    <div className="p-4 rounded-full bg-black/60 border border-primary/50 box-glow-pink">
                      <Lock size={28} className="text-primary" />
                    </div>
                    <p className="text-white text-sm font-bold drop-shadow-lg">🔒 Locked Image</p>
                    <button
                      onClick={() => { setChatViewer(null); handleUnlockTap(currentMsg); }}
                      className="mt-1 px-6 py-2.5 rounded-full bg-primary text-white text-sm font-bold box-glow-pink hover:bg-primary/90"
                    >
                      <Unlock size={14} className="inline mr-1.5 -mt-0.5" /> Unlock · {unlockCost} 💎
                    </button>
                  </div>
                </div>
              ) : (
                <img
                  src={currentMsg.imageUrl!}
                  alt="Character image"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                    maxHeight: '80vh',
                  }}
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    console.log('[VIEWER] Image failed:', currentMsg?.imageUrl, 'retried:', img.dataset.retried);
                    if (!img.dataset.retried) {
                      img.dataset.retried = 'true';
                      img.src = img.src + (img.src.includes('?') ? '&retry=1' : '?retry=1');
                    }
                  }}
                  onLoad={() => console.log('[VIEWER] Image loaded OK')}
                />
              )}
              {chatViewerImages.length > 1 && (
                <>
                  <button
                    onClick={() => setChatViewer(v => v && { idx: Math.max(v.idx - 1, 0) })}
                    disabled={chatViewer.idx === 0}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    onClick={() => setChatViewer(v => v && { idx: Math.min(v.idx + 1, chatViewerImages.length - 1) })}
                    disabled={chatViewer.idx === chatViewerImages.length - 1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>
            <div className="flex justify-center py-4">
              <span className="text-white/70 text-sm font-semibold tabular-nums">
                {chatViewer.idx + 1} of {chatViewerImages.length}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Unlock Confirmation Modal */}
      <AnimatePresence>
        {unlockTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setUnlockTarget(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="w-full shadow-[0_-10px_40px_rgba(255,0,127,0.25)]"
              style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '20px 20px 80px 20px',
                zIndex: 9999,
                backgroundColor: 'var(--background)',
                borderTopLeftRadius: '16px',
                borderTopRightRadius: '16px',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <Unlock size={16} className="text-primary" /> Unlock Image
                </h3>
                <button onClick={() => setUnlockTarget(null)} className="text-muted-foreground hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-muted-foreground mb-5">
                Unlock this image for <span className="text-primary font-bold">{unlockCost} 💎 Neon Cards</span>. Once unlocked it stays unlocked permanently.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setUnlockTarget(null)}
                  className="flex-1 py-3 rounded-xl border border-border text-muted-foreground text-sm font-bold hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmUnlock}
                  disabled={unlockMutation.isPending}
                  className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold box-glow-pink hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2 transition-all"
                >
                  <Unlock size={14} />
                  {unlockMutation.isPending ? "Unlocking…" : `Unlock · ${unlockCost} 💎`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selfie Prompt Modal */}
      <AnimatePresence>
        {showSelfieModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSelfieModal(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="w-full bg-card border-t border-primary/30 rounded-t-2xl p-5 shadow-[0_-10px_40px_rgba(255,0,127,0.2)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <Camera size={16} className="text-accent" /> Request a Selfie
                </h3>
                <button onClick={() => setShowSelfieModal(false)} className="text-muted-foreground hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Describe the scene or pose (optional)</p>
              <textarea
                autoFocus
                value={selfieDesc}
                onChange={e => setSelfieDesc(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), submitSelfie())}
                placeholder="e.g. Sitting on a neon rooftop at night, looking over your shoulder…"
                rows={3}
                className="w-full rounded-xl border border-secondary/50 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent resize-none"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setShowSelfieModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground text-sm font-semibold hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitSelfie}
                  disabled={isRequestingSelfie}
                  className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-bold box-glow-blue disabled:opacity-50 transition-all"
                >
                  {isRequestingSelfie ? "Generating…" : "📸 Send"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gift Tray */}
      <AnimatePresence>
        {showGiftTray && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            className="absolute bottom-20 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-primary/30 p-4 z-50 rounded-t-2xl shadow-[0_-10px_30px_rgba(255,0,127,0.15)]"
          >
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1 text-center">Send a Gift</h3>
            <p className="text-[10px] text-muted-foreground text-center mb-4">
              {isGold ? "Gold tier: 50% off all gifts!" : "Costs Neon Cards (🃏)"}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { type: GiftInputGiftType.cyber_cocktail, name: "Cyber Cocktail", cost: ecoConfig?.giftSmall ?? 10, ap: 5, intimacy: "+1%", icon: "🍹" },
                { type: GiftInputGiftType.neon_bracelet,  name: "Neon Bracelet",  cost: ecoConfig?.giftMedium ?? 25, ap: 15, intimacy: "+2%", icon: "💎" },
                { type: GiftInputGiftType.secret_key,     name: "Secret Key",     cost: ecoConfig?.giftLarge ?? 50, ap: 35, intimacy: "+5%", icon: "🔑" },
              ].map(gift => {
                const displayCost = isGold ? Math.floor(gift.cost / 2) : gift.cost;
                return (
                  <button
                    key={gift.type}
                    onClick={() => handleGift(gift.type)}
                    className="flex flex-col items-center p-3 rounded-xl border border-border bg-background hover:border-primary hover:box-glow-pink transition-all"
                  >
                    <span className="text-3xl mb-2 drop-shadow-[0_0_10px_rgba(255,0,127,0.8)]">{gift.icon}</span>
                    <span className="text-xs font-bold text-white mb-1">{gift.name}</span>
                    <span className="text-[10px] text-secondary font-semibold">{displayCost} 🃏</span>
                    <span className="text-[10px] text-muted-foreground">+{gift.ap} AP · {gift.intimacy} 💜</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Chat Confirmation Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-auto bg-background rounded-t-2xl border-t border-border p-6 space-y-4" style={{ paddingBottom: "140px" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">🔄 New Chat</h3>
              <button onClick={() => setShowNewChatModal(false)} className="p-1 text-muted-foreground hover:text-white">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              This archives your current conversation and starts fresh. You can still view archived chats in your Chat Feed.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowNewChatModal(false)}
                className="flex-1 h-11 rounded-xl border border-border text-muted-foreground text-sm font-bold hover:bg-card transition-colors">
                Cancel
              </button>
              <button onClick={handleNewChat} disabled={archiving}
                className="flex-1 h-11 rounded-xl bg-primary/20 border border-primary/40 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-50">
                {archiving ? "Starting…" : "Start Fresh"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
