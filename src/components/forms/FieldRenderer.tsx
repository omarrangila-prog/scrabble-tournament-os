"use client";

import * as React from "react";
import { Upload } from "lucide-react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormField } from "@/lib/domain/events";
import { cn } from "@/lib/utils";

/**
 * Renders one registration-form field.
 *
 * Shared between the participant form and the director's form preview, so a
 * question always looks the same in both — a preview that renders differently
 * from the real thing is worse than no preview.
 */
export function FieldRenderer({
  field,
  value,
  error,
  onChange,
  onFile,
  fileName,
  fileError,
}: {
  field: FormField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  onFile: (name: string) => void;
  fileName: string | null;
  fileError?: string;
}) {
  const f = field;

  if (f.kind === "heading")
    return (
      <h2 className="border-b border-line pb-2 pt-2 text-[15px] font-bold text-ink">{f.label}</h2>
    );

  if (f.kind === "paragraph")
    return <p className="text-[13.5px] leading-relaxed text-muted">{f.label}</p>;

  if (f.kind === "consent")
    return (
      <label className="flex cursor-pointer items-start gap-3 rounded-compact bg-[rgb(var(--c-surface-soft))] p-3.5">
        <input
          type="checkbox"
          checked={value === "yes"}
          onChange={(e) => onChange(e.target.checked ? "yes" : "")}
          aria-invalid={!!error}
          className="mt-0.5 size-4.5 shrink-0 rounded-[5px] accent-[#7357F6]"
        />
        <span>
          <span className="block text-[13.5px] font-medium text-ink">{f.label}</span>
          {error ? <span className="mt-0.5 block text-[12px] text-critical">{error}</span> : null}
        </span>
      </label>
    );

  if (f.kind === "file")
    return (
      <Field label={f.label} hint={f.hint} error={fileError}>
        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-control border border-dashed px-4 py-4 transition-colors",
            fileError ? "border-critical bg-critical-050/40" : "border-line-strong hover:bg-[rgb(var(--c-surface-soft))]",
          )}
        >
          <input
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            aria-invalid={!!fileError}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file.name);
            }}
          />
          <Upload className="size-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            {fileName ? (
              <>
                <span className="block truncate text-[13.5px] font-semibold text-ink">
                  {fileName}
                </span>
                <span className="block text-[12px] text-[#12855c]">Attached — tap to replace</span>
              </>
            ) : (
              <>
                <span className="block text-[13.5px] font-semibold text-ink">
                  Choose a screenshot or photo
                </span>
                <span className="block text-[12px] text-muted">JPG, PNG or PDF</span>
              </>
            )}
          </span>
        </label>
      </Field>
    );

  if (f.kind === "select")
    return (
      <Field label={f.label} hint={f.hint} error={error} required={f.required}>
        <Select value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error}>
          <option value="">Select…</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </Field>
    );

  if (f.kind === "radio")
    return (
      <Field label={f.label} hint={f.hint} error={error} required={f.required}>
        <div className="grid gap-2 sm:grid-cols-2">
          {(f.options ?? []).map((o) => (
            <label
              key={o}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-control border px-3.5 py-3 transition-colors",
                value === o
                  ? "border-primary bg-primary-050"
                  : "border-line bg-[rgb(var(--c-surface-strong))] hover:bg-[rgb(var(--c-surface-soft))]",
              )}
            >
              <input
                type="radio"
                name={f.id}
                checked={value === o}
                onChange={() => onChange(o)}
                className="size-4 accent-[#7357F6]"
              />
              <span className="text-[13.5px] text-ink">{o}</span>
            </label>
          ))}
        </div>
      </Field>
    );

  if (f.kind === "textarea")
    return (
      <Field label={f.label} hint={f.hint} error={error} required={f.required}>
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.placeholder}
          aria-invalid={!!error}
        />
      </Field>
    );

  const type =
    f.kind === "email" ? "email" : f.kind === "date" ? "date" : f.kind === "number" ? "number" : f.kind === "phone" ? "tel" : "text";

  return (
    <Field label={f.label} hint={f.hint} error={error} required={f.required}>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={f.placeholder}
        invalid={!!error}
      />
    </Field>
  );
}