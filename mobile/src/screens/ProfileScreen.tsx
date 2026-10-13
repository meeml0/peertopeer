import React, { useState, useEffect, useRef } from 'react';
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
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Settings,
  Camera,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Sparkles,
  Grid,
  Heart,
} from 'lucide-react-native';

import { PulsCoinBadge } from '../components/PulsCoinBadge';

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - 6) / 3;

export const ProfileScreen = ({ navigation }: any) => {
  const { user, profile, refreshProfile, pulscoinBalance } = useAuth();

  const [photos, setPhotos] = useState<any[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Bağlantı Sayısı & Toplam Beğeni Sayısı
  const [connectionCount, setConnectionCount] = useState(0);
  const [totalLikesCount, setTotalLikesCount] = useState(0);

  // Fotoğraf Detay Kaydırmalı Modal (Instagram Swipe Carousel)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [likedPhotoIds, setLikedPhotoIds] = useState<Set<string>>(new Set());
  const [photoLikesMap, setPhotoLikesMap] = useState<Record<string, number>>({});
  const photoScrollRef = useRef<ScrollView>(null);
  const lastTapRef = useRef<Record<string, number>>({});

  // Düzenleme Modalı (Bio & İsim)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFullName, setEditFullName] = useState(profile?.full_name || '');
  const [editUsername, setEditUsername] = useState(profile?.username || '');
  const [editBio, setEditBio] = useState(profile?.bio || '');
  const [editStatus, setEditStatus] = useState(profile?.status_message || '');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    fetchProfileData();
  }, [user?.id]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchProfileData();
    });
    return unsubscribe;
  }, [navigation, user?.id]);

  const fetchProfileData = async () => {
    if (!user) return;
    fetchPhotos();
    fetchConnectionCount();
    fetchTotalLikesAndDetails();
  };

  const fetchConnectionCount = async () => {
    if (!user) return;
    try {
      const { count } = await supabase
        .from('user_connections')
        .select('*', { count: 'exact', head: true })
        .or(`follower_id.eq.${user.id},following_id.eq.${user.id}`);

      setConnectionCount(count || 0);
    } catch (e) {
      console.log('Bağlantı sayısı hatası:', e);
    }
  };

  const fetchTotalLikesAndDetails = async () => {
    if (!user) return;
    try {
      // 1. Kullanıcının fotoğraflarının aldığı tüm beğenileri çek
      const { data: userPhotos } = await supabase
        .from('user_photos')
        .select('id')
        .eq('user_id', user.id);

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

      // 2. Kendi beğendiği fotoğrafları çek
      const { data: myLikes } = await supabase
        .from('photo_likes')
        .select('photo_id')
        .eq('user_id', user.id);

      if (myLikes) {
        setLikedPhotoIds(new Set(myLikes.map((l) => l.photo_id)));
      }
    } catch (e) {
      console.log('Beğeni detayları alınamadı:', e);
    }
  };

  useEffect(() => {
    if (profile) {
      setEditFullName(profile.full_name || '');
      setEditUsername(profile.username || '');
      setEditBio(profile.bio || '');
      setEditStatus(profile.status_message || '');
    }
  }, [profile]);

  const fetchPhotos = async () => {
    if (!user) return;
    try {
      setLoadingPhotos(true);
      const { data, error } = await supabase
        .from('user_photos')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPhotos(data || []);
    } catch (err) {
      console.error('Vitrin fotoğrafları alınamadı:', err);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const togglePhotoLike = async (photoId: string) => {
    if (!user) return;
    const isAlreadyLiked = likedPhotoIds.has(photoId);

    // İyimser UI güncellemesi
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
      fetchTotalLikesAndDetails();
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

  // Avatar Değiştir
  const pickAndUploadAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert('Fotoğraf seçebilmek için galeri izni gereklidir.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      setUploadingAvatar(true);

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const fileExt = asset.uri.split('.').pop() || 'jpg';
      const fileName = `${user?.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const newUrl = publicUrlData.publicUrl;

      await supabase
        .from('profiles')
        .update({ avatar_url: newUrl })
        .eq('id', user?.id);

      await refreshProfile();
      alert('Profil fotoğrafınız güncellendi!');
    } catch (err: any) {
      alert('Fotoğraf yüklenemedi: ' + err.message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Vitrine Fotoğraf Ekle (+)
  const addGalleryPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert('Fotoğraf seçebilmek için galeri izni gereklidir.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      setUploadingPhoto(true);

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const fileExt = asset.uri.split('.').pop() || 'jpg';
      const fileName = `${user?.id}/photo-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('profile_photos')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('profile_photos')
        .getPublicUrl(fileName);

      const photoUrl = publicUrlData.publicUrl;

      const { data: newRow, error: dbError } = await supabase
        .from('user_photos')
        .insert({
          user_id: user?.id,
          photo_url: photoUrl,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setPhotos((prev) => [newRow, ...prev]);
    } catch (err: any) {
      alert('Yüklenemedi: ' + err.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Fotoğraf Sil
  const deletePhoto = async (photoId: string) => {
    try {
      const { error } = await supabase
        .from('user_photos')
        .delete()
        .eq('id', photoId)
        .eq('user_id', user?.id);

      if (error) throw error;
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setSelectedPhotoIndex(null);
    } catch (e: any) {
      alert('Fotoğraf silinemedi: ' + e.message);
    }
  };

  // Profili Kaydet
  const handleSaveProfile = async () => {
    if (!editUsername.trim()) {
      alert('Kullanıcı adı boş olamaz');
      return;
    }

    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: editUsername.trim(),
          full_name: editFullName.trim(),
          bio: editBio.trim(),
          status_message: editStatus.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user?.id);

      if (error) throw error;

      await refreshProfile();
      setIsEditModalOpen(false);
      alert('Profil güncellendi!');
    } catch (err: any) {
      alert('Güncelleme hatası: ' + err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header (Instagram Style) */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>@{profile?.username}</Text>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => navigation.navigate('Settings')}
          activeOpacity={0.8}
        >
          <Settings size={22} color="#f8fafc" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Instagram Header Bölümü: Avatar + Sayılar */}
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

            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={pickAndUploadAvatar}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Camera size={14} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>

          {/* Sayısal İstatistikler: Gönderi, Gerçek Bağlantı, Toplam Beğeni */}
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

        {/* PulsCoin Cüzdan Kartı */}
        <View style={styles.walletCard}>
          <LinearGradient
            colors={['rgba(245, 158, 11, 0.15)', 'rgba(217, 119, 6, 0.05)']}
            style={styles.walletCardInner}
          >
            <View style={styles.walletLeft}>
              <View style={styles.walletCoinIcon}>
                <Sparkles size={22} color="#fbbf24" />
              </View>
              <View>
                <Text style={styles.walletTitle}>PulsCoin Bakiyesi</Text>
                <Text style={styles.walletSubtext}>Arama ve mesajlaşma bakiyesi</Text>
              </View>
            </View>

            <PulsCoinBadge balance={pulscoinBalance} size="medium" showLabel />
          </LinearGradient>
        </View>

        {/* Eylem Butonları: Profili Düzenle & Fotoğraf Ekle */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={styles.editProfileBtn}
            onPress={() => setIsEditModalOpen(true)}
            activeOpacity={0.8}
          >
            <Edit3 size={15} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.editProfileText}>Profili Düzenle</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addPhotoCtaBtn}
            onPress={addGalleryPhoto}
            disabled={uploadingPhoto}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#6366f1', '#8b5cf6']}
              style={styles.addPhotoInner}
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Plus size={16} color="#ffffff" style={{ marginRight: 4 }} />
                  <Text style={styles.addPhotoCtaText}>Fotoğraf Ekle</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Tab Bar Simge Çizgisi (Grid Tab) */}
        <View style={styles.tabIndicatorBar}>
          <View style={styles.activeTabItem}>
            <Grid size={20} color="#818cf8" />
          </View>
        </View>

        {/* Instagram 3'lü Fotoğraf Izgarası */}
        {loadingPhotos ? (
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
          <View style={styles.emptyGridContainer}>
            <Sparkles size={36} color="#475569" style={{ marginBottom: 10 }} />
            <Text style={styles.emptyTitle}>Henüz fotoğraf paylaşmadınız</Text>
            <Text style={styles.emptySubtitle}>
              "Fotoğraf Ekle" butonuna basarak vitrininizi doldurmaya başlayın.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Profil Düzenleme Modalı */}
      <Modal visible={isEditModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.editModalCard}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>Profili Düzenle</Text>
              <TouchableOpacity onPress={() => setIsEditModalOpen(false)}>
                <X size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Kullanıcı Adı</Text>
              <TextInput
                style={styles.modalInput}
                value={editUsername}
                onChangeText={setEditUsername}
                placeholderTextColor="#64748b"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Ad Soyad</Text>
              <TextInput
                style={styles.modalInput}
                value={editFullName}
                onChangeText={setEditFullName}
                placeholderTextColor="#64748b"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Durum İletisi</Text>
              <TextInput
                style={styles.modalInput}
                value={editStatus}
                onChangeText={setEditStatus}
                placeholderTextColor="#64748b"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Biyografi</Text>
              <TextInput
                style={[styles.modalInput, { height: 75, textAlignVertical: 'top' }]}
                value={editBio}
                onChangeText={setEditBio}
                placeholderTextColor="#64748b"
                multiline
              />
            </View>

            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={handleSaveProfile}
              disabled={savingProfile}
            >
              <LinearGradient
                colors={['#6366f1', '#8b5cf6']}
                style={styles.modalSaveInner}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Check size={18} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.modalSaveText}>Değişiklikleri Kaydet</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

              <TouchableOpacity
                style={styles.carouselIconBtn}
                onPress={() => {
                  const currentPhoto = photos[selectedPhotoIndex];
                  if (currentPhoto) {
                    deletePhoto(currentPhoto.id);
                    setSelectedPhotoIndex(null);
                  }
                }}
              >
                <Trash2 size={20} color="#ef4444" />
              </TouchableOpacity>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
  },
  settingsBtn: {
    padding: 6,
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
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
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
    marginBottom: 12,
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
  walletCard: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  walletCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  walletLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletCoinIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  walletTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  walletSubtext: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  editProfileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  editProfileText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  addPhotoCtaBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  addPhotoInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  addPhotoCtaText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
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
  emptyGridContainer: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyTitle: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: '#475569',
    fontSize: 12,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  editModalCard: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  modalInput: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 15,
  },
  modalSaveBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 10,
  },
  modalSaveInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  modalSaveText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
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
