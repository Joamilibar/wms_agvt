import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/auth.store';
import Layout from './components/layout/Layout';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventario from './pages/Inventario';
import Picking from './pages/Picking';
import Guias from './pages/Guias';
import PickingLog from './pages/PickingLog';
import ABCAnalysis from './pages/ABCAnalysis';
import Coverage from './pages/Coverage';
import Aging from './pages/Aging';
import BSaleConfig from './pages/BSaleConfig';
import AnalisisInventario from './pages/AnalisisInventario';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventario" element={<Inventario />} />
            <Route path="/picking" element={<Picking />} />
            <Route path="/picking-log" element={<PickingLog />} />
            <Route path="/guias" element={<Guias />} />
            <Route path="/abc" element={<ABCAnalysis />} />
            <Route path="/cobertura" element={<Coverage />} />
            <Route path="/aging" element={<Aging />} />
            <Route path="/bsale" element={<BSaleConfig />} />
            <Route path="/analisis" element={<AnalisisInventario />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
