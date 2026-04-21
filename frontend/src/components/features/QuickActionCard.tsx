import { LucideIcon } from "lucide-react";
import { FC } from "react";
import { Card } from "@/components/ui/Card";

interface QuickActionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick?: () => void;
}

export const QuickActionCard: FC<QuickActionCardProps> = ({ icon: Icon, title, description, onClick }) => {
  return (
    <Card
      className="cursor-pointer border-[#2a2a4a] bg-[#161625] p-4 transition-all hover:border-[#3a3a5a] hover:bg-[#1e1e35]"
      onClick={onClick}
    >
      <div className="mb-2 inline-flex rounded-lg bg-indigo-600/10 p-2 text-indigo-300">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-[#a0a0c0]">{description}</p>
    </Card>
  );
};
