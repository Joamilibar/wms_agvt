import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  warehouse: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('wms_user') || 'null'),
  token: localStorage.getItem('wms_token'),
  isAuthenticated: !!localStorage.getItem('wms_token'),
  login: (token, user) => {
    localStorage.setItem('wms_token', token);
    localStorage.setItem('wms_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem('wms_token');
    localStorage.removeItem('wms_user');
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
