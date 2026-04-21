import clsx from "clsx";
import { FC, HTMLAttributes } from "react";

export const Skeleton: FC<HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={clsx("animate-pulse rounded-lg bg-[#1e1e35]", className)} {...props} />
);
