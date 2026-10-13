import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { socketService } from '../services/socket';
import { Phone, PhoneOff, Video } from 'lucide-react-native';

export const IncomingCallModal = ({ navigation }: any) => {
  const [incomingCall, setIncomingCall] = useState<any | null>(null);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    socket.on('incoming_call', (data: any) => {
      setIncomingCall(data);
    });

    socket.on('call_ended', () => {
      setIncomingCall(null);
    });

    return () => {
      socket.off('incoming_call');
      socket.off('call_ended');
    };
  }, []);

  const acceptCall = () => {
    if (!incomingCall) return;
    const callData = incomingCall;
    setIncomingCall(null);

    navigation.navigate('Call', {
      targetUser: {
        id: callData.fromUserId,
        username: callData.callerName,
      },
      isCaller: false,
      callType: callData.callType,
      offer: callData.offer, // Arayan tarafın SDP teklifi
    });
  };

  const rejectCall = () => {
    if (!incomingCall) return;
    const socket = socketService.getSocket();
    socket?.emit('reject_call', { toUserId: incomingCall.fromUserId });
    setIncomingCall(null);
  };

  if (!incomingCall) return null;

  return (
    <Modal visible={true} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.callerAvatar}>
            <Text style={styles.avatarText}>
              {incomingCall.callerName?.charAt(0)?.toUpperCase() || 'U'}
            </Text>
          </View>

          <Text style={styles.callerName}>{incomingCall.callerName}</Text>
          <Text style={styles.callTypeDesc}>
            {incomingCall.callType === 'video'
              ? 'Görüntülü arama yapıyor...'
              : 'Sesli arama yapıyor...'}
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.rejectBtn]}
              onPress={rejectCall}
            >
              <PhoneOff size={26} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.acceptBtn]}
              onPress={acceptCall}
            >
              {incomingCall.callType === 'video' ? (
                <Video size={26} color="#ffffff" />
              ) : (
                <Phone size={26} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
  },
  callerAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  callerName: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  callTypeDesc: {
    color: '#94a3b8',
    fontSize: 15,
    marginBottom: 32,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  btn: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    backgroundColor: '#ef4444',
  },
  acceptBtn: {
    backgroundColor: '#10b981',
  },
});
