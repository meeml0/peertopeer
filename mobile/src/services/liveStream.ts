import { supabase } from './supabase';

export interface LiveStream {
  id: string;
  host_id: string;
  title: string;
  is_live: boolean;
  created_at: string;
  ended_at?: string;
  profiles?: {
    id: string;
    full_name: string;
    avatar_url: string;
    username?: string;
  };
}

/**
 * ID Bazlı Modüler Canlı Yayın Servisi
 * Farklı bir projeye taşındığında sadece veritabanı istemcisi yeterlidir.
 */
export const liveStreamService = {
  /**
   * Yeni bir canlı yayın kaydı oluşturur
   */
  async createStream(hostId: string, title: string = 'Canlı Yayın'): Promise<{ stream: LiveStream | null; error: any }> {
    try {
      const { data, error } = await supabase
        .from('live_streams')
        .insert({
          host_id: hostId,
          title: title || 'Canlı Yayın',
          is_live: true,
        })
        .select('*, profiles:host_id(id, full_name, avatar_url, username)')
        .single();

      if (error) throw error;
      return { stream: data, error: null };
    } catch (error) {
      console.error('[LiveStreamService] createStream error:', error);
      return { stream: null, error };
    }
  },

  /**
   * Yayını sonlandırır
   */
  async endStream(streamId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('live_streams')
        .update({
          is_live: false,
          ended_at: new Date().toISOString(),
        })
        .eq('id', streamId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[LiveStreamService] endStream error:', error);
      return false;
    }
  },

  /**
   * Bir kullanıcının yayıncıyı takip edip etmediğini kontrol eder.
   * Takip şartı kontrolü burada ID bazlı yapılır.
   */
  async checkFollowPermission(followerId: string, hostId: string): Promise<boolean> {
    // Yayıncı kendisi ise doğrudan izin ver
    if (followerId === hostId) return true;

    try {
      const { data, error } = await supabase
        .from('user_connections')
        .select('id')
        .eq('follower_id', followerId)
        .eq('following_id', hostId)
        .maybeSingle();

      if (error) {
        console.warn('[LiveStreamService] follow check warning:', error.message);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('[LiveStreamService] checkFollowPermission error:', error);
      return false;
    }
  },

  /**
   * Aktif canlı yayınları çeker
   */
  async getActiveStreams(): Promise<LiveStream[]> {
    try {
      const { data, error } = await supabase
        .from('live_streams')
        .select('*, profiles:host_id(id, full_name, avatar_url, username)')
        .eq('is_live', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as LiveStream[]) || [];
    } catch (error) {
      console.error('[LiveStreamService] getActiveStreams error:', error);
      return [];
    }
  },
};
