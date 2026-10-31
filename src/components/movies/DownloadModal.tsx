import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ScrollView,
  ActivityIndicator,
  Linking,
  Share,
  Alert,
} from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';

import { DownloadItemState } from '../../types';
export type { DownloadItemState };

interface DownloadModalProps {
  visible: boolean;
  item: DownloadItemState | null;
  insets: EdgeInsets;
  onClose: () => void;
  onRetry?: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = React.memo(
  ({ visible, item, insets, onClose, onRetry }) => {
    if (!item) return null;

    const handleSystemDownload = async () => {
      if (!item.downloadUrl) {
        Alert.alert('Download Notice', 'No direct download link is currently available for this title.');
        return;
      }

      try {
        await Linking.openURL(item.downloadUrl);
      } catch {
        handleShareOrExternalDownloader();
      }
    };


    const handleShareOrExternalDownloader = async () => {
      if (!item.downloadUrl) return;
      try {
        await Share.share({
          title: `Download: ${item.title}`,
          message: item.downloadUrl,
          url: item.downloadUrl,
        });
      } catch {
        // user dismissed share sheet
      }
    };

    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
      >
        <View style={styles.backdrop}>
          <TouchableOpacity
            style={styles.backdropTouchable}
            activeOpacity={1}
            onPress={onClose}
          />

          <View
            style={[
              styles.modalSheet,
              { paddingBottom: Math.max(insets.bottom, 20) + 16 },
            ]}
          >
            {/* Header Handle */}
            <View style={styles.dragHandle} />

            <View style={styles.headerRow}>
              <View style={styles.titleWrap}>
                <Text style={styles.headerBadge}>⬇️ DOWNLOAD MANAGER</Text>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Media Preview Box */}
              <View style={styles.mediaPreviewCard}>
                {item.posterUrl ? (
                  <Image
                    source={{ uri: item.posterUrl }}
                    style={styles.previewThumb}
                  />
                ) : (
                  <View style={[styles.previewThumb, styles.previewThumbFallback]}>
                    <Text style={styles.fallbackIcon}>🎬</Text>
                  </View>
                )}

                <View style={styles.previewInfo}>
                  <Text style={styles.previewTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.qualityPill}>
                      <Text style={styles.qualityPillText}>
                        {item.quality || '1080p Full HD'}
                      </Text>
                    </View>
                    <View style={styles.directPill}>
                      <Text style={styles.directPillText}>⚡ Direct Stream</Text>
                    </View>
                  </View>
                  <Text style={styles.destinationNote}>
                    📁 Destination: Android Download/ & Gallery
                  </Text>
                </View>
              </View>

              {/* Status & Actions */}
              {item.isResolving ? (
                <View style={styles.resolvingBox}>
                  <ActivityIndicator size="large" color="#10B981" />
                  <Text style={styles.resolvingTitle}>
                    Generating Direct Download Link...
                  </Text>
                  <Text style={styles.resolvingSub}>
                    Extracting high-speed zero-ad streaming manifest from cinema mirrors.
                  </Text>
                </View>
              ) : item.downloadUrl ? (
                <View style={styles.actionsContainer}>
                  {/* Option 1: Open in Downloader App (1DM / ADM / VLC) - RECOMMENDED FOR GALLERY */}
                  <TouchableOpacity
                    style={styles.primaryDownloadBtn}
                    onPress={handleShareOrExternalDownloader}
                    activeOpacity={0.85}
                  >
                    <View style={styles.btnIconWrap}>
                      <Text style={styles.btnIconText}>⚡</Text>
                    </View>
                    <View style={styles.btnTextWrap}>
                      <Text style={styles.primaryBtnTitle}>
                        Download with 1DM / ADM / VLC (Recommended)
                      </Text>
                      <Text style={styles.primaryBtnSub}>
                        Multi-threaded high-speed downloading & auto MP4 Gallery conversion
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Option 2: Direct Download via System / Browser */}
                  <TouchableOpacity
                    style={styles.secondaryDownloadBtn}
                    onPress={handleSystemDownload}
                    activeOpacity={0.85}
                  >
                    <View style={styles.btnIconWrap}>
                      <Text style={styles.btnIconText}>📥</Text>
                    </View>
                    <View style={styles.btnTextWrap}>
                      <Text style={styles.secondaryBtnTitle}>
                        Browser / System Download
                      </Text>
                      <Text style={styles.secondaryBtnSub}>
                        Open direct stream in your browser or system manager
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Option 3: Copy Stream URL */}
                  <TouchableOpacity
                    style={styles.copyLinkBtn}
                    onPress={handleShareOrExternalDownloader}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.copyLinkText}>
                      📋 Copy Direct Video Link
                    </Text>
                  </TouchableOpacity>

