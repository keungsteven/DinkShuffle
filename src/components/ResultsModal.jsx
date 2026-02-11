import { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  Pressable,
} from 'react-native';
import { colors, spacing } from '../utils/responsive';

/**
 * Calculate player statistics from rounds data
 */
function calculatePlayerStats(rounds, players, gameType) {
  const stats = {};

  // Initialize stats for all players
  players.forEach((p) => {
    stats[p.id] = {
      id: p.id,
      name: p.name,
      gender: p.gender,
      wins: 0,
      losses: 0,
      totalPoints: 0,
      pointsAgainst: 0,
      gamesPlayed: 0,
    };
  });

  // Process each round and court
  rounds.forEach((round) => {
    round.courts.forEach((court) => {
      // Only count completed games with scores
      if (court.score?.team1 == null || court.score?.team2 == null) {
        return;
      }

      const team1Score = court.score.team1;
      const team2Score = court.score.team2;
      const team1Won = team1Score > team2Score;
      const isTie = team1Score === team2Score;

      if (gameType === 'doubles') {
        // Doubles: team1 = players[0,1], team2 = players[2,3]
        const team1Players = court.team1 || [court.players[0], court.players[1]];
        const team2Players = court.team2 || [court.players[2], court.players[3]];

        team1Players.forEach((p) => {
          if (p && stats[p.id]) {
            stats[p.id].gamesPlayed++;
            stats[p.id].totalPoints += team1Score;
            stats[p.id].pointsAgainst += team2Score;
            if (!isTie) {
              if (team1Won) stats[p.id].wins++;
              else stats[p.id].losses++;
            }
          }
        });

        team2Players.forEach((p) => {
          if (p && stats[p.id]) {
            stats[p.id].gamesPlayed++;
            stats[p.id].totalPoints += team2Score;
            stats[p.id].pointsAgainst += team1Score;
            if (!isTie) {
              if (!team1Won) stats[p.id].wins++;
              else stats[p.id].losses++;
            }
          }
        });
      } else {
        // Singles: players[0] vs players[1]
        const p1 = court.players[0];
        const p2 = court.players[1];

        if (p1 && stats[p1.id]) {
          stats[p1.id].gamesPlayed++;
          stats[p1.id].totalPoints += team1Score;
          stats[p1.id].pointsAgainst += team2Score;
          if (!isTie) {
            if (team1Won) stats[p1.id].wins++;
            else stats[p1.id].losses++;
          }
        }

        if (p2 && stats[p2.id]) {
          stats[p2.id].gamesPlayed++;
          stats[p2.id].totalPoints += team2Score;
          stats[p2.id].pointsAgainst += team1Score;
          if (!isTie) {
            if (!team1Won) stats[p2.id].wins++;
            else stats[p2.id].losses++;
          }
        }
      }
    });
  });

  // Calculate average point differential for each player
  Object.values(stats).forEach((player) => {
    if (player.gamesPlayed > 0) {
      player.avgPointDiff = (player.totalPoints - player.pointsAgainst) / player.gamesPlayed;
    } else {
      player.avgPointDiff = 0;
    }
  });

  return Object.values(stats);
}

/**
 * Assign ranks with ties support
 * Players with identical sorting values get the same rank
 */
function assignRanks(sortedList, getCompareValue) {
  const ranked = [];
  let currentRank = 1;

  sortedList.forEach((player, index) => {
    if (index === 0) {
      ranked.push({ ...player, rank: currentRank });
    } else {
      const prevValue = getCompareValue(sortedList[index - 1]);
      const currValue = getCompareValue(player);
      // If values are equal, keep same rank; otherwise, rank = position + 1
      if (prevValue === currValue) {
        ranked.push({ ...player, rank: currentRank });
      } else {
        currentRank = index + 1;
        ranked.push({ ...player, rank: currentRank });
      }
    }
  });

  return ranked;
}

/**
 * Medal component for top 3 players
 */
