import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useResponsive, colors, spacing } from '../utils/responsive';
import { loadMatchHistory, resolvePlayerNames } from '../utils/storage';

export default function MatchHistoryScreen({ onBack, user }) {
  const { isDesktop } = useResponsive();
  const [sessions, setSessions] = useState([]);
  const [playerNames, setPlayerNames] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState(null);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      const history = await loadMatchHistory();
      setSessions(history);

      // Collect all player IDs for name resolution
      const allPlayerIds = [];
      for (const session of history) {
        for (const match of session.matches) {
          if (match.playerIds) allPlayerIds.push(...match.playerIds);
        }
      }
      const names = await resolvePlayerNames(allPlayerIds);
      setPlayerNames(names);

      setLoading(false);
    }
    fetchHistory();
  }, [user]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getPlayerName = (id) => playerNames.get(id) || 'Unknown';

  const toggleSession = (sessionCode) => {
    setExpandedSession((prev) => (prev === sessionCode ? null : sessionCode));
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        isDesktop && styles.contentContainerDesktop,
      ]}
    >
      <View style={[styles.mainContent, isDesktop && styles.mainContentDesktop]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, isDesktop && styles.titleDesktop]}>Match History</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading history...</Text>
          </View>
        ) : sessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Match History</Text>
            <Text style={styles.emptySubtext}>
              Play some games and your history will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.sessionList}>
            {sessions.map((session) => (
              <View key={session.sessionCode} style={styles.sessionCard}>
                <TouchableOpacity
                  style={styles.sessionHeader}
                  onPress={() => toggleSession(session.sessionCode)}
                  activeOpacity={0.7}
                >
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionName}>{session.sessionName}</Text>
                    <View style={styles.sessionMeta}>
                      <Text style={styles.sessionDate}>{formatDate(session.sessionDate)}</Text>
                      <Text style={styles.sessionType}>
                        {session.gameType === 'doubles'
                          ? (session.pairingMode === 'mixed' ? 'Mixed Doubles' : 'Doubles')
                          : 'Singles'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.matchCount}>
                    {session.matches.length} {session.matches.length === 1 ? 'game' : 'games'}
                  </Text>
                  <Text style={styles.expandIcon}>
                    {expandedSession === session.sessionCode ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {expandedSession === session.sessionCode && (
                  <View style={styles.matchesContainer}>
                    {session.matches
                      .sort((a, b) => a.roundNumber - b.roundNumber || a.courtNumber - b.courtNumber)
                      .map((match) => (
                        <View key={match.courtId} style={styles.matchRow}>
                          <View style={styles.matchInfo}>
                            <Text style={styles.matchRound}>
                              Round {match.roundNumber}, Court {match.courtNumber}
                            </Text>
                            <Text style={styles.matchPlayers}>
                              {(match.playerIds || []).map(getPlayerName).join(', ')}
                            </Text>
                          </View>
                          <View style={styles.matchScore}>
                            {match.scoreTeam1 != null && match.scoreTeam2 != null ? (
                              <Text style={styles.scoreText}>
                                {match.scoreTeam1} - {match.scoreTeam2}
                              </Text>
                            ) : (
                              <Text style={styles.noScoreText}>No score</Text>
                            )}
                          </View>
                        </View>
                      ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  contentContainerDesktop: {
    padding: spacing.xl,
  },
  mainContent: {
    width: '100%',
  },
  mainContentDesktop: {
    maxWidth: 800,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  backButton: {
    marginRight: spacing.md,
    padding: spacing.xs,
    ...Platform.select({ web: { cursor: 'pointer' } }),
  },
  backButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  titleDesktop: {
    fontSize: 28,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  sessionList: {
    gap: spacing.md,
  },
  sessionCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    ...Platform.select({ web: { cursor: 'pointer' } }),
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  sessionMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 4,
  },
  sessionDate: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  sessionType: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
  },
  matchCount: {
    fontSize: 13,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  expandIcon: {
    fontSize: 12,
    color: colors.textMuted,
  },
  matchesContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderRadius: 10,
    padding: spacing.md,
  },
  matchInfo: {
    flex: 1,
  },
  matchRound: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  matchPlayers: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  matchScore: {
    marginLeft: spacing.md,
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  noScoreText: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
