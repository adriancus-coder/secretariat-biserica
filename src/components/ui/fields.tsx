import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, className, children }: FieldProps) {
  return (
    <div className={cx("field", className)}>
      {label ? <label htmlFor={htmlFor}>{label}</label> : null}
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
      {error ? (
        <div className="field-error" id={htmlFor ? `${htmlFor}-err` : undefined} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

type BaseProps = {
  name: string;
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  className?: string;
};

export function TextField({
  name,
  label,
  error,
  hint,
  className,
  id,
  ...rest
}: BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, "name">) {
  const fid = id ?? `f-${name}`;
  return (
    <Field label={label} htmlFor={fid} error={error} hint={hint} className={className}>
      <input
        id={fid}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-err` : undefined}
        {...rest}
      />
    </Field>
  );
}

export function TextAreaField({
  name,
  label,
  error,
  hint,
  className,
  id,
  ...rest
}: BaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const fid = id ?? `f-${name}`;
  return (
    <Field label={label} htmlFor={fid} error={error} hint={hint} className={className}>
      <textarea
        id={fid}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-err` : undefined}
        {...rest}
      />
    </Field>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function SelectField({
  name,
  label,
  error,
  hint,
  className,
  id,
  options,
  emptyLabel,
  ...rest
}: BaseProps & { options: Option[]; emptyLabel?: string } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  const fid = id ?? `f-${name}`;
  return (
    <Field label={label} htmlFor={fid} error={error} hint={hint} className={className}>
      <select
        id={fid}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-err` : undefined}
        {...rest}
      >
        {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Opțiunile unui nomenclator, păstrând și valoarea curentă dacă între timp a fost scoasă din listă. */
export function nomenOptions(values: readonly string[], current?: string | null): Option[] {
  const list = [...values];
  if (current && !list.includes(current)) list.push(current);
  return list.map((v) => ({ value: v, label: v }));
}
