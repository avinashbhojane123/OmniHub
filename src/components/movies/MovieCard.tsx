import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Movie } from '../../types';

interface MovieCardProps {
  movie: Movie;
  cardWidth: number;
  isBookmarked: boolean;
  onPress: (movie: Movie) => void;
  onToggleWatchlist: (movie: Movie) => void;
}

export const MovieCard: React.FC<MovieCardProps> = React.memo(
  ({ movie, cardWidth, isBookmarked, onPress, onToggleWatchlist }) => {
    return (
      <TouchableOpacity
        style={[styles.movieCard, { width: cardWidth }]}
        activeOpacity={0.88}
        onPress={() => onPress(movie)}
      >
        <View style={styles.posterContainer}>
          <Image
            source={{
              uri:
                movie.poster_path ||
                'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&q=80',
            }}
            style={styles.cardPoster}
            resizeMode="cover"
            progressiveRenderingEnabled
            fadeDuration={200}
          />

          {/* Rating Tag */}
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingBadgeText}>★ {movie.vote_average}</Text>
          </View>

          {/* TVmaze Network Tag */}
          {movie.network ? (
            <View style={styles.networkBadge}>
              <Text style={styles.networkBadgeText} numberOfLines={1}>
                📺 {movie.network}
              </Text>
            </View>
          ) : null}

          {/* Trakt Social Metrics Badge */}
          {movie.trakt_watchers ? (
            <View style={styles.traktSocialBadge}>
              <Text style={styles.traktSocialBadgeText}>
                🔥 {movie.trakt_watchers} watching
              </Text>
            </View>
          ) : movie.trakt_plays ? (
            <View style={styles.traktSocialBadge}>
              <Text style={styles.traktSocialBadgeText}>
                ▶ {Math.round(movie.trakt_plays / 1000)}k plays
              </Text>
            </View>
          ) : movie.trakt_list_count ? (
            <View style={styles.traktSocialBadge}>
              <Text style={styles.traktSocialBadgeText}>
                🎯 {Math.round(movie.trakt_list_count / 1000)}k wanted
              </Text>
            </View>
          ) : null}

          {/* Heart bookmark shortcut */}
          <TouchableOpacity
            style={[
              styles.bookmarkShortcut,
              isBookmarked && styles.bookmarkShortcutActive,
            ]}
            onPress={(e) => {
              e.stopPropagation();
              onToggleWatchlist(movie);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.bookmarkShortcutText}>
              {isBookmarked ? '❤️' : '🤍'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Movie title and metadata */}
        <View style={styles.cardMeta}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {movie.title}
          </Text>
          <View style={styles.cardSubMeta}>
            <Text style={styles.cardYear}>
              {movie.release_date ? movie.release_date.slice(0, 4) : ''}
              {movie.network ? ` • ${movie.network}` : ''}
            </Text>
            {movie.trakt_rating ? (
              <View style={styles.traktCardScore}>
                <Text style={styles.traktCardScoreText}>⚡ {movie.trakt_rating}</Text>
              </View>
            ) : movie.is_tv ? (
              <View style={styles.tvCardBadge}>
                <Text style={styles.tvCardBadgeText}>SERIES</Text>
              </View>
            ) : movie.runtime ? (
              <Text style={styles.cardRuntime}>{movie.runtime}m</Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.movie.id === next.movie.id &&
    prev.cardWidth === next.cardWidth &&
    prev.isBookmarked === next.isBookmarked &&
    prev.movie.trakt_watchers === next.movie.trakt_watchers &&
    prev.movie.network === next.movie.network,
);


const styles = StyleSheet.create({
  movieCard: {
    margin: 6,
    borderRadius: 14,
    backgroundColor: '#121620',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  posterContainer: {
    aspectRatio: 2 / 3,
    width: '100%',
    backgroundColor: '#1A1E29',
  },
  cardPoster: {
    width: '100%',
    height: '100%',
  },
  ratingBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(9, 11, 16, 0.82)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#FBBF24',
  },
  ratingBadgeText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: 'bold',
  },
  traktSocialBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(237, 28, 36, 0.90)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  traktSocialBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  traktCardScore: {
    backgroundColor: 'rgba(237, 28, 36, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#ED1C24',
  },
  traktCardScoreText: {
    color: '#ED1C24',
    fontSize: 10,
    fontWeight: '700',
  },
  bookmarkShortcut: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(9, 11, 16, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkShortcutActive: {
    backgroundColor: 'rgba(225, 29, 72, 0.85)',
  },
  bookmarkShortcutText: {
    fontSize: 14,
  },
  cardMeta: {
    padding: 10,
  },
  cardTitle: {
    color: '#F9FAFB',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardYear: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  cardRuntime: {
    color: '#6B7280',
    fontSize: 11,
  },
  networkBadge: {
    position: 'absolute',
    top: 8,
    left: 42,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#3B82F6',
    maxWidth: '55%',
  },
  networkBadgeText: {
    color: '#60A5FA',
    fontSize: 9,
    fontWeight: '800',
  },
  tvCardBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#3B82F6',
  },
  tvCardBadgeText: {
    color: '#60A5FA',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});


