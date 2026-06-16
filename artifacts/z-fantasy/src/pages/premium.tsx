import { useState } from "react";
import { useCreateInvoice, InvoiceRequestTier, InvoiceRequestPeriod } from "@workspace/api-client-react";
import { Star, Zap, Infinity, Shield, CheckCircle2 } from "lucide-react";
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

export function Premium() {
  const [period, setPeriod] = useState<Period>("monthly");
  const [paidTier, setPaidTier] = useState<string | null>(null);
  const createInvoice = useCreateInvoice();
  const { toast } = useToast();

  const handleSubscribe = (tier: InvoiceRequestTier, tierName: string) => {
    createInvoice.mutate(
      { data: { tier, period: period as typeof InvoiceRequestPeriod[keyof typeof InvoiceRequestPeriod] } },
      {
        onSuccess: (res) => {
          if (window.Telegram?.WebApp?.openInvoice) {
            window.Telegram.WebApp.openInvoice(res.invoiceLink, (status) => {
              if (status === "paid") {
                setPaidTier(tierName);
                setTimeout(() => setPaidTier(null), 4000);
              } else if (status === "cancelled") {
                toast({ title: "Payment cancelled" });
              } else if (status === "failed") {
                toast({ title: "Payment failed", description: "Please try again.", variant: "destructive" });
              }
            });
          } else {
            toast({ title: "Open in Telegram", description: "Please open this app inside Telegram to complete payment." });
          }
        },
        onError: () => toast({ title: "Failed to create invoice", variant: "destructive" })
      }
    );
  };

  const tiers = [
    {
      id: InvoiceRequestTier.Bronze,
      name: "Bronze",
      color: "text-amber-500",
      border: "border-amber-500",
      glow: "hover:shadow-[0_0_25px_rgba(245,158,11,0.5)]",
      icon: Shield,
      features: ["100 Tickets/cycle", "Basic avatars", "Standard wait times"],
    },
    {
      id: InvoiceRequestTier.Silver,
      name: "Silver",
      color: "text-slate-300",
      border: "border-slate-300",
      glow: "hover:shadow-[0_0_25px_rgba(203,213,225,0.5)]",
      icon: Zap,
      features: ["300 Tickets/cycle", "Priority generation", "Voice messages", "HD Vault"],
    },
    {
      id: InvoiceRequestTier.Gold,
      name: "Gold",
      color: "text-yellow-400",
      border: "border-yellow-400",
      glow: "hover:shadow-[0_0_25px_rgba(250,204,21,0.5)]",
      icon: Infinity,
      features: ["1000 Tickets/cycle", "Instant generation", "All NSFW unlocked", "Custom models"],
    },
  ];

  return (
    <div className="p-4 pb-24">
      {/* Payment success overlay */}
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

      <div className="space-y-6">
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

      <p className="text-center text-[10px] text-muted-foreground mt-6">
        Payments processed via Telegram Stars. The native checkout sheet opens inside your app.
      </p>
    </div>
  );
}
