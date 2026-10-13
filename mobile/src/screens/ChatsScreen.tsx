import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { Search, Sparkles, MessageSquare } from 'lucide-react-native';

export const ChatsScreen = ({ navigation }: any) => {
  const { user } = useAuth();
  const [chats, setChats] = useState<any[]>([]);
  const [filteredChats, setFilteredChats] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChats();

    const channel = supabase
      .channel('public:chats_list_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          fetchChats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredChats(chats);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredChats(
        chats.filter(
          (c) =>
            c.username?.toLowerCase().includes(q) ||
            c.full_name?.toLowerCase().includes(q) ||
            c.lastMessage?.toLowerCase().includes(q)
        )
      );
    }
  }, [searchQuery, chats]);

  const fetchChats = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user.id);

      if (error) throw error;

      const userChats = await Promise.all(
        (profiles || []).map(async (p) => {
          const { data: lastMsgs } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${user.id},conversation_id.in.(select conversation_id from conversation_participants where user_id='${p.id}')),and(sender_id.eq.${p.id},conversation_id.in.(select conversation_id from conversation_participants where user_id='${user.id}'))`)
            .order('created_at', { ascending: false })
            .limit(1);

          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', p.id)
            .eq('is_read', false);

          const lastMsg = lastMsgs && lastMsgs.length > 0 ? lastMsgs[0] : null;

          return {
            ...p,
            lastMessage: lastMsg ? lastMsg.content : null,
            lastMessageTime: lastMsg ? lastMsg.created_at : null,
            unreadCount: count || 0,
          };
        })
      );

      // Sıralama: En son mesaj atan en üstte
      userChats.sort((a, b) => {
        if (!a.lastMessageTime && !b.lastMessageTime) return 0;
        if (!a.lastMessageTime) return 1;
        if (!b.lastMessageTime) return -1;
        return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
      });

      setChats(userChats);
      setFilteredChats(userChats);
    } catch (err) {
      console.error('Sohbetler alınamadı:', err);
    } finally {
      setLoading(false);
    }
  };

  const openChat = (targetUser: any) => {
    navigation.navigate('Chat', { targetUser });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sohbetler</Text>
        <Text style={styles.headerSubtitle}>Tüm mesajlaşmalar ve gelen kutunuz</Text>
      </View>

      {/* Arama Çubuğu */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Search size={18} color="#64748b" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Mesajlarda veya kişilerde ara..."
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Mesaj Listesi */}
      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.chatCard}
              onPress={() => openChat(item)}
              activeOpacity={0.75}
            >
              {/* Avatar */}
              <TouchableOpacity
                onPress={() => navigation.navigate('UserProfile', { targetUser: item })}
                activeOpacity={0.8}
              >
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <LinearGradient
                    colors={['#6366f1', '#a855f7']}
                    style={styles.avatarGradient}
                  >
                    <Text style={styles.avatarLetter}>
                      {item.username?.charAt(0)?.toUpperCase() || 'U'}
                    </Text>
                  </LinearGradient>
                )}
              </TouchableOpacity>

              {/* Chat Info */}
              <View style={styles.chatInfo}>
                <View style={styles.titleRow}>
                  <Text style={styles.userName}>{item.full_name || item.username}</Text>
                  {item.lastMessageTime && (
                    <Text style={[styles.timeText, item.unreadCount > 0 && styles.activeTimeText]}>
                      {new Date(item.lastMessageTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  )}
                </View>

                <View style={styles.lastMsgRow}>
                  <Text
                    style={[
                      styles.lastMessageText,
                      item.unreadCount > 0 && styles.unreadMessageText,
                    ]}
                    numberOfLines={1}
                  >
                    {item.lastMessage || 'Sohbeti başlatmak için dokunun'}
                  </Text>
                  {item.unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>
                        {item.unreadCount > 99 ? '99+' : item.unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MessageSquare size={38} color="#475569" style={{ marginBottom: 10 }} />
              <Text style={styles.emptyTitle}>Henüz sohbet bulunmuyor</Text>
              <Text style={styles.emptySubtitle}>Kişilerden birini seçerek mesajlaşmaya başlayın.</Text>
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
  searchContainer: {
    paddingHorizontal: 20,
    marginVertical: 14,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.65)',
    padding: 14,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  chatInfo: {
    flex: 1,
    marginLeft: 14,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  timeText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  activeTimeText: {
    color: '#10b981',
    fontWeight: '700',
  },
  lastMsgRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessageText: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 13,
  },
  unreadMessageText: {
    color: '#f1f5f9',
    fontWeight: '600',
  },
  unreadBadge: {
    backgroundColor: '#10b981',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
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
