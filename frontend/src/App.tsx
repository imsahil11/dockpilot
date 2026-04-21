import { FC, Suspense, lazy, useEffect } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuthStore } from "@/store/authStore";

const LoginPage = lazy(() => import("@/pages/Login"));
const RegisterPage = lazy(() => import("@/pages/Register"));
const DashboardPage = lazy(() => import("@/pages/Dashboard"));
const TopologyPage = lazy(() => import("@/pages/Topology"));
const MonitorPage = lazy(() => import("@/pages/Monitor"));
const AIChatPage = lazy(() => import("@/pages/AIChat"));
const SecurityPage = lazy(() => import("@/pages/Security"));
const BuilderPage = lazy(() => import("@/pages/Builder"));
const HistoryPage = lazy(() => import("@/pages/History"));
const TerminalPage = lazy(() => import("@/pages/Terminal"));

const PageFallback: FC = () => (
  <div className="space-y-3">
    <Skeleton className="h-10 w-1/3" />
    <Skeleton className="h-56 w-full" />
    <Skeleton className="h-56 w-full" />
  </div>
);

const ProtectedShell: FC = () => {
  useRealtime();
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

const RequireAuth: FC<{ children: JSX.Element }> = ({ children }) => {
  const token = useAuthStore((state) => state.token);
  const initialized = useAuthStore((state) => state.initialized);

  if (!initialized) {
    return <PageFallback />;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const PublicOnly: FC<{ children: JSX.Element }> = ({ children }) => {
  const token = useAuthStore((state) => state.token);
  const initialized = useAuthStore((state) => state.initialized);

  if (!initialized) {
    return <PageFallback />;
  }

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const App: FC = () => {
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <RegisterPage />
            </PublicOnly>
          }
        />

        <Route
          path="/"
          element={
            <RequireAuth>
              <ProtectedShell />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="topology" element={<TopologyPage />} />
          <Route path="monitor" element={<MonitorPage />} />
          <Route path="ai-chat" element={<AIChatPage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="builder" element={<BuilderPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="terminal" element={<TerminalPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
};

export default App;
