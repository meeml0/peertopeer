import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Platform,
  Alert,
  Dimensions,
  SafeAreaView,
  KeyboardAvoidingView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Users, X, Send, Heart, Lock, ShieldAlert } from 'lucide-react-native';
import { socketService } from '../services/socket';
import { liveStreamService } from '../services/liveStream';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface ChatMessage {
  id: string;
  senderName: string;
  message: string;
  isHeart?: boolean;
}

export const LiveViewerScreen = ({ route, navigation }: any) => {
  const { streamId, hostUser } = route.params;
  const { user, profile } = useAuth();
  const socket = socketService.getSocket();

  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const remoteVideoRef = useRef<any>(null);

  // 1. Takip Kontrolü ve Yetkilendirme
  useEffect(() => {
    checkPermissionAndConnect();

    return () => {
      leaveStream();
    };
  }, []);

  const checkPermissionAndConnect = async () => {
    if (!user || !hostUser?.id) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    // Takipçi mi kontrol et
    const isAllowed = await liveStreamService.checkFollowPermission(user.id, hostUser.id);
    if (!isAllowed) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    setLoading(false);
    initViewerSocket();
  };

  const initViewerSocket = () => {
    if (!socket || !user) return;

    // Yayın odasına katıl
    socket.emit('join_live_stream', {
      streamId,
      viewerId: user.id,
      hostId: hostUser.id,
    });

    // Yayıncıdan WebRTC teklifi (Offer) geldiğinde
    socket.on('stream_offer_received', async ({ offer, hostUserId }: any) => {
      console.log('[Viewer] Yayıncıdan offer alındı, yanıt hazırlanıyor...');
      await handleOfferFromHost(offer);
    });

    // ICE Candidate
    socket.on('stream_ice_candidate', async ({ candidate }: any) => {
      if (peerConnection.current && candidate) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('[Viewer] ICE Candidate hatası:', e);
        }
      }
    });

    // İzleyici sayısı güncellemesi
    socket.on('stream_viewer_count', ({ count }: { count: number }) => {
      setViewerCount(count);
    });

    // Chat mesajı
    socket.on('stream_chat_received', (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev.slice(-30), msg]);
    });

    // Yayıncı yayını sonlandırdığında
    socket.on('stream_ended', () => {
      Alert.alert('Yayın Bitti', 'Yayıncı canlı yayını sonlandırdı.', [
        { text: 'Tamam', onPress: () => navigation.goBack() },
      ]);
    });
  };

  const handleOfferFromHost = async (offer: any) => {
    if (typeof RTCPeerConnection === 'undefined') return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnection.current = pc;

    pc.ontrack = (event) => {
      console.log('[Viewer] Yayıncının medya akışı yakalandı:', event.streams);
      const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch((e: any) => console.warn('Otomatik oynatma:', e));
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('stream_ice_candidate', {
          targetSocketId: null, // Sunucu host'a yönlendirecek
          candidate: event.candidate,
        });
      }
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Cevabı sunucu üzerinden host'a ilet
      socket?.emit('stream_answer_from_viewer', {
        streamId,
        hostId: hostUser.id,
        answer,
      });
    } catch (e) {
      console.error('[Viewer] Offer yanıtlanırken hata:', e);
    }
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !socket) return;

    socket.emit('stream_send_chat', {
      streamId,
      message: inputMessage.trim(),
      senderName: profile?.full_name || 'İzleyici',
      senderAvatar: profile?.avatar_url,
    });
    setInputMessage('');
  };

  const handleSendHeart = () => {
    if (!socket) return;
    socket.emit('stream_send_chat', {
      streamId,
      message: '❤️',
      isHeart: true,
      senderName: profile?.full_name || 'İzleyici',
      senderAvatar: profile?.avatar_url,
    });
  };

  const leaveStream = () => {
    if (socket) {
      socket.emit('leave_live_stream', { streamId });
    }
    if (peerConnection.current) {
      try {
        peerConnection.current.close();
      } catch (e) {}
      peerConnection.current = null;
    }
  };

  // 1. Yükleniyor Ekranı
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>Yayın odasına bağlanılıyor...</Text>
      </View>
    );
  }

  // 2. Takip Etmiyor - Erişim Engellendi Ekranı
  if (accessDenied) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <View style={styles.lockBox}>
          <ShieldAlert size={50} color="#ff4444" style={{ marginBottom: 16 }} />
          <Text style={styles.lockTitle}>Özel Canlı Yayın</Text>
          <Text style={styles.lockDescription}>
            Bu canlı yayını yalnızca <Text style={{ fontWeight: 'bold', color: '#fff' }}>{hostUser?.full_name || 'bu kullanıcıyı'}</Text> takip eden kişiler izleyebilir.
          </Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backBtnText}>Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 3. Canlı Yayın İzleme Ekranı
  return (
    <SafeAreaView style={styles.container}>
      {/* Yayıncının Medya Akışı */}
      <View style={StyleSheet.absoluteFillObject}>
        {Platform.OS === 'web' ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, styles.mobilePlaceholder]}>
            <Image
              source={{ uri: hostUser?.avatar_url || 'https://via.placeholder.com/150' }}
              style={styles.hostAvatarBig}
            />
            <Text style={styles.mobilePlaceholderText}>{hostUser?.full_name} Canlı Yayında</Text>
          </View>
        )}
      </View>

      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.8)']}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="box-none"
      />

      {/* Üst Bar: Canlı Rozeti, Host Bilgisi, İzleyici Sayısı, Çıkış */}
      <View style={styles.topHeader}>
        <View style={styles.hostInfo}>
          <Image
            source={{ uri: hostUser?.avatar_url || 'https://via.placeholder.com/40' }}
            style={styles.hostAvatar}
          />
          <View>
            <Text style={styles.hostName}>{hostUser?.full_name}</Text>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>CANLI</Text>
            </View>
          </View>
        </View>

        <View style={styles.viewerBadge}>
          <Users size={14} color="#ffffff" style={{ marginRight: 5 }} />
          <Text style={styles.viewerText}>{viewerCount}</Text>
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <X size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Alt Bölüm: Canlı Chat & Beğeni */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottomArea}
      >
        <View style={styles.chatListContainer}>
          <FlatList
            data={chatMessages}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.chatBubble}>
                <Text style={styles.chatSender}>{item.senderName}: </Text>
                <Text style={styles.chatContent}>
                  {item.isHeart ? '❤️' : item.message}
                </Text>
              </View>
            )}
          />
        </View>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Yorum yap..."
            placeholderTextColor="#8892b0"
            value={inputMessage}
            onChangeText={setInputMessage}
          />
          <TouchableOpacity style={styles.heartBtn} onPress={handleSendHeart}>
            <Heart size={20} color="#ff2d55" fill="#ff2d55" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.sendBtn} onPress={handleSendMessage}>
            <Send size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#090d16',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 14,
  },
  lockBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 24,
    borderRadius: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.2)',
  },
  lockTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  lockDescription: {
    color: '#8892b0',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  backBtn: {
    backgroundColor: '#0066cc',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  backBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 30 : 10,
    zIndex: 10,
  },
  hostInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hostAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#ff2d55',
  },
  hostName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff2d55',
    marginRight: 4,
  },
  liveText: {
    color: '#ff2d55',
    fontSize: 11,
    fontWeight: 'bold',
  },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 'auto',
    marginRight: 10,
  },
  viewerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobilePlaceholder: {
    backgroundColor: '#0a0e17',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hostAvatarBig: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#ff2d55',
    marginBottom: 16,
  },
  mobilePlaceholderText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    zIndex: 10,
  },
  chatListContainer: {
    maxHeight: 180,
    marginBottom: 10,
  },
  chatBubble: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  chatSender: {
    color: '#4cc9f0',
    fontSize: 13,
    fontWeight: 'bold',
  },
  chatContent: {
    color: '#fff',
    fontSize: 13,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 22,
    paddingHorizontal: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heartBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,45,85,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0066cc',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});
