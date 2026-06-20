import { useState } from "react";
import { useCreateInvoice, InvoiceRequestTier, InvoiceRequestPeriod } from "@workspace/api-client-react";
import { Star, Zap, Infinity, Shield, CheckCircle2, CreditCard, Ticket } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Period = "weekly" | "monthly" | "yearly";

const PRICES: Record<string, Record<Period, number>> = {
  Bronze: { weekly: 100,  monthly: 300,  yearly: 3000  },
  Silver: { weekly: 200,  monthly: 600,  yearly: 6000  },
  Gold:   { weekly: 350,  monthly: 1050, yearly: 10500 },
};

const PERIOD_LABELS: Record<Period, string> = {
  weekly:  "Weekly",
  monthly: "Monthly",
  yearly:  "Yearly",
};

const PERIOD_NOTE: Record<Period, string> = {
  weekly:  "Billed every 7 days",
  monthly: "Save 1 week vs. weekly",
  yearly:  "Save 2 months vs. monthly",
};

const NEON_PACKS = [
  { id: "starter", label: "Starter",  cards: 100, stars: 200,  color: "text-cyan-300",  border: "border-cyan-500/50",  glow: "hover:shadow-[0_0_20px_rgba(34,211,238,0.3)]",  bonus: null },
  { id: "booster", label: "Booster",  cards: 270, stars: 450,  color: "text-violet-300", border: "border-violet-500/50", glow: "hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]", bonus: "+20 bonus" },
  { id: "mega",    label: "Mega",     cards: 550, stars: 950,  color: "text-pink-300",   border: "border-pink-500/50",   glow: "hover:shadow-[0_0_20px_rgba(236,72,153,0.3)]", bonus: "+50 bonus" },
];

