import { Routes, Route, Navigate } from "react-router-dom";
import { useApiKey } from "./hooks/useApiKey";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ViolationsPage from "./pages/ViolationsPage";
import TreeViewPage from "./pages/TreeViewPage";
import TraceDetailPage from "./pages/TraceDetailPage";
import AgentsPage from "./pages/AgentsPage";
import PoliciesPage from "./pages/PoliciesPage";
import ReviewQueuePage from "./pages/ReviewQueuePage";

export default function App() {
  const { apiKey } = useApiKey();

  if (!apiKey) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/violations" element={<ViolationsPage />} />
        <Route path="/trees/:rootTaskId" element={<TreeViewPage />} />
        <Route path="/traces/:traceId" element={<TraceDetailPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/policies" element={<PoliciesPage />} />
        <Route path="/review" element={<ReviewQueuePage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
