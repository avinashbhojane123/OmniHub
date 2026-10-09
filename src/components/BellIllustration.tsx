import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

interface BellIllustrationProps {
  size?: number;
}

export const BellIllustration: React.FC<BellIllustrationProps> = ({ size = 90 }) => {
  return (
    <View style={[styles.container, { width: size, height: size }]} pointerEvents="none">
      {/* Sound waves & sparkles background */}
      <View style={styles.sparkleTop}>
        <Text style={styles.sparkleText}>✨</Text>
      </View>
      <View style={styles.sparkleLeft}>
        <Text style={styles.waveText}>(((</Text>
      </View>
      <View style={styles.sparkleRight}>
        <Text style={styles.waveText}>)))</Text>
      </View>

      {/* Main 3D Bell Body */}
      <View style={styles.bellWrapper}>
        {/* Bell Top Handle / Loop */}
        <View style={styles.bellHandle} />

        {/* Bell Main Dome */}
        <View style={styles.bellDome}>
          {/* Highlight sheen on the dome */}
          <View style={styles.bellSheen} />
        </View>

        {/* Bell Flared Rim / Skirt */}
        <View style={styles.bellRim} />

        {/* Clapper / Hammer */}
        <View style={styles.clapper} />
      </View>

      {/* Little confetti dots at bottom */}
      <View style={styles.confettiRow}>
        <View style={[styles.confettiDot, styles.confettiGreen]} />
        <View style={[styles.confettiDot, styles.confettiOrange]} />
        <View style={[styles.confettiDot, styles.confettiYellow]} />
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
  bellWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  bellHandle: {
    width: 14,
    height: 10,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderWidth: 3,
    borderColor: '#FF7A00',
    backgroundColor: 'transparent',
    marginBottom: -2,
  },
  bellDome: {
    width: 44,
    height: 38,
    backgroundColor: '#FF7A00',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#E05A00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  bellSheen: {
    position: 'absolute',
    top: 4,
    right: 6,
    width: 10,
    height: 18,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    transform: [{ rotate: '20deg' }],
  },
  bellRim: {
    width: 58,
    height: 12,
    backgroundColor: '#FA541C',
    borderRadius: 6,
    marginTop: -3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  clapper: {
    width: 16,
    height: 10,
    backgroundColor: '#D9480F',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    marginTop: -2,
  },
  sparkleTop: {
    position: 'absolute',
    top: -2,
    right: 4,
    zIndex: 1,
  },
  sparkleText: {
    fontSize: 16,
  },
  sparkleLeft: {
    position: 'absolute',
    left: 2,
    top: 22,
    zIndex: 1,
  },
  sparkleRight: {
    position: 'absolute',
    right: 2,
    top: 22,
    zIndex: 1,
  },
  waveText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#84CC16',
    letterSpacing: -2,
  },
  confettiRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  confettiDot: {
    width: 6,
    height: 6,
    borderRadius: 2,
  },
  confettiGreen: {
    backgroundColor: '#84CC16',
    transform: [{ rotate: '25deg' }],
  },
  confettiOrange: {
    backgroundColor: '#FF6B00',
    transform: [{ rotate: '-15deg' }],
  },
  confettiYellow: {
    backgroundColor: '#EAB308',
    transform: [{ rotate: '45deg' }],
  },
});
