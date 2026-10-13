import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Send, Video, Phone, Check, CheckCheck } from 'lucide-react-native';
import { PulsCoinBadge } from '../components/PulsCoinBadge';
import { Alert } from 'react-native';
import { formatMessageDateHeader, isSameDay } from '../utils/dateUtils';

export const ChatScreen = ({ route, navigation }: any) => {
  const { targetUser } = route.params;
  const { user, pulscoinBalance, spendCoins } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    initConversation();
  }, []);

  useEffect(() => {
    if (!conversationId) return;

    loadMessages(conversationId);
    markMessagesAsRead(conversationId);

    const channel = supabase
      .channel(`chat_room_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => {
            // 1. Zaten aynı gerçek ID varsa ekleme
            const idExists = prev.some((m) => m.id === payload.new.id);
            if (idExists) return prev;

            // 2. Eğer bu mesaj bizim az önce gönderdiğimiz geçici mesajsa, geçici olanı gerçek olanla değiştir
            const optimisticIndex = prev.findIndex(
              (m) =>
                m.sender_id === payload.new.sender_id &&
                m.content === payload.new.content &&
                typeof m.id === 'string' &&
                !m.id.includes('-') // Geçici id Date.now() olduğundan tire içermez, Supabase UUID ise tire içerir
            );

            if (optimisticIndex !== -1) {
              const updated = [...prev];
              updated[optimisticIndex] = payload.new;
              return updated;
            }

            // 3. Karşı taraftan gelen yeni mesajsa ekle
            return [...prev, payload.new];
          });

          // Karşı taraftan yeni mesaj geldiyse ve sohbet açıksa okundu yap
          if (payload.new.sender_id !== user?.id) {
            markMessagesAsRead(conversationId);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          // Mesajın okundu bilgisi güncellendiğinde ekranı canlı yenile
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? payload.new : m))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const markMessagesAsRead = async (convId: string) => {
    if (!user) return;
    try {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', convId)
        .neq('sender_id', user.id)
        .eq('is_read', false);
    } catch (e) {
      console.log('Okundu bilgisi güncellenemedi:', e);
    }
  };

  const initConversation = async () => {
    if (!user) return;

    try {
      const { data: myParticipations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      const myConvIds = (myParticipations || []).map((p) => p.conversation_id);
      let existingConvId = null;

      if (myConvIds.length > 0) {
        const { data: commonParticipations } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .in('conversation_id', myConvIds)
          .eq('user_id', targetUser.id);

        if (commonParticipations && commonParticipations.length > 0) {
          existingConvId = commonParticipations[0].conversation_id;
        }
      }

      if (!existingConvId) {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({})
          .select()
          .single();

        if (newConv) {
          existingConvId = newConv.id;
          await supabase.from('conversation_participants').insert([
            { conversation_id: newConv.id, user_id: user.id },
            { conversation_id: newConv.id, user_id: targetUser.id },
          ]);
        }
      }

      if (existingConvId) {
        setConversationId(existingConvId);
      }
    } catch (e: any) {
      console.error('initConversation istisna:', e);
    }
  };

  const loadMessages = async (convId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (data) setMessages(data);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !conversationId || !user) return;

    // PulsCoin bakiye kontrolü (1 mesaj = 1 PulsCoin)
    if (pulscoinBalance < 1) {
      alert('Yetersiz PulsCoin! Mesaj gönderebilmek için en az 1 PulsCoin bakiyeniz olmalıdır.');
      return;
    }

    const textToSend = inputText.trim();
    setInputText('');

    // 1 PulsCoin harca
    const spent = await spendCoins(1, 'chat_message', `@${targetUser.username} kullanıcısına mesaj gönderildi`);
    if (!spent) {
      alert('Bakiye yetersiz veya işlem başarısız oldu.');
      return;
    }

    const optimisticMessage = {
      id: Date.now().toString(),
      conversation_id: conversationId,
      sender_id: user.id,
      content: textToSend,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: textToSend,
    });

    if (error) {
      console.error('Mesaj gönderim hatası:', error);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/* Modern Glass Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color="#ffffff" />
        </TouchableOpacity>

        {/* Profil Bilgisi & Avatara Dokunarak Vitrini Aç */}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
          onPress={() => navigation.navigate('UserProfile', { targetUser })}
          activeOpacity={0.8}
        >
          <View style={styles.headerAvatarWrapper}>
            {targetUser.avatar_url ? (
              <Image source={{ uri: targetUser.avatar_url }} style={styles.headerAvatar} />
            ) : (
              <LinearGradient
                colors={['#6366f1', '#a855f7']}
                style={styles.headerAvatar}
              >
                <Text style={styles.headerAvatarText}>
                  {targetUser.username?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </LinearGradient>
            )}
            <View style={styles.headerDot} />
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {targetUser.full_name || targetUser.username}
            </Text>
            <Text style={styles.headerSubtitle}>Profili Gör • P2P Şifreli</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <PulsCoinBadge balance={pulscoinBalance} />

          <TouchableOpacity
            style={styles.callIconBtn}
            onPress={() =>
              navigation.navigate('Call', {
                targetUser,
                isCaller: true,
                callType: 'audio',
              })
            }
          >
            <View style={styles.audioIconWrapper}>
              <Phone size={17} color="#06b6d4" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.callIconBtn}
            onPress={() =>
              navigation.navigate('Call', {
                targetUser,
                isCaller: true,
                callType: 'video',
              })
            }
          >
            <LinearGradient
              colors={['#10b981', '#059669']}
              style={styles.videoGradientBadge}
            >
              <Video size={17} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* Mesaj Listesi */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
        renderItem={({ item, index }) => {
          const isMine = item.sender_id === user?.id;

          // Önceki mesajla farklı bir günde miyiz? İlk mesajsa veya gün değiştiyse tarih etiketi göster
          const prevItem = index > 0 ? messages[index - 1] : null;
          const showDateHeader = !prevItem || !isSameDay(prevItem.created_at, item.created_at);

          return (
            <View key={item.id}>
              {showDateHeader && (
                <View style={styles.dateHeaderContainer}>
                  <View style={styles.dateHeaderBadge}>
                    <Text style={styles.dateHeaderText}>
                      {formatMessageDateHeader(item.created_at)}
                    </Text>
                  </View>
                </View>
              )}

              <View
                style={[
                  styles.bubbleWrapper,
                  isMine ? styles.myBubbleWrapper : styles.theirBubbleWrapper,
                ]}
              >
                {isMine ? (
                  <LinearGradient
                    colors={['#6366f1', '#4f46e5']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.messageBubble, styles.myBubble]}
                  >
                    <Text style={styles.myMessageText}>{item.content}</Text>
                    <View style={styles.timeWrapper}>
                      <Text style={styles.myTimestamp}>
                        {new Date(item.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                      {item.is_read ? (
                        <CheckCheck size={14} color="#38bdf8" style={{ marginLeft: 4 }} />
                      ) : (
                        <Check size={14} color="#94a3b8" style={{ marginLeft: 4 }} />
                      )}
                    </View>
                  </LinearGradient>
                ) : (
                  <View style={[styles.messageBubble, styles.theirBubble]}>
                    <Text style={styles.theirMessageText}>{item.content}</Text>
                    <Text style={styles.theirTimestamp}>
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Yüzen Mesaj Giriş Barı (Floating Input) */}
      <View style={styles.floatingInputContainer}>
        <View style={styles.inputInner}>
          <TextInput
            style={styles.textInput}
            placeholder="Mesajınızı yazın..."
            placeholderTextColor="#64748b"
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              !inputText.trim() && { opacity: 0.5 },
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim()}
          >
            <LinearGradient
              colors={['#6366f1', '#8b5cf6']}
              style={styles.sendBtnGradient}
            >
              <Send size={18} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
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
    paddingBottom: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    backdropFilter: 'blur(20px)',
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  headerAvatarWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#0f172a',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callIconBtn: {
    shadowColor: '#10b981',
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  audioIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoGradientBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20,
  },
  dateHeaderContainer: {
    alignItems: 'center',
    marginVertical: 14,
  },
  dateHeaderBadge: {
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  dateHeaderText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  bubbleWrapper: {
    marginBottom: 10,
  },
  myBubbleWrapper: {
    alignItems: 'flex-end',
  },
  theirBubbleWrapper: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
  },
  myBubble: {
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  myMessageText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 21,
  },
  theirMessageText: {
    color: '#f1f5f9',
    fontSize: 15,
    lineHeight: 21,
  },
  timeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  myTimestamp: {
    fontSize: 10,
    color: '#cbd5e1',
    opacity: 0.85,
  },
  theirTimestamp: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  floatingInputContainer: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    paddingTop: 8,
    backgroundColor: '#07090e',
  },
  inputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  textInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    maxHeight: 90,
    paddingVertical: 8,
  },
  sendBtn: {
    marginLeft: 8,
  },
  sendBtnGradient: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
