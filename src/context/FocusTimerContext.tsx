import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { AppState, Vibration, Alert } from 'react-native';
import notifee, { TriggerType, AndroidImportance } from '@notifee/react-native';

export type TimerMode = 'pomodoro' | 'short_break' | 'long_break' | 'deep_work';

export interface FocusTimerPreset {
  mode: TimerMode;
  label: string;
  icon: string;
  minutes: number;
}

export const TIMER_PRESETS: FocusTimerPreset[] = [
  { mode: 'pomodoro', label: 'Pomodoro', icon: '🍅', minutes: 25 },
  { mode: 'short_break', label: 'Short Break', icon: '☕', minutes: 5 },
  { mode: 'long_break', label: 'Long Break', icon: '🌴', minutes: 15 },
  { mode: 'deep_work', label: 'Deep Work', icon: '⚡', minutes: 45 },
];

export interface FocusTimerContextType {
  activeMode: TimerMode;
  totalSeconds: number;
  secondsRemaining: number;
  isRunning: boolean;
  selectedTaskId?: string;
  selectedTaskTitle?: string;
  completedSessions: number;
  isModalVisible: boolean;
  isFloatingVisible: boolean;

  startTimer: () => Promise<void>;
  pauseTimer: () => Promise<void>;
  resetTimer: () => Promise<void>;
  adjustTime: (deltaMinutes: number) => void;
  selectPreset: (mode: TimerMode, minutes: number) => void;
  selectTask: (taskId?: string, title?: string) => void;
  openModal: (taskId?: string, title?: string) => void;
  closeModal: () => void;
  minimizeToFloating: () => void;
  expandFromFloating: () => void;
  dismissFloating: () => void;
}

const FocusTimerContext = createContext<FocusTimerContextType | undefined>(undefined);

