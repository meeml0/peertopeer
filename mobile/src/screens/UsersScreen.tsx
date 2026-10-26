import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Phone,
  Video,
  MessageCircle,
  Settings,
  Search,
  Sparkles,
  Heart,
  Image as ImageIcon,
  Users as UsersIcon,
  Radio,
} from 'lucide-react-native';

import { PulsCoinBadge } from '../components/PulsCoinBadge';
import { socketService } from '../services/socket';
import { liveStreamService, LiveStream } from '../services/liveStream';
import { formatChatListTime } from '../utils/dateUtils';

const { width } = Dimensions.get('window');

export const UsersScreen = ({ navigation }: any) => {
  const { user, profile, pulscoinBalance } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'feed' | 'users'>('feed');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);

  // Canlı Çevrimiçi Kullanıcı ID'leri (Socket.IO Realtime)
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // Beğeni Durumları ve Sayıları
  const [likedPhotoIds, setLikedPhotoIds] = useState<Set<string>>(new Set());
  const [likesCountMap, setLikesCountMap] = useState<Record<string, number>>({});

  // Aktif Canlı Yayınlar
  const [activeLiveStreams, setActiveLiveStreams] = useState<LiveStream[]>([]);
  const lastTapRef = useRef<Record<string, number>>({});

  useEffect(() => {
    fetchUsers();
    fetchPosts();
    fetchMyLikes();

    // 1. Socket.IO Canlı Çevrimiçi Durumu Dinleyicisi
    const socket = socketService.getSocket();
    if (socket) {
      // Mevcut online kullanıcılar listesi
      socket.on('online_users_list', (userIds: string[]) => {
        setOnlineUserIds(new Set(userIds));
      });

      // Kullanıcı bağlandı/koptu
      socket.on('user_status_changed', ({ userId, status }: { userId: string; status: string }) => {
        setOnlineUserIds((prev) => {
          const updated = new Set(prev);
          if (status === 'online') {
            updated.add(userId);
          } else {
            updated.delete(userId);
          }
          return updated;
        });
      });
    }

    // 2. Supabase Realtime (Profiller, Fotoğraflar ve Beğeniler)
    const channel = supabase
      .channel('public:users_and_posts_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          fetchUsers();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_photos' },
        () => {
          fetchPosts();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photo_likes' },
        () => {
          fetchPosts();
          fetchMyLikes();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          fetchUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      socket?.off('online_users_list');
      socket?.off('user_status_changed');
      socket?.off('live_stream_status_changed');
    };
  }, [user]);

  // Canlı Yayınları Çek ve Dinle
  useEffect(() => {
    fetchActiveStreams();

    const socket = socketService.getSocket();
    if (socket) {
      socket.on('live_stream_status_changed', () => {
        fetchActiveStreams();
      });
    }

    return () => {
      socket?.off('live_stream_status_changed');
    };
  }, []);

  const fetchActiveStreams = async () => {
    const streams = await liveStreamService.getActiveStreams();
    setActiveLiveStreams(streams);
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredUsers(
        users.filter(
          (u) =>
            u.username?.toLowerCase().includes(q) ||
            u.full_name?.toLowerCase().includes(q)
        )
      );
    }
  }, [searchQuery, users]);

  // Kullanıcının kendi beğendiği fotoğrafları çek
  const fetchMyLikes = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('photo_likes')
        .select('photo_id')
        .eq('user_id', user.id);

      if (data) {
        setLikedPhotoIds(new Set(data.map((l) => l.photo_id)));
      }
    } catch (e) {
      console.log('Beğeniler alınamadı:', e);
    }
  };

  const fetchPosts = async () => {
    try {
      setLoadingPosts(true);
      const { data, error } = await supabase
        .from('user_photos')
        .select(`
          *,
          user:user_id (*)
        `)
        .order('created_at', { ascending: false });

      let fetchedPosts = data || [];

      if (error || !data) {
        // Fallback: Yalın çekip profilleri bağlayalım
        const { data: rawPhotos } = await supabase
          .from('user_photos')
          .select('*')
          .order('created_at', { ascending: false });

        if (rawPhotos && rawPhotos.length > 0) {
          const userIds = Array.from(new Set(rawPhotos.map((p) => p.user_id)));
          const { data: userProfiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', userIds);

          const profileMap = new Map((userProfiles || []).map((u: any) => [u.id, u]));
          fetchedPosts = rawPhotos.map((p: any) => ({
            ...p,
            user: profileMap.get(p.user_id) || { username: 'Kullanıcı' },
          }));
        }
      }

      setPosts(fetchedPosts);

      // Fotoğrafların toplam beğeni sayılarını çek
      if (fetchedPosts.length > 0) {
        const photoIds = fetchedPosts.map((p) => p.id);
        const { data: likesData } = await supabase
          .from('photo_likes')
          .select('photo_id')
          .in('photo_id', photoIds);

        const countMap: Record<string, number> = {};
        (likesData || []).forEach((row: any) => {
          countMap[row.photo_id] = (countMap[row.photo_id] || 0) + 1;
        });
        setLikesCountMap(countMap);
      }
    } catch (e) {
      console.error('Posts fetch hatası:', e);
    } finally {
      setLoadingPosts(false);
    }
  };

  // Beğeni Ekle / Kaldır (Like Toggle)
  const toggleLike = async (photoId: string) => {
    if (!user) return;
    const isAlreadyLiked = likedPhotoIds.has(photoId);

    // İyimser UI güncellemesi (Anında tepki)
    setLikedPhotoIds((prev) => {
      const updated = new Set(prev);
      if (isAlreadyLiked) updated.delete(photoId);
      else updated.add(photoId);
      return updated;
    });

    setLikesCountMap((prev) => ({
      ...prev,
      [photoId]: Math.max(0, (prev[photoId] || 0) + (isAlreadyLiked ? -1 : 1)),
    }));

    try {
      if (isAlreadyLiked) {
        await supabase
          .from('photo_likes')
          .delete()
          .eq('photo_id', photoId)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('photo_likes')
          .insert({ photo_id: photoId, user_id: user.id });
      }
    } catch (err) {
      console.error('Beğeni işlemi hatası:', err);
      // Geri al
      fetchMyLikes();
    }
  };

  // Çift Tık ile Beğenme (Instagram Double Tap)
  const handlePhotoDoubleTap = (photoId: string) => {
    const now = Date.now();
    const lastTap = lastTapRef.current[photoId] || 0;
    if (now - lastTap < 300) {
      // Çift tık algılandı! Henüz beğenilmemişse beğen
      if (!likedPhotoIds.has(photoId)) {
        toggleLike(photoId);
      }
    }
    lastTapRef.current[photoId] = now;
  };

  const fetchUsers = async () => {
    if (!user) return;
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user.id);

      if (error) throw error;

      // Her kullanıcı için son mesajı ve okunmamış mesaj sayısını bul
      const usersWithMessages = await Promise.all(
        (profiles || []).map(async (p) => {
          // Bu kişiyle olan son mesaj
          const { data: lastMsgs } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${user.id},conversation_id.in.(select conversation_id from conversation_participants where user_id='${p.id}')),and(sender_id.eq.${p.id},conversation_id.in.(select conversation_id from conversation_participants where user_id='${user.id}'))`)
            .order('created_at', { ascending: false })
            .limit(1);

          // Okunmamış mesaj sayısı
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

      // En son mesaj atan kullanıcı en üstte
      usersWithMessages.sort((a, b) => {
        if (!a.lastMessageTime && !b.lastMessageTime) return 0;
        if (!a.lastMessageTime) return 1;
        if (!b.lastMessageTime) return -1;
        return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
      });

      setUsers(usersWithMessages);
      setFilteredUsers(usersWithMessages);
    } catch (err) {
      console.error('Kullanıcılar alınırken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  const startChat = (targetUser: any) => {
    navigation.navigate('Chat', { targetUser });
  };

  const startCall = (targetUser: any, callType: 'video' | 'audio') => {
    navigation.navigate('Call', { targetUser, isCaller: true, callType });
  };

  const openUserProfile = (targetUser: any) => {
    navigation.navigate('UserProfile', { targetUser });
  };

  return (
    <View style={styles.container}>
      {/* Aurora Ambient Glows */}
      <View style={styles.glowTop} />

      {/* Modern Glass Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <LinearGradient
            colors={['#6366f1', '#a855f7']}
            style={styles.myAvatarBadge}
          >
            <Text style={styles.myAvatarLetter}>
              {profile?.username?.charAt(0)?.toUpperCase() || 'U'}
            </Text>
          </LinearGradient>
          <View>
            <Text style={styles.welcomeText}>Hoş Geldin,</Text>
            <Text style={styles.userNameHeader}>
              {profile?.full_name || profile?.username || 'Kullanıcı'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Canlı Yayın Başlat Butonu */}
          <TouchableOpacity
            style={styles.liveStartBtn}
            onPress={() => navigation.navigate('LiveHost', { title: 'Canlı Yayın' })}
            activeOpacity={0.8}
          >
            <Radio size={16} color="#ffffff" style={{ marginRight: 4 }} />
            <Text style={styles.liveStartText}>Yayın Aç</Text>
          </TouchableOpacity>

          <PulsCoinBadge balance={pulscoinBalance} />
          <TouchableOpacity
            style={styles.settingsGlassBtn}
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.8}
          >
            <Settings size={20} color="#cbd5e1" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Aktif Kişiler & Canlı Yayınlar Şeridi (Stories) */}
      {(() => {
        const liveOnlineUsers = users.filter((u) => onlineUserIds.has(u.id));
        return (
          <View style={styles.activeStripContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>
                {activeLiveStreams.length > 0 ? '🔴 Canlı Yayınlar & Çevrimiçi' : 'Çevrimiçi Kişiler'}
              </Text>
              <Text style={styles.onlineCountText}>{liveOnlineUsers.length} aktif</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.activeStripContent}
            >
              {/* Aktif Canlı Yayın Yapan Kullanıcılar */}
              {activeLiveStreams.map((stream) => {
                const hostProfile = stream.profiles || { full_name: 'Yayıncı', username: 'host', avatar_url: '' };
                const isMyStream = stream.host_id === user?.id;

                return (
                  <TouchableOpacity
                    key={`stream_${stream.id}`}
                    style={styles.activeUserItem}
                    onPress={() => {
                      if (isMyStream) {
                        navigation.navigate('LiveHost', { streamId: stream.id, title: stream.title });
                      } else {
                        navigation.navigate('LiveViewer', {
                          streamId: stream.id,
                          hostUser: hostProfile,
                        });
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.activeAvatarWrapper}>
                      <LinearGradient
                        colors={['#ff2d55', '#ff007f']}
                        style={[styles.activeAvatarRing, { padding: 3 }]}
                      >
                        {hostProfile.avatar_url ? (
                          <Image source={{ uri: hostProfile.avatar_url }} style={styles.activeAvatarInner} />
                        ) : (
                          <View style={[styles.activeAvatarInner, { backgroundColor: '#1e1b4b' }]}>
                            <Text style={styles.activeAvatarLetter}>
                              {hostProfile.full_name?.charAt(0)?.toUpperCase() || 'L'}
                            </Text>
                          </View>
                        )}
                      </LinearGradient>
                      <View style={styles.liveBadgeFloating}>
                        <Text style={styles.liveBadgeText}>CANLI</Text>
                      </View>
                    </View>
                    <Text style={[styles.activeUsername, { color: '#ff2d55', fontWeight: 'bold' }]} numberOfLines={1}>
                      {isMyStream ? 'Yayınınız' : hostProfile.full_name || hostProfile.username}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Çevrimiçi Kullanıcılar */}
              {liveOnlineUsers.map((u) => {
                // Eğer zaten canlı yayında listeleniyorsa tekrar listeleme
                if (activeLiveStreams.some((s) => s.host_id === u.id)) return null;

                return (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.activeUserItem}
                    onPress={() => openUserProfile(u)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.activeAvatarWrapper}>
                      <LinearGradient
                        colors={['#10b981', '#06b6d4']}
                        style={styles.activeAvatarRing}
                      >
                        {u.avatar_url ? (
                          <Image source={{ uri: u.avatar_url }} style={styles.activeAvatarInner} />
                        ) : (
                          <View style={styles.activeAvatarInner}>
                            <Text style={styles.activeAvatarLetter}>
                              {u.username?.charAt(0)?.toUpperCase() || 'U'}
                            </Text>
                          </View>
                        )}
                      </LinearGradient>
                      <View style={styles.pulseDot} />
                    </View>
                    <Text style={styles.activeUsername} numberOfLines={1}>
                      {u.username}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        );
      })()}

      {/* Akış & Kişiler Segment Seçici (Instagram Style Feed Switcher) */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'feed' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('feed')}
          activeOpacity={0.8}
        >
          <ImageIcon size={16} color={activeTab === 'feed' ? '#818cf8' : '#64748b'} style={{ marginRight: 6 }} />
          <Text style={[styles.segmentText, activeTab === 'feed' && styles.segmentTextActive]}>
            Akış (Paylaşımlar)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'users' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('users')}
          activeOpacity={0.8}
        >
          <UsersIcon size={16} color={activeTab === 'users' ? '#818cf8' : '#64748b'} style={{ marginRight: 6 }} />
          <Text style={[styles.segmentText, activeTab === 'users' && styles.segmentTextActive]}>
            Kişiler ({users.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* 1. SEÇENEK: AKIŞ (INSTAGRAM STYLE GÖNDERİLER - BEĞENİ VE ÇİFT TIK) */}
      {activeTab === 'feed' ? (
        <View style={styles.feedContainer}>
          {loadingPosts ? (
            <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={posts}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.feedListContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const postUser = item.user || { username: 'Kullanıcı' };
                const isLiked = likedPhotoIds.has(item.id);
                const likesCount = likesCountMap[item.id] || 0;

                return (
                  <View style={styles.feedCard}>
                    {/* Kart Başlığı / Kullanıcı Bilgisi */}
                    <View style={styles.feedCardHeader}>
                      <TouchableOpacity
                        style={styles.feedUserTouch}
                        onPress={() => openUserProfile(postUser)}
                        activeOpacity={0.8}
                      >
                        {postUser.avatar_url ? (
                          <Image source={{ uri: postUser.avatar_url }} style={styles.feedAvatar} />
                        ) : (
                          <LinearGradient
                            colors={['#6366f1', '#a855f7']}
                            style={styles.feedAvatar}
                          >
                            <Text style={styles.feedAvatarLetter}>
                              {postUser.username?.charAt(0)?.toUpperCase() || 'U'}
                            </Text>
                          </LinearGradient>
                        )}
                        <View style={{ marginLeft: 10 }}>
                          <Text style={styles.feedUsername}>
                            {postUser.full_name || postUser.username}
                          </Text>
                          <Text style={styles.feedHandle}>@{postUser.username}</Text>
                        </View>
                      </TouchableOpacity>

                      {/* Hızlı Arama Butonları */}
                      {postUser.id !== user?.id && (
                        <View style={styles.feedHeaderActions}>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.audioActionBtn]}
                            onPress={() => startCall(postUser, 'audio')}
                          >
                            <Phone size={16} color="#06b6d4" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.callActionBtn]}
                            onPress={() => startCall(postUser, 'video')}
                          >
                            <Video size={16} color="#34d399" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {/* Gönderi Fotoğrafı - Çift Tık ile Beğenme (Double Tap Like) */}
                    <TouchableOpacity
                      activeOpacity={0.95}
                      onPress={() => handlePhotoDoubleTap(item.id)}
                    >
                      <Image source={{ uri: item.photo_url }} style={styles.feedImage} />
                    </TouchableOpacity>

                    {/* Gönderi Alt Eylemler: Yorum kaldırıldı, Kalp Beğeni ve Sayısı Eklendi */}
                    <View style={styles.feedFooter}>
                      <View style={styles.feedFooterActions}>
                        {/* Kalp Beğeni Butonu */}
                        <TouchableOpacity
                          style={styles.likeTouchBtn}
                          onPress={() => toggleLike(item.id)}
                          activeOpacity={0.7}
                        >
                          <Heart
                            size={24}
                            color={isLiked ? '#ef4444' : '#cbd5e1'}
                            fill={isLiked ? '#ef4444' : 'transparent'}
                          />
                          <Text style={[styles.likeCountText, isLiked && styles.likedTextActive]}>
                            {likesCount} beğenme
                          </Text>
                        </TouchableOpacity>

                        <Text style={styles.feedDate}>
                          {new Date(item.created_at).toLocaleDateString([], {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </Text>
                      </View>

                      {item.caption ? (
                        <Text style={styles.feedCaption}>
                          <Text style={styles.feedCaptionUsername}>@{postUser.username} </Text>
                          {item.caption}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <ImageIcon size={44} color="#475569" style={{ marginBottom: 12 }} />
                  <Text style={styles.emptyText}>Henüz paylaşım yapılmamış.</Text>
                  <Text style={styles.emptySubtext}>
                    Profil sekmesine giderek ilk vitrin fotoğrafınızı paylaşabilirsiniz!
                  </Text>
                </View>
              }
            />
          )}
        </View>
      ) : (
        /* 2. SEÇENEK: KİŞİLER LİSTESİ */
        <View style={styles.listSection}>
          {/* Arama Çubuğu */}
          <View style={styles.searchContainer}>
            <View style={styles.searchBox}>
              <Search size={18} color="#64748b" style={{ marginRight: 10 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Kişi veya sohbet ara..."
                placeholderTextColor="#64748b"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userCard}
                  onPress={() => startChat(item)}
                  activeOpacity={0.75}
                >
                  {/* Avatar (Tıklandığında Profil Vitrinini Açar) */}
                  <TouchableOpacity
                    style={styles.avatarBox}
                    onPress={() => openUserProfile(item)}
                    activeOpacity={0.8}
                  >
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.avatarGradient} />
                    ) : (
                      <LinearGradient
                        colors={['#3b82f6', '#8b5cf6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.avatarGradient}
                      >
                        <Text style={styles.avatarText}>
                          {item.username?.charAt(0)?.toUpperCase() || 'U'}
                        </Text>
                      </LinearGradient>
                    )}
                    {onlineUserIds.has(item.id) && <View style={styles.onlineBadge} />}
                  </TouchableOpacity>

                  {/* User Info */}
                  <View style={styles.userInfo}>
                    <View style={styles.userNameRow}>
                      <Text style={styles.userName}>{item.full_name || item.username}</Text>
                      {item.lastMessageTime && (
                        <Text style={[styles.lastMsgTime, item.unreadCount > 0 && styles.activeTimeColor]}>
                          {formatChatListTime(item.lastMessageTime)}
                        </Text>
                      )}
                    </View>
                    <View style={styles.lastMsgRow}>
                      <Text
                        style={[
                          styles.userHandle,
                          item.unreadCount > 0 && styles.unreadMessageHighlight,
                        ]}
                        numberOfLines={1}
                      >
                        {item.lastMessage ? item.lastMessage : `@${item.username} • Sohbeti başlat`}
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

                  {/* Eylem Butonları: Hem Sesli Hem Görüntülü Arama */}
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.audioActionBtn]}
                      onPress={() => startCall(item, 'audio')}
                    >
                      <Phone size={17} color="#06b6d4" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.callActionBtn]}
                      onPress={() => startCall(item, 'video')}
                    >
                      <Video size={17} color="#34d399" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Sparkles size={36} color="#475569" style={{ marginBottom: 12 }} />
                  <Text style={styles.emptyText}>Henüz başka kullanıcı bulunamadı.</Text>
                  <Text style={styles.emptySubtext}>Farklı bir tarayıcıdan ikinci kullanıcıyı açabilirsiniz.</Text>
                </View>
              }
            />
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
    position: 'relative',
  },
  glowTop: {
    position: 'absolute',
    top: -50,
    left: '20%',
    width: 250,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  myAvatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  myAvatarLetter: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  welcomeText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  userNameHeader: {
    fontSize: 17,
    fontWeight: '800',
    color: '#f8fafc',
  },
  settingsGlassBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  liveStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff2d55',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  liveStartText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  liveBadgeFloating: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    backgroundColor: '#ff2d55',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#07090e',
  },
  liveBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  activeStripContainer: {
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  onlineCountText: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
  },
  activeStripContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  activeUserItem: {
    alignItems: 'center',
    width: 60,
  },
  activeAvatarWrapper: {
    position: 'relative',
    marginBottom: 6,
  },
  activeAvatarRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    padding: 2.5,
  },
  activeAvatarInner: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  activeAvatarLetter: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  pulseDot: {
    position: 'absolute',
    bottom: 0,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#07090e',
  },
  activeUsername: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  segmentContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 16,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  segmentBtnActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  segmentText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#818cf8',
    fontWeight: '700',
  },
  feedContainer: {
    flex: 1,
  },
  feedListContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  feedCard: {
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
    borderRadius: 22,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  feedUserTouch: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  feedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedAvatarLetter: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  feedUsername: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  feedHandle: {
    color: '#64748b',
    fontSize: 11,
  },
  feedHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  feedImage: {
    width: '100%',
    height: width - 32,
    backgroundColor: '#0f172a',
  },
  feedFooter: {
    padding: 14,
  },
  feedFooterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  likeTouchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  likeCountText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  likedTextActive: {
    color: '#ef4444',
  },
  feedDate: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
  },
  noOnlineContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  noOnlineText: {
    color: '#64748b',
    fontSize: 12,
    fontStyle: 'italic',
  },
  feedCaption: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  feedCaptionUsername: {
    color: '#ffffff',
    fontWeight: '700',
  },
  listSection: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 12,
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
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.65)',
    padding: 14,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  avatarBox: {
    position: 'relative',
  },
  avatarGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#0f172a',
  },
  userInfo: {
    flex: 1,
    marginLeft: 14,
  },
  userNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  userName: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  lastMsgTime: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  activeTimeColor: {
    color: '#10b981',
    fontWeight: '700',
  },
  lastMsgRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userHandle: {
    flex: 1,
    color: '#64748b',
    fontSize: 13,
  },
  unreadMessageHighlight: {
    color: '#e2e8f0',
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
    shadowColor: '#10b981',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioActionBtn: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  callActionBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
    paddingHorizontal: 30,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '600',
  },
  emptySubtext: {
    color: '#475569',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
  },
});