function getToken() {
  return (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData || "mock_init_data_for_dev";
}

export function Premium() {
  const [period, setPeriod] = useState<Period>("monthly");
  const [paidTier, setPaidTier] = useState<string | null>(null);
  const [cardsBought, setCardsBought] = useState<number | null>(null);
  const [ticketsBought, setTicketsBought] = useState<number | null>(null);
  const [customCards, setCustomCards] = useState("");
  const [customTickets, setCustomTickets] = useState("");
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const [buyingTickets, setBuyingTickets] = useState<string | null>(null);
  const createInvoice = useCreateInvoice();
  const { toast } = useToast();

  function openInvoiceSafe(link: string, onPaid?: () => void) {
    if (window.Telegram?.WebApp?.openInvoice) {
      window.Telegram.WebApp.openInvoice(link, (status) => {
        if (status === "paid") { onPaid?.(); }
        else if (status === "cancelled") { toast({ title: "Payment cancelled" }); }
        else if (status === "failed") { toast({ title: "Payment failed", description: "Please try again.", variant: "destructive" }); }
      });
    } else {
      window.open(link, "_blank");
    }
  }

  const handleSubscribe = (tier: InvoiceRequestTier, tierName: string) => {
    createInvoice.mutate(
      { data: { tier, period: period as typeof InvoiceRequestPeriod[keyof typeof InvoiceRequestPeriod] } },
      {
        onSuccess: (res) => {
          openInvoiceSafe(res.invoiceLink, () => {
            setPaidTier(tierName);
            setTimeout(() => setPaidTier(null), 4000);
          });
        },
        onError: () => toast({ title: "Failed to create invoice", variant: "destructive" })
      }
    );
  };

  const handleBuyNeonCards = async (packId: string, customAmount?: number) => {
    setBuyingPack(packId);
    try {
      const body: Record<string, unknown> = { packType: packId };
      if (packId === "custom" && customAmount) body.customAmount = customAmount;

      const res = await fetch("/api/payments/neon-cards/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed");
      }

      const { invoiceLink } = await res.json() as { invoiceLink: string };

      openInvoiceSafe(invoiceLink, () => {
        const amount = customAmount ?? NEON_PACKS.find(p => p.id === packId)?.cards ?? 0;
        setCardsBought(amount);
        setTimeout(() => setCardsBought(null), 4000);
      });
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setBuyingPack(null);
    }
  };

  const handleBuyTickets = async (packType: string, customAmount?: number) => {
    setBuyingTickets(packType);
    try {
      const body: Record<string, unknown> = { packType };
      if (packType === "custom" && customAmount) body.customAmount = customAmount;

      const res = await fetch("/api/payments/tickets/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed");
      }

      const { invoiceLink } = await res.json() as { invoiceLink: string };

      openInvoiceSafe(invoiceLink, () => {
        const amount = customAmount ?? 200;
        setTicketsBought(amount);
        setTimeout(() => setTicketsBought(null), 4000);
      });
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setBuyingTickets(null);
    }
  };

  const tiers = [
    {
      id: InvoiceRequestTier.Bronze,
      name: "Bronze",
      color: "text-amber-500",
      border: "border-amber-500",
      glow: "hover:shadow-[0_0_25px_rgba(245,158,11,0.5)]",
      icon: Shield,
      features: ["UNLIMITED MESSAGES", "Includes 150 Neon Tickets to start", "4/6 Image Ratio Loop"],
    },
    {
      id: InvoiceRequestTier.Silver,
      name: "Silver",
      color: "text-slate-300",
      border: "border-slate-300",
      glow: "hover:shadow-[0_0_25px_rgba(203,213,225,0.5)]",
      icon: Zap,
      features: ["UNLIMITED MESSAGES", "Includes 350 Neon Tickets to start", "Max 40 Daily Requests"],
    },
    {
      id: InvoiceRequestTier.Gold,
      name: "Gold",
      color: "text-yellow-400",
      border: "border-yellow-400",
      glow: "hover:shadow-[0_0_25px_rgba(250,204,21,0.5)]",
      icon: Infinity,
      features: ["UNLIMITED MESSAGES", "Includes 600 Neon Tickets to start", "Balance limits set to 9999"],
    },
  ];

  const customAmt = parseInt(customCards, 10);
  const customStars = !isNaN(customAmt) && customAmt >= 10 ? Math.ceil(customAmt / 2) : null;
  const customBonus = !isNaN(customAmt) && customAmt > 0 ? (customAmt > 500 ? 50 : customAmt > 250 ? 20 : 0) : 0;

  return (
    <div className="p-4 pb-24">
      {/* Payment success overlays */}
      {paidTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-card border border-yellow-400 rounded-3xl p-10 flex flex-col items-center gap-4 shadow-[0_0_60px_rgba(250,204,21,0.4)]">
            <CheckCircle2 size={64} className="text-yellow-400 drop-shadow-[0_0_16px_rgba(250,204,21,0.8)]" />
            <h2 className="text-2xl font-bold uppercase tracking-widest text-yellow-400">Activated!</h2>
            <p className="text-muted-foreground text-center text-sm">
              {paidTier} tier is now live.<br />Enjoy your upgraded experience.
            </p>
          </div>
        </div>
      )}
      {cardsBought !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-card border border-cyan-400 rounded-3xl p-10 flex flex-col items-center gap-4 shadow-[0_0_60px_rgba(34,211,238,0.4)]">
            <span className="text-6xl">🃏</span>
            <h2 className="text-2xl font-bold uppercase tracking-widest text-cyan-400">+{cardsBought} Cards!</h2>
            <p className="text-muted-foreground text-center text-sm">Neon Cards added to your wallet.</p>
          </div>
        </div>
      )}

      <div className="text-center mb-8 mt-4">
        <h1 className="text-3xl font-bold uppercase tracking-widest text-glow-purple">Ascend</h1>
        <p className="text-muted-foreground mt-2 text-sm">Unlock the true power of the underground.</p>
      </div>

      {/* Period Selector */}
      <div className="flex p-1 bg-card rounded-xl border border-border mb-6">
        {(["weekly", "monthly", "yearly"] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              period === p
                ? "bg-secondary text-white box-glow-purple"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-accent mb-6">{PERIOD_NOTE[period]}</p>

      <div className="space-y-6 mb-10">
        {tiers.map(tier => {
          const Icon = tier.icon;
          const stars = PRICES[tier.name]?.[period] ?? 0;

          return (
            <div key={tier.id} className={`p-6 rounded-2xl bg-card border ${tier.border} ${tier.glow} transition-all relative overflow-hidden group`}>
              <div className={`absolute top-0 right-0 w-32 h-32 bg-current opacity-5 rounded-full blur-3xl -mr-10 -mt-10 ${tier.color}`} />

              <div className="relative z-10 flex justify-between items-start mb-6">
                <div>
                  <h2 className={`text-2xl font-bold uppercase tracking-wider ${tier.color} drop-shadow-[0_0_8px_currentColor]`}>{tier.name}</h2>
                  <div className="mt-1">
                    <span className="text-2xl font-bold text-white">{stars.toLocaleString()} ⭐</span>
                    <span className="text-sm text-muted-foreground font-normal ml-1">/ {PERIOD_LABELS[period].toLowerCase()}</span>
                  </div>
                  {period === "yearly" && (
                    <div className="mt-1 text-xs font-semibold text-green-400">
                      ≈ {Math.round(stars / 12).toLocaleString()} ⭐/mo — Best Value
                    </div>
                  )}
                </div>
                <Icon size={32} className={tier.color} />
              </div>

              <ul className="space-y-3 mb-6 relative z-10">
                {tier.features.map((feat, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Star size={14} className={tier.color} /> {feat}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(tier.id, tier.name)}
                disabled={createInvoice.isPending}
                className={`w-full py-3 rounded-xl border ${tier.border} ${tier.color} font-bold uppercase tracking-wider hover:bg-current hover:text-black transition-colors relative z-10 disabled:opacity-50`}
              >
                {createInvoice.isPending ? "Loading..." : `Get ${tier.name} — ${stars.toLocaleString()} ⭐`}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Neon Card Shop ── */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <CreditCard size={18} className="text-cyan-400" />
          <h2 className="text-lg font-bold uppercase tracking-widest text-cyan-400" style={{ textShadow: "0 0 10px rgba(0,240,255,0.7)" }}>
            Neon Card Shop
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Neon Cards power character creation (25🃏), selfies (15🃏), and gifts. Daily claim gives +15🃏.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {NEON_PACKS.map(pack => (
            <button
              key={pack.id}
              onClick={() => handleBuyNeonCards(pack.id)}
              disabled={buyingPack === pack.id}
              className={`p-3 rounded-2xl bg-card border ${pack.border} ${pack.glow} transition-all flex flex-col items-center gap-1.5 disabled:opacity-50`}
            >
              <span className="text-3xl">🃏</span>
              <span className={`text-xs font-black uppercase tracking-wide ${pack.color}`}>{pack.label}</span>
              <span className={`text-lg font-bold ${pack.color}`}>{pack.cards}</span>
              <span className="text-[10px] text-muted-foreground">{pack.bonus ?? "cards"}</span>
              <span className="text-xs font-semibold text-white mt-1">{pack.stars} ⭐</span>
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div className="p-4 rounded-2xl bg-card border border-border">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Custom Amount (2 Stars : 1 Card)</p>
          <div className="flex gap-2">
            <input
              type="number"
              min={10}
              step={1}
              value={customCards}
              onChange={e => setCustomCards(e.target.value)}
              placeholder="Min 10 cards"
              className="flex-1 h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-cyan-400/60"
            />
            <button
              onClick={() => handleBuyNeonCards("custom", customAmt)}
              disabled={customStars === null || buyingPack === "custom"}
              className="px-4 h-10 rounded-lg border border-cyan-500/50 text-cyan-400 font-bold text-sm hover:bg-cyan-500/10 transition-colors disabled:opacity-40"
            >
              {customStars !== null ? `${customStars} ⭐` : "Buy"}
            </button>
          </div>
          {customStars !== null && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Receive <span className="text-cyan-300 font-bold">{customAmt + customBonus} Cards</span> for <span className="text-white font-bold">{customStars} ⭐</span>
              </span>
              {customBonus > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${
                  customBonus >= 50
                    ? "bg-pink-500/20 text-pink-300 border-pink-500/50"
                    : "bg-violet-500/20 text-violet-300 border-violet-500/50"
                }`}>
                  +{customBonus} Bonus Cards
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Ticket Shop ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Ticket size={18} className="text-yellow-400" />
          <h2 className="text-lg font-bold uppercase tracking-widest text-yellow-400" style={{ textShadow: "0 0 10px rgba(250,204,21,0.7)" }}>
            Ticket Shop
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Tickets fuel AI messages. 2 Stars = 1 Ticket. Orders over 500 get +20 bonus per 100.
        </p>

        {/* Fixed starter pack */}
        <button
          onClick={() => handleBuyTickets("starter")}
          disabled={buyingTickets === "starter"}
          className="w-full p-4 rounded-2xl bg-card border border-yellow-500/40 hover:shadow-[0_0_20px_rgba(250,204,21,0.25)] transition-all flex items-center justify-between mb-3 disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎟</span>
            <div className="text-left">
              <p className="text-sm font-black text-yellow-400 uppercase tracking-wide">Starter Pack</p>
              <p className="text-xs text-muted-foreground">200 Tickets instantly</p>
            </div>
          </div>
          <span className="text-sm font-bold text-white">100 ⭐</span>
        </button>

        {/* Custom ticket amount */}
        <div className="p-4 rounded-2xl bg-card border border-border">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Custom Amount (2 Stars : 1 Ticket)</p>
          {(() => {
            const customTicketAmt = parseInt(customTickets, 10);
            const customTicketStars = !isNaN(customTicketAmt) && customTicketAmt >= 10 ? Math.ceil(customTicketAmt / 2) : null;
            const customTicketBonus = !isNaN(customTicketAmt) && customTicketAmt > 500
              ? Math.floor((customTicketAmt - 500) / 100) * 20 : 0;
            return (
              <>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={10}
                    step={1}
                    value={customTickets}
                    onChange={e => setCustomTickets(e.target.value)}
                    placeholder="Min 10 tickets"
                    className="flex-1 h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-yellow-400/60"
                  />
                  <button
                    onClick={() => handleBuyTickets("custom", customTicketAmt)}
                    disabled={customTicketStars === null || buyingTickets === "custom"}
                    className="px-4 h-10 rounded-lg border border-yellow-500/50 text-yellow-400 font-bold text-sm hover:bg-yellow-500/10 transition-colors disabled:opacity-40"
                  >
                    {customTicketStars !== null ? `${customTicketStars} ⭐` : "Buy"}
                  </button>
                </div>
                {customTicketStars !== null && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Receive <span className="text-yellow-300 font-bold">{customTicketAmt + customTicketBonus} Tickets</span> for <span className="text-white font-bold">{customTicketStars} ⭐</span>
                    </span>
                    {customTicketBonus > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border bg-yellow-500/20 text-yellow-300 border-yellow-500/50">
                        +{customTicketBonus} Bonus
                      </span>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground mt-6">
        Payments processed via Telegram Stars. Native checkout sheet opens inside your app.
      </p>

      {/* Tickets purchased overlay */}
      {ticketsBought !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-card border border-yellow-400 rounded-3xl p-10 flex flex-col items-center gap-4 shadow-[0_0_60px_rgba(250,204,21,0.4)]">
            <span className="text-6xl">🎟</span>
            <h2 className="text-2xl font-bold uppercase tracking-widest text-yellow-400">+{ticketsBought} Tickets!</h2>
            <p className="text-muted-foreground text-center text-sm">Tickets added to your wallet.</p>
          </div>
        </div>
      )}
    </div>
  );
}
