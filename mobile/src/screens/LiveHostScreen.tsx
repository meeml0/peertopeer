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
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { Users, SwitchCamera, Mic, MicOff, X, Send, Heart } from 'lucide-react-native';
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

export const LiveHostScreen = ({ route, navigation }: any) => {
  const { title } = route.params || { title: 'Canlı Yayın' };
  const { user, profile } = useAuth();
  const socket = socketService.getSocket();

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [isMuted, setIsMuted] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');

  // WebRTC mesh peer bağlantıları: Map<viewerSocketId, RTCPeerConnection>
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStream = useRef<MediaStream | null>(null);
  const webVideoRef = useRef<any>(null);

  // 1. İzinleri ve Yayını Başlat
  useEffect(() => {
    (async () => {
      if (!permission?.granted) {
        await requestPermission();
      }
      initHostStream();
    })();

    return () => {
      handleEndStream();
    };
  }, []);

  // Web tarayıcısı için kamera/mikrofon akışını al
  useEffect(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          localStream.current = stream;
          if (webVideoRef.current) {
            webVideoRef.current.srcObject = stream;
          }
        })
        .catch((err) => console.warn('Kamera akışı alınamadı:', err));
    }
  }, []);

  const initHostStream = async () => {
    if (!user) return;

    // Supabase kaydı oluştur
    const { stream, error } = await liveStreamService.createStream(user.id, title);
    if (error || !stream) {
      Alert.alert('Hata', 'Canlı yayın başlatılamadı.');
      navigation.goBack();
      return;
    }

    setStreamId(stream.id);

    // Socket sunucusuna bildir
    if (socket) {
      socket.emit('start_live_stream', { streamId: stream.id, hostId: user.id });

      // Odaya yeni bir izleyici geldiğinde
      socket.on('new_stream_viewer', async ({ viewerSocketId }: { viewerSocketId: string }) => {
        console.log('[Host] Yeni izleyici katıldı:', viewerSocketId);
        createOfferForViewer(stream.id, viewerSocketId);
      });

      // İzleyiciden WebRTC cevabı geldiğinde
      socket.on('stream_answer_received', async ({ viewerSocketId, answer }: any) => {
        const pc = peerConnections.current.get(viewerSocketId);
        if (pc && answer) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          } catch (e) {
            console.error('[Host] Remote description hatası:', e);
          }
        }
      });

      // İzleyiciden ICE Candidate geldiğinde
      socket.on('stream_ice_candidate', async ({ fromSocketId, candidate }: any) => {
        const pc = peerConnections.current.get(fromSocketId);
        if (pc && candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('[Host] Candidate ekleme hatası:', e);
          }
        }
      });

      // İzleyici sayısı güncellendiğinde
      socket.on('stream_viewer_count', ({ count }: { count: number }) => {
        setViewerCount(count);
      });

      // Chat mesajı geldiğinde
      socket.on('stream_chat_received', (msg: ChatMessage) => {
        setChatMessages((prev) => [...prev.slice(-30), msg]);
      });
    }
  };

  // Yeni gelen izleyiciye WebRTC Offer gönder
  const createOfferForViewer = async (sId: string, viewerSocketId: string) => {
    if (typeof RTCPeerConnection === 'undefined') return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current.set(viewerSocketId, pc);

    // Host'un ses ve video track'lerini ekle
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('stream_ice_candidate', {
          targetSocketId: viewerSocketId,
          candidate: event.candidate,
        });
      }
    };

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);

      socket?.emit('stream_offer_to_viewer', {
        streamId: sId,
        viewerSocketId,
        offer,
      });
    } catch (e) {
      console.error('[Host] Offer oluşturulamadı:', e);
    }
  };

  const toggleCameraFacing = () => {
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach((track) => {
        track.enabled = isMuted; // Tam tersine ayarla
      });
    }
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !streamId || !socket) return;

    socket.emit('stream_send_chat', {
      streamId,
      message: inputMessage.trim(),
      senderName: profile?.full_name || 'Yayıncı',
      senderAvatar: profile?.avatar_url,
    });
    setInputMessage('');
  };

  const handleEndStream = async () => {
    if (streamId) {
      socket?.emit('end_live_stream', { streamId });
      await liveStreamService.endStream(streamId);
    }

    // Temizlik
    peerConnections.current.forEach((pc) => {
      try {
        pc.close();
      } catch (e) {}
    });
    peerConnections.current.clear();

    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => t.stop());
    }

    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Kamera Görünümü */}
      <View style={StyleSheet.absoluteFillObject}>
        {Platform.OS === 'web' ? (
          <video
            ref={webVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'front' ? 'scaleX(-1)' : 'none' }}
          />
        ) : (
          <CameraView style={StyleSheet.absoluteFillObject} facing={facing} />
        )}
      </View>

      {/* Karartma Gradyanı */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.8)']}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="box-none"
      />

      {/* Üst Bar: Canlı Rozeti, İzleyici Sayısı, Kapat Butonu */}
      <View style={styles.topHeader}>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>CANLI</Text>
        </View>

        <View style={styles.viewerBadge}>
          <Users size={14} color="#ffffff" style={{ marginRight: 5 }} />
          <Text style={styles.viewerText}>{viewerCount}</Text>
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={handleEndStream}>
          <X size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Sağ Yan Araç Çubuğu (Kamera Çevir, Mikrofon Aç/Kapat) */}
      <View style={styles.sideControls}>
        <TouchableOpacity style={styles.sideBtn} onPress={toggleCameraFacing}>
          <SwitchCamera size={22} color="#ffffff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.sideBtn, isMuted && styles.sideBtnActive]} onPress={toggleMute}>
          {isMuted ? <MicOff size={22} color="#ff4444" /> : <Mic size={22} color="#ffffff" />}
        </TouchableOpacity>
      </View>

      {/* Alt Bölüm: Canlı Yorum Akışı ve Mesaj Yazma */}
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
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 30 : 10,
    zIndex: 10,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff2d55',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 5,
  },
  liveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  viewerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    marginLeft: 'auto',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideControls: {
    position: 'absolute',
    right: 16,
    top: 100,
    zIndex: 10,
  },
  sideBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  sideBtnActive: {
    backgroundColor: 'rgba(255, 68, 68, 0.4)',
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
