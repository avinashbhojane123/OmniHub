import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

export const CalendarGraphic: React.FC = () => {
  return (
    <View style={styles.container} pointerEvents="none">
      {/* Playful Orange Squiggle / Spring Accent on the left */}
      <View style={styles.squiggleLeft}>
        <Text style={styles.squiggleText}>〰️</Text>
      </View>

      {/* Main Calendar Body */}
      <View style={styles.calendarOuter}>
        {/* Top Wire Rings / Hanging loops */}
        <View style={styles.ringsRow}>
          <View style={styles.ringHandle} />
          <View style={styles.ringHandle} />
        </View>

        {/* White Inner Card with Grid */}
        <View style={styles.calendarInner}>
          {/* Row 1 */}
          <View style={styles.gridRow}>
            <View style={styles.gridCell} />
            <View style={styles.gridCell} />
            <View style={styles.gridCell} />
            <View style={styles.gridCell} />
          </View>
          {/* Row 2 */}
          <View style={styles.gridRow}>
            <View style={styles.gridCell} />
            <View style={styles.gridCell} />
            <View style={[styles.gridCell, styles.gridCellFilled]} />
            <View style={styles.gridCell} />
          </View>
        </View>
      </View>

      {/* Playful Pink Sparkles on the right */}
      <View style={styles.sparkleRight}>
        <Text style={styles.sparkleText}>✨</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 18,
    position: 'relative',
    height: 120,
  },
  squiggleLeft: {
    position: 'absolute',
    left: '18%',
    top: 24,
    transform: [{ rotate: '-25deg' }],
  },
  squiggleText: {
    fontSize: 22,
  },
  sparkleRight: {
    position: 'absolute',
    right: '20%',
    top: 14,
  },
  sparkleText: {
    fontSize: 20,
  },
  calendarOuter: {
    width: 126,
    height: 102,
    backgroundColor: '#84CC16', // Playful lime green from Image 2
    borderRadius: 22,
    padding: 8,
    justifyContent: 'flex-end',
    position: 'relative',
    shadowColor: '#65A30D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  ringsRow: {
    position: 'absolute',
    top: -10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 22,
  },
  ringHandle: {
    width: 12,
    height: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 3,
    borderColor: '#65A30D',
  },
  calendarInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    height: 72,
    justifyContent: 'center',
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 6,
  },
  gridCell: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#2C2D35',
    backgroundColor: '#FFFFFF',
  },
  gridCellFilled: {
    backgroundColor: '#84CC16',
    borderColor: '#65A30D',
  },
});
