import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';

interface TrailerModalProps {
  visible: boolean;
  trailerKey?: string;
  onClose: () => void;
}

export const TrailerModal: React.FC<TrailerModalProps> = React.memo(
  ({ visible, trailerKey, onClose }) => {
    const handleOpenExternalYouTube = (key: string) => {
      const ytUrl = `https://www.youtube.com/watch?v=${key}`;
      Linking.openURL(ytUrl).catch(() => {
        Alert.alert('Error', 'Could not open YouTube app or link');
      });
    };

    return (
      <Modal
        visible={visible}
        animationType="fade"
        transparent
        onRequestClose={onClose}
      >
        <View style={styles.trailerModalBackdrop}>
          <View style={styles.trailerModalContent}>
            {/* Header */}
            <View style={styles.trailerModalHeader}>
              <Text style={styles.trailerModalTitle}>Official TMDb Trailer</Text>
              <View style={styles.trailerHeaderActions}>
                {trailerKey && (
                  <TouchableOpacity
                    style={styles.youtubeAppBtn}
                    onPress={() => handleOpenExternalYouTube(trailerKey)}
                  >
                    <Text style={styles.youtubeAppBtnText}>Open YouTube ↗</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.trailerCloseBtn} onPress={onClose}>
                  <Text style={styles.trailerCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Embedded Player */}
            {trailerKey ? (
              <View style={styles.webviewContainer}>
                <WebView
                  source={{
                    uri: `https://www.youtube.com/embed/${trailerKey}?autoplay=1&playsinline=1&modestbranding=1`,
                  }}
                  allowsFullscreenVideo
                  javaScriptEnabled
                  domStorageEnabled
                  startInLoadingState
                  renderLoading={() => (
                    <View style={styles.webviewLoading}>
                      <ActivityIndicator size="large" color="#E11D48" />
                    </View>
                  )}
                  style={styles.webview}
                />
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    );
  },
);

const styles = StyleSheet.create({
  trailerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    padding: 16,
  },
  trailerModalContent: {
    backgroundColor: '#121620',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  trailerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2433',
  },
  trailerModalTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  trailerHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  youtubeAppBtn: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  youtubeAppBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  trailerCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E2433',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailerCloseText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  webviewContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
  },
  webview: {
    flex: 1,
  },
  webviewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
});
