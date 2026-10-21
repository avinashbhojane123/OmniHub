import React, { useState, useRef, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DrawingStroke, DrawingPoint } from '../../types';
import { useAppTheme } from '../../hooks/useTheme';

interface KeepDrawingModalProps {
  visible: boolean;
  initialStrokes?: DrawingStroke[];
  onClose: () => void;
  onSaveDrawing: (strokes: DrawingStroke[]) => void;
}

const PALETTE = ['#0F172A', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#FFFFFF'];
const STROKE_WIDTHS = [2, 5, 10];

export const KeepDrawingModal: React.FC<KeepDrawingModalProps> = ({
  visible,
  initialStrokes = [],
  onClose,
  onSaveDrawing,
}) => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [strokes, setStrokes] = useState<DrawingStroke[]>(initialStrokes);
  const [currentColor, setCurrentColor] = useState<string>(isDark ? '#F8FAFC' : '#0F172A');
  const [currentWidth, setCurrentWidth] = useState<number>(3);
  const [isEraser, setIsEraser] = useState<boolean>(false);
  const [currentStroke, setCurrentStroke] = useState<DrawingStroke | null>(null);

  // Sync initial strokes on open
  React.useEffect(() => {
    if (visible) {
      setStrokes(initialStrokes);
      setCurrentColor(isDark ? '#F8FAFC' : '#0F172A');
      setIsEraser(false);
      setCurrentStroke(null);
    }
  }, [visible, initialStrokes, isDark]);

  const strokesRef = useRef<DrawingStroke[]>(strokes);
  strokesRef.current = strokes;

  const currentStrokeRef = useRef<DrawingStroke | null>(currentStroke);
  currentStrokeRef.current = currentStroke;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const newStroke: DrawingStroke = {
            color: isEraser ? (isDark ? '#1E293B' : '#FFFFFF') : currentColor,
            width: isEraser ? 22 : currentWidth,
            points: [{ x: Math.round(locationX), y: Math.round(locationY) }],
          };
          setCurrentStroke(newStroke);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          if (currentStrokeRef.current) {
            const updated = {
              ...currentStrokeRef.current,
              points: [
                ...currentStrokeRef.current.points,
                { x: Math.round(locationX), y: Math.round(locationY) },
              ],
            };
            setCurrentStroke(updated);
          }
        },
        onPanResponderRelease: () => {
          if (currentStrokeRef.current && currentStrokeRef.current.points.length > 0) {
            setStrokes([...strokesRef.current, currentStrokeRef.current]);
          }
          setCurrentStroke(null);
        },
      }),
    [currentColor, currentWidth, isEraser, isDark]
  );

  const handleUndo = () => {
    if (strokes.length > 0) {
      setStrokes(strokes.slice(0, -1));
    }
  };

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke(null);
  };

  const handleSave = () => {
    onSaveDrawing(strokes);
    onClose();
  };

  const renderStrokeSegment = (p1: DrawingPoint, p2: DrawingPoint, color: string, width: number, key: string) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;

    return (
      <View
        key={key}
        style={{
          position: 'absolute',
          left: cx - length / 2,
          top: cy - width / 2,
          width: Math.max(length, 1),
          height: width,
          borderRadius: width / 2,
          backgroundColor: color,
          transform: [{ rotate: `${angle}deg` }],
        }}
      />
    );
  };

  const allRenderedStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
        {/* Top Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.surface,
              paddingTop: insets.top + 10,
            },
          ]}
        >
          <TouchableOpacity
            onPress={onClose}
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel="Cancel drawing"
          >
            <Text style={[styles.actionBtnText, { color: colors.text }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Drawing Pad</Text>
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Save drawing"
          >
            <Text style={styles.saveBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Drawing Surface Canvas */}
        <View
          style={[
            styles.canvasArea,
            { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' },
          ]}
          {...panResponder.panHandlers}
        >
          {allRenderedStrokes.map((s, strokeIdx) => {
            if (s.points.length === 1) {
              const pt = s.points[0];
              return (
                <View
                  key={`dot_${strokeIdx}`}
                  style={{
                    position: 'absolute',
                    left: pt.x - s.width / 2,
                    top: pt.y - s.width / 2,
                    width: s.width,
                    height: s.width,
                    borderRadius: s.width / 2,
                    backgroundColor: s.color,
                  }}
                />
              );
            }
            return s.points.slice(0, -1).map((pt, pIdx) => {
              const nextPt = s.points[pIdx + 1];
              return renderStrokeSegment(
                pt,
                nextPt,
                s.color,
                s.width,
                `seg_${strokeIdx}_${pIdx}`
              );
            });
          })}
        </View>

        {/* Bottom Drawing Tool Bar */}
        <View
          style={[
            styles.toolbar,
            {
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          {/* Stroke Widths */}
          <View style={styles.widthRow}>
            {STROKE_WIDTHS.map((w) => (
              <TouchableOpacity
                key={w}
                style={[
                  styles.widthBtn,
                  currentWidth === w && !isEraser && styles.selectedWidthBtn,
                ]}
                onPress={() => {
                  setCurrentWidth(w);
                  setIsEraser(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Stroke width ${w}`}
              >
                <View
                  style={{
                    width: w * 2.2,
                    height: w * 2.2,
                    borderRadius: (w * 2.2) / 2,
                    backgroundColor: colors.text,
                  }}
                />
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.toolBtn, isEraser && styles.selectedToolBtn]}
              onPress={() => setIsEraser(!isEraser)}
              accessibilityRole="button"
              accessibilityLabel={isEraser ? 'Switch to pen' : 'Switch to eraser'}
            >
              <Text style={styles.toolIcon}>🧹</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolBtn}
              onPress={handleUndo}
              accessibilityRole="button"
              accessibilityLabel="Undo last stroke"
            >
              <Text style={styles.toolIcon}>↩️</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolBtn}
              onPress={handleClear}
              accessibilityRole="button"
              accessibilityLabel="Clear all strokes"
            >
              <Text style={styles.toolIcon}>🗑️</Text>
            </TouchableOpacity>
          </View>

          {/* Color Palette */}
          {!isEraser && (
            <View style={styles.paletteRow}>
              {PALETTE.map((c) => {
                const isSelected = currentColor === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorDot,
                      {
                        backgroundColor: c,
                        borderColor: isSelected
                          ? colors.primary
                          : isDark
                          ? '#334155'
                          : '#E2E8F0',
                        borderWidth: isSelected ? 3 : 1,
                      },
                    ]}
                    onPress={() => {
                      setCurrentColor(c);
                      setIsEraser(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Color ${c}`}
                  />
                );
              })}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150,150,150,0.2)',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  actionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '500',
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  canvasArea: {
    flex: 1,
    overflow: 'hidden',
  },
  toolbar: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.2)',
    gap: 12,
  },
  widthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  widthBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedWidthBtn: {
    backgroundColor: 'rgba(150,150,150,0.25)',
  },
  toolBtn: {
    padding: 6,
    borderRadius: 8,
  },
  selectedToolBtn: {
    backgroundColor: 'rgba(150,150,150,0.3)',
  },
  toolIcon: {
    fontSize: 18,
  },
  paletteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
});
