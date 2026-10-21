import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { PollData } from '../../types/chat';

interface PollCreateModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmitPoll: (pollData: PollData) => void;
}

export const PollCreateModal: React.FC<PollCreateModalProps> = ({
  visible,
  onClose,
  onSubmitPoll,
}) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  if (!visible) return null;

  const handleAddOption = () => {
    if (options.length >= 5) {
      Alert.alert('Maximum Options', 'Polls can have up to 5 options.');
      return;
    }
    setOptions([...options, '']);
  };

  const handleUpdateOption = (text: string, index: number) => {
    const updated = [...options];
    updated[index] = text;
    setOptions(updated);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) {
      Alert.alert('Minimum Options', 'Polls require at least 2 options.');
      return;
    }
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!question.trim()) {
      Alert.alert('Question Required', 'Please enter a poll question.');
      return;
    }
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      Alert.alert('Options Required', 'Please provide at least 2 valid options.');
      return;
    }

    const pollData: PollData = {
      question: question.trim(),
      options: cleanOptions.map((text, idx) => ({
        id: idx + 1,
        text,
        votes: [],
      })),
    };

    onSubmitPoll(pollData);
    setQuestion('');
    setOptions(['', '']);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Create Live Poll 📊</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.inputLabel}>Question</Text>
            <TextInput
              style={styles.questionInput}
              placeholder="Ask a question..."
              placeholderTextColor="#64748B"
              value={question}
              onChangeText={setQuestion}
              maxLength={120}
            />

            <Text style={styles.inputLabel}>Options</Text>
            {options.map((opt, idx) => (
              <View key={idx} style={styles.optionRow}>
                <TextInput
                  style={styles.optionInput}
                  placeholder={`Option ${idx + 1}`}
                  placeholderTextColor="#64748B"
                  value={opt}
                  onChangeText={(text) => handleUpdateOption(text, idx)}
                  maxLength={60}
                />
                {options.length > 2 && (
                  <TouchableOpacity
                    style={styles.removeOptionBtn}
                    onPress={() => handleRemoveOption(idx)}
                  >
                    <Text style={styles.removeOptionText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {options.length < 5 && (
              <TouchableOpacity
                style={styles.addOptionBtn}
                onPress={handleAddOption}
              >
                <Text style={styles.addOptionText}>+ Add Option</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.submitBtn,
              { opacity: question.trim() ? 1 : 0.5 },
            ]}
            onPress={handleSubmit}
            disabled={!question.trim()}
          >
            <Text style={styles.submitBtnText}>Launch Poll in Room</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  questionInput: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  optionInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  removeOptionBtn: {
    padding: 8,
  },
  removeOptionText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '700',
  },
  addOptionBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  addOptionText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#38BDF8',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
});
