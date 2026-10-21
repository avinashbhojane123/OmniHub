import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
} from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { StreamableMedia } from '../../types';

interface StreamCatalogViewProps {
  catalog: StreamableMedia[];
  insets: EdgeInsets;
  refreshControl?: React.ReactElement;
  onPlayStream: (
    item: StreamableMedia,
    episodeStreamId?: string,
    episodeTitle?: string,
  ) => void;
  onDownload?: (item: StreamableMedia) => void;
}

export const StreamCatalogView: React.FC<StreamCatalogViewProps> = React.memo(
  ({ catalog, insets, refreshControl, onPlayStream, onDownload }) => {
    return (
      <FlatList
        data={catalog}
        keyExtractor={(item) => item.id}
        refreshControl={refreshControl}
        contentContainerStyle={[
          styles.listContainer,
          { paddingBottom: insets.bottom + 40 },
        ]}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        ListHeaderComponent={
          <View style={styles.streamHeaderBanner}>
            <View style={styles.streamBannerBadge}>
              <Text style={styles.streamBannerBadgeText}>
                ⚡ INSTANT UNIVERSAL STREAMING
              </Text>
            </View>
            <Text style={styles.streamBannerTitle}>
              Instant Streamer & HD Series
            </Text>
            <Text style={styles.streamBannerSubtitle}>
              Stream any TMDb movie or TV series on-demand via direct zero-ad HLS
              or clean multi-source mirrors, or switch to your local media server.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.streamCard}>
            <View style={styles.streamBackdropContainer}>
              <Image
                source={{ uri: item.backdropUrl || item.posterUrl }}
                style={styles.streamBackdrop}
                progressiveRenderingEnabled
                fadeDuration={200}
              />
              <View style={styles.streamOverlayGradient}>
                <View style={styles.streamPillRow}>
                  <View style={styles.streamTypePill}>
                    <Text style={styles.streamTypePillText}>
                      {item.type.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.streamQualityPill}>
                    <Text style={styles.streamQualityPillText}>
                      {item.quality}
                    </Text>
                  </View>
                  {item.tmdbId && (
                    <View style={styles.streamInstantPill}>
                      <Text style={styles.streamInstantPillText}>
                        ⚡ Instant Embed
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.streamCardTitle}>{item.title}</Text>
                {item.duration ? (
                  <Text style={styles.streamCardDuration}>
                    ⏱ {item.duration} • {item.genres.join(', ')}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.streamCardBody}>
              <Text style={styles.streamCardOverview} numberOfLines={2}>
                {item.overview}
              </Text>

              {item.type === 'series' && item.episodes ? (
                <View style={styles.episodesWrap}>
                  <Text style={styles.episodesLabel}>Available Episodes:</Text>
                  {item.episodes.map((ep) => (
                    <TouchableOpacity
                      key={ep.episodeNumber}
                      style={styles.episodeRow}
                      onPress={() =>
                        onPlayStream(item, ep.streamId, ep.title)
                      }
                    >
                      <Text style={styles.episodeTitle}>{ep.title}</Text>
                      <View style={styles.playEpBtn}>
                        <Text style={styles.playEpBtnText}>
                          ▶ Play ({ep.duration})
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.catalogActionRow}>
                  <TouchableOpacity
                    style={styles.startStreamBtn}
                    onPress={() => onPlayStream(item)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.startStreamBtnText}>
                      {item.tmdbId ? '⚡ Stream HD' : '▶ Play Movie'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.catalogDownloadBtn}
                    onPress={() => onDownload && onDownload(item)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.catalogDownloadBtnText}>⬇️ Download</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}
      />
    );
  },
);

const styles = StyleSheet.create({
  listContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  streamHeaderBanner: {
    backgroundColor: '#161B26',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  streamBannerBadge: {
    backgroundColor: 'rgba(225, 29, 72, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E11D48',
  },
  streamBannerBadgeText: {
    color: '#FB7185',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  streamBannerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  streamBannerSubtitle: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 18,
  },
  streamCard: {
    backgroundColor: '#121620',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  streamBackdropContainer: {
    height: 160,
    width: '100%',
    backgroundColor: '#161B26',
  },
  streamBackdrop: {
    width: '100%',
    height: '100%',
  },
  streamOverlayGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(9, 11, 16, 0.65)',
    padding: 14,
    justifyContent: 'flex-end',
  },
  streamPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  streamTypePill: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  streamTypePillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  streamQualityPill: {
    backgroundColor: '#1E2433',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  streamQualityPillText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: 'bold',
  },
  streamInstantPill: {
    backgroundColor: '#059669',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  streamInstantPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  streamCardTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  streamCardDuration: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
  },
  streamCardBody: {
    padding: 14,
  },
  streamCardOverview: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  episodesWrap: {
    backgroundColor: '#090B10',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1A1E29',
  },
  episodesLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  episodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#161B26',
  },
  episodeTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  playEpBtn: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 8,
  },
  playEpBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  catalogActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  startStreamBtn: {
    flex: 1.3,
    backgroundColor: '#E11D48',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startStreamBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  catalogDownloadBtn: {
    flex: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogDownloadBtnText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '700',
  },
});
