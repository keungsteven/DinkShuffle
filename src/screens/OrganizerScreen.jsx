import { useState, useMemo, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { shufflePlayers } from '../utils/shuffle';
import { useResponsive, colors, spacing } from '../utils/responsive';
import { saveSessionToCloud, saveShuffleResultsToCloud, updateCourtInCloud } from '../utils/storage';
import { supabase } from '../utils/supabase';
import ScoreEntry from '../components/ScoreEntry';
import ResultsModal from '../components/ResultsModal';

export default function OrganizerScreen({ sessionCode, onLeave, onSessionUpdate, initialData, user }) {
  const { isDesktop, width } = useResponsive();

  // Game configuration - restore from initialData if available
  const [gameType, setGameType] = useState(initialData?.config?.gameType || null);
  const [pairingMode, setPairingMode] = useState(initialData?.config?.pairingMode || null);
  const [numRounds, setNumRounds] = useState(initialData?.config?.numRounds?.toString() || '3');
  const [numCourts, setNumCourts] = useState(initialData?.config?.numCourts?.toString() || '2');

  // Players and rounds - restore from initialData if available
  const [players, setPlayers] = useState(initialData?.players || []);
  const [rounds, setRounds] = useState(initialData?.rounds || []);
  const [isShuffled, setIsShuffled] = useState(initialData?.isShuffled || false);
  const [error, setError] = useState('');
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState('male');

  // Player count input for generating slots
  const [playerCountInput, setPlayerCountInput] = useState('8');
  const [showResults, setShowResults] = useState(false);
  const [sessionName, setSessionName] = useState(initialData?.sessionName || '');
  const [isEditingSessionName, setIsEditingSessionName] = useState(false);
  const [tempSessionName, setTempSessionName] = useState('');

  // Court names (session-level, survives reshuffles)
  const [courtNames, setCourtNames] = useState(initialData?.courtNames || {});
  const [editingCourtNumber, setEditingCourtNumber] = useState(null);
  const [tempCourtName, setTempCourtName] = useState('');

  const getCourtName = (courtNumber) => courtNames[courtNumber] || `Court ${courtNumber}`;

  // Track if this is initial mount to avoid saving on restore
  const isInitialMount = useRef(true);

  // Calculate grid columns for courts based on screen width
  const courtColumns = useMemo(() => {
    if (width >= 1200) return 3;
    if (width >= 768) return 2;
    return 1;
  }, [width]);

  // Auto-save session when state changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const timeoutId = setTimeout(() => {
      if (onSessionUpdate) {
        onSessionUpdate({
          sessionName,
          config: {
            gameType,
            pairingMode,
            numRounds: parseInt(numRounds, 10) || 3,
            numCourts: parseInt(numCourts, 10) || 2,
          },
          players,
          rounds,
          isShuffled,
          courtNames,
        });
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [sessionName, gameType, pairingMode, numRounds, numCourts, players, rounds, isShuffled, courtNames, onSessionUpdate]);

  // Cloud sync: save session config to Supabase when user is logged in
  useEffect(() => {
    if (!user || !supabase || isInitialMount.current) return;

    const timeoutId = setTimeout(() => {
      saveSessionToCloud(sessionCode, {
        sessionName,
        config: { gameType, pairingMode, numRounds: parseInt(numRounds, 10) || 3, numCourts: parseInt(numCourts, 10) || 2 },
        courtNames,
        isShuffled,
      });
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [user, sessionCode, sessionName, gameType, pairingMode, numRounds, numCourts, courtNames, isShuffled]);

  // Real-time: subscribe to court score/status updates from other clients
  useEffect(() => {
    if (!supabase || !isShuffled || rounds.length === 0) return;

    const channel = supabase
      .channel(`courts-${sessionCode}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'courts',
      }, (payload) => {
        const updated = payload.new;
        setRounds((prev) =>
          prev.map((round) => ({
            ...round,
            courts: round.courts.map((court) => {
              // Match by court number within the round (best effort without round_id)
              if (court.courtNumber !== updated.court_number) return court;
              return {
                ...court,
                status: updated.status || court.status,
                score: {
                  team1: updated.score_team1 ?? court.score.team1,
                  team2: updated.score_team2 ?? court.score.team2,
                  lastUpdatedBy: updated.score_updated_by || court.score.lastUpdatedBy,
                  lastUpdatedAt: updated.score_updated_at
                    ? new Date(updated.score_updated_at).getTime()
                    : court.score.lastUpdatedAt,
                },
              };
            }),
          }))
        );
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, isShuffled, rounds.length, sessionCode]);

  // Real-time: subscribe to player roster changes from other clients
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel(`players-${sessionCode}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'session_players',
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setPlayers((prev) => {
            // Avoid duplicates
            if (prev.some((p) => p.id === payload.new.id)) return prev;
            return [...prev, {
              id: payload.new.id,
              name: payload.new.player_name,
              gender: payload.new.gender,
            }];
          });
        } else if (payload.eventType === 'DELETE') {
          setPlayers((prev) => prev.filter((p) => p.id !== payload.old.id));
        } else if (payload.eventType === 'UPDATE') {
          setPlayers((prev) => prev.map((p) =>
            p.id === payload.new.id
              ? { ...p, name: payload.new.player_name, gender: payload.new.gender }
              : p
          ));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, sessionCode]);

  const playerCounts = useMemo(() => {
    const males = players.filter((p) => p.gender === 'male').length;
    const females = players.filter((p) => p.gender === 'female').length;
    return { total: players.length, males, females };
  }, [players]);

  const handleShuffle = () => {
    setError('');

    if (players.length === 0) {
      setError('Please generate players first');
      return;
    }
    if (!gameType) {
      setError('Please select a game type');
      return;
    }
    if (gameType === 'doubles' && !pairingMode) {
      setError('Please select a pairing mode');
      return;
    }

    const result = shufflePlayers({
      players,
      gameType,
      pairingMode,
      numRounds: parseInt(numRounds, 10) || 1,
      numCourts: parseInt(numCourts, 10) || 1,
    });

    if (result.error) {
      setError(result.error);
      return;
    }

    setRounds(result.rounds);
    setIsShuffled(true);

    // Persist to Supabase if logged in (fire-and-forget)
    if (user) {
      saveShuffleResultsToCloud(sessionCode, players, result.rounds);
    }
  };

  const resetShuffle = () => {
    setRounds([]);
    setIsShuffled(false);
    setError('');
  };

  const toggleCourtStatus = (roundId, courtId) => {
    setRounds((prev) =>
      prev.map((round) => {
        if (round.id !== roundId) return round;
        return {
          ...round,
          courts: round.courts.map((court) => {
            if (court.id !== courtId) return court;
            const nextStatus =
              court.status === 'pending'
                ? 'playing'
                : court.status === 'playing'
                ? 'completed'
                : 'pending';
            return { ...court, status: nextStatus };
          }),
        };
      })
    );
  };

  const removePlayer = (playerId) => {
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
  };

  const startEditingPlayer = (player) => {
    setEditingPlayer(player);
    setEditName(player.name);
    setEditGender(player.gender);
  };

  const savePlayerEdit = () => {
    if (!editingPlayer || !editName.trim()) return;
    const updatedName = editName.trim();
    const updatedGender = editGender;
    const playerId = editingPlayer.id;

    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId ? { ...p, name: updatedName, gender: updatedGender } : p
      )
    );

    // Propagate name/gender changes into existing rounds so matchups are preserved
    if (isShuffled && rounds.length > 0) {
      const updatePlayer = (p) =>
        p && p.id === playerId ? { ...p, name: updatedName, gender: updatedGender } : p;

      setRounds((prev) =>
        prev.map((round) => ({
          ...round,
          sitOuts: round.sitOuts?.map(updatePlayer) || [],
          courts: round.courts.map((court) => ({
            ...court,
            players: court.players.map(updatePlayer),
            ...(court.team1 ? { team1: court.team1.map(updatePlayer) } : {}),
            ...(court.team2 ? { team2: court.team2.map(updatePlayer) } : {}),
          })),
        }))
      );
    }

    setEditingPlayer(null);
    setEditName('');
    setEditGender('male');
  };

  const cancelEditPlayer = () => {
    setEditingPlayer(null);
    setEditName('');
    setEditGender('male');
  };

  /**
   * Generate initial player slots based on count input
   */
  const generatePlayerSlots = () => {
    const count = parseInt(playerCountInput, 10);
    if (isNaN(count) || count < 1) {
      setError('Please enter a valid number of players');
      return;
    }
    if (count > 50) {
      setError('Maximum 50 players allowed');
      return;
    }

    const newPlayers = [];
    for (let i = 1; i <= count; i++) {
      newPlayers.push({
        id: `player-${i}-${Date.now()}`,
        name: `Player ${i}`,
        gender: 'male',
      });
    }
    setPlayers(newPlayers);
    setError('');
  };

  const addPlayer = () => {
    if (players.length >= 50) {
      setError('Maximum 50 players allowed');
      return;
    }
    // Find the next player number by checking existing default names
    let maxNum = 0;
    for (const p of players) {
      const match = p.name.match(/^Player (\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
    const nextNum = Math.max(maxNum + 1, players.length + 1);
    setPlayers((prev) => [
      ...prev,
      { id: `player-${nextNum}-${Date.now()}`, name: `Player ${nextNum}`, gender: 'male' },
    ]);
    setError('');
  };

  const removeLastPlayer = () => {
    if (players.length <= 1) return;
    // Priority 1: remove the player with the highest "Player N" default name
    // Priority 2: remove an unedited player (still has default name)
    // Priority 3: remove the last player in the list
    let removeIdx = -1;
    let highestNum = -1;
    for (let i = 0; i < players.length; i++) {
      const match = players[i].name.match(/^Player (\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > highestNum) {
          highestNum = num;
          removeIdx = i;
        }
      }
    }
    if (removeIdx === -1) removeIdx = players.length - 1;
    setPlayers((prev) => prev.filter((_, i) => i !== removeIdx));
    setError('');
  };

  const updateScore = (roundId, courtId, team1Score, team2Score, updaterName) => {
    let courtNumber = null;
    let roundNumber = null;

    setRounds((prev) =>
      prev.map((round) => {
        if (round.id !== roundId) return round;
        roundNumber = round.roundNumber;
        return {
          ...round,
          courts: round.courts.map((court) => {
            if (court.id !== courtId) return court;
            courtNumber = court.courtNumber;
            return {
              ...court,
              score: {
                team1: team1Score,
                team2: team2Score,
                lastUpdatedBy: updaterName,
                lastUpdatedAt: Date.now(),
              },
              status: court.status === 'pending' ? 'playing' : court.status,
            };
          }),
        };
      })
    );

    // Sync score to cloud if logged in
    if (user && courtNumber && roundNumber) {
      updateCourtInCloud(sessionCode, roundNumber, courtNumber, {
        score_team1: team1Score,
        score_team2: team2Score,
        score_updated_by: updaterName,
        status: 'playing',
      });
    }
  };

  const renderOptionButton = (label, isSelected, onPress) => (
    <TouchableOpacity
      style={[
        styles.optionButton,
        isSelected && styles.optionButtonSelected,
        isDesktop && styles.optionButtonDesktop,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.optionButtonText, isSelected && styles.optionButtonTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderCourt = (court, roundId) => {
    const statusColors = {
      pending: colors.secondary,
      playing: colors.warningLight,
      completed: colors.successLight,
    };

    const team1 = court.team1 || [court.players[0], court.players[1]];
    const team2 = court.team2 || [court.players[2], court.players[3]];

    const handleScoreUpdate = (t1, t2, updater) => {
      updateScore(roundId, court.id, t1, t2, updater);
    };

    return (
      <View
        key={court.id}
        style={[
          styles.courtCard,
          { backgroundColor: statusColors[court.status] },
          courtColumns > 1 && { width: `${100 / courtColumns - 2}%` },
        ]}
      >
        <View style={styles.courtHeader}>
          {editingCourtNumber === court.courtNumber ? (
            <View style={styles.courtNameEditRow}>
              <TextInput
                style={styles.courtNameInput}
                value={tempCourtName}
                onChangeText={setTempCourtName}
                autoFocus
                selectTextOnFocus
                onSubmitEditing={() => {
                  if (tempCourtName.trim()) {
                    setCourtNames((prev) => ({ ...prev, [court.courtNumber]: tempCourtName.trim() }));
                  }
                  setEditingCourtNumber(null);
                }}
                onBlur={() => {
                  if (tempCourtName.trim()) {
                    setCourtNames((prev) => ({ ...prev, [court.courtNumber]: tempCourtName.trim() }));
                  }
                  setEditingCourtNumber(null);
                }}
              />
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => {
                setEditingCourtNumber(court.courtNumber);
                setTempCourtName(getCourtName(court.courtNumber));
              }}
              activeOpacity={0.7}
              style={styles.courtTitleTouchable}
            >
              <Text style={styles.courtTitle}>{getCourtName(court.courtNumber)}</Text>
              <Text style={styles.courtTitleEditIcon}>✎</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => toggleCourtStatus(roundId, court.id)}
            style={styles.statusButton}
            activeOpacity={0.7}
          >
            <View style={[styles.statusDot, {
              backgroundColor: court.status === 'completed' ? colors.success
                : court.status === 'playing' ? colors.warning : colors.textMuted
            }]} />
            <Text style={styles.courtStatus}>
              {court.status === 'completed' ? 'Done' : court.status === 'playing' ? 'Playing' : 'Pending'}
            </Text>
          </TouchableOpacity>
        </View>

        {gameType === 'doubles' ? (
          <View style={styles.teamsContainer}>
            <View style={styles.team}>
              <Text style={styles.teamLabel}>Team 1</Text>
              {team1.map((p, i) => (
                <Text key={i} style={styles.playerName}>
                  {p?.name} {pairingMode === 'mixed' && <Text style={styles.genderTag}>({p?.gender?.[0]?.toUpperCase()})</Text>}
                </Text>
              ))}
            </View>
            <View style={styles.scoreSection}>
              <ScoreEntry
                score={court.score}
                onScoreUpdate={handleScoreUpdate}
                team1Label="Team 1"
                team2Label="Team 2"
                currentUserName="Organizer"
                isOrganizer
              />
            </View>
            <View style={styles.team}>
              <Text style={styles.teamLabel}>Team 2</Text>
              {team2.map((p, i) => (
                <Text key={i} style={styles.playerName}>
                  {p?.name} {pairingMode === 'mixed' && <Text style={styles.genderTag}>({p?.gender?.[0]?.toUpperCase()})</Text>}
                </Text>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.singlesContainer}>
            <View style={styles.singlePlayer}>
              <Text style={styles.playerName}>{court.players[0]?.name}</Text>
            </View>
            <View style={styles.scoreSection}>
              <ScoreEntry
                score={court.score}
                onScoreUpdate={handleScoreUpdate}
                team1Label={court.players[0]?.name}
                team2Label={court.players[1]?.name}
                currentUserName="Organizer"
                isOrganizer
              />
            </View>
            <View style={styles.singlePlayer}>
              <Text style={styles.playerName}>{court.players[1]?.name}</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderPlayerRoster = () => (
    <View style={[styles.card, styles.rosterSection]}>
      <View style={styles.rosterHeader}>
        <Text style={styles.sectionTitle}>Players ({playerCounts.total})</Text>
        {players.length > 0 && (
          <Text style={styles.rosterCounts}>
            {playerCounts.males}M / {playerCounts.females}F
          </Text>
        )}
      </View>

      {/* Player Count Controls */}
      {players.length === 0 ? (
        <View style={styles.playerCountSection}>
          <Text style={styles.playerCountLabel}>Number of Players</Text>
          <View style={styles.playerCountRow}>
            <View style={styles.playerCountInputRow}>
              <TouchableOpacity
                style={styles.playerCountButton}
                onPress={() => setPlayerCountInput((n) => Math.max(2, parseInt(n, 10) - 1).toString())}
                activeOpacity={0.7}
              >
                <Text style={styles.playerCountButtonText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.playerCountInput}
                value={playerCountInput}
                onChangeText={(t) => setPlayerCountInput(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={2}
              />
              <TouchableOpacity
                style={styles.playerCountButton}
                onPress={() => setPlayerCountInput((n) => Math.min(50, parseInt(n, 10) + 1).toString())}
                activeOpacity={0.7}
              >
                <Text style={styles.playerCountButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.generateButton}
              onPress={generatePlayerSlots}
              activeOpacity={0.8}
            >
              <Text style={styles.generateButtonText}>Generate Players</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.playerAddRemoveRow}>
          <TouchableOpacity
            style={[styles.playerAddRemoveButton, players.length <= 1 && styles.playerAddRemoveDisabled]}
            onPress={removeLastPlayer}
            activeOpacity={0.7}
            disabled={players.length <= 1}
          >
            <Text style={[styles.playerAddRemoveText, players.length <= 1 && styles.playerAddRemoveTextDisabled]}>− Remove</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.playerAddRemoveButton, players.length >= 50 && styles.playerAddRemoveDisabled]}
            onPress={addPlayer}
            activeOpacity={0.7}
            disabled={players.length >= 50}
          >
            <Text style={[styles.playerAddRemoveText, players.length >= 50 && styles.playerAddRemoveTextDisabled]}>+ Add</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Player List */}
      {players.length > 0 ? (
        <>
          <View style={styles.playerGrid}>
            {players.map((player) => (
              <View key={player.id} style={styles.playerChip}>
                <TouchableOpacity
                  onPress={() => removePlayer(player.id)}
                  style={styles.removeButton}
                  activeOpacity={0.7}
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </TouchableOpacity>
                <Text style={styles.playerChipText}>
                  {player.name}
                  <Text style={styles.genderIndicator}>
                    {' '}({player.gender === 'male' ? 'M' : 'F'})
                  </Text>
                </Text>
                <TouchableOpacity
                  onPress={() => startEditingPlayer(player)}
                  style={styles.editButton}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editButtonText}>✎</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
          <Text style={styles.rosterHint}>
            Tap ✎ to edit name and gender • Tap × to remove
          </Text>
        </>
      ) : (
        <View style={styles.emptyRoster}>
          <Text style={styles.emptyRosterText}>No players yet</Text>
          <Text style={styles.emptyRosterHint}>
            Enter the number of players and tap Generate
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        isDesktop && styles.contentContainerDesktop,
      ]}
    >
      {/* Centered content wrapper for desktop */}
      <View style={[styles.mainContent, isDesktop && styles.mainContentDesktop]}>
        {/* Header */}
        <View style={[styles.header, isDesktop && styles.headerDesktop]}>
          <TouchableOpacity onPress={onLeave} style={styles.backButton} activeOpacity={0.7}>
            <Text style={styles.backButtonText}>← Leave</Text>
          </TouchableOpacity>
          <View style={styles.sessionInfo}>
            <View style={styles.sessionTitleRow}>
              <Text style={[styles.title, isDesktop && styles.titleDesktop]}>Session</Text>
              <Text style={[styles.sessionCode, isDesktop && styles.sessionCodeDesktop]}>{sessionCode}</Text>
            </View>
            {isEditingSessionName ? (
              <View style={styles.sessionNameEditRow}>
                <TextInput
                  style={styles.sessionNameInput}
                  value={tempSessionName}
                  onChangeText={setTempSessionName}
                  placeholder="Enter session name"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.sessionNameSaveBtn}
                  onPress={() => {
                    setSessionName(tempSessionName);
                    setIsEditingSessionName(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sessionNameSaveBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sessionNameCancelBtn}
                  onPress={() => setIsEditingSessionName(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sessionNameCancelBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.sessionNameDisplay}
                onPress={() => {
                  setTempSessionName(sessionName);
                  setIsEditingSessionName(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.sessionNameText}>
                  {sessionName || 'Tap to name session'}
                </Text>
                <Text style={styles.sessionNameEditIcon}>✎</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {!isShuffled ? (
          <View style={[styles.configSection, isDesktop && styles.configSectionDesktop]}>
            {/* Player Roster */}
            {renderPlayerRoster()}

            {/* Configuration Card */}
            <View style={styles.card}>
              {/* Game Type */}
              <View style={styles.optionGroup}>
                <Text style={styles.sectionTitle}>Game Type</Text>
                <View style={[styles.optionRow, isDesktop && styles.optionRowDesktop]}>
                  {renderOptionButton('Singles', gameType === 'singles', () => {
                    setGameType('singles');
                    setPairingMode(null);
                  })}
                  {renderOptionButton('Doubles', gameType === 'doubles', () =>
                    setGameType('doubles')
                  )}
                </View>
              </View>

              {/* Pairing Mode (Doubles only) */}
              {gameType === 'doubles' && (
                <View style={styles.optionGroup}>
                  <Text style={styles.sectionTitle}>Pairing Mode</Text>
                  <View style={[styles.optionRow, isDesktop && styles.optionRowDesktop]}>
                    {renderOptionButton('Random', pairingMode === 'random', () =>
                      setPairingMode('random')
                    )}
                    {renderOptionButton('Mixed', pairingMode === 'mixed', () =>
                      setPairingMode('mixed')
                    )}
                  </View>
                  <Text style={styles.optionHint}>
                    {pairingMode === 'mixed'
                      ? 'Each team: 1 male + 1 female'
                      : 'Random team assignments'}
                  </Text>
                </View>
              )}

              {/* Number inputs row */}
              <View style={[styles.numbersRow, isDesktop && styles.numbersRowDesktop]}>
                {/* Number of Rounds */}
                <View style={[styles.optionGroup, styles.numberGroup]}>
                  <Text style={styles.sectionTitle}>Rounds</Text>
                  <View style={styles.numberInputRow}>
                    <TouchableOpacity
                      style={[styles.numberButton, isDesktop && styles.numberButtonDesktop]}
                      onPress={() => setNumRounds((n) => Math.max(1, parseInt(n, 10) - 1).toString())}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.numberButtonText}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.numberInput, isDesktop && styles.numberInputDesktop]}
                      value={numRounds}
                      onChangeText={(t) => setNumRounds(t.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                    <TouchableOpacity
                      style={[styles.numberButton, isDesktop && styles.numberButtonDesktop]}
                      onPress={() => setNumRounds((n) => Math.min(20, parseInt(n, 10) + 1).toString())}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.numberButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Number of Courts */}
                <View style={[styles.optionGroup, styles.numberGroup]}>
                  <Text style={styles.sectionTitle}>Courts</Text>
                  <View style={styles.numberInputRow}>
                    <TouchableOpacity
                      style={[styles.numberButton, isDesktop && styles.numberButtonDesktop]}
                      onPress={() => setNumCourts((n) => Math.max(1, parseInt(n, 10) - 1).toString())}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.numberButtonText}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.numberInput, isDesktop && styles.numberInputDesktop]}
                      value={numCourts}
                      onChangeText={(t) => setNumCourts(t.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                    <TouchableOpacity
                      style={[styles.numberButton, isDesktop && styles.numberButtonDesktop]}
                      onPress={() => setNumCourts((n) => Math.min(10, parseInt(n, 10) + 1).toString())}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.numberButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Error Display */}
              {error ? <Text style={styles.error}>{error}</Text> : null}

              {/* Shuffle Button */}
              <TouchableOpacity
                style={[styles.shuffleButton, isDesktop && styles.shuffleButtonDesktop]}
                onPress={handleShuffle}
                activeOpacity={0.8}
              >
                <Text style={styles.shuffleButtonText}>Shuffle & Generate Rounds</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.roundsSection}>
            <View style={[styles.roundsHeader, isDesktop && styles.roundsHeaderDesktop]}>
              <Text style={styles.roundsTitle}>
                {rounds.length} Rounds • {numCourts} Courts • {gameType === 'doubles' ? (pairingMode === 'mixed' ? 'Mixed' : 'Random') : 'Singles'}
              </Text>
              <View style={styles.roundsHeaderButtons}>
                <TouchableOpacity onPress={() => setShowResults(true)} activeOpacity={0.7}>
                  <Text style={styles.viewResultsText}>View Results</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={resetShuffle} activeOpacity={0.7}>
                  <Text style={styles.reshuffleText}>← Edit Settings</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Compact player roster for name editing */}
            <View style={styles.compactRoster}>
              <Text style={styles.compactRosterTitle}>Players ({players.length})</Text>
              <View style={styles.compactRosterGrid}>
                {players.map((player) => (
                  <TouchableOpacity
                    key={player.id}
                    style={styles.compactPlayerChip}
                    onPress={() => startEditingPlayer(player)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.compactPlayerText}>
                      {player.name}
                      <Text style={styles.genderIndicator}> ({player.gender === 'male' ? 'M' : 'F'})</Text>
                    </Text>
                    <Text style={styles.compactEditIcon}>✎</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={styles.tapHint}>Tap score to enter results • Tap status to change</Text>

            {rounds.map((round) => (
              <View key={round.id} style={[styles.roundCard, isDesktop && styles.roundCardDesktop]}>
                <View style={styles.roundHeader}>
                  <Text style={[styles.roundTitle, isDesktop && styles.roundTitleDesktop]}>
                    Round {round.roundNumber}
                  </Text>
                  {round.sitOuts && round.sitOuts.length > 0 && (
                    <Text style={styles.sitOutText}>
                      Sitting out: {round.sitOuts.map((p) => p.name).join(', ')}
                    </Text>
                  )}
                </View>
                <View style={[
                  styles.courtsGrid,
                  courtColumns > 1 && styles.courtsGridMultiColumn,
                ]}>
                  {round.courts.map((court) => renderCourt(court, round.id))}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Edit Player Modal */}
      <Modal
        visible={editingPlayer !== null}
        transparent
        animationType="fade"
        onRequestClose={cancelEditPlayer}
      >
        <Pressable style={styles.modalOverlay} onPress={cancelEditPlayer}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Edit Player</Text>
            <Text style={styles.modalLabel}>Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Player name"
              autoFocus
              selectTextOnFocus
            />
            <Text style={styles.modalLabel}>Gender</Text>
            <View style={styles.genderToggleRow}>
              <TouchableOpacity
                style={[
                  styles.genderToggleButton,
                  editGender === 'male' && styles.genderToggleButtonActive,
                ]}
                onPress={() => setEditGender('male')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.genderToggleText,
                    editGender === 'male' && styles.genderToggleTextActive,
                  ]}
                >
                  Male
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.genderToggleButton,
                  editGender === 'female' && styles.genderToggleButtonActive,
                ]}
                onPress={() => setEditGender('female')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.genderToggleText,
                    editGender === 'female' && styles.genderToggleTextActive,
                  ]}
                >
                  Female
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={cancelEditPlayer}
                activeOpacity={0.7}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={savePlayerEdit}
                activeOpacity={0.7}
              >
                <Text style={styles.modalButtonSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Results Modal */}
      <ResultsModal
        visible={showResults}
        onClose={() => setShowResults(false)}
        rounds={rounds}
        players={players}
        gameType={gameType}
      />
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
    maxWidth: 1200,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerDesktop: {
    marginBottom: spacing.xl,
  },
  backButton: {
    marginRight: spacing.md,
    padding: spacing.xs,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  backButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  titleDesktop: {
    fontSize: 28,
  },
  sessionCode: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 10,
  },
  sessionNameDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  sessionNameText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  sessionNameEditIcon: {
    fontSize: 12,
    color: colors.textMuted,
  },
  sessionNameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  sessionNameInput: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 14,
    color: colors.text,
    maxWidth: 200,
    ...Platform.select({
      web: { outlineStyle: 'none' },
    }),
  },
  sessionNameSaveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 8,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  sessionNameSaveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  sessionNameCancelBtn: {
    padding: 6,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  sessionNameCancelBtnText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  sessionCodeDesktop: {
    fontSize: 20,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: spacing.lg,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  configSection: {
    gap: spacing.lg,
  },
  configSectionDesktop: {
    gap: spacing.xl,
  },
  rosterSection: {
    gap: spacing.md,
  },
  rosterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  rosterCounts: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  playerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  playerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 20,
    gap: spacing.xs,
    ...Platform.select({
      web: { cursor: 'default' },
    }),
  },
  playerChipText: {
    fontSize: 14,
    color: colors.text,
  },
  genderIndicator: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  editButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  editButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  removeButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  removeButtonText: {
    fontSize: 18,
    color: colors.textMuted,
    fontWeight: '500',
  },
  rosterHint: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  optionGroup: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  optionHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  optionRowDesktop: {
    maxWidth: 400,
  },
  optionButton: {
    flex: 1,
    backgroundColor: colors.secondary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      },
    }),
  },
  optionButtonDesktop: {
    paddingVertical: 16,
  },
  optionButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  optionButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  optionButtonTextSelected: {
    color: '#fff',
  },
  numbersRow: {
    flexDirection: 'column',
    gap: spacing.lg,
  },
  numbersRowDesktop: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  numberGroup: {
    marginBottom: 0,
  },
  numberInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  numberButton: {
    width: 48,
    height: 48,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
      },
    }),
  },
  numberButtonDesktop: {
    width: 52,
    height: 52,
  },
  numberButtonText: {
    fontSize: 26,
    fontWeight: '500',
    color: colors.text,
  },
  numberInput: {
    width: 64,
    height: 48,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    ...Platform.select({
      web: { outlineStyle: 'none' },
    }),
  },
  numberInputDesktop: {
    width: 72,
    height: 52,
    fontSize: 22,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: colors.errorLight,
    padding: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.md,
  },
  shuffleButton: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'transform 0.15s ease',
      },
    }),
  },
  shuffleButtonDesktop: {
    paddingVertical: 20,
    maxWidth: 400,
  },
  shuffleButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  roundsSection: {
    gap: spacing.lg,
  },
  roundsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  roundsHeaderDesktop: {
    marginBottom: spacing.sm,
  },
  roundsHeaderButtons: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'center',
  },
  roundsTitle: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  viewResultsText: {
    fontSize: 14,
    color: colors.success,
    fontWeight: '600',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  reshuffleText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  tapHint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  roundCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  roundCardDesktop: {
    padding: spacing.xl,
  },
  roundHeader: {
    gap: spacing.xs,
  },
  roundTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  roundTitleDesktop: {
    fontSize: 20,
  },
  sitOutText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  courtsGrid: {
    gap: spacing.md,
  },
  courtsGridMultiColumn: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  courtCard: {
    borderRadius: 12,
    padding: spacing.md,
  },
  courtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  courtTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  courtTitleTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  courtTitleEditIcon: {
    fontSize: 12,
    color: colors.textMuted,
  },
  courtNameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  courtNameInput: {
    backgroundColor: colors.background,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    minWidth: 100,
    ...Platform.select({
      web: { outlineStyle: 'none' },
    }),
  },
  courtStatus: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  teamsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  team: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  teamLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  playerName: {
    fontSize: 14,
    color: colors.text,
  },
  genderTag: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  singlesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  singlePlayer: {
    flex: 1,
    alignItems: 'center',
  },
  scoreSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
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
    maxWidth: 340,
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
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.lg,
    ...Platform.select({
      web: { outlineStyle: 'none' },
    }),
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  modalButtonCancel: {
    backgroundColor: colors.secondary,
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  modalButtonSave: {
    backgroundColor: colors.primary,
  },
  modalButtonSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  genderToggleRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  genderToggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.secondary,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  genderToggleButtonActive: {
    backgroundColor: colors.primary,
  },
  genderToggleText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  genderToggleTextActive: {
    color: '#fff',
  },
  playerCountSection: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.md,
  },
  playerCountLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  playerCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  playerCountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  playerCountButton: {
    width: 40,
    height: 40,
    backgroundColor: colors.secondary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  playerCountButtonText: {
    fontSize: 22,
    fontWeight: '500',
    color: colors.text,
  },
  playerCountInput: {
    width: 56,
    height: 40,
    backgroundColor: colors.secondary,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    ...Platform.select({
      web: { outlineStyle: 'none' },
    }),
  },
  generateButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: 10,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyRoster: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyRosterText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  emptyRosterHint: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  compactRoster: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  compactRosterTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  compactRosterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  compactPlayerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    paddingVertical: 5,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: 14,
    gap: 4,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  compactPlayerText: {
    fontSize: 13,
    color: colors.text,
  },
  compactEditIcon: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
