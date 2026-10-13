import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { socketService } from '../services/socket';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  pulscoinBalance: number;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  spendCoins: (amount: number, type: string, description?: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  pulscoinBalance: 0,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  spendCoins: async () => false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const pulscoinBalance = profile?.pulscoin_balance ?? 0;

  useEffect(() => {
    // Mevcut oturumu al
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        socketService.connect(session.user.id);
      }
      setLoading(false);
    });

    // Oturum değişikliklerini dinle
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        socketService.connect(session.user.id);
      } else {
        setProfile(null);
        socketService.disconnect();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Profil & PulsCoin anlık değişikliklerini Supabase Realtime ile canlı dinle
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile_balance_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          console.log('[PulsCoin] Canlı profil bakiye güncellemesi:', payload.new);
          setProfile((prev: any) => ({ ...prev, ...payload.new }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) setProfile(data);
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  };

  // PulsCoin harcama fonksiyonu (Bakiye kontrolü yapar, düşer ve log kaydeder)
  const spendCoins = async (amount: number, type: string, description: string = ''): Promise<boolean> => {
    if (!user?.id || !profile) return false;
    const current = profile.pulscoin_balance ?? 0;

    if (current < amount) {
      console.warn(`[PulsCoin] Yetersiz bakiye! Mevcut: ${current}, İstenen: ${amount}`);
      return false;
    }

    const newBalance = Math.max(0, current - amount);

    // 1. İyimser yerel güncelleme
    setProfile((prev: any) => ({ ...prev, pulscoin_balance: newBalance }));

    try {
      // 2. Veritabanında güncelle
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ pulscoin_balance: newBalance })
        .eq('id', user.id);

      if (updateError) {
        console.error('[PulsCoin] Bakiye düşülemedi:', updateError);
        // Geri al
        setProfile((prev: any) => ({ ...prev, pulscoin_balance: current }));
        return false;
      }

      // 3. İşlem geçmişi tablosuna yaz
      await supabase.from('pulscoin_transactions').insert({
        user_id: user.id,
        amount: -amount,
        transaction_type: type,
        description: description || `${amount} PulsCoin harcandı`,
      });

      console.log(`[PulsCoin] ${amount} coin harcandı (${type}). Yeni bakiye: ${newBalance}`);
      return true;
    } catch (e) {
      console.error('[PulsCoin] spendCoins istisna:', e);
      return false;
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    socketService.disconnect();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        pulscoinBalance,
        loading,
        signOut,
        refreshProfile,
        spendCoins,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