                  {/* Pro Tip Card */}
                  <View style={styles.tipCard}>
                    <Text style={styles.tipIcon}>💡</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tipText}>
                        <Text style={styles.tipBold}>Pro Tip: </Text>
                        For offline playback in your phone's Gallery, apps like{' '}
                        <Text style={styles.tipHighlight}>1DM</Text> or{' '}
                        <Text style={styles.tipHighlight}>ADM</Text> (free on Play Store) download all HD video segments into a single playable MP4 movie file!
                      </Text>
                      <TouchableOpacity
                        style={styles.install1dmBtn}
                        onPress={() =>
                          Linking.openURL(
                            'https://play.google.com/store/apps/details?id=idm.internet.download.manager',
                          ).catch(() => {})
                        }
                        activeOpacity={0.8}
                      >
                        <Text style={styles.install1dmBtnText}>
                          📲 Get Free 1DM from Google Play Store ↗
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.errorBox}>
                  <Text style={styles.errorIcon}>⚠️</Text>
                  <Text style={styles.errorTitle}>Direct Link Unavailable</Text>
                  <Text style={styles.errorSub}>
                    {item.error ||
                      'The direct stream extractor could not generate an offline download manifest for this title right now. It can still be streamed online in the player.'}
                  </Text>
                  {onRetry && (
                    <TouchableOpacity
                      style={styles.retryBtn}
                      onPress={onRetry}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.retryBtnText}>🔄 Retry Extraction</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  },
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  backdropTouchable: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: '#0F131C',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#2D3748',
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleWrap: {
    flex: 1,
    paddingRight: 12,
  },
  headerBadge: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E2433',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingBottom: 16,
  },
  mediaPreviewCard: {
    flexDirection: 'row',
    backgroundColor: '#161B26',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#262D3D',
    marginBottom: 18,
  },
  previewThumb: {
    width: 65,
    height: 95,
    borderRadius: 10,
    backgroundColor: '#1E2433',
  },
  previewThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    fontSize: 24,
  },
  previewInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'space-between',
  },
  previewTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 4,
  },
  qualityPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  qualityPillText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
  },
  directPill: {
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.4)',
  },
  directPillText: {
    color: '#FB7185',
    fontSize: 10,
    fontWeight: '700',
  },
  destinationNote: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
  },
  resolvingBox: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolvingTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 4,
  },
  resolvingSub: {
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  actionsContainer: {
    gap: 12,
  },
  primaryDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  btnIconText: {
    fontSize: 20,
  },
  btnTextWrap: {
    flex: 1,
  },
  primaryBtnTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  primaryBtnSub: {
    color: '#D1FAE5',
    fontSize: 11,
  },
  secondaryDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E2433',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2E384D',
  },
  secondaryBtnTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  secondaryBtnSub: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  copyLinkBtn: {
    backgroundColor: '#161B26',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  copyLinkText: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '600',
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    marginTop: 4,
    gap: 8,
  },
  tipIcon: {
    fontSize: 16,
  },
  tipText: {
    flex: 1,
    color: '#D1D5DB',
    fontSize: 11,
    lineHeight: 16,
  },
  tipBold: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  tipHighlight: {
    color: '#F59E0B',
    fontWeight: '700',
  },
  install1dmBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  install1dmBtnText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
  },
  errorBox: {
    paddingVertical: 24,
    alignItems: 'center',
    backgroundColor: '#161B26',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorSub: {
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
