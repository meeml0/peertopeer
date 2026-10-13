import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
  Dimensions,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft,
  MessageCircle,
  Video,
  Phone,
  Image as ImageIcon,
  Sparkles,
  X,
  Heart,
  UserPlus,
  UserCheck,
  Grid,
} from 'lucide-react-native';
import { PulsCoinBadge } from '../components/PulsCoinBadge';

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - 6) / 3;

export const UserProfileScreen = ({ route, navigation }: any) => {
  const { targetUser } = route.params;
  const { user } = useAuth();

  const [profile, setProfile] = useState<any>(targetUser);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Bağlantı (Connection) & İstatistikler
  const [isConnected, setIsConnected] = useState(false);
  const [connectionCount, setConnectionCount] = useState(0);
  const [totalLikesCount, setTotalLikesCount] = useState(0);
  const [connectingLoading, setConnectingLoading] = useState(false);

  // Instagram Tarzı Fotoğraf Kaydırma Modalı (Swipe Carousel)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [likedPhotoIds, setLikedPhotoIds] = useState<Set<string>>(new Set());
  const [photoLikesMap, setPhotoLikesMap] = useState<Record<string, number>>({});
  const photoScrollRef = useRef<ScrollView>(null);
  const lastTapRef = useRef<Record<string, number>>({});

  useEffect(() => {
    fetchProfileAndStats();
  }, [targetUser.id]);

  const fetchProfileAndStats = async () => {
    try {
      setLoading(true);

      // 1. Profil detaylarını çek
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUser.id)
        .single();

      if (profileData) setProfile(profileData);

      // 2. Vitrin fotoğraflarını çek
      const { data: userPhotos } = await supabase
        .from('user_photos')
        .select('*')
        .eq('user_id', targetUser.id)
        .order('created_at', { ascending: false });

      setPhotos(userPhotos || []);

      // 3. Bağlantı Durumu & Sayısını Kontrol Et
      if (user) {
        const { data: connectionData } = await supabase
          .from('user_connections')
          .select('*')
          .eq('follower_id', user.id)
          .eq('following_id', targetUser.id)
          .maybeSingle();

        setIsConnected(!!connectionData);

        const { count } = await supabase
          .from('user_connections')
          .select('*', { count: 'exact', head: true })
          .or(`follower_id.eq.${targetUser.id},following_id.eq.${targetUser.id}`);

        setConnectionCount(count || 0);
      }

      // 4. Hedef Kullanıcının Fotoğraflarının Aldığı Toplam Beğenileri Çek
      if (userPhotos && userPhotos.length > 0) {
        const photoIds = userPhotos.map((p) => p.id);
        const { data: likesData } = await supabase
          .from('photo_likes')
          .select('photo_id')
          .in('photo_id', photoIds);

        setTotalLikesCount((likesData || []).length);

        const countMap: Record<string, number> = {};
        (likesData || []).forEach((row: any) => {
          countMap[row.photo_id] = (countMap[row.photo_id] || 0) + 1;
        });
        setPhotoLikesMap(countMap);
      } else {
        setTotalLikesCount(0);
        setPhotoLikesMap({});
      }

      // 5. Giriş yapan kullanıcının beğendiği fotoğrafları çek
      if (user) {
        const { data: myLikes } = await supabase
          .from('photo_likes')
          .select('photo_id')
          .eq('user_id', user.id);

        if (myLikes) {
          setLikedPhotoIds(new Set(myLikes.map((l) => l.photo_id)));
        }
      }
    } catch (err) {
      console.error('Profil bilgileri alınamadı:', err);
    } finally {
      setLoading(false);
    }
  };

  // Bağlantı Oluştur / Kaldır (Connect / Disconnect)
  const toggleConnection = async () => {
    if (!user || connectingLoading) return;
    setConnectingLoading(true);

    const prevConnected = isConnected;
    const targetUserId = targetUser.id;

    // İyimser UI güncellemesi
    setIsConnected(!prevConnected);
    setConnectionCount((prev) => Math.max(0, prev + (prevConnected ? -1 : 1)));

    try {
      if (prevConnected) {
        const { error } = await supabase
          .from('user_connections')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', targetUserId);

        if (error) throw error;
        console.log('Bağlantı başarıyla silindi:', { follower: user.id, following: targetUserId });
      } else {
        const { error, data } = await supabase
          .from('user_connections')
          .insert({ follower_id: user.id, following_id: targetUserId })
          .select();

        if (error) throw error;
        console.log('Bağlantı başarıyla eklendi:', data);
      }
    } catch (e: any) {
      console.error('Bağlantı işlemi hatası:', e);
      alert('Bağlantı işlemi başarısız: ' + (e.message || JSON.stringify(e)));
      // Geri al
      setIsConnected(prevConnected);
      setConnectionCount((prev) => Math.max(0, prev + (prevConnected ? 1 : -1)));
    } finally {
      setConnectingLoading(false);
    }
  };

  const togglePhotoLike = async (photoId: string) => {
    if (!user) return;
    const isAlreadyLiked = likedPhotoIds.has(photoId);

    setLikedPhotoIds((prev) => {
      const updated = new Set(prev);
      if (isAlreadyLiked) updated.delete(photoId);
      else updated.add(photoId);
      return updated;
    });

    setPhotoLikesMap((prev) => ({
      ...prev,
      [photoId]: Math.max(0, (prev[photoId] || 0) + (isAlreadyLiked ? -1 : 1)),
    }));

    setTotalLikesCount((prev) => Math.max(0, prev + (isAlreadyLiked ? -1 : 1)));

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
    }
  };

  const handleModalPhotoDoubleTap = (photoId: string) => {
    const now = Date.now();
    const lastTap = lastTapRef.current[photoId] || 0;
    if (now - lastTap < 300) {
      if (!likedPhotoIds.has(photoId)) {
        togglePhotoLike(photoId);
      }
    }
    lastTapRef.current[photoId] = now;
  };

  const startChat = () => {
    navigation.navigate('Chat', { targetUser: profile });
  };

  const startCall = (callType: 'video' | 'audio') => {
    navigation.navigate('Call', { targetUser: profile, isCaller: true, callType });
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>@{profile?.username}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Instagram Header Bölümü: Avatar + Sayılar (Tıpkı Kendi Profiliniz Gibi) */}
        <View style={styles.profileHeaderSection}>
          <View style={styles.avatarWrapper}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <LinearGradient
                colors={['#6366f1', '#a855f7']}
                style={styles.avatarGradient}
              >
                <Text style={styles.avatarLetter}>
                  {profile?.username?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </LinearGradient>
            )}
            <View style={styles.onlineBadge} />
          </View>

          {/* Sayısal İstatistikler: Gönderi, Bağlantı, Beğeni */}
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{photos.length}</Text>
              <Text style={styles.statLabel}>Gönderi</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{connectionCount}</Text>
              <Text style={styles.statLabel}>Bağlantı</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{totalLikesCount}</Text>
              <Text style={styles.statLabel}>Beğeni</Text>
            </View>
          </View>
        </View>

        {/* Biyografi ve İsim Alanı */}
        <View style={styles.bioSection}>
          <Text style={styles.profileFullName}>{profile?.full_name || profile?.username}</Text>
          <Text style={styles.statusBadge}>
            {profile?.status_message || 'PulseCall kullanıyor ✨'}
          </Text>
          {profile?.bio ? (
            <Text style={styles.bioText}>{profile.bio}</Text>
          ) : null}
        </View>

        {/* Eylem Butonları: Bağlantı Kur / Mesaj / Sesli / Görüntülü */}
        <View style={styles.actionButtonsRow}>
          {/* Bağlantı Oluştur Butonu */}
          <TouchableOpacity
            style={[styles.actionBtnConnect, isConnected && styles.actionBtnConnected]}
            onPress={toggleConnection}
            activeOpacity={0.8}
            disabled={connectingLoading}
          >
            <LinearGradient
              colors={isConnected ? ['#334155', '#1e293b'] : ['#6366f1', '#4f46e5']}
              style={styles.actionBtnInner}
            >
              {isConnected ? (
                <>
                  <UserCheck size={16} color="#38bdf8" style={{ marginRight: 5 }} />
                  <Text style={[styles.actionBtnText, { color: '#38bdf8' }]}>Bağlantıdasınız</Text>
                </>
              ) : (
                <>
                  <UserPlus size={16} color="#ffffff" style={{ marginRight: 5 }} />
                  <Text style={styles.actionBtnText}>Bağlantı Kur</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Mesaj Gönder */}
          <TouchableOpacity
            style={styles.actionBtnChat}
            onPress={startChat}
            activeOpacity={0.8}
          >
            <View style={styles.actionBtnInnerSecondary}>
              <MessageCircle size={17} color="#cbd5e1" style={{ marginRight: 4 }} />
              <Text style={styles.actionBtnTextSecondary}>Mesaj</Text>
            </View>
          </TouchableOpacity>

          {/* Sesli Arama */}
          <TouchableOpacity
            style={styles.actionBtnIcon}
            onPress={() => startCall('audio')}
            activeOpacity={0.8}
          >
            <View style={styles.iconCircleCyan}>
              <Phone size={17} color="#06b6d4" />
            </View>
          </TouchableOpacity>

          {/* Görüntülü Arama */}
          <TouchableOpacity
            style={styles.actionBtnIcon}
            onPress={() => startCall('video')}
            activeOpacity={0.8}
          >
            <View style={styles.iconCircleGreen}>
              <Video size={17} color="#34d399" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Tab Bar Simge Çizgisi (Grid Tab) */}
        <View style={styles.tabIndicatorBar}>
          <View style={styles.activeTabItem}>
            <Grid size={20} color="#818cf8" />
          </View>
        </View>

        {/* Instagram 3'lü Fotoğraf Izgarası */}
        {loading ? (
          <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 30 }} />
        ) : photos.length > 0 ? (
          <View style={styles.photosGrid}>
            {photos.map((item, idx) => (
              <TouchableOpacity
                key={item.id}
                style={styles.gridItem}
                onPress={() => setSelectedPhotoIndex(idx)}
                activeOpacity={0.85}
              >
                <Image source={{ uri: item.photo_url }} style={styles.gridImage} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyGallery}>
            <Sparkles size={36} color="#475569" style={{ marginBottom: 10 }} />
            <Text style={styles.emptyGalleryTitle}>Henüz fotoğraf yüklenmemiş</Text>
            <Text style={styles.emptyGallerySubtitle}>
              Kullanıcı vitrinine fotoğraf eklediğinde burada görünecek.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Instagram Tarzı Yana Kaydırılabilir (Swipe Carousel) Fotoğraf & Beğeni Modalı */}
      {selectedPhotoIndex !== null && photos.length > 0 && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.carouselOverlay}>
            {/* Üst Bar */}
            <View style={styles.carouselHeader}>
              <TouchableOpacity
                style={styles.carouselIconBtn}
                onPress={() => setSelectedPhotoIndex(null)}
              >
                <X size={24} color="#ffffff" />
              </TouchableOpacity>

              <Text style={styles.carouselIndexIndicator}>
                {selectedPhotoIndex + 1} / {photos.length}
              </Text>

              <View style={{ width: 40 }} />
            </View>

            {/* Yatay Kaydırılabilir Fotoğraf Listesi */}
            <ScrollView
              ref={photoScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: selectedPhotoIndex * width, y: 0 }}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
                setSelectedPhotoIndex(newIndex);
              }}
              style={styles.carouselScrollView}
            >
              {photos.map((photo) => {
                const isLiked = likedPhotoIds.has(photo.id);
                const likesCount = photoLikesMap[photo.id] || 0;

                return (
                  <View key={photo.id} style={styles.carouselSlide}>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => handleModalPhotoDoubleTap(photo.id)}
                      style={styles.carouselImageWrapper}
                    >
                      <Image
                        source={{ uri: photo.photo_url }}
                        style={styles.carouselFullImage}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>

                    {/* Alt Çubuk: Beğeni Butonu, Beğeni Sayısı ve Tarih */}
                    <View style={styles.carouselFooter}>
                      <View style={styles.carouselFooterRow}>
                        <TouchableOpacity
                          style={styles.carouselLikeBtn}
                          onPress={() => togglePhotoLike(photo.id)}
                          activeOpacity={0.7}
                        >
                          <Heart
                            size={26}
                            color={isLiked ? '#ef4444' : '#ffffff'}
                            fill={isLiked ? '#ef4444' : 'transparent'}
                          />
                          <Text style={[styles.carouselLikeText, isLiked && styles.likedTextActive]}>
                            {likesCount} beğenme
                          </Text>
                        </TouchableOpacity>

                        <Text style={styles.carouselDateText}>
                          {new Date(photo.created_at).toLocaleDateString([], {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </Text>
                      </View>

                      {photo.caption ? (
                        <Text style={styles.carouselCaptionText}>{photo.caption}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </Modal>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 55,
    paddingBottom: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  backBtn: {
    padding: 6,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  profileHeaderSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarImage: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 2.5,
    borderColor: '#6366f1',
  },
  avatarGradient: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: 'bold',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10b981',
    borderWidth: 3,
    borderColor: '#07090e',
  },
  statsContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginLeft: 20,
  },
  statBox: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
  },
  statLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  bioSection: {
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  profileFullName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 3,
  },
  statusBadge: {
    fontSize: 13,
    color: '#34d399',
    fontWeight: '600',
    marginBottom: 6,
  },
  bioText: {
    fontSize: 14,
    color: '#cbd5e1',
    lineHeight: 20,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  actionBtnConnect: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionBtnConnected: {
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  actionBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnChat: {
    flex: 1.5,
    borderRadius: 12,
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  actionBtnInnerSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  actionBtnTextSecondary: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  actionBtnIcon: {
    width: 42,
    height: 42,
  },
  iconCircleCyan: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleGreen: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIndicatorBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 2,
  },
  activeTabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#818cf8',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  gridItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    backgroundColor: '#1e293b',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  emptyGallery: {
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyGalleryTitle: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyGallerySubtitle: {
    color: '#475569',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  carouselOverlay: {
    flex: 1,
    backgroundColor: '#000000',
  },
  carouselHeader: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  carouselIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselIndexIndicator: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  carouselScrollView: {
    flex: 1,
  },
  carouselSlide: {
    width: width,
    flex: 1,
    justifyContent: 'space-between',
  },
  carouselImageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselFullImage: {
    width: width,
    height: '100%',
  },
  carouselFooter: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  carouselFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  carouselLikeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  carouselLikeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  likedTextActive: {
    color: '#ef4444',
  },
  carouselDateText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  carouselCaptionText: {
    color: '#f8fafc',
    fontSize: 14,
    lineHeight: 20,
  },
});
