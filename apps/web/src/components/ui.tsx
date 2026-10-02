import type { ButtonHTMLAttributes, ComponentProps, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "dark" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-[0.96] active:brightness-90",
  dark: "bg-night text-white hover:bg-ink",
  secondary: "bg-panel text-ink ring-1 ring-inset ring-line-strong hover:ring-ink",
  ghost: "bg-transparent text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "bg-panel text-danger ring-1 ring-inset ring-line-strong hover:ring-danger",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center whitespace-nowrap rounded-[10px] font-medium transition-[background-color,box-shadow,filter,color] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

/** Square icon-only button; always pass an aria-label. */
export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { "aria-label": string }) {
  return (
    <button
      type="button"
      title={props["aria-label"]}
      className={cx("inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink [&_svg]:size-4", className)}
      {...props}
    />
  );
}

const field =
  "w-full rounded-lg border border-line-strong bg-panel px-3 text-sm text-ink placeholder:text-muted/70 transition-[border-color,box-shadow] focus:border-ink focus:outline-none focus:ring-4 focus:ring-accent/40 disabled:opacity-60";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(field, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(field, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(field, "h-9 pr-8 text-[13px]", className)} {...props} />;
}

export function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: ReactNode; error?: string | null; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

type Tone = "neutral" | "accent" | "pink" | "warn" | "danger" | "info" | "ink";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2 ring-line",
  accent: "bg-accent-soft text-[#1f5c12] ring-[#cfe9c6]",
  pink: "bg-pink-soft text-pink-deep ring-[#ffd3e3]",
  warn: "bg-warn-soft text-warn ring-[#f6dfae]",
  danger: "bg-danger-soft text-danger ring-[#f6c9c4]",
  info: "bg-info-soft text-info ring-[#d4dcff]",
  ink: "bg-night text-white ring-night",
};

export function Badge({ tone = "neutral", children, title, className }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px] font-medium leading-5 ring-1 ring-inset", TONES[tone], className)}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line-strong bg-panel px-1.5 font-mono text-[11px] leading-5 text-muted shadow-[0_1px_0_var(--color-line-strong)]">{children}</kbd>;
}

/** Segmented control: one of a few options, the selected one in ink. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "md",
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[10px] bg-sunken p-0.5 ring-1 ring-inset ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors [&_svg]:size-3.5",
            size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
            value === o.value ? "bg-panel text-ink shadow-[var(--shadow-soft)] ring-1 ring-line" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span aria-hidden className="grid size-10 place-items-center rounded-full bg-pink-soft font-pixel text-pink-deep ring-1 ring-[#ffd3e3]">
        ✳
      </span>
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {children ? <div className="max-w-xs text-[13px] leading-relaxed text-muted">{children}</div> : null}
      {action}
    </div>
  );
}

export const STATUS_LABEL = { open: "Open", in_progress: "In progress", resolved: "Resolved" } as const;
export const STATUS_TONE = { open: "pink", in_progress: "info", resolved: "neutral" } as const satisfies Record<string, Tone>;
export const PRIORITY_TONE = { low: "neutral", medium: "neutral", high: "warn", urgent: "danger" } as const satisfies Record<string, Tone>;
