import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { Movie, TVMazeEpisode, TVMazeSeason } from '../../types';
import { tvMazeService } from '../../services/movies/TVMazeService';

interface TVEpisodeGuideModalProps {
  visible: boolean;
  movie: Movie | null;
  insets: EdgeInsets;
  onClose: () => void;
  onPlayEpisode: (movie: Movie, season: number, episode: number, title: string) => void;
  onDownloadEpisode?: (movie: Movie, season: number, episode: number, title: string) => void;
}

export const TVEpisodeGuideModal: React.FC<TVEpisodeGuideModalProps> = React.memo(
  ({ visible, movie, insets, onClose, onPlayEpisode, onDownloadEpisode }) => {
    const [seasons, setSeasons] = useState<TVMazeSeason[]>([]);
    const [allEpisodes, setAllEpisodes] = useState<TVMazeEpisode[]>([]);
    const [selectedSeason, setSelectedSeason] = useState<number>(1);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch seasons & episodes when modal opens
    useEffect(() => {
      if (!visible || !movie) {
        setSeasons([]);
        setAllEpisodes([]);
        setSelectedSeason(1);
        return;
      }

      let isCurrent = true;
      setIsLoading(true);

      const loadTvData = async () => {
        try {
          const showId = movie.tvmaze_id || movie.id;
          const [fetchedSeasons, fetchedEpisodes] = await Promise.all([
            tvMazeService.getShowSeasons(showId),
            tvMazeService.getShowEpisodes(showId),
          ]);

          if (isCurrent) {
            setSeasons(fetchedSeasons);
            setAllEpisodes(fetchedEpisodes);
            if (fetchedSeasons.length > 0) {
              setSelectedSeason(fetchedSeasons[0].number || 1);
            }
          }
        } catch {
          // Fallback handled in service
        } finally {
          if (isCurrent) {
            setIsLoading(false);
          }
        }
      };

      loadTvData();

      return () => {
        isCurrent = false;
      };
    }, [visible, movie]);

    // Filter episodes for current selected season
    const currentSeasonEpisodes = allEpisodes.filter(
      (ep) => ep.season === selectedSeason,
    );

    const episodesToRender =
      currentSeasonEpisodes.length > 0 ? currentSeasonEpisodes : allEpisodes.slice(0, 10);

    if (!movie) return null;

    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleWrap}>
                <View style={styles.tvBadge}>
                  <Text style={styles.tvBadgeText}>📺 TVMAZE GUIDE</Text>
                </View>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {movie.title}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Show Info Card */}
            <View style={styles.showCard}>
              {movie.poster_path ? (
                <Image
                  source={{ uri: movie.poster_path }}
                  style={styles.showPoster}
                />
              ) : (
                <View style={[styles.showPoster, styles.fallbackShowPoster]}>
                  <Text style={styles.fallbackShowPosterIcon}>📺</Text>
                </View>
              )}
              <View style={styles.showMeta}>
                <Text style={styles.showTitle} numberOfLines={1}>
                  {movie.title}
                </Text>
                <View style={styles.showPillsRow}>
                  {movie.network ? (
                    <View style={styles.networkPill}>
                      <Text style={styles.networkPillText}>{movie.network}</Text>
                    </View>
                  ) : null}
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>
                      {movie.status === 'Ended' ? '⏹ Ended' : '🟢 Airing'}
                    </Text>
                  </View>
                  <View style={styles.ratingPill}>
                    <Text style={styles.ratingPillText}>★ {movie.vote_average}</Text>
                  </View>
                </View>

                {movie.schedule_time && (
                  <Text style={styles.scheduleText}>
                    📅 {movie.schedule_days?.join(', ') || 'Sundays'} at {movie.schedule_time}
                  </Text>
                )}

                <Text style={styles.overviewText} numberOfLines={2}>
                  {movie.overview}
                </Text>
              </View>
            </View>

            {/* Season Selector Tabs */}
            {seasons.length > 0 && (
              <View style={styles.seasonsContainer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.seasonsScroll}
                >
                  {seasons.map((s) => {
                    const isSelected = selectedSeason === s.number;
                    return (
                      <TouchableOpacity
                        key={s.id || s.number}
                        style={[styles.seasonTab, isSelected && styles.seasonTabActive]}
                        onPress={() => setSelectedSeason(s.number)}
                      >
                        <Text
                          style={[
                            styles.seasonTabText,
                            isSelected && styles.seasonTabTextActive,
                          ]}
                        >
                          Season {s.number}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Episodes List */}
            {isLoading ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="large" color="#E11D48" />
                <Text style={styles.loaderText}>Loading TVmaze episode guide...</Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.episodesList}
              >
                <Text style={styles.seasonHeading}>
                  Season {selectedSeason} Episodes ({episodesToRender.length})
                </Text>

                {episodesToRender.map((ep) => {
                  const cleanSummary = ep.summary
                    ? ep.summary.replace(/<[^>]+>/g, '').trim()
                    : 'Episode synopsis coming soon.';

                  return (
                    <View key={ep.id} style={styles.episodeCard}>
                      <View style={styles.episodeTopRow}>
                        {ep.image?.medium || ep.image?.original || movie.backdrop_path ? (
                          <Image
                            source={{
                              uri:
                                ep.image?.medium ||
                                ep.image?.original ||
                                movie.backdrop_path,
                            }}
                            style={styles.episodeThumb}
                          />
                        ) : (
                          <View style={[styles.episodeThumb, styles.fallbackEpisodeThumb]}>
                            <Text style={styles.fallbackEpisodeThumbText}>
                              S{ep.season}:E{ep.number}
                            </Text>
                          </View>
                        )}

                        <View style={styles.episodeMeta}>
                          <View style={styles.episodeNumRow}>
                            <Text style={styles.episodeNumBadge}>
                              S{ep.season < 10 ? `0${ep.season}` : ep.season}:E
                              {ep.number < 10 ? `0${ep.number}` : ep.number}
                            </Text>
                            {ep.runtime ? (
                              <Text style={styles.episodeRuntime}>{ep.runtime} min</Text>
                            ) : null}
                          </View>

                          <Text style={styles.episodeName} numberOfLines={1}>
                            {ep.name || `Episode ${ep.number}`}
                          </Text>

                          <Text style={styles.episodeAirDate}>
                            {ep.airdate
                              ? new Date(ep.airdate).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : 'Air date TBA'}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.episodeSummary} numberOfLines={2}>
                        {cleanSummary}
                      </Text>

                      {/* Episode Action Buttons */}
                      <View style={styles.episodeActionRow}>
                        <TouchableOpacity
                          style={styles.playEpisodeBtn}
                          onPress={() => {
                            onClose();
                            onPlayEpisode(movie, ep.season, ep.number, ep.name);
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.playEpisodeBtnText}>
                            ▶ Stream S{ep.season}:E{ep.number}
                          </Text>
                        </TouchableOpacity>

                        {onDownloadEpisode && (
                          <TouchableOpacity
                            style={styles.downloadEpisodeBtn}
                            onPress={() => {
                              onClose();
                              onDownloadEpisode(movie, ep.season, ep.number, ep.name);
                            }}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.downloadEpisodeBtnText}>⬇️ Download</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    );
  },
);

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0A0D14',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '92%',
    borderWidth: 1,
    borderColor: '#1E2536',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#161C28',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 12,
  },
  tvBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tvBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerTitle: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E2536',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '700',
  },
  showCard: {
    flexDirection: 'row',
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#111520',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2738',
  },
  showPoster: {
    width: 64,
    height: 94,
    borderRadius: 8,
    backgroundColor: '#1B2232',
    marginRight: 12,
  },
  showMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  showTitle: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '700',
  },
  showPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  networkPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  networkPillText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '700',
  },
  statusPill: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusPillText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '600',
  },
  ratingPill: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingPillText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '700',
  },
  scheduleText: {
    color: '#9CA3AF',
    fontSize: 11,
    marginBottom: 4,
  },
  overviewText: {
    color: '#6B7280',
    fontSize: 11,
    lineHeight: 15,
  },
  seasonsContainer: {
    marginTop: 12,
    marginHorizontal: 16,
  },
  seasonsScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  seasonTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#141924',
    borderWidth: 1,
    borderColor: '#222A3B',
  },
  seasonTabActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  seasonTabText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  seasonTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 10,
  },
  episodesList: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  seasonHeading: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  episodeCard: {
    backgroundColor: '#121622',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1D2434',
  },
  episodeTopRow: {
    flexDirection: 'row',
  },
  episodeThumb: {
    width: 86,
    height: 54,
    borderRadius: 8,
    backgroundColor: '#1A202E',
    marginRight: 10,
  },
  episodeMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  episodeNumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  episodeNumBadge: {
    color: '#3B82F6',
    fontSize: 11,
    fontWeight: '800',
  },
  episodeRuntime: {
    color: '#6B7280',
    fontSize: 10,
  },
  episodeName: {
    color: '#F9FAFB',
    fontSize: 13,
    fontWeight: '700',
  },
  episodeAirDate: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 2,
  },
  episodeSummary: {
    color: '#9CA3AF',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  episodeActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1A2130',
  },
  playEpisodeBtn: {
    flex: 1,
    backgroundColor: '#E11D48',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playEpisodeBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  downloadEpisodeBtn: {
    backgroundColor: '#1A202E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadEpisodeBtnText: {
    color: '#D1D5DB',
    fontSize: 11,
    fontWeight: '600',
  },
  fallbackShowPoster: {
    backgroundColor: '#1E2536',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackShowPosterIcon: {
    fontSize: 24,
  },
  fallbackEpisodeThumb: {
    backgroundColor: '#1E2536',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackEpisodeThumbText: {
    color: '#3B82F6',
    fontSize: 11,
    fontWeight: '800',
  },
});
