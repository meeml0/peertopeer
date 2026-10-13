import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, X } from 'lucide-react-native';

interface NotificationData {
  senderId: string;
  senderName: string;
  content: string;
  senderUser: any;
}

export const InAppNotificationBanner = ({ navigation }: any) => {
  const { user } = useAuth();
  const [notification, setNotification] = useState<NotificationData | null>(null);
  const translateY = useState(new Animated.Value(-120))[0];

  useEffect(() => {
    if (!user) return;

    // Tüm yeni gelen mesajları dinleyen global dinleyici
    const channel = supabase
      .channel('global_in_app_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          // Bize ait olmayan bir mesaj geldiyse
          if (payload.new.sender_id !== user.id) {
            // Gönderen kişinin profilini çek
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', payload.new.sender_id)
              .single();

            if (senderProfile) {
              triggerBanner({
                senderId: senderProfile.id,
                senderName: senderProfile.full_name || senderProfile.username,
                content: payload.new.content,
                senderUser: senderProfile,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const triggerBanner = (data: NotificationData) => {
    setNotification(data);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 8,
    }).start();

    // 5 saniye sonra otomatik kapat
    setTimeout(() => {
      dismissBanner();
    }, 5000);
  };

  const dismissBanner = () => {
    Animated.timing(translateY, {
      toValue: -120,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setNotification(null));
  };

  const handleOpenChat = () => {
    if (notification && navigation) {
      const target = notification.senderUser;
      dismissBanner();
      navigation.navigate('Chat', { targetUser: target });
    }
  };

  if (!notification) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.card}
        onPress={handleOpenChat}
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={['#6366f1', '#a855f7']}
          style={styles.avatarBadge}
        >
          <Text style={styles.avatarLetter}>
            {notification.senderName.charAt(0).toUpperCase()}
          </Text>
        </LinearGradient>

        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.senderName}>{notification.senderName}</Text>
            <Text style={styles.timeText}>Şimdi</Text>
          </View>
          <Text style={styles.messageText} numberOfLines={1}>
            {notification.content}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={dismissBanner}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={16} color="#94a3b8" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 45 : 25,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
    backdropFilter: 'blur(20px)',
  },
  avatarBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarLetter: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  senderName: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  timeText: {
    color: '#818cf8',
    fontSize: 11,
    fontWeight: '600',
  },
  messageText: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  closeBtn: {
    padding: 6,
    marginLeft: 8,
  },
});
