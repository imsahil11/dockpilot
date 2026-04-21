import clsx from "clsx";
import { ButtonHTMLAttributes, FC } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
}

export const Button: FC<ButtonProps> = ({
  className,
  variant = "primary",
  loading = false,
  children,
  disabled,
  ...props
}) => {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-indigo-600 text-white hover:bg-indigo-500",
        variant === "secondary" && "bg-[#1e1e35] text-[#f0f0ff] hover:bg-[#2a2a4a]",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-500",
        variant === "ghost" && "bg-transparent text-[#a0a0c0] hover:bg-[#1e1e35]",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? "Loading..." : children}
    </button>
  );
};
