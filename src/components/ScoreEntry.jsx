import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  Platform,
  Pressable,
} from 'react-native';
import { colors, spacing } from '../utils/responsive';

/**
 * ScoreEntry component for entering game scores
 */
export default function ScoreEntry({
  score,
  onScoreUpdate,
  team1Label,
  team2Label,
  currentUserName = 'Organizer',
}) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [team1Score, setTeam1Score] = useState(
    score?.team1 !== null ? score.team1.toString() : ''
  );
  const [team2Score, setTeam2Score] = useState(
    score?.team2 !== null ? score.team2.toString() : ''
  );

  const hasScore = score?.team1 !== null && score?.team2 !== null;

  const handleOpen = () => {
    setTeam1Score(score?.team1 !== null ? score.team1.toString() : '');
    setTeam2Score(score?.team2 !== null ? score.team2.toString() : '');
    setIsModalVisible(true);
  };

  const handleSave = () => {
    const t1 = parseInt(team1Score, 10);
    const t2 = parseInt(team2Score, 10);

    if (isNaN(t1) || isNaN(t2)) {
      return;
    }

    onScoreUpdate(t1, t2, currentUserName);
    setIsModalVisible(false);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.scoreDisplay, hasScore && styles.scoreDisplayHasScore]}
        onPress={handleOpen}
        activeOpacity={0.7}
      >
        {hasScore ? (
          <View style={styles.scoreRow}>
            <Text style={styles.scoreValue}>{score.team1}</Text>
            <Text style={styles.scoreDash}>-</Text>
            <Text style={styles.scoreValue}>{score.team2}</Text>
          </View>
        ) : (
          <Text style={styles.addScore}>+ Score</Text>
        )}
      </TouchableOpacity>

      {hasScore && score.lastUpdatedBy && (
        <Text style={styles.attribution}>
          {score.lastUpdatedBy} {score.lastUpdatedAt && formatTime(score.lastUpdatedAt)}
        </Text>
      )}

      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCancel}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Enter Score</Text>

            <View style={styles.scoreInputRow}>
              <View style={styles.scoreInputGroup}>
                <Text style={styles.teamLabel} numberOfLines={1}>{team1Label}</Text>
                <TextInput
                  style={styles.scoreInput}
                  value={team1Score}
                  onChangeText={(t) => setTeam1Score(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  selectTextOnFocus
                />
              </View>

              <Text style={styles.inputDash}>-</Text>

              <View style={styles.scoreInputGroup}>
                <Text style={styles.teamLabel} numberOfLines={1}>{team2Label}</Text>
                <TextInput
                  style={styles.scoreInput}
                  value={team2Score}
                  onChangeText={(t) => setTeam2Score(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  selectTextOnFocus
                />
              </View>
            </View>

            <Text style={styles.updaterNote}>
              Entered by: {currentUserName}
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancel}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                activeOpacity={0.8}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 3,
  },
  scoreDisplay: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    minWidth: 72,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        userSelect: 'none',
      },
    }),
  },
  scoreDisplayHasScore: {
    borderColor: colors.primary + '30',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  scoreDash: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  addScore: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  attribution: {
    fontSize: 10,
    color: colors.textMuted,
    ...Platform.select({
      web: { userSelect: 'none' },
    }),
  },
  modalOverlay: {
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
    padding: spacing.xl,
    width: '90%',
    maxWidth: 360,
    gap: spacing.lg,
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
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  scoreInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  scoreInputGroup: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  teamLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
    maxWidth: 100,
    textAlign: 'center',
  },
  scoreInput: {
    width: 72,
    height: 64,
    backgroundColor: colors.secondary,
    borderRadius: 14,
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.text,
    borderWidth: 2,
    borderColor: 'transparent',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        transition: 'border-color 0.15s ease',
      },
    }),
  },
  inputDash: {
    fontSize: 32,
    fontWeight: '500',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  updaterNote: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.secondary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
      },
    }),
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'transform 0.15s ease',
      },
    }),
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
