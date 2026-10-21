import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useTheme';
import { radius } from '../theme';

interface CreateNewModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectHabit: () => void;
  onSelectTask: () => void;
  onSelectEvent: () => void;
  onSelectFocusTimer?: () => void;
}

export const CreateNewModal: React.FC<CreateNewModalProps> = ({
  visible,
  onClose,
  onSelectHabit,
  onSelectTask,
  onSelectEvent,
  onSelectFocusTimer,
}) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.sheetContainer,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderSubtle,
                  paddingBottom: Math.max(insets.bottom, 16) + 12,
                },
              ]}
            >
              {/* Drag Handle */}
              <View style={[styles.dragHandle, { backgroundColor: colors.borderSubtle }]} />

              <Text style={[styles.sheetTitle, { color: colors.text }]}>Create New</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
                What would you like to schedule today?
              </Text>

              {/* Option 1: Daily Routine / Habit */}
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
                ]}
                onPress={() => {
                  onClose();
                  onSelectHabit();
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(255, 107, 0, 0.15)' }]}>
                  <Text style={styles.optionIcon}>🌱</Text>
                </View>
                <View style={styles.optionInfo}>
                  <Text style={[styles.optionTitle, { color: colors.text }]}>Daily Routine / Habit</Text>
                  <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                    Build streaks, set alarms, and track consistency
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
              </TouchableOpacity>

              {/* Option 2: Scheduled Task */}
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
                ]}
                onPress={() => {
                  onClose();
                  onSelectTask();
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Text style={styles.optionIcon}>📝</Text>
                </View>
                <View style={styles.optionInfo}>
                  <Text style={[styles.optionTitle, { color: colors.text }]}>Scheduled Task</Text>
                  <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                    Add due dates, priorities, sub-bullets, and reminders
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
              </TouchableOpacity>

              {/* Option 3: Calendar Event */}
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
                ]}
                onPress={() => {
                  onClose();
                  onSelectEvent();
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                  <Text style={styles.optionIcon}>📅</Text>
                </View>
                <View style={styles.optionInfo}>
                  <Text style={[styles.optionTitle, { color: colors.text }]}>Calendar Event</Text>
                  <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                    Schedule time blocks, meetings, or sync appointments
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
              </TouchableOpacity>

              {/* Option 4: Focus Timer */}
              {onSelectFocusTimer && (
                <TouchableOpacity
                  style={[
                    styles.optionCard,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
                  ]}
                  onPress={() => {
                    onClose();
                    onSelectFocusTimer();
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.iconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                    <Text style={styles.optionIcon}>⏱️</Text>
                  </View>
                  <View style={styles.optionInfo}>
                    <Text style={[styles.optionTitle, { color: colors.text }]}>Focus / Pomodoro Timer</Text>
                    <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                      Start a 25-minute deep focus block with alerts
                    </Text>
                  </View>
                  <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
                </TouchableOpacity>
              )}

              {/* Cancel Button */}
              <TouchableOpacity
                onPress={onClose}
                style={[styles.cancelBtn, { borderColor: colors.borderSubtle }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 16,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  optionIcon: {
    fontSize: 22,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  optionDesc: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 15,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
    marginLeft: 8,
  },
  cancelBtn: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