export const FocusTimerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeMode, setActiveMode] = useState<TimerMode>('pomodoro');
  const [totalSeconds, setTotalSeconds] = useState<number>(25 * 60);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(undefined);
  const [selectedTaskTitle, setSelectedTaskTitle] = useState<string | undefined>(undefined);
  const [completedSessions, setCompletedSessions] = useState<number>(0);
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [isFloatingVisible, setIsFloatingVisible] = useState<boolean>(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimeRef = useRef<number | null>(null);

  // Recalculate remaining seconds when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isRunning && endTimeRef.current) {
        const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
        setSecondsRemaining(remaining);
        if (remaining <= 0) {
          setIsRunning(false);
          endTimeRef.current = null;
          setIsFloatingVisible(false);
          try {
            Vibration.vibrate([0, 500, 250, 500]);
          } catch {}
          setCompletedSessions((cnt) => cnt + 1);
          Alert.alert('🎉 Session Complete!', 'Great focus! Take a well-deserved break.');
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isRunning]);

  // Interval ticker
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            endTimeRef.current = null;
            setIsRunning(false);
            setIsFloatingVisible(false);
            try {
              Vibration.vibrate([0, 500, 250, 500]);
            } catch {}
            setCompletedSessions((cnt) => cnt + 1);
            Alert.alert(
              '🎉 Session Complete!',
              activeMode === 'pomodoro' || activeMode === 'deep_work'
                ? 'Great focus! Take a well-deserved break.'
                : 'Break is over! Ready for another focus round?'
            );
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, activeMode]);

  const selectPreset = useCallback((mode: TimerMode, minutes: number) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    endTimeRef.current = null;
    setIsRunning(false);
    try {
      notifee.cancelNotification('focus_timer_alarm');
    } catch {}
    setActiveMode(mode);
    const secs = minutes * 60;
    setTotalSeconds(secs);
    setSecondsRemaining(secs);
  }, []);

  const startTimer = useCallback(async () => {
    if (isRunning) return;
    const targetEnd = Date.now() + secondsRemaining * 1000;
    endTimeRef.current = targetEnd;
    setIsRunning(true);

    try {
      await notifee.createChannel({
        id: 'focus_timer_channel',
        name: 'Focus Timer Alerts',
        importance: AndroidImportance.HIGH,
        sound: 'alarm_clock',
      });

      const modeDetails = TIMER_PRESETS.find((p) => p.mode === activeMode);
      const title = `${modeDetails?.icon || '⏱️'} ${modeDetails?.label || 'Focus Session'} Complete!`;
      const body = selectedTaskTitle
        ? `Finished session for: "${selectedTaskTitle}"`
        : 'Time to take a break or start your next sprint.';

      await notifee.createTriggerNotification(
        {
          id: 'focus_timer_alarm',
          title,
          body,
          android: {
            channelId: 'focus_timer_channel',
            importance: AndroidImportance.HIGH,
            pressAction: { id: 'default' },
            sound: 'alarm_clock',
          },
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: targetEnd,
        }
      );
    } catch (err) {
      console.warn('Failed to schedule focus timer notification:', err);
    }
  }, [activeMode, isRunning, secondsRemaining, selectedTaskTitle]);

  const pauseTimer = useCallback(async () => {
    if (!isRunning) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    endTimeRef.current = null;
    setIsRunning(false);
    try {
      await notifee.cancelNotification('focus_timer_alarm');
    } catch {}
  }, [isRunning]);

  const resetTimer = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    endTimeRef.current = null;
    setIsRunning(false);
    setSecondsRemaining(totalSeconds);
    setIsFloatingVisible(false);
    try {
      await notifee.cancelNotification('focus_timer_alarm');
    } catch {}
  }, [totalSeconds]);

  const adjustTime = useCallback(
    (deltaMinutes: number) => {
      const deltaSecs = deltaMinutes * 60;
      setSecondsRemaining((prev) => {
        const next = Math.max(60, prev + deltaSecs);
        if (isRunning) {
          endTimeRef.current = Date.now() + next * 1000;
        }
        return next;
      });
      setTotalSeconds((prev) => Math.max(60, prev + deltaSecs));
    },
    [isRunning]
  );

  const selectTask = useCallback((taskId?: string, title?: string) => {
    setSelectedTaskId(taskId);
    setSelectedTaskTitle(title);
  }, []);

  const openModal = useCallback((taskId?: string, title?: string) => {
    if (taskId) {
      setSelectedTaskId(taskId);
      if (title) setSelectedTaskTitle(title);
    }
    setIsFloatingVisible(false);
    setIsModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalVisible(false);
    // If the timer is still actively running, keep it alive and show the floating widget!
    if (isRunning) {
      setIsFloatingVisible(true);
    }
  }, [isRunning]);

  const minimizeToFloating = useCallback(() => {
    setIsModalVisible(false);
    if (isRunning || secondsRemaining < totalSeconds) {
      setIsFloatingVisible(true);
    }
  }, [isRunning, secondsRemaining, totalSeconds]);

  const expandFromFloating = useCallback(() => {
    setIsFloatingVisible(false);
    setIsModalVisible(true);
  }, []);

  const dismissFloating = useCallback(() => {
    setIsFloatingVisible(false);
  }, []);

  return (
    <FocusTimerContext.Provider
      value={{
        activeMode,
        totalSeconds,
        secondsRemaining,
        isRunning,
        selectedTaskId,
        selectedTaskTitle,
        completedSessions,
        isModalVisible,
        isFloatingVisible,
        startTimer,
        pauseTimer,
        resetTimer,
        adjustTime,
        selectPreset,
        selectTask,
        openModal,
        closeModal,
        minimizeToFloating,
        expandFromFloating,
        dismissFloating,
      }}
    >
      {children}
    </FocusTimerContext.Provider>
  );
};

export const useFocusTimer = (): FocusTimerContextType => {
  const context = useContext(FocusTimerContext);
  if (!context) {
    return {
      activeMode: 'pomodoro',
      totalSeconds: 25 * 60,
      secondsRemaining: 25 * 60,
      isRunning: false,
      selectedTaskId: undefined,
      selectedTaskTitle: undefined,
      completedSessions: 0,
      isModalVisible: false,
      isFloatingVisible: false,

      startTimer: async () => {},
      pauseTimer: async () => {},
      resetTimer: async () => {},
      adjustTime: () => {},
      selectPreset: () => {},
      selectTask: () => {},
      openModal: () => {},
      closeModal: () => {},
      minimizeToFloating: () => {},
      expandFromFloating: () => {},
      dismissFloating: () => {},
    };
  }
  return context;
};
