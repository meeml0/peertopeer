import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Clock,
  Sparkles,
} from 'lucide-react-native';

export const CallsScreen = ({ navigation }: any) => {
  const { user } = useAuth();
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCalls();
    const unsubscribe = navigation.addListener('focus', () => {
      fetchCalls();
    });
    return unsubscribe;
  }, [navigation, user?.id]);

  const fetchCalls = async () => {
    if (!user) return;
    try {
      setLoading(true);

      // 1. Önce doğrudan join ile dene
      const { data, error } = await supabase
        .from('call_logs')
        .select(`
          *,
          caller:caller_id (*),
          receiver:receiver_id (*)
        `)
        .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setCalls(data);
        return;
      }

      console.log('Join ile call_logs alinamadi, yalın sorgu deneniyor:', error?.message);

      // 2. Foreign key ilişkisi PostgREST tarafından çözülemezse yalın çek ve profil bilgilerini eşle
      const { data: rawCalls, error: rawError } = await supabase
        .from('call_logs')
        .select('*')
        .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (rawError || !rawCalls) {
        console.log('Call logs tablosu hatası:', rawError?.message);
        setCalls([]);
        return;
      }

      // İlgili tüm profil id'lerini topla
      const userIds = Array.from(
        new Set(rawCalls.flatMap((c: any) => [c.caller_id, c.receiver_id]).filter(Boolean))
      );

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds);

        const profileMap = new Map((profilesData || []).map((p: any) => [p.id, p]));

        const populatedCalls = rawCalls.map((c: any) => ({
          ...c,
          caller: profileMap.get(c.caller_id) || { username: 'Kullanıcı' },
          receiver: profileMap.get(c.receiver_id) || { username: 'Kullanıcı' },
        }));

        setCalls(populatedCalls);
      } else {
        setCalls([]);
      }
    } catch (e) {
      console.error('Calls fetch istisna:', e);
    } finally {
      setLoading(false);
    }
  };

  const startCall = (targetUser: any, type: 'video' | 'audio') => {
    navigation.navigate('Call', { targetUser, isCaller: true, callType: type });
  };

  const formatDuration = (secs: number) => {
    if (!secs) return 'Cevapsız';
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins > 0 ? `${mins}dk ` : ''}${rem}sn`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Aramalar</Text>
        <Text style={styles.headerSubtitle}>Görüşme ve çağrı geçmişi</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isOutgoing = item.caller_id === user?.id;
            const otherUser = isOutgoing ? item.receiver : item.caller;

            return (
              <View style={styles.callCard}>
                {/* Avatar */}
                <TouchableOpacity
                  onPress={() => otherUser && navigation.navigate('UserProfile', { targetUser: otherUser })}
                  activeOpacity={0.8}
                >
                  {otherUser?.avatar_url ? (
                    <Image source={{ uri: otherUser.avatar_url }} style={styles.avatarImage} />
                  ) : (
                    <LinearGradient
                      colors={['#6366f1', '#a855f7']}
                      style={styles.avatarGradient}
                    >
                      <Text style={styles.avatarLetter}>
                        {otherUser?.username?.charAt(0)?.toUpperCase() || 'U'}
                      </Text>
                    </LinearGradient>
                  )}
                </TouchableOpacity>

                {/* Call Info */}
                <View style={styles.callInfo}>
                  <Text style={styles.userName}>{otherUser?.full_name || otherUser?.username || 'Kullanıcı'}</Text>
                  <View style={styles.detailsRow}>
                    {item.status === 'missed' ? (
                      <PhoneMissed size={14} color="#ef4444" style={{ marginRight: 5 }} />
                    ) : isOutgoing ? (
                      <PhoneOutgoing size={14} color="#10b981" style={{ marginRight: 5 }} />
                    ) : (
                      <PhoneIncoming size={14} color="#06b6d4" style={{ marginRight: 5 }} />
                    )}
                    <Text style={[styles.callTypeDesc, item.status === 'missed' && styles.missedCallText]}>
                      {item.call_type === 'video' ? 'Görüntülü Arama' : 'Sesli Arama'} •{' '}
                      {item.status === 'missed' ? (
                        <Text style={styles.missedTag}>Cevapsız</Text>
                      ) : (
                        <Text style={styles.completedTag}>{formatDuration(item.duration)}</Text>
                      )}
                    </Text>
                  </View>
                </View>

                {/* Date & Quick Call Button */}
                <View style={styles.rightActions}>
                  <Text style={styles.callDate}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <TouchableOpacity
                    style={styles.actionCallBtn}
                    onPress={() => otherUser && startCall(otherUser, item.call_type || 'video')}
                  >
                    {item.call_type === 'video' ? (
                      <Video size={17} color="#34d399" />
                    ) : (
                      <Phone size={17} color="#34d399" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Clock size={40} color="#475569" style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>Henüz arama geçmişi yok</Text>
              <Text style={styles.emptySubtitle}>Yaptığınız ve aldığınız tüm aramalar burada listelenir.</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  listContent: {
    padding: 16,
    paddingBottom: 30,
  },
  callCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.65)',
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  callInfo: {
    flex: 1,
    marginLeft: 14,
  },
  userName: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 3,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  callTypeDesc: {
    color: '#94a3b8',
    fontSize: 12,
  },
  missedCallText: {
    color: '#fca5a5',
  },
  missedTag: {
    color: '#ef4444',
    fontWeight: '700',
  },
  completedTag: {
    color: '#34d399',
    fontWeight: '600',
  },
  rightActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  callDate: {
    color: '#64748b',
    fontSize: 11,
  },
  actionCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 70,
  },
  emptyTitle: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: '#475569',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
});
