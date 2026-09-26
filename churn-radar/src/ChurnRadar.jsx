import React, { useState, useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { ChevronDown, ChevronUp, Radio, TrendingDown, TrendingUp, AlertTriangle, Plus, Pencil, X, RotateCcw, Trash2 } from "lucide-react";

// ---------------------------------------------------------------------------
// SYNTHETIC DATA
// In a real integration this would come from your data.json / customers table.
// Field names are deliberately generic so this stays a drop-in reference.
// ---------------------------------------------------------------------------
const CUSTOMERS = [
  { id: "C-1042", name: "Bramwell & Co", plan: "Growth", tenureMonths: 4, loginsLast30: 2, daysSinceLogin: 19, paymentFailures90d: 2, supportTickets90d: 3, negativeSentimentTickets: 2, featureAdoptionPct: 22, history: [61, 58, 52, 41, 30] },
  { id: "C-1043", name: "Solstice Analytics", plan: "Starter", tenureMonths: 14, loginsLast30: 18, daysSinceLogin: 1, paymentFailures90d: 0, supportTickets90d: 1, negativeSentimentTickets: 0, featureAdoptionPct: 71, history: [12, 11, 10, 9, 8] },
  { id: "C-1044", name: "Ferric Studio", plan: "Growth", tenureMonths: 2, loginsLast30: 4, daysSinceLogin: 8, paymentFailures90d: 1, supportTickets90d: 2, negativeSentimentTickets: 1, featureAdoptionPct: 35, history: [40, 44, 47, 51, 55] },
  { id: "C-1045", name: "Northbound Legal", plan: "Enterprise", tenureMonths: 27, loginsLast30: 25, daysSinceLogin: 0, paymentFailures90d: 0, supportTickets90d: 0, negativeSentimentTickets: 0, featureAdoptionPct: 88, history: [6, 5, 6, 5, 4] },
  { id: "C-1046", name: "Kestrel Freight", plan: "Starter", tenureMonths: 6, loginsLast30: 1, daysSinceLogin: 26, paymentFailures90d: 1, supportTickets90d: 4, negativeSentimentTickets: 3, featureAdoptionPct: 14, history: [55, 62, 68, 74, 79] },
  { id: "C-1047", name: "Verdant Supply", plan: "Growth", tenureMonths: 9, loginsLast30: 11, daysSinceLogin: 3, paymentFailures90d: 0, supportTickets90d: 1, negativeSentimentTickets: 0, featureAdoptionPct: 58, history: [20, 19, 21, 18, 17] },
  { id: "C-1048", name: "Hollow Creek Design", plan: "Starter", tenureMonths: 3, loginsLast30: 0, daysSinceLogin: 34, paymentFailures90d: 2, supportTickets90d: 1, negativeSentimentTickets: 1, featureAdoptionPct: 9, history: [58, 64, 70, 77, 84] },
  { id: "C-1049", name: "Anvilcrest Metals", plan: "Enterprise", tenureMonths: 18, loginsLast30: 15, daysSinceLogin: 2, paymentFailures90d: 0, supportTickets90d: 2, negativeSentimentTickets: 0, featureAdoptionPct: 63, history: [17, 16, 15, 16, 14] },
];

// ---------------------------------------------------------------------------
// SCORING MODEL
// Transparent, weighted-signal model — the same "score → threshold → action"
// pattern used elsewhere. Each signal is normalized to 0-1, weighted, summed,
// then passed through a logistic squash so the output reads as a probability.
// No black box: every contributing factor is visible in the breakdown.
// ---------------------------------------------------------------------------
const DEFAULT_WEIGHTS = {
  recency: 28,     // days since last login
  usage: 22,       // inverse of logins in last 30 days
  payment: 20,     // payment failures
  support: 14,     // support ticket volume
  sentiment: 10,   // negative sentiment tickets
  adoption: 6,     // inverse of feature adoption
};

const WEIGHT_LABELS = {
  recency: "Login recency",
  usage: "Usage frequency",
  payment: "Payment failures",
  support: "Support volume",
  sentiment: "Negative sentiment",
  adoption: "Feature adoption",
};

function normalizedWeights(weights) {
  const total = Object.values(weights).reduce((s, v) => s + v, 0) || 1;
  const out = {};
  for (const k in weights) out[k] = weights[k] / total;
  return out;
}

function scoreCustomer(c, rawWeights) {
  const w = normalizedWeights(rawWeights);

  const recency = Math.min(c.daysSinceLogin / 30, 1);
  const usage = 1 - Math.min(c.loginsLast30 / 20, 1);
  const payment = Math.min(c.paymentFailures90d / 3, 1);
  const support = Math.min(c.supportTickets90d / 5, 1);
  const sentiment = Math.min(c.negativeSentimentTickets / 3, 1);
  const adoption = 1 - Math.min(c.featureAdoptionPct / 100, 1);

  const raw =
    recency * w.recency +
    usage * w.usage +
    payment * w.payment +
    support * w.support +
    sentiment * w.sentiment +
    adoption * w.adoption;

  // logistic squash centered so raw=0.5 lands near 50%
  const prob = 1 / (1 + Math.exp(-8 * (raw - 0.5)));

  return {
    prob,
    factors: [
      { key: "Days since login", value: c.daysSinceLogin, contribution: recency * w.recency },
      { key: "Login frequency", value: `${c.loginsLast30}/30d`, contribution: usage * w.usage },
      { key: "Payment failures", value: c.paymentFailures90d, contribution: payment * w.payment },
      { key: "Support tickets", value: c.supportTickets90d, contribution: support * w.support },
      { key: "Negative sentiment", value: c.negativeSentimentTickets, contribution: sentiment * w.sentiment },
      { key: "Feature adoption", value: `${c.featureAdoptionPct}%`, contribution: adoption * w.adoption },
    ].sort((a, b) => b.contribution - a.contribution),
  };
}

function emptyCustomer() {
  return {
    id: `C-${Math.floor(1000 + Math.random() * 9000)}`,
    name: "",
    plan: "Starter",
    tenureMonths: 6,
    loginsLast30: 10,
    daysSinceLogin: 5,
    paymentFailures90d: 0,
    supportTickets90d: 0,
    negativeSentimentTickets: 0,
    featureAdoptionPct: 50,
    history: [30, 30, 30, 30, 30],
  };
}

function tierFor(prob) {
  if (prob >= 0.66) return { label: "Critical", color: "#f0616d", glow: "rgba(240,97,109,0.18)" };
  if (prob >= 0.35) return { label: "Watch", color: "#f0b429", glow: "rgba(240,180,41,0.16)" };
  return { label: "Stable", color: "#4fd1a5", glow: "rgba(79,209,165,0.14)" };
}

const FONT_DISPLAY = "'Space Grotesk', sans-serif";
const FONT_BODY = "'Inter', sans-serif";
const FONT_MONO = "'IBM Plex Mono', monospace";

const styles = {
  page: {
    minHeight: "100vh",
    background: "#12161d",
    color: "#e8ecf1",
    fontFamily: FONT_BODY,
    padding: "48px 24px 80px",
  },
  container: { maxWidth: 960, margin: "0 auto" },
  eyebrow: {
    fontFamily: FONT_MONO,
    fontSize: 12,
    letterSpacing: "0.14em",
    color: "#6c7789",
    textTransform: "uppercase",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  h1: {
    fontFamily: FONT_DISPLAY,
    fontSize: 40,
    fontWeight: 600,
    margin: "10px 0 6px",
    letterSpacing: "-0.01em",
  },
  sub: { color: "#8b95a5", fontSize: 15, maxWidth: 560, lineHeight: 1.55 },
};

function Gauge({ prob }) {
  const tier = tierFor(prob);
  const pct = Math.round(prob * 100);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference * (1 - prob);
  return (
    <div style={{ position: "relative", width: 132, height: 132 }}>
      <svg width={132} height={132} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={66} cy={66} r={54} stroke="#232a35" strokeWidth={10} fill="none" />
        <circle
          cx={66}
          cy={66}
          r={54}
          stroke={tier.color}
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.6s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontFamily: FONT_MONO, fontSize: 26, fontWeight: 600, color: tier.color }}>{pct}%</div>
        <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "#6c7789", textTransform: "uppercase" }}>
          risk
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "#12161d",
  border: "1px solid #2a3240",
  borderRadius: 7,
  color: "#e8ecf1",
  padding: "7px 9px",
  fontSize: 13,
  fontFamily: FONT_BODY,
  outline: "none",
  boxSizing: "border-box",
};

