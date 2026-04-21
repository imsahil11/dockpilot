import clsx from "clsx";
import { FC, HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "running" | "stopped" | "warning" | "info" | "critical";
}

export const Badge: FC<BadgeProps> = ({ tone = "info", className, ...props }) => {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        tone === "running" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
        tone === "stopped" && "border-red-500/20 bg-red-500/10 text-red-400",
        tone === "warning" && "border-amber-500/20 bg-amber-500/10 text-amber-400",
        tone === "critical" && "border-red-500/40 bg-red-500/20 text-red-300",
        tone === "info" && "border-blue-500/20 bg-blue-500/10 text-blue-400",
        className
      )}
      {...props}
    />
  );
};
