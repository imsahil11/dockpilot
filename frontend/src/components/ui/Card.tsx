import clsx from "clsx";
import { FC, HTMLAttributes } from "react";

export const Card: FC<HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => {
  return <div className={clsx("rounded-xl border border-[#2a2a4a] bg-[#161625]", className)} {...props} />;
};
