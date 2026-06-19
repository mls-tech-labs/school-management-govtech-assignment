"use client";
import { Button as AntdButton } from "antd";

export interface AppButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  type?: "submit" | "button";
  disabled?: boolean;
  onClick?: () => void;
  leadingIcon?: React.ReactNode;
}

/**
 * Shared button wrapper around the Ant Design (`antd`) `<Button>` primitive,
 * styled with Tailwind CSS utility classes (per Constitution v2.3.0).
 */
export function Button({
  children,
  variant = "primary",
  type = "button",
  disabled = false,
  onClick,
  leadingIcon,
}: AppButtonProps) {
  return (
    <AntdButton
      type={variant === "primary" ? "primary" : "default"}
      htmlType={type}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center"
    >
      {leadingIcon ? <span className="mr-1.5">{leadingIcon}</span> : null}
      {children}
    </AntdButton>
  );
}
