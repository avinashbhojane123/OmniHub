import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { KeepColorKey, KEEP_COLORS } from '../../types';
import { useAppTheme } from '../../hooks/useTheme';

interface KeepColorPickerProps {
  selectedColor: KeepColorKey;
  onSelectColor: (color: KeepColorKey) => void;
}

export const KeepColorPicker: React.FC<KeepColorPickerProps> = ({
  selectedColor,
  onSelectColor,
}) => {
  const { isDark } = useAppTheme();
  const colorKeys = Object.keys(KEEP_COLORS) as KeepColorKey[];

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: isDark ? '#94A3B8' : '#64748B' }]}>
        COLOR PALETTE
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollList}
      >
        {colorKeys.map((key) => {
          const colorDef = KEEP_COLORS[key];
          const bg = isDark ? colorDef.darkBg : colorDef.lightBg;
          const border = isDark ? colorDef.darkBorder : colorDef.lightBorder;
          const isSelected = selectedColor === key;

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.colorCircle,
                {
                  backgroundColor: bg,
                  borderColor: isSelected ? (isDark ? '#F8FAFC' : '#0F172A') : border,
                  borderWidth: isSelected ? 2.5 : 1.5,
                },
              ]}
              onPress={() => onSelectColor(key)}
              activeOpacity={0.7}
            >
              {isSelected && (
                <View style={styles.checkMarker}>
                  <Text style={[styles.checkText, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                    ✓
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 16,
    textTransform: 'uppercase',
  },
  scrollList: {
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  colorCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  checkMarker: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkText: {
    fontSize: 14,
    fontWeight: '900',
  },
});
