"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CornerDownLeft, Info, Sparkles } from "lucide-react";
import { Badge, Button, Card, CardHeader, Input } from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import {
  answerQuestion,
  CopilotAnswer,
  SUGGESTED_QUESTIONS,
} from "@/lib/copilot/answer";
import { cn } from "@/lib/utils";

interface Entry {
  id: string;
  question: string;
  answer: CopilotAnswer;
}

/**
 * The Copilot answers from tournament data and always offers the director a
 * next action. It never issues rulings or changes results on its own.
 */
export function CopilotPanel({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const store = useStore();
  const [question, setQuestion] = React.useState("");
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [thinking, setThinking] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setQuestion("");
    setThinking(true);
    // Small delay so the answer reads as a considered response.
    window.setTimeout(() => {
      const answer = answerQuestion(q, {
        tournament: store.tournament,
        players: store.players,
        pairings: store.pairings,
        disputes: store.disputes,
        audit: store.audit,
      });
      setEntries((e) => [...e, { id: Math.random().toString(36).slice(2), question: q, answer }]);
      setThinking(false);
      window.setTimeout(
        () => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }),
        60,
      );
    }, 420);
  };

  return (
    <Card className="flex h-full flex-col" data-tour="copilot-panel">
      <CardHeader
        title="Tournament Copilot"
        subtitle="Answers come from this tournament's live data"
        icon={<Sparkles className="size-4.5" />}
        action={<Badge tone="primary">Guidance</Badge>}
      />

      <div
        ref={listRef}
        className={cn(
          "flex-1 space-y-3 overflow-y-auto px-5 scroll-slim",
          compact ? "max-h-[300px]" : "max-h-[520px] min-h-[320px]",
        )}
      >
        {entries.length === 0 ? (
          <div className="rounded-compact bg-[rgb(var(--c-surface-soft))] p-4">
            <p className="text-[13px] leading-relaxed text-muted">
              Ask about pending results, pairing conflicts, byes, rank movement or whether the
              next round can be generated safely.
            </p>
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {entries.map((e) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-compact rounded-br-[4px] bg-primary px-3.5 py-2 text-[13px] text-white">
                  {e.question}
                </p>
              </div>

              <div className="rounded-compact rounded-bl-[4px] border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface))] p-3.5">
                <p className="text-[13.5px] font-semibold leading-snug text-ink">
                  {e.answer.headline}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {e.answer.body.map((b, i) => (
                    <li key={i} className="text-[12.5px] leading-relaxed text-muted">
                      {b}
                    </li>
                  ))}
                </ul>

                {e.answer.references?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {e.answer.references.map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-warning-050 px-2 py-0.5 text-[11.5px] text-[#b4741f]"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {e.answer.actions.map((a) => (
                    <Button
                      key={a.label}
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (a.kind === "mark-resolved") {
                          store.toast({
                            title: "Marked as resolved",
                            description: "This item was cleared from the Copilot follow-up list.",
                            tone: "success",
                          });
                          return;
                        }
                        if (a.href) router.push(a.href);
                      }}
                    >
                      {a.label}
                      <ArrowRight className="size-3.5" />
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      store.toast({
                        title: "Marked as resolved",
                        description: "This item was cleared from the Copilot follow-up list.",
                        tone: "success",
                      })
                    }
                  >
                    Mark resolved
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {thinking ? (
          <div className="flex items-center gap-2 rounded-compact border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface))] px-3.5 py-2.5">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-primary"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </span>
            <span className="text-[12.5px] text-muted">Checking tournament data…</span>
          </div>
        ) : null}
      </div>

      <div className="border-t border-line p-3.5">
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 scroll-slim">
          {SUGGESTED_QUESTIONS.slice(0, compact ? 4 : 10).map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="shrink-0 rounded-full border border-line-strong bg-[rgb(var(--c-surface))] px-2.5 py-1 text-[11.5px] text-muted transition-colors hover:border-primary/30 hover:bg-primary-050 hover:text-primary-600"
            >
              {s}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="flex gap-2"
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about this tournament…"
            aria-label="Ask the Tournament Copilot"
          />
          <Button type="submit" variant="primary" disabled={!question.trim()}>
            <CornerDownLeft className="size-4" />
          </Button>
        </form>

        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-faint">
          <Info className="mt-px size-3 shrink-0" />
          Guidance only. The Tournament Director makes the final decision on every ruling and
          pairing.
        </p>
      </div>
    </Card>
  );
}
