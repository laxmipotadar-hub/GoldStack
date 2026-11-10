import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  User,
  Role,
  PartyRole,
  AuthUser,
  SendOtpResponse,
  VerifyOtpResponse,
  AuthMeResponse
} from '../../shared/types.js';

export type { AuthUser, User };

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoginModalOpen: boolean;
  openLoginModal: (preferredRole?: Role) => void;
  closeLoginModal: () => void;
  sendOtp: (phone: string) => Promise<SendOtpResponse>;
  verifyOtp: (phone: string, otp: string, role?: Role) => Promise<VerifyOtpResponse>;
  logout: () => Promise<void>;
  switchUser: (role: Role, targetPartyId?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [preferredRoleForModal, setPreferredRoleForModal] = useState<PartyRole | undefined>();

  // Fetch current session on mount
  const checkSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.authenticated && data.user) {
        setUser(data.user);
      } else {
        // If not logged in, auto-login as default Jeweller for instant demo usability
        await autoLoginDefault('JEWELLER');
      }
    } catch (err) {
      console.warn('[Auth] Session check error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const autoLoginDefault = async (role: PartyRole) => {
    try {
      const defaultPhone = role === 'JEWELLER' ? '+91 98201 12345' : '+91 98202 23456';
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: defaultPhone, otp: '123456', role })
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
      }
    } catch (err) {
      console.error('[Auth] Auto-login error:', err);
    }
  };

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const openLoginModal = (preferredRole?: PartyRole) => {
    setPreferredRoleForModal(preferredRole);
    setIsLoginModalOpen(true);
  };

  const closeLoginModal = () => {
    setIsLoginModalOpen(false);
  };

  const sendOtp = async (phone: string) => {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to send OTP');
    return data;
  };

  const verifyOtp = async (phone: string, otp: string, role?: PartyRole) => {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, otp, role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'OTP verification failed');
    if (data.user) {
      setUser(data.user);
      setIsLoginModalOpen(false);
    }
    return data;
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore
    }
    setUser(null);
    openLoginModal('JEWELLER');
  };

  const switchUser = async (role: PartyRole, targetPartyId?: string) => {
    const phone =
      role === 'JEWELLER'
        ? '+91 98201 12345'
        : role === 'MEDIATOR'
        ? '+91 98205 56789'
        : targetPartyId === '33333333-3333-3333-3333-333333333333'
        ? '+91 98203 34567'
        : targetPartyId === '44444444-4444-4444-4444-444444444444'
        ? '+91 98204 45678'
        : targetPartyId === '66666666-6666-6666-6666-666666666666'
        ? '+91 98206 67890'
        : '+91 98202 23456';

    await verifyOtp(phone, '123456', role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isLoginModalOpen,
        openLoginModal,
        closeLoginModal,
        sendOtp,
        verifyOtp,
        logout,
        switchUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

