import {
  Activity,
  Bell,
  Bot,
  FileCode,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Rocket,
  Shield,
  Terminal
} from "lucide-react";
import { FC, ReactNode, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAlertStore } from "@/store/alertStore";
import { useAuthStore } from "@/store/authStore";
import { useContainerStore } from "@/store/containerStore";

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Topology", to: "/topology", icon: Network },
  { label: "Monitor", to: "/monitor", icon: Activity },
  { label: "AI Agent", to: "/ai-chat", icon: Bot, badge: "AI" },
  { label: "Security", to: "/security", icon: Shield },
  { label: "Builder", to: "/builder", icon: FileCode },
  { label: "History", to: "/history", icon: History },
  { label: "Terminal", to: "/terminal", icon: Terminal }
];

const titleByPath: Record<string, string> = {
  "/dashboard": "Dashboard Overview",
  "/topology": "Topology Map",
  "/monitor": "Live Monitoring",
  "/ai-chat": "AI Agent",
  "/security": "Security Scanner",
  "/builder": "Dockerfile & Compose Builder",
  "/history": "Deployment History",
  "/terminal": "Browser Terminal"
};

export const Layout: FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const unresolvedCount = useAlertStore((state) => state.unresolvedCount);
  const containers = useContainerStore((state) => state.containers);
  const daemonConnected = useContainerStore((state) => state.daemonConnected);

  const runningCount = useMemo(
    () => containers.filter((container) => container.state.running).length,
    [containers]
  );

  const title = titleByPath[location.pathname] ?? "DockPilot";

  return (
    <div className="min-h-screen bg-transparent text-[#f0f0ff]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-[#2a2a4a] bg-[#0a0a0f] p-4 transition-transform lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center gap-3">
          <Rocket className="h-6 w-6 text-indigo-400" />
          <span className="text-xl font-semibold text-indigo-300">DockPilot</span>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  [
                    "group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all",
                    isActive
                      ? "border-l-2 border-indigo-500 bg-indigo-600/10 text-indigo-400"
                      : "text-[#a0a0c0] hover:border-l-2 hover:border-[#3a3a5a] hover:bg-[#161625]"
                  ].join(" ")
                }
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                {item.badge ? (
                  <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-indigo-300">
                    {item.badge}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        <div className="absolute bottom-4 left-4 right-4 space-y-3 rounded-xl border border-[#2a2a4a] bg-[#161625] p-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{user?.username ?? "Operator"}</p>
              <div className="flex items-center gap-2 text-xs text-[#a0a0c0]">
                <span className={`h-2 w-2 rounded-full ${daemonConnected ? "bg-emerald-400" : "bg-red-400"}`} />
                {daemonConnected ? "Docker connected" : "Docker disconnected"}
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] px-3 py-2 text-sm text-[#f0f0ff] hover:border-[#3a3a5a]"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      <div className="lg:ml-64">
        <header className="fixed left-0 right-0 top-0 z-30 border-b border-[#2a2a4a] bg-[#0f0f1a]/95 backdrop-blur lg:left-64">
          <div className="flex h-16 items-center justify-between px-4 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                className="rounded-lg border border-[#2a2a4a] p-2 text-[#a0a0c0] lg:hidden"
                onClick={() => setMobileOpen((value) => !value)}
              >
                <Menu className="h-4 w-4" />
              </button>
              <h1 className="text-base font-semibold text-[#f0f0ff] lg:text-lg">{title}</h1>
            </div>

            <div className="flex items-center gap-4">
              <span
                className={`hidden rounded-md border px-2 py-1 text-xs md:inline-flex ${
                  daemonConnected
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : "border-red-500/20 bg-red-500/10 text-red-400"
                }`}
              >
                {daemonConnected ? "Connected" : "Disconnected"}
              </span>

              <div className="hidden items-center gap-2 rounded-lg border border-[#2a2a4a] bg-[#161625] px-3 py-1.5 text-xs text-[#a0a0c0] md:flex">
                <span>Total: {containers.length}</span>
                <span className="text-emerald-400">Running: {runningCount}</span>
              </div>

              <div className="relative rounded-lg border border-[#2a2a4a] bg-[#161625] p-2">
                <Bell className="h-4 w-4 text-[#a0a0c0]" />
                {unresolvedCount > 0 ? (
                  <span className="absolute -right-2 -top-2 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                    {unresolvedCount}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 pb-6 pt-20 lg:px-8">{children}</main>
      </div>
    </div>
  );
};
