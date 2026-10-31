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
import { Movie } from '../../types';
import { movieService } from '../../services/movies/MovieService';
import { tvMazeService } from '../../services/movies/TVMazeService';

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
    const [detailMovie, setDetailMovie] = useState<Movie | null>(movie);
    const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

    useEffect(() => {
      setDetailMovie(movie);
      if (!visible || !movie) return;

      // If cast and director / trailer_key are already present, skip loading
      if (movie.cast && movie.cast.length > 0 && (movie.director || movie.trailer_key)) {
        return;
      }

      let isCurrent = true;
      setIsLoadingDetails(true);

      const loadFullDetails = async () => {
        try {
          if (movie.is_tv || movie.tvmaze_id) {
            const showId = movie.tvmaze_id || movie.id;
            const cast = await tvMazeService.getShowCast(showId);
            if (isCurrent && cast.length > 0) {
              setDetailMovie((prev) => (prev ? { ...prev, cast } : prev));
            }
          } else {
            const details = await movieService.getMovieDetails(movie.id);
            if (isCurrent && details && !details.title.startsWith('Movie #')) {
              setDetailMovie((prev) => (prev ? { ...prev, ...details } : prev));
            }
          }
        } catch {
          // Keep base movie information on network error
        } finally {
          if (isCurrent) {
            setIsLoadingDetails(false);
          }
        }
      };

      loadFullDetails();

      return () => {
        isCurrent = false;
      };
    }, [visible, movie?.id]);

    if (!movie) return null;

    const activeMovie = detailMovie || movie;

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
              {activeMovie.backdrop_path || activeMovie.poster_path ? (
                <Image
                  source={{
                    uri: activeMovie.backdrop_path || activeMovie.poster_path,
                  }}
                  style={styles.detailBackdrop}
                />
              ) : (
                <View style={[styles.detailBackdrop, styles.fallbackBackdrop]}>
                  <Text style={styles.fallbackBackdropIcon}>
                    {activeMovie.is_tv ? '📺' : '🎬'}
                  </Text>
                </View>
              )}
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
                    onStream(activeMovie);
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
                {activeMovie.poster_path ? (
                  <Image
                    source={{ uri: activeMovie.poster_path }}
                    style={styles.detailThumbPoster}
                  />
                ) : (
                  <View style={[styles.detailThumbPoster, styles.fallbackThumbPoster]}>
                    <Text style={styles.fallbackThumbPosterIcon}>
                      {activeMovie.is_tv ? '📺' : '🎬'}
                    </Text>
                  </View>
                )}

                <View style={styles.detailHeaderTextWrap}>
                  <Text style={styles.detailTitle}>{activeMovie.title}</Text>
                  {activeMovie.tagline ? (
                    <Text style={styles.detailTagline}>"{activeMovie.tagline}"</Text>
                  ) : null}

                  {/* Stats pills */}
                  <View style={styles.detailStatsRow}>
                    <View style={styles.detailStatPill}>
                      <Text style={styles.detailStatPillText}>
                        ★ {activeMovie.vote_average} / 10
                      </Text>
                    </View>
                    {activeMovie.release_date ? (
                      <View style={styles.detailStatPill}>
                        <Text style={styles.detailStatPillText}>
                          {activeMovie.release_date.slice(0, 4)}
                        </Text>
                      </View>
                    ) : null}
                    {activeMovie.runtime ? (
                      <View style={styles.detailStatPill}>
                        <Text style={styles.detailStatPillText}>
                          {Math.floor(activeMovie.runtime / 60)}h {activeMovie.runtime % 60}m
                        </Text>
                      </View>
                    ) : null}
                    {activeMovie.original_language ? (
                      <View style={[styles.detailStatPill, { borderColor: '#E11D48', backgroundColor: 'rgba(225, 29, 72, 0.15)' }]}>
                        <Text style={[styles.detailStatPillText, { color: '#FB7185', fontWeight: '800' }]}>
                          🌐 {activeMovie.original_language.toUpperCase()}
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
                    onStream(activeMovie);
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
                    onDownload && onDownload(activeMovie);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.detailDownloadActionBtnText}>
                    ⬇️ Download
                  </Text>
                </TouchableOpacity>

                {activeMovie.trailer_key ? (
                  <TouchableOpacity
                    style={styles.detailTrailerActionBtn}
                    onPress={() => {
                      onClose();
                      onTrailer(activeMovie.trailer_key);
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
                  onPress={() => onToggleWatchlist(activeMovie)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.detailSecondaryActionBtnText}>
                    {isBookmarked ? '❤️ Saved' : '+ Watchlist'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* TVmaze Series Episode Guide Action Button */}
              {(activeMovie.is_tv || activeMovie.network || activeMovie.tvmaze_id) && onBrowseEpisodes && (
                <TouchableOpacity
                  style={styles.detailTvEpisodesActionBtn}
                  onPress={() => {
                    onClose();
                    onBrowseEpisodes(activeMovie);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.detailTvEpisodesActionBtnText}>
                    📺 Browse TVmaze Seasons & Episodes
                  </Text>
                </TouchableOpacity>
              )}

              {/* Genres */}
              {activeMovie.genres && activeMovie.genres.length > 0 && (
                <View style={styles.detailGenresRow}>
                  {activeMovie.genres.map((g) => (
                    <View key={g.id} style={styles.detailGenreTag}>
                      <Text style={styles.detailGenreTagText}>{g.name}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Director */}
              {activeMovie.director ? (
                <View style={styles.detailDirectorRow}>
                  <Text style={styles.detailSectionLabel}>Director: </Text>
                  <Text style={styles.detailDirectorName}>{activeMovie.director}</Text>
                </View>
              ) : null}

              {/* Overview */}
              <Text style={styles.detailSectionHeading}>Synopsis</Text>
              <Text style={styles.detailOverviewText}>{activeMovie.overview}</Text>

              {/* Cast */}
              {activeMovie.cast && activeMovie.cast.length > 0 ? (
                <>
                  <Text style={styles.detailSectionHeading}>Top Cast</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.detailCastScroll}
                  >
                    {activeMovie.cast.map((actor) => (
                      <View key={actor.id} style={styles.castCard}>
                        {actor.profile_path ? (
                          <Image
                            source={{ uri: actor.profile_path }}
                            style={styles.castAvatar}
                          />
                        ) : (
                          <View style={[styles.castAvatar, styles.castAvatarPlaceholder]}>
                            <Text style={styles.castAvatarInitials}>
                              {actor.name
                                ? actor.name
                                    .split(' ')
                                    .map((n) => n[0])
                                    .slice(0, 2)
                                    .join('')
                                : '👤'}
                            </Text>
                          </View>
                        )}
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
              ) : isLoadingDetails ? (
                <View style={styles.loadingDetailsRow}>
                  <ActivityIndicator size="small" color="#E11D48" />
                  <Text style={styles.loadingDetailsText}>Loading cast & credits...</Text>
                </View>
              ) : null}

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
  loadingDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingDetailsText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  fallbackBackdrop: {
    backgroundColor: '#161B26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackBackdropIcon: {
    fontSize: 48,
    opacity: 0.6,
  },
  fallbackThumbPoster: {
    backgroundColor: '#161B26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackThumbPosterIcon: {
    fontSize: 32,
    opacity: 0.7,
  },
  castAvatarPlaceholder: {
    backgroundColor: '#1E2536',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2C3549',
  },
  castAvatarInitials: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '700',
  },
});

