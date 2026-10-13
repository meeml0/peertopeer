import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';

interface PulsCoinBadgeProps {
  balance: number;
  onPress?: () => void;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

export const PulsCoinBadge: React.FC<PulsCoinBadgeProps> = ({
  balance,
  onPress,
  size = 'small',
  showLabel = false,
}) => {
  const isLarge = size === 'large';
  const isMedium = size === 'medium';

  const badgeContent = (
    <LinearGradient
      colors={['#f59e0b', '#d97706', '#b45309']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.badgeContainer,
        isMedium && styles.badgeMedium,
        isLarge && styles.badgeLarge,
      ]}
    >
      {/* Altın Parıltı Yıldız İkonu */}
      <View style={[styles.coinIconWrapper, isLarge && styles.coinIconWrapperLarge]}>
        <Sparkles size={isLarge ? 18 : isMedium ? 15 : 12} color="#ffffff" />
      </View>

      <Text
        style={[
          styles.balanceText,
          isMedium && styles.balanceTextMedium,
          isLarge && styles.balanceTextLarge,
        ]}
      >
        {balance.toLocaleString()}
      </Text>

      {showLabel && (
        <Text style={[styles.coinLabel, isLarge && styles.coinLabelLarge]}>
          PulsCoin
        </Text>
      )}
    </LinearGradient>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {badgeContent}
      </TouchableOpacity>
    );
  }

  return badgeContent;
};

const styles = StyleSheet.create({
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.4)',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  badgeMedium: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 22,
  },
  badgeLarge: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 26,
  },
  coinIconWrapper: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  coinIconWrapperLarge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    marginRight: 8,
  },
  balanceText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  balanceTextMedium: {
    fontSize: 14,
  },
  balanceTextLarge: {
    fontSize: 18,
  },
  coinLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  coinLabelLarge: {
    fontSize: 14,
    marginLeft: 6,
  },
});
