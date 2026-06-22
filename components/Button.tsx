"use client";

export interface AppButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  type?: "submit" | "button";
  disabled?: boolean;
  onClick?: () => void;
  leadingIcon?: React.ReactNode;
}

export function Button({
  children,
  variant = "primary",
  type = "button",
  disabled = false,
  onClick,
  leadingIcon,
}: AppButtonProps) {
  const base =
    "inline-flex items-center justify-center px-4 py-2 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const cls =
    variant === "primary"
      ? base + " bg-primary-600 text-white hover:bg-primary-700"
      : base +
        " bg-surface text-primary-600 border border-primary-600 hover:bg-primary-50";
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={cls}>
      {leadingIcon ? <span className="mr-1.5">{leadingIcon}</span> : null}
      {children}
    </button>
  );
}
