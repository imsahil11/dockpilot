import { Loader2 } from "lucide-react";
import { FC } from "react";

export const Spinner: FC<{ className?: string }> = ({ className }) => {
  return <Loader2 className={`h-5 w-5 animate-spin text-indigo-400 ${className ?? ""}`} />;
};
