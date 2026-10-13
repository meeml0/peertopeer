import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft,
  User,
  Check,
  Shield,
  Lock,
  Camera,
  Image as ImageIcon,
  Plus,
  Trash2,
  FileText,
  LogOut,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - 64) / 3;

export const SettingsScreen = ({ navigation }: any) => {
  const { user, profile, refreshProfile, signOut } = useAuth();

  const [username, setUsername] = useState(profile?.username || '');
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [statusMessage, setStatusMessage] = useState(profile?.status_message || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Profil Vitrin Fotoğrafları
  const [galleryPhotos, setGalleryPhotos] = useState<any[]>([]);
  const [uploadingGalleryPhoto, setUploadingGalleryPhoto] = useState(false);

  // Şifre Değiştirme
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    fetchGalleryPhotos();
  }, [user?.id]);

  const fetchGalleryPhotos = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('user_photos')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGalleryPhotos(data || []);
    } catch (err) {
      console.error('Vitrin fotoğrafları alınamadı:', err);
    }
  };

  // 1. Profil Resmi (Avatar) Yükleme -> 'avatars' bucket'ı
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
      setAvatarUrl(newUrl);

      await supabase
        .from('profiles')
        .update({ avatar_url: newUrl })
        .eq('id', user?.id);

      await refreshProfile();
      alert('Profil fotoğrafınız güncellendi!');
    } catch (err: any) {
      console.error('Avatar yükleme hatası:', err);
      alert('Fotoğraf yüklenemedi: ' + (err.message || 'Hata oluştu.'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  // 2. Vitrine Yeni Fotoğraf Ekleme -> 'profile_photos' bucket'ı
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
      setUploadingGalleryPhoto(true);

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

      // user_photos tablosuna kaydet
      const { data: newRow, error: dbError } = await supabase
        .from('user_photos')
        .insert({
          user_id: user?.id,
          photo_url: photoUrl,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setGalleryPhotos((prev) => [newRow, ...prev]);
      alert('Fotoğraf vitrininize eklendi!');
    } catch (err: any) {
      console.error('Vitrin fotoğrafı yüklenirken hata:', err);
      alert('Yüklenemedi: ' + (err.message || 'Hata oluştu.'));
    } finally {
      setUploadingGalleryPhoto(false);
    }
  };

  // 3. Vitrinden Fotoğraf Silme
  const deleteGalleryPhoto = async (photoId: string) => {
    try {
      const { error } = await supabase
        .from('user_photos')
        .delete()
        .eq('id', photoId)
        .eq('user_id', user?.id);

      if (error) throw error;

      setGalleryPhotos((prev) => prev.filter((p) => p.id !== photoId));
      alert('Fotoğraf vitrinden kaldırıldı.');
    } catch (err: any) {
      alert('Fotoğraf silinemedi: ' + err.message);
    }
  };

  // 4. Profil Bilgilerini (İsim, Bio vb.) Güncelleme
  const handleUpdateProfile = async () => {
    if (!username.trim()) {
      alert('Kullanıcı adı boş bırakılamaz.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: username.trim(),
          full_name: fullName.trim(),
          bio: bio.trim(),
          status_message: statusMessage.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user?.id);

      if (error) throw error;

      await refreshProfile();
      alert('Profil bilgileriniz başarıyla güncellendi!');
    } catch (err: any) {
      console.error('Profil güncelleme hatası:', err);
      alert('Güncelleme başarısız: ' + (err.message || 'Hata oluştu.'));
    } finally {
      setSaving(false);
    }
  };

  // 5. Şifre Güncelleme
  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      alert('Yeni şifre en az 6 karakter olmalıdır.');
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setNewPassword('');
      alert('Şifreniz başarıyla güncellendi!');
    } catch (err: any) {
      alert('Şifre güncellenemedi: ' + (err.message || 'Hata oluştu.'));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <ArrowLeft size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profili Düzenle & Ayarlar</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar Yükleme Alanı */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <LinearGradient
                colors={['#6366f1', '#a855f7']}
                style={styles.avatarCircle}
              >
                <Text style={styles.avatarLetter}>
                  {username?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </LinearGradient>
            )}

            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={pickAndUploadAvatar}
              disabled={uploadingAvatar}
              activeOpacity={0.8}
            >
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Camera size={18} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.changePhotoText} onPress={pickAndUploadAvatar}>
            {uploadingAvatar ? 'Avatar yükleniyor...' : 'Profil Resmini Değiştir'}
          </Text>
          <Text style={styles.emailText}>{user?.email}</Text>
        </View>

        {/* Profil Vitrin Fotoğrafları (Galeri Yönetimi) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <ImageIcon size={18} color="#818cf8" style={{ marginRight: 8 }} />
            <Text style={styles.cardTitle}>Profil Vitrini (Herkese Açık Fotoğraflar)</Text>
          </View>
          <Text style={styles.cardDesc}>
            Profilinizi ziyaret eden kişilerin görebileceği vitrin fotoğraflarınız.
          </Text>

          <View style={styles.galleryGrid}>
            {/* Fotoğraf Ekle Butonu */}
            <TouchableOpacity
              style={styles.addPhotoBtn}
              onPress={addGalleryPhoto}
              disabled={uploadingGalleryPhoto}
              activeOpacity={0.8}
            >
              {uploadingGalleryPhoto ? (
                <ActivityIndicator size="small" color="#818cf8" />
              ) : (
                <>
                  <Plus size={26} color="#818cf8" />
                  <Text style={styles.addPhotoText}>Ekle</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Mevcut Vitrin Fotoğrafları */}
            {galleryPhotos.map((photo) => (
              <View key={photo.id} style={styles.galleryItem}>
                <Image source={{ uri: photo.photo_url }} style={styles.galleryItemImage} />
                <TouchableOpacity
                  style={styles.deletePhotoBtn}
                  onPress={() => deleteGalleryPhoto(photo.id)}
                >
                  <Trash2 size={14} color="#ffffff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Profil & Biyografi Bilgileri Kartı */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <User size={18} color="#818cf8" style={{ marginRight: 8 }} />
            <Text style={styles.cardTitle}>Profil Bilgileri & Biyografi</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Kullanıcı Adı</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Kullanıcı adı"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Ad Soyad</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Ad Soyad"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Durum İletisi (Kısa Başlık)</Text>
            <TextInput
              style={styles.input}
              value={statusMessage}
              onChangeText={setStatusMessage}
              placeholder="örn: Müsait, İşte, PulseCall'da..."
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Biyografi / Hakkında</Text>
            <TextInput
              style={[styles.input, { height: 75, textAlignVertical: 'top' }]}
              value={bio}
              onChangeText={setBio}
              placeholder="Kendinizden bahsedin..."
              placeholderTextColor="#64748b"
              multiline
            />
          </View>

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleUpdateProfile}
            disabled={saving}
          >
            <LinearGradient
              colors={['#6366f1', '#8b5cf6']}
              style={styles.gradientBtnInner}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Check size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.btnText}>Bilgileri Kaydet</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Güvenlik & Şifre Değiştirme Kartı */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Lock size={18} color="#34d399" style={{ marginRight: 8 }} />
            <Text style={styles.cardTitle}>Güvenlik & Şifre</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Yeni Şifre</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleUpdatePassword}
            disabled={savingPassword || !newPassword}
          >
            <LinearGradient
              colors={['#10b981', '#059669']}
              style={styles.gradientBtnInner}
            >
              {savingPassword ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Shield size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.btnText}>Şifreyi Güncelle</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Hesaptan Çıkış Yap Butonu */}
        <TouchableOpacity
          style={styles.logoutCardBtn}
          onPress={async () => {
            await signOut();
          }}
          activeOpacity={0.8}
        >
          <LogOut size={18} color="#ef4444" style={{ marginRight: 8 }} />
          <Text style={styles.logoutBtnText}>Hesaptan Çıkış Yap</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 10,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2.5,
    borderColor: '#6366f1',
  },
  avatarLetter: {
    fontSize: 38,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#07090e',
    shadowColor: '#6366f1',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 5,
  },
  changePhotoText: {
    color: '#818cf8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  emailText: {
    color: '#64748b',
    fontSize: 13,
  },
  card: {
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
    borderRadius: 22,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
  },
  cardDesc: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 14,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  addPhotoBtn: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#6366f1',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    color: '#818cf8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  galleryItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1e293b',
  },
  galleryItemImage: {
    width: '100%',
    height: '100%',
  },
  deletePhotoBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  saveBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
  },
  gradientBtnInner: {
    flexDirection: 'row',
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  logoutCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    marginTop: 8,
    marginBottom: 20,
  },
  logoutBtnText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '700',
  },
});
