import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { env } from './env';
import { supabase } from './supabase';

export type Profile = {
  id: string;
  display_name: string;
  color: string;
  avatar_url: string | null;
  terms_version: string | null;
  terms_accepted_at: string | null;
};

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

GoogleSignin.configure({
  webClientId: env.googleWebClientId,
  scopes: ['profile', 'email'],
  offlineAccess: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, color, avatar_url, terms_version, terms_accepted_at')
      .eq('id', userId)
      .single();
    if (!error) setProfile(data as Profile);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // fora do callback para evitar deadlock do supabase-js
      setTimeout(() => loadProfile(s?.user.id), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signInWithGoogle = useCallback(async () => {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      if (!isSuccessResponse(res)) return; // usuário cancelou
      const idToken = res.data.idToken;
      if (!idToken) throw new Error('O Google não retornou o token de identidade.');
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
      if (error) throw error;
    } catch (e) {
      if (isErrorWithCode(e)) {
        if (e.code === statusCodes.IN_PROGRESS) return;
        if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          throw new Error('Google Play Services indisponível neste aparelho.');
        }
      }
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    try {
      await GoogleSignin.signOut();
    } catch {
      // ignora
    }
  }, []);

  const refreshProfile = useCallback(() => loadProfile(session?.user.id), [loadProfile, session]);

  const value = useMemo(
    () => ({ ready, session, profile, signInWithGoogle, signOut, refreshProfile }),
    [ready, session, profile, signInWithGoogle, signOut, refreshProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
