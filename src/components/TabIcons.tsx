import React from 'react';
import { View, StyleSheet } from 'react-native';

interface TabIconProps {
  focused: boolean;
  color: string;
  size?: number;
}

/**
 * Clean, vector-like Today (Calendar) Icon
 */
export const TodayTabIcon: React.FC<TabIconProps> = ({ focused, color, size = 22 }) => {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* 2 Binder Rings */}
      <View style={[styles.binderRing, { left: 4, backgroundColor: color }]} />
      <View style={[styles.binderRing, { right: 4, backgroundColor: color }]} />

      {/* Calendar Card */}
      <View
        style={[
          styles.calCard,
          {
            borderColor: color,
            backgroundColor: focused ? 'rgba(255, 107, 0, 0.08)' : 'transparent',
          },
        ]}
      >
        {/* Top Header Bar */}
        <View style={[styles.calHeaderBar, { backgroundColor: color }]} />

        {/* Center Date Grid Dots */}
        <View style={styles.calGrid}>
          <View style={[styles.calDot, { backgroundColor: color }]} />
          <View style={[styles.calDot, { backgroundColor: color }]} />
          <View style={[styles.calDot, { backgroundColor: color }]} />
          <View style={[styles.calDot, { backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
};

/**
 * Clean, vector-like Tasks (Checkbox) Icon
 */
export const TasksTabIcon: React.FC<TabIconProps> = ({ focused, color, size = 22 }) => {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View
        style={[
          styles.taskBox,
          {
            borderColor: color,
            backgroundColor: focused ? color : 'transparent',
          },
        ]}
      >
        {/* Checkmark glyph */}
        <View style={styles.checkmarkContainer}>
          <View
            style={[
              styles.checkStemShort,
              { backgroundColor: focused ? '#FFFFFF' : color },
            ]}
          />
          <View
            style={[
              styles.checkStemLong,
              { backgroundColor: focused ? '#FFFFFF' : color },
            ]}
          />
        </View>
      </View>
    </View>
  );
};


/**
 * Clean, vector-like Google Keep Notes (Lightbulb) Icon
 */
export const KeepNotesTabIcon: React.FC<TabIconProps> = ({ focused, color, size = 22 }) => {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Bulb Round Dome */}
      <View
        style={[
          styles.bulbDome,
          {
            borderColor: color,
            backgroundColor: focused ? color : 'transparent',
          },
        ]}
      >
        {/* Inner glow filament */}
        <View
          style={[
            styles.bulbFilament,
            { backgroundColor: focused ? '#FFFFFF' : color },
          ]}
        />
      </View>
      {/* Bulb Screw Base */}
      <View style={[styles.bulbBase, { backgroundColor: color }]} />
      <View style={[styles.bulbContact, { backgroundColor: color }]} />
    </View>
  );
};

/**
 * Clean, vector-like Settings (Control Sliders) Icon
 */
export const SettingsTabIcon: React.FC<TabIconProps> = ({ focused, color, size = 22 }) => {
  return (
    <View style={[styles.container, { width: size, height: size, justifyContent: 'center' }]}>
      {/* Slider track 1 */}
      <View style={styles.sliderRow}>
        <View style={[styles.sliderTrack, { backgroundColor: color }]} />
        <View style={[styles.sliderKnob, { left: 4, backgroundColor: color, borderColor: focused ? '#FFFFFF' : color }]} />
      </View>

      {/* Slider track 2 */}
      <View style={styles.sliderRow}>
        <View style={[styles.sliderTrack, { backgroundColor: color }]} />
        <View style={[styles.sliderKnob, { right: 4, backgroundColor: color, borderColor: focused ? '#FFFFFF' : color }]} />
      </View>

      {/* Slider track 3 */}
      <View style={styles.sliderRow}>
        <View style={[styles.sliderTrack, { backgroundColor: color }]} />
        <View style={[styles.sliderKnob, { left: 11, backgroundColor: color, borderColor: focused ? '#FFFFFF' : color }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  binderRing: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 4,
    borderRadius: 1,
    zIndex: 3,
  },
  calCard: {
    width: 20,
    height: 19,
    borderRadius: 4,
    borderWidth: 1.8,
    marginTop: 2,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  calHeaderBar: {
    height: 4.5,
    width: '100%',
  },
  calGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2.5,
    paddingVertical: 1.5,
  },
  calDot: {
    width: 2.2,
    height: 2.2,
    borderRadius: 1.1,
  },
  taskBox: {
    width: 19,
    height: 19,
    borderRadius: 5,
    borderWidth: 1.8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkContainer: {
    width: 12,
    height: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkStemShort: {
    position: 'absolute',
    left: 2,
    bottom: 3,
    width: 2,
    height: 4.5,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
  },
  checkStemLong: {
    position: 'absolute',
    left: 5.5,
    bottom: 2.5,
    width: 2,
    height: 8,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  sliderRow: {
    width: 20,
    height: 5,
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 1,
  },
  sliderTrack: {
    height: 1.8,
    width: '100%',
    borderRadius: 1,
    opacity: 0.85,
  },
  sliderKnob: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    borderWidth: 1,
  },
  bulbDome: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bulbFilament: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  bulbBase: {
    width: 7,
    height: 2.2,
    marginTop: 1,
    borderRadius: 0.8,
  },
  bulbContact: {
    width: 4,
    height: 1.5,
    marginTop: 0.5,
    borderRadius: 0.5,
  },
});