function Medal({ rank }) {
  const medalColors = {
    1: '#FFD700', // Gold
    2: '#C0C0C0', // Silver
    3: '#CD7F32', // Bronze
  };

  if (rank > 3) return <View style={styles.medalPlaceholder} />;

  return (
    <View style={[styles.medal, { backgroundColor: medalColors[rank] }]}>
      <Text style={styles.medalText}>{rank}</Text>
    </View>
  );
}

/**
 * ResultsModal component
 */
export default function ResultsModal({ visible, onClose, rounds, players, gameType }) {
  const [activeTab, setActiveTab] = useState('winLoss'); // 'winLoss' | 'points'

  const playerStats = useMemo(
    () => calculatePlayerStats(rounds, players, gameType),
    [rounds, players, gameType]
  );

  const sortedByWinRate = useMemo(() => {
    const filtered = [...playerStats].filter((p) => p.gamesPlayed > 0);
    const sorted = filtered.sort((a, b) => {
      const aRate = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : 0;
      const bRate = b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0;
      if (bRate !== aRate) return bRate - aRate;
      // Tiebreaker: average point differential (higher is better)
      if (b.avgPointDiff !== a.avgPointDiff) return b.avgPointDiff - a.avgPointDiff;
      return b.wins - a.wins; // Final tiebreaker: more total wins
    });
    // Create composite key for tie detection: win rate + avg point diff
    return assignRanks(sorted, (p) => {
      const rate = p.wins + p.losses > 0 ? p.wins / (p.wins + p.losses) : 0;
      // Round to avoid floating point comparison issues
      return `${rate.toFixed(4)}_${p.avgPointDiff.toFixed(2)}`;
    });
  }, [playerStats]);

  const sortedByPoints = useMemo(() => {
    const filtered = [...playerStats].filter((p) => p.gamesPlayed > 0);
    const sorted = filtered.sort((a, b) => b.totalPoints - a.totalPoints);
    // Assign ranks with ties for same total points
    return assignRanks(sorted, (p) => p.totalPoints);
  }, [playerStats]);

  const displayList = activeTab === 'winLoss' ? sortedByWinRate : sortedByPoints;

  const getWinRate = (player) => {
    const total = player.wins + player.losses;
    if (total === 0) return 0;
    return Math.round((player.wins / total) * 100);
  };

  const hasGames = playerStats.some((p) => p.gamesPlayed > 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Results</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'winLoss' && styles.tabActive]}
              onPress={() => setActiveTab('winLoss')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === 'winLoss' && styles.tabTextActive]}>
                Win/Loss
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'points' && styles.tabActive]}
              onPress={() => setActiveTab('points')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === 'points' && styles.tabTextActive]}>
                Total Points
              </Text>
            </TouchableOpacity>
          </View>

          {/* Results List */}
          <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
            {!hasGames ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No completed games yet</Text>
                <Text style={styles.emptySubtext}>Enter scores to see results</Text>
              </View>
            ) : (
              displayList.map((player) => (
                <View key={player.id} style={styles.playerRow}>
                  <Medal rank={player.rank} />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName} numberOfLines={1}>
                      {player.name}
                    </Text>
                    {activeTab === 'winLoss' && (
                      <Text style={styles.avgDiffText}>
                        Avg Diff: {player.avgPointDiff >= 0 ? '+' : ''}{player.avgPointDiff.toFixed(1)}
                      </Text>
                    )}
                  </View>
                  {activeTab === 'winLoss' ? (
                    <View style={styles.statsContainer}>
                      <Text style={styles.winLossText}>
                        {player.wins}-{player.losses}
                      </Text>
                      <Text style={styles.percentText}>({getWinRate(player)}%)</Text>
                    </View>
                  ) : (
                    <Text style={styles.pointsText}>{player.totalPoints} pts</Text>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(4px)',
      },
    }),
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.2,
        shadowRadius: 60,
        elevation: 10,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  closeText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.background,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  listContainer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  medal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  medalText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  medalPlaceholder: {
    width: 28,
    height: 28,
    marginRight: spacing.md,
  },
  playerInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  playerName: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  avgDiffText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  winLossText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  percentText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  pointsText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
});
