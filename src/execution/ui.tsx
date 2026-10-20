import { useEffect, useRef, type ReactNode } from "react";
import { X, Plus, ArrowRight } from "lucide-react";
export function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={secondary ? "btn secondary" : "btn"}
    >
      {children}
    </button>
  );
}
export function Section({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"section " + className}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">
        <Plus size={22} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <div className={"field " + (wide ? "wide" : "")}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function TextArea({
  label,
  value,
  onChange,
  hint,
  required = false,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  required?: boolean;
  rows?: number;
}) {
  return (
    <Field label={label} hint={hint} wide>
      <textarea
        aria-label={label}
        rows={rows}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
export function Input({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
  step,
  required = false,
  hint,
}: {
  label: string;
  value: string | number | null;
  onChange: (v: string) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        aria-label={label}
        type={type}
        min={min}
        max={max}
        step={step}
        required={required}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </Field>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button className="icon" aria-label="关闭窗口" onClick={onClose}>
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function LinkButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="link" onClick={onClick}>
      {children}
      <ArrowRight size={16} />
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export const numberValue = (v: string) => (v === "" ? null : Number(v));
export const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
