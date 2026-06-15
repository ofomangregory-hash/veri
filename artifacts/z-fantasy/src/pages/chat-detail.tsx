import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useGetConversation, useSendMessage, useSendGift, useRequestSelfie, GiftInputGiftType } from "@workspace/api-client-react";
import { Send, Gift, Camera, ChevronLeft, Heart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

export function ChatDetail() {
  const { id } = useParams<{ id: string }>();
  const [input, setInput] = useState("");
  const [showGiftTray, setShowGiftTray] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: conv, isLoading, refetch } = useGetConversation(id!, {
    query: { enabled: !!id, queryKey: ['chat', id] }
  });

  const sendMsg = useSendMessage();
  const sendGift = useSendGift();
  const reqSelfie = useRequestSelfie();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conv?.messages]);

  const handleSend = () => {
    if (!input.trim() || !id) return;
    const text = input;
    setInput("");
    
    sendMsg.mutate({ characterId: id, data: { content: text } }, {
      onSuccess: () => refetch(),
      onError: () => toast({ title: "Failed to send", variant: "destructive" })
    });
  };

  const handleGift = (giftType: GiftInputGiftType) => {
    if (!id) return;
    setShowGiftTray(false);
    sendGift.mutate({ characterId: id, data: { giftType } }, {
      onSuccess: (res) => {
        toast({ title: "Gift Sent!", description: `+${res.affectionPoints} AP. ${res.aiReaction}` });
        refetch();
      },
      onError: () => toast({ title: "Gift Failed", description: "Not enough tickets", variant: "destructive" })
    });
  };

  const handleSelfie = () => {
    if (!id) return;
    reqSelfie.mutate({ characterId: id, data: { description: "Show me yourself" } }, {
      onSuccess: () => {
        toast({ title: "Selfie Requested!" });
        refetch();
      },
      onError: () => toast({ title: "Request Failed", variant: "destructive" })
    });
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="shrink-0 h-16 border-b border-border bg-card/90 backdrop-blur-md flex items-center px-4 gap-3 sticky top-0 z-40">
        <Link href="/chat" className="p-2 -ml-2 text-muted-foreground hover:text-white">
          <ChevronLeft size={24} />
        </Link>
        <div className="w-10 h-10 rounded-full overflow-hidden border border-secondary box-glow-purple shrink-0">
          <img src={conv?.character?.avatarUrl || ""} alt="Avatar" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-white truncate">{conv?.character?.name}</h2>
          <div className="text-xs text-primary flex items-center gap-1 font-medium">
            <Heart size={10} className="fill-primary" /> {conv?.affectionPoints || 0} AP
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {conv?.messages?.map((msg, i) => {
          const isUser = msg.role === 'user';
          return (
            <div key={i} className={`flex flex-col max-w-[85%] ${isUser ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
              <div className={`p-3 rounded-2xl ${
                isUser 
                  ? 'bg-primary text-primary-foreground rounded-tr-sm box-glow-pink' 
                  : 'bg-card text-card-foreground border border-border rounded-tl-sm'
              }`}>
                {msg.content}
              </div>
              {msg.imageUrl && (
                <div className="mt-2 rounded-xl overflow-hidden border border-border max-w-xs">
                  <img src={msg.imageUrl} alt="Attachment" className="w-full h-auto" />
                </div>
              )}
            </div>
          );
        })}
        {sendMsg.isPending && (
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
          onClick={handleSelfie}
          disabled={reqSelfie.isPending}
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
          disabled={!input.trim() || sendMsg.isPending}
          className="p-2.5 rounded-full bg-primary text-white box-glow-pink shrink-0 disabled:opacity-50"
        >
          <Send size={20} className="ml-0.5" />
        </button>
      </div>

      {/* Gift Tray */}
      <AnimatePresence>
        {showGiftTray && (
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            className="absolute bottom-20 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-primary/30 p-4 z-50 rounded-t-2xl shadow-[0_-10px_30px_rgba(255,0,127,0.15)]"
          >
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 text-center">Send a Gift</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { type: GiftInputGiftType.cyber_cocktail, name: "Cocktail", cost: 10, ap: 5, icon: "🍸" },
                { type: GiftInputGiftType.neon_bracelet, name: "Bracelet", cost: 25, ap: 15, icon: "⭕" },
                { type: GiftInputGiftType.secret_key, name: "Secret Key", cost: 50, ap: 35, icon: "🔑" },
              ].map(gift => (
                <button
                  key={gift.type}
                  onClick={() => handleGift(gift.type)}
                  className="flex flex-col items-center p-3 rounded-xl border border-border bg-background hover:border-primary hover:box-glow-pink transition-all"
                >
                  <span className="text-3xl mb-2 drop-shadow-[0_0_10px_rgba(255,0,127,0.8)]">{gift.icon}</span>
                  <span className="text-xs font-bold text-white mb-1">{gift.name}</span>
                  <span className="text-[10px] text-primary">{gift.cost} 🎟️</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
