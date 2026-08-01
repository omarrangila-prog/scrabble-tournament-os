"use client";

/**
 * Premium Championship Glass — shared interface primitives.
 *
 * Every screen composes from these, so spacing, radii, glass treatment, motion
 * and status colouring stay identical product-wide. All values resolve through
 * the token layer in `globals.css`, so the same components serve light mode,
 * dark mode and print without conditional styling.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Search, X } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  variant = "glass",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /** `data` drops the backdrop blur — use it behind dense tables. */
  variant?: "glass" | "flat" | "raised" | "strong" | "data";
}) {
  return (
    <div
      className={cn(
        "rounded-card transition-shadow duration-200",
        variant === "glass" && "glass",
        variant === "flat" && "glass-flat",
        variant === "raised" && "glass-raised",
        variant === "strong" && "glass-strong",
        variant === "data" && "glass-data",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 p-5 pb-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-control bg-gradient-to-br from-primary-050 to-secondary-050 text-primary">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-bold tracking-[-0.015em] text-ink">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-[13px] leading-snug text-muted">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "outline" | "gold";
  size?: "sm" | "md" | "lg" | "xl";
  icon?: React.ReactNode;
  loading?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", icon, loading, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-control font-semibold",
        "transition-all duration-[120ms] ease-out",
        "disabled:cursor-not-allowed disabled:opacity-55",
        "active:scale-[0.985]",
        size === "sm" && "h-9 px-3.5 text-[13px]",
        size === "md" && "h-11 px-4.5 text-[14px]",
        size === "lg" && "h-12 px-6 text-[15px]",
        size === "xl" && "h-14 px-8 text-[16px]",
        variant === "primary" &&
          "bg-gradient-to-b from-primary to-primary-600 text-white shadow-[0_1px_0_rgba(255,255,255,0.28)_inset,0_10px_24px_rgba(115,87,246,0.32)] hover:brightness-[1.06] hover:shadow-[0_1px_0_rgba(255,255,255,0.28)_inset,0_14px_30px_rgba(115,87,246,0.4)]",
        variant === "secondary" &&
          "border border-[rgb(var(--glass-border))] bg-[rgb(var(--glass-bg))] text-ink shadow-[var(--shadow-glass-sm)] backdrop-blur-md hover:bg-[rgb(var(--glass-bg-strong))]",
        variant === "outline" &&
          "border border-line-strong bg-transparent text-primary-600 hover:bg-primary-050",
        variant === "ghost" && "text-muted hover:bg-[rgb(var(--c-surface-soft))] hover:text-ink",
        variant === "danger" &&
          "bg-gradient-to-b from-critical to-[#d8425f] text-white shadow-[0_10px_24px_rgba(234,85,114,0.3)] hover:brightness-[1.06]",
        variant === "success" &&
          "bg-gradient-to-b from-success to-[#189a6b] text-white shadow-[0_10px_24px_rgba(32,185,130,0.3)] hover:brightness-[1.06]",
        variant === "gold" &&
          "bg-gradient-to-b from-[#F0BE5C] to-gold text-[#4A3208] shadow-[0_10px_24px_rgba(230,169,61,0.32)] hover:brightness-[1.05]",
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/* Badge — status never relies on colour alone                                 */
/* -------------------------------------------------------------------------- */

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
  pulse,
}: {
  tone?: "neutral" | "primary" | "success" | "warning" | "critical" | "info" | "gold";
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold",
        tone === "neutral" && "bg-[rgb(var(--c-line))] text-muted",
        tone === "primary" && "bg-primary-050 text-primary-600",
        tone === "success" && "bg-success-050 text-[#12855c]",
        tone === "warning" && "bg-warning-050 text-[#a76d16]",
        tone === "critical" && "bg-critical-050 text-[#c33450]",
        tone === "info" && "bg-info-050 text-[#2668c9]",
        tone === "gold" && "bg-gold-050 text-[#9c6f14]",
        className,
      )}
    >
      {dot ? (
        <span className={cn("size-1.5 shrink-0 rounded-full bg-current", pulse && "pulse-dot")} />
      ) : null}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-11 w-full rounded-control border bg-[rgb(var(--c-surface-strong))] px-3.5 text-[14px] text-ink",
        "placeholder:text-faint transition-all duration-150",
        "focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/12",
        invalid ? "border-critical bg-critical-050/40" : "border-line",
        className,
      )}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-11 w-full appearance-none rounded-control border border-line bg-[rgb(var(--c-surface-strong))] pl-3.5 pr-9 text-[14px] text-ink",
          "transition-all duration-150 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/12",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
    </div>
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-control border border-line bg-[rgb(var(--c-surface-strong))] px-3.5 py-2.5 text-[14px] text-ink",
        "placeholder:text-faint transition-all duration-150",
        "focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/12",
        className,
      )}
      {...props}
    />
  );
});

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink">
        {label}
        {required ? <span className="text-critical">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] font-medium text-critical">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        type="search"
      />
      {value ? (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-faint transition-colors hover:bg-[rgb(var(--c-line))] hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toggle                                                                      */
/* -------------------------------------------------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-ink">{label}</p>
        {description ? <p className="mt-0.5 text-[12.5px] text-muted">{description}</p> : null}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50",
          checked
            ? "bg-gradient-to-r from-primary to-secondary shadow-[0_4px_12px_rgba(115,87,246,0.34)]"
            : "bg-[rgb(var(--c-line-strong))]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-1 overflow-x-auto rounded-compact border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-soft))] p-1 backdrop-blur-md scroll-slim",
        className,
      )}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13.5px] font-semibold transition-all duration-150",
            value === t.id
              ? "bg-[rgb(var(--c-surface-strong))] text-ink shadow-[0_2px_10px_rgba(39,48,92,0.1)]"
              : "text-muted hover:bg-[rgb(var(--c-surface))] hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined ? (
            <span
              className={cn(
                "num rounded-full px-1.5 py-0.5 text-[11px]",
                value === t.id ? "bg-primary-050 text-primary-600" : "bg-[rgb(var(--c-line))] text-muted",
              )}
            >
              {t.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Drawer                                                                      */
/* -------------------------------------------------------------------------- */

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "md" | "lg" | "xl";
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-[rgb(18_23_42/0.32)] backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden
        style={{ animation: "tos-fade 240ms ease-out" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Details"}
        className={cn(
          "relative flex h-full w-full flex-col border-l border-[rgb(var(--glass-border))]",
          "bg-[rgb(var(--c-surface-strong))] shadow-[var(--sh-float)] backdrop-blur-2xl",
          width === "md" && "sm:max-w-[540px]",
          width === "lg" && "sm:max-w-[700px]",
          width === "xl" && "sm:max-w-[880px]",
        )}
        style={{ animation: "tos-drawer 240ms cubic-bezier(0.22,1,0.36,1)" }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-bold tracking-[-0.02em] text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-muted transition-colors hover:bg-[rgb(var(--c-line))] hover:text-ink"
          >
            <X className="size-4.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 scroll-slim">{children}</div>
        {footer ? (
          <div className="border-t border-line bg-[rgb(var(--c-surface-soft))] px-6 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
      <style>{`
        @keyframes tos-drawer{from{transform:translateX(28px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes tos-fade{from{opacity:0}to{opacity:1}}
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                       */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-[rgb(18_23_42/0.34)] backdrop-blur-[4px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-feature",
          "border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-strong))]",
          "shadow-[var(--sh-float)] backdrop-blur-2xl",
          size === "sm" && "max-w-md",
          size === "md" && "max-w-2xl",
          size === "lg" && "max-w-4xl",
        )}
        style={{ animation: "tos-modal 260ms cubic-bezier(0.22,1,0.36,1)" }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold tracking-[-0.02em] text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-muted transition-colors hover:bg-[rgb(var(--c-line))] hover:text-ink"
          >
            <X className="size-4.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 scroll-slim">{children}</div>
        {footer ? (
          <div className="border-t border-line bg-[rgb(var(--c-surface-soft))] px-6 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
      <style>{`@keyframes tos-modal{from{transform:translateY(10px) scale(.985);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}`}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="board-motif flex flex-col items-center justify-center rounded-card px-6 py-14 text-center">
      {icon ? (
        <span className="mb-3 grid size-14 place-items-center rounded-feature bg-gradient-to-br from-primary-050 to-secondary-050 text-primary shadow-[var(--shadow-glass-sm)]">
          {icon}
        </span>
      ) : null}
      <p className="text-[15.5px] font-bold text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[13.5px] leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-compact bg-gradient-to-r from-[rgb(var(--c-line))] via-[rgb(var(--c-line-strong))] to-[rgb(var(--c-line))]",
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                      */
/* -------------------------------------------------------------------------- */

export function Avatar({
  initials,
  hue,
  size = 36,
  className,
}: {
  initials: string;
  hue: number;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold ring-2 ring-white/70",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(140deg, hsl(${hue} 80% 93%), hsl(${(hue + 42) % 360} 78% 85%))`,
        color: `hsl(${hue} 58% 30%)`,
        boxShadow: "0 2px 8px rgba(39,48,92,0.1)",
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Metric tile                                                                 */
/* -------------------------------------------------------------------------- */

export function Stat({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "critical" | "info" | "gold";
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "glass group flex w-full items-start gap-3 rounded-card p-4 text-left transition-all duration-200",
        onClick && "hover:-translate-y-0.5 hover:shadow-[var(--sh-card-hover)]",
      )}
    >
      {icon ? (
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-control",
            tone === "neutral" && "bg-gradient-to-br from-[rgb(var(--c-line))] to-transparent text-muted",
            tone === "primary" && "bg-gradient-to-br from-primary-050 to-secondary-050 text-primary",
            tone === "success" && "bg-gradient-to-br from-success-050 to-cyan-050 text-[#12855c]",
            tone === "warning" && "bg-gradient-to-br from-warning-050 to-gold-050 text-[#a76d16]",
            tone === "critical" && "bg-gradient-to-br from-critical-050 to-warning-050 text-[#c33450]",
            tone === "info" && "bg-gradient-to-br from-info-050 to-cyan-050 text-[#2668c9]",
            tone === "gold" && "bg-gradient-to-br from-gold-050 to-warning-050 text-[#9c6f14]",
          )}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-muted">{label}</p>
        <p className="num mt-0.5 text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-ink">
          {value}
        </p>
        {sub ? <p className="mt-0.5 text-[12px] text-muted">{sub}</p> : null}
      </div>
    </Comp>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                    */
/* -------------------------------------------------------------------------- */

export function Progress({
  value,
  tone = "primary",
  className,
  label,
}: {
  value: number;
  tone?: "primary" | "success" | "warning" | "critical";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--c-line))]", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          tone === "primary" && "bg-gradient-to-r from-primary to-secondary",
          tone === "success" && "bg-gradient-to-r from-success to-cyan",
          tone === "warning" && "bg-gradient-to-r from-warning to-gold",
          tone === "critical" && "bg-gradient-to-r from-critical to-peach",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Table shell — horizontal scroll is contained, never on the page body        */
/* -------------------------------------------------------------------------- */

export function TableWrap({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full overflow-x-auto scroll-slim", className)}>
      <table className="w-full min-w-[720px] border-collapse text-left">{children}</table>
    </div>
  );
}

export function Th({ children, className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 whitespace-nowrap border-b border-line bg-[rgb(var(--c-surface-strong))] px-3 py-3",
        "text-[11.5px] font-bold uppercase tracking-[0.05em] text-muted",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("border-b border-line px-3 py-2.5 text-[13.5px] text-ink", className)}
      {...props}
    >
      {children}
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/* Page header                                                                 */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  subtitle,
  actions,
  badge,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[24px] font-extrabold tracking-[-0.03em] text-ink sm:text-[32px]">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle ? (
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
