import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore, type Role } from './stores/auth.store';
import { Toaster } from 'react-hot-toast';
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
import Usuarios from './pages/Usuarios';
import Packs from './pages/Packs';

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

/**
 * Keeps a signed-in user out of a screen their role cannot use. The API is the
 * real boundary — this only avoids sending someone to a page that answers 403.
 */
function RoleRoute({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const can = useAuthStore((s) => s.can);
  return can(...roles) ? <>{children}</> : <Navigate to="/" replace />;
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
            <Route path="/packs" element={<Packs />} />
            <Route path="/abc" element={<ABCAnalysis />} />
            <Route path="/cobertura" element={<Coverage />} />
            <Route path="/aging" element={<Aging />} />
            <Route
              path="/bsale"
              element={
                <RoleRoute roles={['admin', 'supervisor']}>
                  <BSaleConfig />
                </RoleRoute>
              }
            />
            <Route
              path="/usuarios"
              element={
                <RoleRoute roles={['admin']}>
                  <Usuarios />
                </RoleRoute>
              }
            />
            <Route path="/analisis" element={<AnalisisInventario />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: '#161b27', color: '#f1f5f9', border: '1px solid #2a3142', fontSize: 13 },
        }}
      />
    </QueryClientProvider>
  );
}
