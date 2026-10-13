import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { socketService } from '../services/socket';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react-native';
import { PulsCoinBadge } from '../components/PulsCoinBadge';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const COIN_RATE = {
  audio: 5, // Dakika başına 5 PulsCoin
  video: 10, // Dakika başına 10 PulsCoin
};

export const CallScreen = ({ route, navigation }: any) => {
  const { targetUser, isCaller, callType } = route.params;
  const { user, profile, pulscoinBalance, spendCoins } = useAuth();

  const requiredCoinsPerMin = callType === 'audio' ? COIN_RATE.audio : COIN_RATE.video;

  const [callStatus, setCallStatus] = useState<'calling' | 'connected' | 'ended'>(
    isCaller ? 'calling' : 'connected'
  );
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const localVideoRef = useRef<any>(null);
  const remoteVideoRef = useRef<any>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const durationRef = useRef(0);
  const hasLoggedRef = useRef(false);
  const socket = socketService.getSocket();

  // Arayan tarafın başlangıç bakiyesini denetle
  useEffect(() => {
    if (isCaller && pulscoinBalance < requiredCoinsPerMin) {
      alert(
        `Yetersiz PulsCoin! ${
          callType === 'video' ? 'Görüntülü' : 'Sesli'
        } arama başlatabilmek için en az ${requiredCoinsPerMin} PulsCoin bakiyeniz olmalıdır.`
      );
      navigation.goBack();
    }
  }, []);

  // Görüşme bağlandığında süreyi (00:00) başlat ve dakikalık PulsCoin tüketimini yönet
  useEffect(() => {
    if (callStatus === 'connected') {
      // Bağlandığı an ilk dakikanın ücretini düş (Sadece arayan kişiden)
      if (isCaller) {
        spendCoins(
          requiredCoinsPerMin,
          callType === 'video' ? 'video_call' : 'audio_call',
          `${callType === 'video' ? 'Görüntülü' : 'Sesli'} arama 1. dakika ücreti`
        );
      }

      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          const next = prev + 1;
          durationRef.current = next;

          // Her 60 saniyede bir sonraki dakikanın ücretini tahsil et
          if (isCaller && next > 0 && next % 60 === 0) {
            spendCoins(
              requiredCoinsPerMin,
              callType === 'video' ? 'video_call' : 'audio_call',
              `${callType === 'video' ? 'Görüntülü' : 'Sesli'} arama (${Math.floor(next / 60) + 1}. dk)`
            ).then((success) => {
              if (!success) {
                alert('PulsCoin bakiyeniz tükendi. Görüşme sonlandırılıyor.');
                endCall();
              }
            });
          }

          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callStatus]);

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(mins)}:${pad(secs)}`;
  };

  const logCallToDatabase = async (status: 'completed' | 'missed' | 'rejected') => {
    if (hasLoggedRef.current) return;
    if (!user || !targetUser?.id) return;
    hasLoggedRef.current = true;

    try {
      const finalDuration = durationRef.current;
      const callerId = isCaller ? user.id : targetUser.id;
      const receiverId = isCaller ? targetUser.id : user.id;

      console.log(`[Call Log] Kaydediliyor: Caller=${callerId}, Receiver=${receiverId}, Status=${status}, Duration=${finalDuration}`);

      const { error } = await supabase.from('call_logs').insert({
        caller_id: callerId,
        receiver_id: receiverId,
        call_type: callType || 'video',
        status: status,
        duration: finalDuration,
      });

      if (error) {
        console.warn('Call log Supabase kayit uyarisi:', error.message);
      } else {
        console.log('[Call Log] Veritabanina basariyla yazildi!');
      }
    } catch (e) {
      console.log('Call log kaydedilemedi:', e);
    }
  };

  const cleanupCall = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    }
    if (peerConnection.current) {
      try {
        peerConnection.current.close();
      } catch (e) {}
      peerConnection.current = null;
    }
  };

  // Socket dinleyicilerini component mount olur olmaz EN BAŞTA bağla
  useEffect(() => {
    if (!socket) return;

    // Karşı taraf aramayı kabul ettiğinde (Caller tarafında tetiklenir)
    const handleCallAnswered = async (data: any) => {
      console.log('[WebRTC] Karşı taraf aramayı kabul etti! Answer işleniyor...', data);
      setCallStatus('connected');

      const pc = peerConnection.current;
      if (data?.answer && pc) {
        try {
          if (pc.signalingState !== 'stable' && pc.signalingState !== 'closed') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            console.log('[WebRTC] RemoteDescription (Answer) başarıyla kuruldu!');
          }
        } catch (setDescErr) {
          console.error('[WebRTC] setRemoteDescription hatası:', setDescErr);
        }
      }
    };

    // ICE Candidate
    const handleIceCandidate = async (data: any) => {
      const pc = peerConnection.current;
      if (data.candidate && pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('ICE adayı eklenirken hata:', e);
        }
      }
    };

    // Reddedildi
    const handleCallRejected = () => {
      logCallToDatabase('rejected');
      setCallStatus('ended');
      cleanupCall();
      alert('Karşı taraf aramayı reddetti.');
      navigation.goBack();
    };

    // Karşı taraf sonlandırdı
    const handleCallEnded = () => {
      console.log('[WebRTC] Görüşme karşı tarafça sonlandırıldı.');
      logCallToDatabase(durationRef.current > 0 ? 'completed' : 'missed');
      setCallStatus('ended');
      cleanupCall();
      navigation.goBack();
    };

    const handleCallFailed = (data: any) => {
      logCallToDatabase('missed');
      setCallStatus('ended');
      cleanupCall();
      alert(data.message || 'Kullanıcıya ulaşılamıyor.');
      navigation.goBack();
    };

    socket.on('call_answered', handleCallAnswered);
    socket.on('ice_candidate', handleIceCandidate);
    socket.on('call_rejected', handleCallRejected);
    socket.on('call_ended', handleCallEnded);
    socket.on('call_failed', handleCallFailed);

    // Çağrı başlatma sürecini tetikle
    startCallProcess();

    return () => {
      socket.off('call_answered', handleCallAnswered);
      socket.off('ice_candidate', handleIceCandidate);
      socket.off('call_rejected', handleCallRejected);
      socket.off('call_ended', handleCallEnded);
      socket.off('call_failed', handleCallFailed);
      cleanupCall();
    };
  }, []);

  const startCallProcess = async () => {
    try {
      // 1. WebRTC PeerConnection Oluştur (Web ortamı için)
      let pc: RTCPeerConnection | null = null;

      if (typeof RTCPeerConnection !== 'undefined') {
        pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnection.current = pc;
      }

      // 2. Kamera ve Mikrofon akışını al (Web)
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: callType === 'video',
            audio: true,
          });
          localStream.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }

          if (pc) {
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));

            pc.ontrack = (event) => {
              console.log('[WebRTC] Karşı taraftan ses/video akışı yakalandı!', event.streams);
              const remoteStream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
                remoteVideoRef.current.muted = false; // Sesin kesinlikle açık olduğundan emin ol
                remoteVideoRef.current.volume = 1.0;
                remoteVideoRef.current.play().catch((playErr: any) => {
                  console.warn('Otomatik ses oynatma engeli:', playErr);
                });
              }
            };

            pc.onicecandidate = (event) => {
              if (event.candidate && socket) {
                socket.emit('ice_candidate', {
                  toUserId: targetUser.id,
                  candidate: event.candidate,
                });
              }
            };
          }
        } catch (mediaErr) {
          console.warn('Medya akışı alınamadı:', mediaErr);
        }
      }

      // 3. ARAYAN TARAF (Offer oluşturup gönderir)
      if (isCaller && socket) {
        let offer = null;
        if (pc) {
          try {
            offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
            });
            await pc.setLocalDescription(offer);
          } catch (e) {
            console.log('Offer oluşturma hatası:', e);
          }
        }

        socket.emit('call_user', {
          toUserId: targetUser.id,
          callerName: profile?.username || 'Kullanıcı',
          callType: callType || 'video',
          offer,
        });
      } 
      // 4. CEVAP VEREN TARAF (Gelen offer'ı set eder ve Answer üretir)
      else if (!isCaller && socket && pc && route.params?.offer) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(route.params.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('answer_call', {
            toUserId: targetUser.id,
            answer,
          });
        } catch (ansErr) {
          console.error('Answer oluşturulamadı:', ansErr);
        }
      }
    } catch (err: any) {
      console.error('Arama başlatma hatası:', err);
    }
  };

  const endCall = () => {
    socket?.emit('end_call', { toUserId: targetUser.id });
    logCallToDatabase(durationRef.current > 0 ? 'completed' : 'missed');
    cleanupCall();
    navigation.goBack();
  };

  const toggleMute = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream.current) {
      const videoTrack = localStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header / Timer Bar */}
      <View style={styles.topHeaderBar}>
        <View style={styles.timerBadge}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: callStatus === 'connected' ? '#10b981' : '#f59e0b' },
            ]}
          />
          <Text style={styles.timerText}>
            {callStatus === 'connected'
              ? formatDuration(duration)
              : callStatus === 'calling'
              ? 'Bağlanıyor...'
              : 'Görüşme Sona Erdi'}
          </Text>
        </View>

        <PulsCoinBadge balance={pulscoinBalance} />

        <Text style={styles.participantNameBadge}>
          {targetUser.full_name || targetUser.username}
        </Text>
      </View>

      {/* Remote Video Stream Area */}
      <View style={styles.videoStreamContainer}>
        {Platform.OS === 'web' ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              backgroundColor: '#090d16',
            }}
          />
        ) : null}

        {callStatus === 'calling' && (
          <View style={styles.placeholderStream}>
            <View style={styles.avatarGlowContainer}>
              {targetUser?.avatar_url ? (
                <Image source={{ uri: targetUser.avatar_url }} style={styles.userAvatarImage} />
              ) : (
                <LinearGradient
                  colors={['#6366f1', '#a855f7']}
                  style={styles.userAvatarPlaceholder}
                >
                  <Text style={styles.userAvatarLetter}>
                    {targetUser.username?.charAt(0)?.toUpperCase() || 'U'}
                  </Text>
                </LinearGradient>
              )}
            </View>
            <Text style={styles.calleeName}>
              {targetUser.full_name || targetUser.username}
            </Text>
            <Text style={styles.statusText}>Aranıyor...</Text>
          </View>
        )}

        {/* Local Stream (Küçük Önizleme Penceresi) */}
        <View style={styles.localVideoWindow}>
          {Platform.OS === 'web' ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: 14,
                transform: 'scaleX(-1)', // Ayna efekti
              }}
            />
          ) : (
            <Text style={styles.localLabel}>Ben</Text>
          )}
        </View>
      </View>

      {/* Control Buttons */}
      <View style={styles.controlsBar}>
        <TouchableOpacity
          style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
          onPress={toggleMute}
        >
          {isMuted ? (
            <MicOff size={24} color="#ffffff" />
          ) : (
            <Mic size={24} color="#ffffff" />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlBtn, isVideoOff && styles.controlBtnActive]}
          onPress={toggleVideo}
        >
          {isVideoOff ? (
            <VideoOff size={24} color="#ffffff" />
          ) : (
            <Video size={24} color="#ffffff" />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlBtn, styles.endCallBtn]}
          onPress={endCall}
        >
          <PhoneOff size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  topHeaderBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 55 : 35,
    left: 20,
    right: 20,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  timerText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  participantNameBadge: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  videoStreamContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderStream: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  avatarGlowContainer: {
    marginBottom: 20,
    shadowColor: '#6366f1',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  userAvatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#6366f1',
  },
  userAvatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  userAvatarLetter: {
    color: '#ffffff',
    fontSize: 48,
    fontWeight: 'bold',
  },
  calleeName: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  statusText: {
    color: '#818cf8',
    fontSize: 16,
    fontWeight: '600',
  },
  localVideoWindow: {
    position: 'absolute',
    bottom: 20,
    right: 18,
    width: 100,
    height: 140,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  localLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingBottom: 45,
    paddingTop: 20,
    backgroundColor: '#111827',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  controlBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnActive: {
    backgroundColor: '#dc2626',
  },
  endCallBtn: {
    backgroundColor: '#ef4444',
  },
});
