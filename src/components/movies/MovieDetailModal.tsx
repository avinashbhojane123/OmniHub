import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { Movie, TraktComment, TraktMovieStats } from '../../types';
import { traktService } from '../../services/movies/TraktService';

interface MovieDetailModalProps {
  visible: boolean;
  movie: Movie | null;
  isBookmarked: boolean;
  insets: EdgeInsets;
  onClose: () => void;
  onStream: (movie: Movie) => void;
  onDownload?: (movie: Movie) => void;
  onTrailer: (trailerKey?: string) => void;
  onToggleWatchlist: (movie: Movie) => void;
  onBrowseEpisodes?: (movie: Movie) => void;
}

export const MovieDetailModal: React.FC<MovieDetailModalProps> = React.memo(
  ({
    visible,
    movie,
    isBookmarked,
    insets,
    onClose,
    onStream,
    onDownload,
    onTrailer,
    onToggleWatchlist,
    onBrowseEpisodes,
  }) => {

    const [traktStats, setTraktStats] = useState<TraktMovieStats | null>(null);
    const [traktComments, setTraktComments] = useState<TraktComment[]>([]);
    const [isLoadingTrakt, setIsLoadingTrakt] = useState(false);
    const [hasLoggedWatch, setHasLoggedWatch] = useState(false);

    // Fetch Trakt Community Insights when movie modal opens
    useEffect(() => {
      if (!visible || !movie) {
        setTraktStats(null);
        setTraktComments([]);
        setHasLoggedWatch(false);
        return;
      }

      let isCurrent = true;
      setIsLoadingTrakt(true);

      const fetchTraktData = async () => {
        try {
          const [stats, comments] = await Promise.all([
            traktService.getMovieStats(movie.id),
            traktService.getMovieComments(movie.id),
          ]);
          if (isCurrent) {
            setTraktStats(stats);
            setTraktComments(comments);
          }
        } catch {
          // Fallback handled in TraktService
        } finally {
          if (isCurrent) {
            setIsLoadingTrakt(false);
          }
        }
      };

      fetchTraktData();

      return () => {
        isCurrent = false;
      };
    }, [visible, movie]);

    const handleLogWatch = useCallback(async () => {
      if (!movie) return;
      try {
        await traktService.logWatchHistory(movie.id, movie.title);
        setHasLoggedWatch(true);
        Alert.alert(
          'Logged to Trakt',
          `"${movie.title}" was logged to your watch history and marked as watched!`,
        );
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Could not log watch history.');
      }
    }, [movie]);

    if (!movie) return null;

    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={false}
        onRequestClose={onClose}
      >
        <View style={[styles.detailModalContainer, { paddingTop: insets.top }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
          >
            {/* Backdrop Header */}
            <View style={styles.detailBackdropContainer}>
              <Image
                source={{
                  uri:
                    movie.backdrop_path ||
                    movie.poster_path ||
                    'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=1200&q=80',
                }}
                style={styles.detailBackdrop}
              />
              <View style={styles.detailBackdropOverlay}>
                {/* Close button */}
                <TouchableOpacity
                  style={styles.detailCloseBtn}
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.detailCloseText}>✕</Text>
                </TouchableOpacity>

                {/* Play stream floating icon */}
                <TouchableOpacity
                  style={styles.detailPlayFloatingBtn}
                  onPress={() => {
                    onClose();
                    onStream(movie);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.detailPlayFloatingIcon}>▶</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Movie info box */}
            <View style={styles.detailBody}>
              <View style={styles.detailHeaderRow}>
                <Image
                  source={{
                    uri:
                      movie.poster_path ||
                      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&q=80',
                  }}
                  style={styles.detailThumbPoster}
                />

                <View style={styles.detailHeaderTextWrap}>
                  <Text style={styles.detailTitle}>{movie.title}</Text>
                  {movie.tagline ? (
                    <Text style={styles.detailTagline}>"{movie.tagline}"</Text>
                  ) : null}

                  {/* Stats pills */}
                  <View style={styles.detailStatsRow}>
                    <View style={styles.detailStatPill}>
                      <Text style={styles.detailStatPillText}>
                        ★ {movie.vote_average} / 10
                      </Text>
                    </View>
                    <View style={styles.detailStatPill}>
                      <Text style={styles.detailStatPillText}>
                        {movie.release_date ? movie.release_date.slice(0, 4) : ''}
                      </Text>
                    </View>
                    {movie.runtime ? (
                      <View style={styles.detailStatPill}>
                        <Text style={styles.detailStatPillText}>
                          {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* Action Buttons Row */}
              <View style={styles.detailActionButtonsRow}>
                <TouchableOpacity
                  style={styles.detailMainActionBtn}
                  onPress={() => {
                    onClose();
                    onStream(movie);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.detailMainActionBtnText}>
                    ▶ Stream HD
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.detailDownloadActionBtn}
                  onPress={() => {
                    onClose();
                    onDownload && onDownload(movie);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.detailDownloadActionBtnText}>
                    ⬇️ Download
                  </Text>
                </TouchableOpacity>

                {movie.trailer_key ? (
                  <TouchableOpacity
                    style={styles.detailTrailerActionBtn}
                    onPress={() => {
                      onClose();
                      onTrailer(movie.trailer_key);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.detailTrailerActionBtnText}>
                      🎬 Trailer
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.detailSecondaryActionBtn,
                    isBookmarked && styles.detailSecondaryActionBtnActive,
                  ]}
                  onPress={() => onToggleWatchlist(movie)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.detailSecondaryActionBtnText}>
                    {isBookmarked ? '❤️ Saved' : '+ Watchlist'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* TVmaze Series Episode Guide Action Button */}
              {(movie.is_tv || movie.network || movie.tvmaze_id) && onBrowseEpisodes && (
                <TouchableOpacity
                  style={styles.detailTvEpisodesActionBtn}
                  onPress={() => {
                    onClose();
                    onBrowseEpisodes(movie);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.detailTvEpisodesActionBtnText}>
                    📺 Browse TVmaze Seasons & Episodes
                  </Text>
                </TouchableOpacity>
              )}



              {/* Genres */}
              {movie.genres && movie.genres.length > 0 && (
                <View style={styles.detailGenresRow}>
                  {movie.genres.map((g) => (
                    <View key={g.id} style={styles.detailGenreTag}>
                      <Text style={styles.detailGenreTagText}>{g.name}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Director */}
              {movie.director ? (
                <View style={styles.detailDirectorRow}>
                  <Text style={styles.detailSectionLabel}>Director: </Text>
                  <Text style={styles.detailDirectorName}>{movie.director}</Text>
                </View>
              ) : null}

              {/* Overview */}
              <Text style={styles.detailSectionHeading}>Synopsis</Text>
              <Text style={styles.detailOverviewText}>{movie.overview}</Text>

              {/* Cast */}
              {movie.cast && movie.cast.length > 0 && (
                <>
                  <Text style={styles.detailSectionHeading}>Top Cast</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.detailCastScroll}
                  >
                    {movie.cast.map((actor) => (
                      <View key={actor.id} style={styles.castCard}>
                        <Image
                          source={{
                            uri:
                              actor.profile_path ||
                              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=185&q=80',
                          }}
                          style={styles.castAvatar}
                        />
                        <Text style={styles.castName} numberOfLines={1}>
                          {actor.name}
                        </Text>
                        <Text style={styles.castCharacter} numberOfLines={1}>
                          {actor.character}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Trakt Social & Community Section */}
              <View style={styles.traktDetailSection}>
                <View style={styles.traktDetailHeaderRow}>
                  <View style={styles.traktPill}>
                    <Text style={styles.traktPillText}>⚡ TRAKT.TV SOCIAL</Text>
                  </View>
                  <Text style={styles.traktSectionTitle}>Community Insights</Text>
                </View>

                {isLoadingTrakt ? (
                  <View style={styles.traktLoaderWrap}>
                    <ActivityIndicator size="small" color="#ED1C24" />
                    <Text style={styles.traktLoaderText}>Loading Trakt community data...</Text>
                  </View>
                ) : (
                  <>
                    {/* Trakt Live Metrics Grid */}
                    <View style={styles.traktMetricsBar}>
                      <View style={styles.traktMetricItem}>
                        <Text style={styles.traktMetricValue}>
                          ★ {movie.trakt_rating || movie.vote_average}
                        </Text>
                        <Text style={styles.traktMetricLabel}>Trakt Score</Text>
                      </View>

                      <View style={styles.traktMetricDivider} />

                      <View style={styles.traktMetricItem}>
                        <Text style={styles.traktMetricValue}>
                          {traktStats?.watchers
                            ? `🔥 ${traktStats.watchers}`
                            : movie.trakt_watchers
                              ? `🔥 ${movie.trakt_watchers}`
                              : '★ Active'}
                        </Text>
                        <Text style={styles.traktMetricLabel}>Watching Now</Text>
                      </View>

                      <View style={styles.traktMetricDivider} />

                      <View style={styles.traktMetricItem}>
                        <Text style={styles.traktMetricValue}>
                          {traktStats?.plays
                            ? `${Math.round(traktStats.plays / 1000)}k`
                            : movie.vote_count
                              ? `${(movie.vote_count / 1000).toFixed(1)}k`
                              : '—'}
                        </Text>
                        <Text style={styles.traktMetricLabel}>Scrobbles</Text>
                      </View>

                      <View style={styles.traktMetricDivider} />

                      <View style={styles.traktMetricItem}>
                        <Text style={styles.traktMetricValue}>
                          {traktStats?.comments || traktComments.length || '—'}
                        </Text>
                        <Text style={styles.traktMetricLabel}>Reviews</Text>
                      </View>
                    </View>

                    {/* Quick Scrobble / Watch Log Action */}
                    <TouchableOpacity
                      style={[
                        styles.traktLogWatchBtn,
                        hasLoggedWatch && styles.traktLogWatchBtnActive,
                      ]}
                      onPress={handleLogWatch}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.traktLogWatchBtnText}>
                        {hasLoggedWatch
                          ? '✓ Logged to Trakt & CineVerse'
                          : '⚡ Log to Trakt Watch History'}
                      </Text>
                    </TouchableOpacity>

                    {/* Trakt Community Comments & Reviews */}
                    {traktComments.length > 0 && (
                      <View style={styles.traktReviewsWrap}>
                        <Text style={styles.traktReviewsHeading}>
                          Community Reviews & Discussions
                        </Text>

                        {traktComments.slice(0, 3).map((item) => (
                          <View key={item.id} style={styles.traktCommentCard}>
                            <View style={styles.traktCommentHeader}>
                              <Image
                                source={{
                                  uri:
                                    item.user.images?.avatar?.full ||
                                    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&q=80',
                                }}
                                style={styles.traktCommentAvatar}
                              />
                              <View style={styles.traktCommentMeta}>
                                <View style={styles.traktCommentNameRow}>
                                  <Text style={styles.traktCommentUsername}>
                                    {item.user.name || item.user.username}
                                  </Text>
                                  {item.user.vip && (
                                    <View style={styles.traktVipBadge}>
                                      <Text style={styles.traktVipBadgeText}>VIP</Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={styles.traktCommentDate}>
                                  {new Date(item.created_at).toLocaleDateString([], {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                </Text>
                              </View>

                              {item.user_rating && (
                                <View style={styles.traktUserRatingBadge}>
                                  <Text style={styles.traktUserRatingBadgeText}>
                                    ★ {item.user_rating}/10
                                  </Text>
                                </View>
                              )}
                            </View>

                            <Text style={styles.traktCommentBody}>{item.comment}</Text>

                            <View style={styles.traktCommentFooter}>
                              <Text style={styles.traktLikesText}>
                                👍 {item.likes} helpful
                              </Text>
                              {item.spoiler && (
                                <View style={styles.traktSpoilerBadge}>
                                  <Text style={styles.traktSpoilerBadgeText}>
                                    ⚠️ Contains Spoilers
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  },
);


const styles = StyleSheet.create({
  detailModalContainer: {
    flex: 1,
    backgroundColor: '#090B10',
  },
  detailBackdropContainer: {
    height: 240,
    width: '100%',
    backgroundColor: '#161B26',
  },
  detailBackdrop: {
    width: '100%',
    height: '100%',
  },
  detailBackdropOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(9, 11, 16, 0.4)',
    justifyContent: 'space-between',
    padding: 16,
  },
  detailCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(9, 11, 16, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCloseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  detailPlayFloatingBtn: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  detailPlayFloatingIcon: {
    color: '#FFFFFF',
    fontSize: 22,
    marginLeft: 3,
  },
  detailBody: {
    paddingHorizontal: 16,
    marginTop: -40,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  detailThumbPoster: {
    width: 95,
    height: 140,
    borderRadius: 12,
    backgroundColor: '#161B26',
    borderWidth: 2,
    borderColor: '#262D3D',
  },
  detailHeaderTextWrap: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'flex-end',
  },
  detailTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  detailTagline: {
    color: '#9CA3AF',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  detailStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  detailStatPill: {
    backgroundColor: '#161B26',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  detailStatPillText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '600',
  },
  detailActionButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  detailMainActionBtn: {
    flex: 1.25,
    backgroundColor: '#E11D48',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailMainActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  detailDownloadActionBtn: {
    flex: 1.15,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  detailDownloadActionBtnText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  detailTrailerActionBtn: {
    flex: 0.85,
    backgroundColor: '#1E2433',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTrailerActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  detailSecondaryActionBtn: {
    flex: 0.95,
    backgroundColor: '#161B26',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  detailSecondaryActionBtnActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  detailSecondaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  detailTvEpisodesActionBtn: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  detailTvEpisodesActionBtnText: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '700',
  },
  detailGenresRow: {

    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  detailGenreTag: {
    backgroundColor: '#1E2433',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  detailGenreTagText: {
    color: '#FB7185',
    fontSize: 12,
    fontWeight: '600',
  },
  detailDirectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  detailSectionLabel: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  detailDirectorName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  detailSectionHeading: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 6,
  },
  detailOverviewText: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  detailCastScroll: {
    gap: 12,
    paddingVertical: 6,
  },
  castCard: {
    width: 80,
    alignItems: 'center',
  },
  castAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#161B26',
    marginBottom: 6,
  },
  castName: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  castCharacter: {
    color: '#9CA3AF',
    fontSize: 10,
    textAlign: 'center',
  },
  traktDetailSection: {
    marginTop: 20,
    backgroundColor: '#121622',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222A3C',
  },
  traktDetailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  traktPill: {
    backgroundColor: '#ED1C24',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  traktPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  traktSectionTitle: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '700',
  },
  traktLoaderWrap: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  traktLoaderText: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 6,
  },
  traktMetricsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#090B10',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#1A202E',
  },
  traktMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  traktMetricValue: {
    color: '#F9FAFB',
    fontSize: 13,
    fontWeight: '800',
  },
  traktMetricLabel: {
    color: '#6B7280',
    fontSize: 9,
    fontWeight: '500',
    marginTop: 2,
  },
  traktMetricDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#1E2536',
  },
  traktLogWatchBtn: {
    backgroundColor: '#ED1C24',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  traktLogWatchBtnActive: {
    backgroundColor: '#059669',
  },
  traktLogWatchBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  traktReviewsWrap: {
    marginTop: 18,
  },
  traktReviewsHeading: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  traktCommentCard: {
    backgroundColor: '#0C0F17',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1A2130',
  },
  traktCommentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  traktCommentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E2536',
    marginRight: 10,
  },
  traktCommentMeta: {
    flex: 1,
  },
  traktCommentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  traktCommentUsername: {
    color: '#F9FAFB',
    fontSize: 12,
    fontWeight: '700',
  },
  traktVipBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  traktVipBadgeText: {
    color: '#000000',
    fontSize: 8,
    fontWeight: '800',
  },
  traktCommentDate: {
    color: '#6B7280',
    fontSize: 10,
  },
  traktUserRatingBadge: {
    backgroundColor: 'rgba(237, 28, 36, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#ED1C24',
  },
  traktUserRatingBadgeText: {
    color: '#ED1C24',
    fontSize: 10,
    fontWeight: '700',
  },
  traktCommentBody: {
    color: '#D1D5DB',
    fontSize: 12,
    lineHeight: 18,
  },
  traktCommentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#161C28',
  },
  traktLikesText: {
    color: '#9CA3AF',
    fontSize: 10,
  },
  traktSpoilerBadge: {
    backgroundColor: '#7F1D1D',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  traktSpoilerBadgeText: {
    color: '#FCA5A5',
    fontSize: 9,
    fontWeight: '600',
  },
});

