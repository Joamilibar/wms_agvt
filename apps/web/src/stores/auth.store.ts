import { create } from 'zustand';
import api, { TOKEN_KEY, REFRESH_KEY, USER_KEY, clearSession } from '../lib/api';

export type Role = 'admin' | 'supervisor' | 'operator';

interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  warehouse: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, refreshToken: string, user: User) => void;
  logout: () => Promise<void>;
  /** True when the signed-in user holds any of the given roles. */
  can: (...roles: Role[]) => boolean;
}

function readStoredUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: readStoredUser(),
  token: localStorage.getItem(TOKEN_KEY),
  isAuthenticated: !!localStorage.getItem(TOKEN_KEY),

  login: (token, refreshToken, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  // M-08: signing out has to reach the server. Deleting the local copy left the
  // refresh token valid for another week.
  logout: async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refresh_token: refreshToken });
      } catch {
        // Revoking is best-effort; the local session goes either way.
      }
    }
    clearSession();
    set({ token: null, user: null, isAuthenticated: false });
  },

  can: (...roles) => {
    const role = get().user?.role;
    return !!role && roles.includes(role);
  },
}));
