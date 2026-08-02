"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Banknote,
  Check,
  HandCoins,
  Plus,
  Receipt,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  Stat,
  TableWrap,
  Tabs,
  Td,
  Th,
} from "@/components/ui";
import {
  selectActiveEvent,
  selectScopedRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import { useFinanceStore } from "@/lib/store/useFinanceStore";
import { useStore } from "@/lib/store/useStore";
import {
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  EXPENSE_CATEGORY_LABEL,
  expenseTotals,
  feeTotals,
  financePosition,
  IncomeSource,
  INCOME_SOURCE_LABEL,
  money,
  perPlayer,
} from "@/lib/engine/finance";
import { cn } from "@/lib/utils";

const CATEGORY_COLOURS = [
  "#7357F6",
  "#3987F8",
  "#55C9E8",
  "#E6A93D",
  "#8E7BF8",
  "#5FA8FA",
  "#7FD9EF",
  "#EFC272",
  "#B9AEFB",
];

const STATUS_TONE: Record<ExpenseStatus, "neutral" | "warning" | "success"> = {
  planned: "neutral",
  committed: "warning",
  paid: "success",
};

const STATUS_LABEL: Record<ExpenseStatus, string> = {
  planned: "Planned",
  committed: "Committed",
  paid: "Paid",
};

/**
 * Finance — where the money came from, where it went, and what is left.
 *
 * Entry-fee figures are derived from the registration records rather than
 * stored, so verifying a payment in the review queue changes this page.
 */
export default function FinancePage() {
  const events = useEventStore();
  const finance = useFinanceStore();
  const app = useStore();

  const event = selectActiveEvent(events);

  // Populate a demo ledger the first time this page is opened. Guarded by the
  // store's own `seeded` flag, so it runs exactly once per browser.
  const eventId = event?.id;
  const seeded = finance.seeded;
  React.useEffect(() => {
    if (eventId && !seeded) useFinanceStore.getState().seedDemo(eventId);
  }, [eventId, seeded]);

  const [tab, setTab] = React.useState("overview");
  const [expenseOpen, setExpenseOpen] = React.useState(false);
  const [incomeOpen, setIncomeOpen] = React.useState(false);

  if (!event) {
    return (
      <Card>
        <EmptyState title="No event" description="Create an event before tracking its finances." />
      </Card>
    );
  }

  const registrations = selectScopedRegistrations(events);
  const expenses = finance.expensesFor(event.id);
  const income = finance.incomeFor(event.id);

  const fees = feeTotals(registrations);
  const costs = expenseTotals(expenses);
  const position = financePosition(fees, costs, income);

  const payingHeads = registrations.filter(
    (r) => r.status !== "rejected" && r.paymentStatus !== "complimentary",
  ).length;
  const totalHeads = registrations.filter((r) => r.status !== "rejected").length;
  const per = perPlayer(position, payingHeads, totalHeads);

  const collectionRate =
    fees.expected > 0 ? Math.round((fees.collected / fees.expected) * 100) : 0;

  const flowData = [
    { name: "Collected", value: fees.collected },
    { name: "Pending", value: fees.pendingVerification },
    { name: "Unpaid", value: fees.outstanding },
    { name: "Sponsors", value: income.reduce((s, i) => s + i.amount, 0) },
    { name: "Spent", value: -costs.paid },
    { name: "Committed", value: -costs.committed },
    { name: "Planned", value: -costs.planned },
  ];

  return (
    <div>
      <PageHeader
        title="Finance"
        subtitle={`${event.name} · ${event.currency}`}
        badge={
          <Badge tone={position.projectedProfit >= 0 ? "success" : "critical"}>
            {position.projectedProfit >= 0 ? "Projected surplus" : "Projected loss"}
          </Badge>
        }
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" icon={<HandCoins className="size-4" />} onClick={() => setIncomeOpen(true)}>
              Add income
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setExpenseOpen(true)}>
              Add expense
            </Button>
          </div>
        }
      />

      {/* Headline ---------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="Cash in hand"
          value={money(position.cashInHand, event.currency)}
          sub="verified in, paid out"
          icon={<Wallet className="size-5" />}
          tone={position.cashInHand >= 0 ? "success" : "critical"}
        />
        <Stat
          label="Collected"
          value={money(fees.collected, event.currency)}
          sub={`${collectionRate}% of expected fees`}
          icon={<Banknote className="size-5" />}
          tone="primary"
        />
        <Stat
          label="Spent"
          value={money(costs.paid, event.currency)}
          sub={`${money(costs.committed, event.currency)} committed`}
          icon={<Receipt className="size-5" />}
          tone="warning"
        />
        <Stat
          label="Projected profit"
          value={money(position.projectedProfit, event.currency)}
          sub={`${position.margin}% margin`}
          icon={
            position.projectedProfit >= 0 ? (
              <TrendingUp className="size-5" />
            ) : (
              <TrendingDown className="size-5" />
            )
          }
          tone={position.projectedProfit >= 0 ? "success" : "critical"}
        />
        <Stat
          label="Worst case"
          value={money(position.worstCaseProfit, event.currency)}
          sub="nothing more collected"
          icon={<AlertTriangle className="size-5" />}
          tone={position.worstCaseProfit >= 0 ? "success" : "critical"}
        />
      </div>

      {position.breakEvenShortfall > 0 ? (
        <div className="mt-3 flex items-start gap-3 rounded-feature bg-warning-050 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-[#a76d16]" />
          <p className="text-[13px] leading-relaxed text-[#a76d16]">
            <strong className="font-semibold">
              {money(position.breakEvenShortfall, event.currency)} still to collect.
            </strong>{" "}
            Money in hand does not yet cover what has been paid and committed. There is{" "}
            {money(fees.outstanding, event.currency)} in unpaid fees and{" "}
            {money(fees.pendingVerification, event.currency)} awaiting verification.
          </p>
        </div>
      ) : null}

      <div className="mt-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "expenses", label: "Expenses", count: expenses.length },
            { id: "income", label: "Income", count: income.length },
          ]}
        />
      </div>

      {/* Overview ---------------------------------------------------------- */}
      {tab === "overview" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <CardHeader title="Money in and out" subtitle="Bars below the line are money going out" />
            <div className="h-[280px] px-3 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={flowData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "rgb(var(--c-muted))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "rgb(var(--c-muted))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${Math.round(Math.abs(v) / 1000)}k`}
                    width={38}
                  />
                  <Tooltip
                    formatter={(v) =>
                      [money(Math.abs(Number(v)), event.currency), ""] as [string, string]
                    }
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid rgb(var(--c-line))",
                      fontSize: 12.5,
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 6, 6]}>
                    {flowData.map((d, i) => (
                      <Cell key={i} fill={d.value >= 0 ? "#7357F6" : "#E6A93D"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="xl:col-span-5">
            <CardHeader title="Where the budget goes" subtitle={`${money(costs.budgeted, event.currency)} budgeted`} />
            <div className="px-5 pb-5">
              {costs.byCategory.length ? (
                <>
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={costs.byCategory}
                          dataKey="amount"
                          nameKey="category"
                          innerRadius={52}
                          outerRadius={80}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {costs.byCategory.map((_, i) => (
                            <Cell key={i} fill={CATEGORY_COLOURS[i % CATEGORY_COLOURS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v, n) =>
                            [
                              money(Number(v), event.currency),
                              EXPENSE_CATEGORY_LABEL[String(n) as ExpenseCategory],
                            ] as [string, string]
                          }
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid rgb(var(--c-line))",
                            fontSize: 12.5,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {costs.byCategory.map((c, i) => (
                      <li key={c.category} className="flex items-center gap-2.5 text-[12.5px]">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] }}
                        />
                        <span className="flex-1 text-ink">{EXPENSE_CATEGORY_LABEL[c.category]}</span>
                        <span className="num font-semibold text-muted">{c.share}%</span>
                        <span className="num w-[92px] text-right font-semibold text-ink">
                          {money(c.amount, event.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <EmptyState title="No expenses yet" description="Add the first expense to see the split." />
              )}
            </div>
          </Card>

          <Card className="xl:col-span-6">
            <CardHeader title="Fee collection" subtitle={`${payingHeads} paying entries`} />
            <div className="space-y-3 px-5 pb-5">
              <Progress value={collectionRate} tone="success" label="Fees collected" />
              <dl className="grid grid-cols-2 gap-2">
                {[
                  ["Collected", fees.collected, "success"],
                  ["Awaiting verification", fees.pendingVerification, "warning"],
                  ["Unpaid", fees.outstanding, "critical"],
                  ["Discounts given", fees.discountGiven, "neutral"],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-2.5">
                    <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                      {label as string}
                    </dt>
                    <dd className="num mt-0.5 text-[15px] font-bold text-ink">
                      {money(value as number, event.currency)}
                    </dd>
                  </div>
                ))}
              </dl>
              {fees.complimentaryCount > 0 ? (
                <p className="text-[12px] text-muted">
                  {fees.complimentaryCount} complimentary{" "}
                  {fees.complimentaryCount === 1 ? "entry is" : "entries are"} included as heads but
                  not as income.
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="xl:col-span-6">
            <CardHeader title="Per player" subtitle="What each entry earns and costs" />
            <div className="grid grid-cols-3 gap-2 px-5 pb-5">
              {[
                ["Revenue", per.revenuePerPlayer],
                ["Cost", per.costPerPlayer],
                ["Profit", per.profitPerPlayer],
              ].map(([label, value]) => (
                <div
                  key={label as string}
                  className="rounded-feature bg-[rgb(var(--c-surface-soft))] px-3 py-4 text-center"
                >
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                    {label as string}
                  </p>
                  <p
                    className={cn(
                      "num mt-1 text-[17px] font-extrabold",
                      label === "Profit" && (value as number) < 0 ? "text-critical" : "text-ink",
                    )}
                  >
                    {money(value as number, event.currency)}
                  </p>
                </div>
              ))}
              <p className="col-span-3 text-[12px] leading-relaxed text-muted">
                Revenue and profit are spread over {payingHeads} paying entries; cost is spread over
                all {totalHeads} players, because complimentary entries still consume catering,
                boards and prizes.
              </p>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Expenses ----------------------------------------------------------- */}
      {tab === "expenses" ? (
        <Card className="mt-4">
          <CardHeader
            title="Expenses"
            subtitle={`${money(costs.paid, event.currency)} paid · ${money(costs.committed, event.currency)} committed · ${money(costs.planned, event.currency)} planned`}
          />
          {expenses.length ? (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Description</Th>
                    <Th>Category</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Status</Th>
                    <Th>Authorised by</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <Td>
                        <span className="font-semibold text-ink">{e.description}</span>
                        {e.reference ? (
                          <span className="ml-2 num text-[11.5px] text-faint">{e.reference}</span>
                        ) : null}
                      </Td>
                      <Td>{EXPENSE_CATEGORY_LABEL[e.category]}</Td>
                      <Td className="num text-right font-semibold">
                        {money(e.amount, event.currency)}
                      </Td>
                      <Td>
                        <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                      </Td>
                      <Td className="text-muted">{e.paidBy ?? "—"}</Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          {e.status !== "paid" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<Check className="size-3.5" />}
                              onClick={() => {
                                finance.setExpenseStatus(e.id, "paid");
                                app.toast({
                                  title: "Marked as paid",
                                  description: `${e.description} — ${money(e.amount, event.currency)}`,
                                  tone: "success",
                                });
                              }}
                            >
                              Mark paid
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trash2 className="size-3.5" />}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete "${e.description}" (${money(e.amount, event.currency)})? This cannot be undone.`,
                                )
                              ) {
                                finance.removeExpense(e.id);
                                app.toast({
                                  title: "Expense deleted",
                                  description: e.description,
                                  tone: "info",
                                });
                              }
                            }}
                          />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <EmptyState title="No expenses" description="Record what the event is spending." />
          )}
        </Card>
      ) : null}

      {/* Income ------------------------------------------------------------- */}
      {tab === "income" ? (
        <Card className="mt-4">
          <CardHeader
            title="Other income"
            subtitle="Sponsorship, merchandise and anything outside the entry fee"
          />
          {income.length ? (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Description</Th>
                    <Th>Source</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {income.map((i) => (
                    <tr key={i.id}>
                      <Td className="font-semibold text-ink">{i.description}</Td>
                      <Td>{INCOME_SOURCE_LABEL[i.source]}</Td>
                      <Td className="num text-right font-semibold">
                        {money(i.amount, event.currency)}
                      </Td>
                      <Td>
                        <Badge tone={i.received ? "success" : "warning"}>
                          {i.received ? "Received" : "Pledged"}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => finance.toggleIncomeReceived(i.id)}
                          >
                            {i.received ? "Mark pledged" : "Mark received"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trash2 className="size-3.5" />}
                            onClick={() => {
                              if (window.confirm(`Delete "${i.description}"? This cannot be undone.`)) {
                                finance.removeIncome(i.id);
                              }
                            }}
                          />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <EmptyState title="No other income" description="Add sponsorship or merchandise income." />
          )}
        </Card>
      ) : null}

      <ExpenseModal
        open={expenseOpen}
        currency={event.currency}
        onClose={() => setExpenseOpen(false)}
        onSave={(draft) => {
          finance.addExpense({ ...draft, eventId: event.id });
          app.toast({
            title: "Expense recorded",
            description: `${draft.description} — ${money(draft.amount, event.currency)}`,
            tone: "success",
          });
          setExpenseOpen(false);
        }}
      />

      <IncomeModal
        open={incomeOpen}
        currency={event.currency}
        onClose={() => setIncomeOpen(false)}
        onSave={(draft) => {
          finance.addIncome({ ...draft, eventId: event.id });
          app.toast({ title: "Income recorded", description: draft.description, tone: "success" });
          setIncomeOpen(false);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ExpenseModal({
  open,
  currency,
  onClose,
  onSave,
}: {
  open: boolean;
  currency: string;
  onClose: () => void;
  onSave: (draft: Omit<Expense, "id" | "at" | "eventId">) => void;
}) {
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState<ExpenseCategory>("venue");
  const [amount, setAmount] = React.useState(0);
  const [status, setStatus] = React.useState<ExpenseStatus>("planned");
  const [paidBy, setPaidBy] = React.useState("Sir Hani");
  const [reference, setReference] = React.useState("");

  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setDescription("");
      setCategory("venue");
      setAmount(0);
      setStatus("planned");
      setReference("");
    }
  }

  const valid = description.trim().length > 1 && amount > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record an expense"
      subtitle="Planned spend can still be cancelled; committed spend cannot."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() =>
              onSave({
                description: description.trim(),
                category,
                amount,
                status,
                paidBy: paidBy.trim() || undefined,
                reference: reference.trim() || undefined,
              })
            }
          >
            Save expense
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Description" required>
          <Input
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Main hall hire, full day"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Amount (${currency})`} required>
            <Input
              type="number"
              className="num"
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            />
          </Field>
        </div>

        <Field label="Status" hint="Paid and committed both count against cash; planned does not.">
          <div className="grid grid-cols-3 gap-2">
            {(["planned", "committed", "paid"] as ExpenseStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-control border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                  status === s
                    ? "border-primary bg-primary-050 text-primary"
                    : "border-line bg-[rgb(var(--c-surface-strong))] text-muted hover:bg-[rgb(var(--c-surface-soft))]",
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Authorised by">
            <Input value={paidBy} onChange={(e) => setPaidBy(e.target.value)} />
          </Field>
          <Field label="Reference" hint="Invoice or PO number.">
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="INV-0000"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function IncomeModal({
  open,
  currency,
  onClose,
  onSave,
}: {
  open: boolean;
  currency: string;
  onClose: () => void;
  onSave: (draft: {
    source: IncomeSource;
    description: string;
    amount: number;
    received: boolean;
  }) => void;
}) {
  const [description, setDescription] = React.useState("");
  const [source, setSource] = React.useState<IncomeSource>("sponsorship");
  const [amount, setAmount] = React.useState(0);
  const [received, setReceived] = React.useState(false);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setDescription("");
      setSource("sponsorship");
      setAmount(0);
      setReceived(false);
    }
  }

  const valid = description.trim().length > 1 && amount > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record other income"
      subtitle="Pledged money is tracked but not counted as cash in hand."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => onSave({ description: description.trim(), source, amount, received })}
          >
            Save income
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Description" required>
          <Input
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Title sponsor"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Source">
            <Select value={source} onChange={(e) => setSource(e.target.value as IncomeSource)}>
              {(Object.keys(INCOME_SOURCE_LABEL) as IncomeSource[]).map((s) => (
                <option key={s} value={s}>
                  {INCOME_SOURCE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Amount (${currency})`} required>
            <Input
              type="number"
              className="num"
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            />
          </Field>
        </div>
        <Field label="Status">
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: false, label: "Pledged" },
              { v: true, label: "Received" },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setReceived(o.v)}
                className={cn(
                  "rounded-control border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                  received === o.v
                    ? "border-primary bg-primary-050 text-primary"
                    : "border-line bg-[rgb(var(--c-surface-strong))] text-muted hover:bg-[rgb(var(--c-surface-soft))]",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