const fieldLabelStyle = {
  fontSize: 11,
  color: "#6c7789",
  marginBottom: 4,
  display: "block",
  fontFamily: FONT_MONO,
  letterSpacing: "0.03em",
};

function EditFields({ draft, setDraft }) {
  const field = (label, key, opts = {}) => (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      {opts.select ? (
        <select
          style={inputStyle}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        >
          {opts.select.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          style={inputStyle}
          type={opts.type || "number"}
          value={draft[key]}
          onChange={(e) =>
            setDraft({
              ...draft,
              [key]: opts.type === "text" ? e.target.value : Number(e.target.value),
            })
          }
        />
      )}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 4 }}>
      {field("Account name", "name", { type: "text" })}
      {field("Plan", "plan", { select: ["Starter", "Growth", "Enterprise"] })}
      {field("Tenure (months)", "tenureMonths")}
      {field("Logins / 30d", "loginsLast30")}
      {field("Days since login", "daysSinceLogin")}
      {field("Payment failures (90d)", "paymentFailures90d")}
      {field("Support tickets (90d)", "supportTickets90d")}
      {field("Negative sentiment tickets", "negativeSentimentTickets")}
      {field("Feature adoption %", "featureAdoptionPct")}
    </div>
  );
}

function CustomerRow({ c, weights, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c);
  const { prob, factors } = useMemo(() => scoreCustomer(c, weights), [c, weights]);
  const tier = tierFor(prob);
  const trendUp = c.history[c.history.length - 1] > c.history[0];

  const sparkData = c.history.map((v, i) => ({ i, v }));

  return (
    <div
      style={{
        background: "#171d26",
        border: "1px solid #232a35",
        borderRadius: 12,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 18px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: tier.color,
              boxShadow: `0 0 0 5px ${tier.glow}`,
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600 }}>{c.name}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: "#6c7789" }}>
              {c.id} · {c.plan} · {c.tenureMonths}mo tenure
            </div>
          </div>
        </div>

        <div style={{ width: 90, height: 34, flexShrink: 0, display: "none" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 18, flexShrink: 0 }}>
          <div style={{ width: 100, height: 32 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData}>
                <defs>
                  <linearGradient id={`grad-${c.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={tier.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={tier.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={tier.color} strokeWidth={1.5} fill={`url(#grad-${c.id})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 13,
              color: tier.color,
              background: tier.glow,
              padding: "4px 10px",
              borderRadius: 999,
              display: "flex",
              alignItems: "center",
              gap: 5,
              whiteSpace: "nowrap",
            }}
          >
  {trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.round(prob * 100)}% · {tier.label}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setDraft(c);
                setEditing(!editing);
                setOpen(true);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 7,
                background: editing ? "#232a35" : "transparent",
                cursor: "pointer",
              }}
              title="Edit account"
            >
              <Pencil size={14} color="#8b95a5" />
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 7,
                cursor: "pointer",
              }}
              title="Remove account"
            >
              <Trash2 size={14} color="#8b95a5" />
            </span>
          </div>

          {open ? <ChevronUp size={18} color="#6c7789" /> : <ChevronDown size={18} color="#6c7789" />}
        </div>
      </button>

      {open && editing && (
        <div style={{ padding: "0 18px 18px", borderTop: "1px solid #1e2530" }}>
          <div style={{ paddingTop: 16 }}>
            <EditFields draft={draft} setDraft={setDraft} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                onClick={() => {
                  onUpdate(draft);
                  setEditing(false);
                }}
                style={{
                  background: "#4fd1a5",
                  color: "#0e1913",
                  border: "none",
                  borderRadius: 7,
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Save changes
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{
                  background: "transparent",
                  color: "#8b95a5",
                  border: "1px solid #2a3240",
                  borderRadius: 7,
                  padding: "8px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {open && !editing && (
        <div style={{ padding: "0 18px 18px", display: "flex", gap: 24, borderTop: "1px solid #1e2530" }}>
          <div style={{ paddingTop: 16 }}>
            <Gauge prob={prob} />
          </div>
          <div style={{ flex: 1, paddingTop: 16 }}>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "#6c7789",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Signal breakdown
            </div>
            {factors.map((f) => (
              <div
                key={f.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 8,
                  fontSize: 13,
                }}
              >
                <div style={{ width: 140, color: "#c4cad4", flexShrink: 0 }}>{f.key}</div>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    background: "#232a35",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(f.contribution * 400, 100)}%`,
                      height: "100%",
                      background: tier.color,
                      borderRadius: 999,
                    }}
                  />
                </div>
                <div style={{ width: 56, textAlign: "right", fontFamily: FONT_MONO, fontSize: 12, color: "#8b95a5" }}>
                  {f.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WeightPanel({ weights, setWeights }) {
  const [open, setOpen] = useState(false);
  const normalized = normalizedWeights(weights);

  return (
    <div
      style={{
        background: "#171d26",
        border: "1px solid #232a35",
        borderRadius: 12,
        marginBottom: 24,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 600 }}>Model weights</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setWeights(DEFAULT_WEIGHTS);
            }}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6c7789", cursor: "pointer" }}
          >
            <RotateCcw size={12} /> reset
          </span>
          {open ? <ChevronUp size={16} color="#6c7789" /> : <ChevronDown size={16} color="#6c7789" />}
        </div>
      </button>
      {open && (
        <div style={{ padding: "4px 18px 18px" }}>
          {Object.keys(weights).map((key) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                <span style={{ color: "#c4cad4" }}>{WEIGHT_LABELS[key]}</span>
                <span style={{ fontFamily: FONT_MONO, color: "#8b95a5" }}>
                  {Math.round(normalized[key] * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                value={weights[key]}
                onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })}
                style={{ width: "100%", accentColor: "#5b8def" }}
              />
            </div>
          ))}
          <div style={{ fontSize: 12, color: "#6c7789", marginTop: 4 }}>
            Sliders are relative weight, not raw %; all six are renormalized to sum to 100% before scoring.
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChurnRadar() {
  const [customers, setCustomers] = useState(CUSTOMERS);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyCustomer());

  const scored = useMemo(
    () => customers.map((c) => ({ c, ...scoreCustomer(c, weights) })).sort((a, b) => b.prob - a.prob),
    [customers, weights]
  );

  function updateCustomer(updated) {
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? { ...updated } : c)));
  }

  function deleteCustomer(id) {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  }

  function addCustomer() {
    if (!draft.name.trim()) return;
    setCustomers((prev) => [...prev, draft]);
    setDraft(emptyCustomer());
    setAdding(false);
  }

  const critical = scored.filter((s) => s.prob >= 0.66).length;
  const watch = scored.filter((s) => s.prob >= 0.35 && s.prob < 0.66).length;
  const stable = scored.length - critical - watch;
  const avgRisk = Math.round((scored.reduce((sum, s) => sum + s.prob, 0) / scored.length) * 100);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.eyebrow}>
          <Radio size={13} /> Churn Radar — standalone  model
        </div>
        <h1 style={styles.h1}>Portfolio churn risk</h1>
        <p style={styles.sub}>
          A weighted, transparent scoring model over login recency, payment health, support activity, and feature
          adoption.every score decomposes into the signals that produced it.
        </p>

        {/* Portfolio summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            margin: "32px 0 28px",
          }}
        >
          {[
            { label: "Avg. risk", value: `${avgRisk}%`, color: "#e8ecf1" },
            { label: "Critical", value: critical, color: "#f0616d" },
            { label: "Watch", value: watch, color: "#f0b429" },
            { label: "Stable", value: stable, color: "#4fd1a5" },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: "#171d26",
                border: "1px solid #232a35",
                borderRadius: 12,
                padding: "16px 18px",
              }}
            >
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: "#6c7789", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {s.label}
              </div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 600, color: s.color, marginTop: 4 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {critical > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(240,97,109,0.08)",
              border: "1px solid rgba(240,97,109,0.25)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 24,
              fontSize: 13,
              color: "#f0919a",
            }}
          >
            <AlertTriangle size={16} />
            {critical} account{critical > 1 ? "s" : ""} above the critical threshold — worth a retention touch this week.
          </div>
        )}

        <WeightPanel weights={weights} setWeights={setWeights} />

        {/* Customer list */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              letterSpacing: "0.08em",
              color: "#6c7789",
              textTransform: "uppercase",
            }}
          >
            Accounts, ranked by risk ({scored.length})
          </div>
          <span
            role="button"
            tabIndex={0}
            onClick={() => {
              setDraft(emptyCustomer());
              setAdding(!adding);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#5b8def",
              cursor: "pointer",
              fontFamily: FONT_MONO,
            }}
          >
            {adding ? <X size={13} /> : <Plus size={13} />}
            {adding ? "cancel" : "add account"}
          </span>
        </div>

        {adding && (
          <div
            style={{
              background: "#171d26",
              border: "1px solid #232a35",
              borderRadius: 12,
              padding: 18,
              marginBottom: 14,
            }}
          >
            <EditFields draft={draft} setDraft={setDraft} />
            <button
              onClick={addCustomer}
              disabled={!draft.name.trim()}
              style={{
                background: draft.name.trim() ? "#5b8def" : "#2a3240",
                color: draft.name.trim() ? "#0d1420" : "#6c7789",
                border: "none",
                borderRadius: 7,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: draft.name.trim() ? "pointer" : "not-allowed",
                marginTop: 10,
              }}
            >
              Add account
            </button>
          </div>
        )}

        {scored.map(({ c }) => (
          <CustomerRow key={c.id} c={c} weights={weights} onUpdate={updateCustomer} onDelete={deleteCustomer} />
        ))}

        {scored.length === 0 && (
          <div style={{ color: "#6c7789", fontSize: 13, padding: "20px 0" }}>
            No accounts yet — add one above to see it scored.
          </div>
        )}

        <div
          style={{
            marginTop: 32,
            padding: "18px 20px",
            background: "#171d26",
            border: "1px solid #232a35",
            borderRadius: 12,
            fontSize: 13,
            color: "#8b95a5",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "#c4cad4" }}>How the score is built:</strong> six signals are normalized to 0–1,
          multiplied by the weights above, summed, then passed through a logistic curve so the result reads as a
          probability. Adjust the sliders to see how sensitive the ranking is to each signal, or add/edit accounts
          to test edge cases. 
        </div>
      </div>
    </div>
  );
}
