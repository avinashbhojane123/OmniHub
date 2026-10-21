import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../../hooks/useTheme';
import { AgeCalculation } from '../ProfileModal';

interface LifeAgeBannerProps {
  ageStats: AgeCalculation | null;
  userName: string;
  birthTime: string;
  onPress: () => void;
}

const LifeAgeBannerComponent: React.FC<LifeAgeBannerProps> = ({
  ageStats,
  userName,
  birthTime,
  onPress,
}) => {
  const { colors } = useAppTheme();

  if (!ageStats) {
    return (
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Set birth date to unlock Life Age metrics"
      >
        <View
          style={[
            styles.pill,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.borderSubtle,
            },
          ]}
        >
          <Text
            style={[styles.text, { color: colors.primary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            🎂 Set your birth date to unlock Life Age milestones ➔
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  const isBirthday = ageStats.nextBirthdayDays === 0;
  const displayName = userName.trim();

  const bannerText = isBirthday
    ? `🎂 🎉 Happy Birthday${displayName ? `, ${displayName}` : ''}! • ${ageStats.years} years young!`
    : `🎂 ${ageStats.years}y ${ageStats.months}m ${ageStats.days}d  •  ${ageStats.totalWeeks.toLocaleString()} wks${birthTime ? `  •  ${birthTime}` : ''}`;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel="View Life Age and Timing Metrics"
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.borderSubtle,
          },
        ]}
      >
        <Text
          style={[styles.text, { color: colors.primary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {bannerText}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export const LifeAgeBanner = React.memo(LifeAgeBannerComponent);

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    width: '100%',
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 11.5,
    fontWeight: '700',
  },
});
