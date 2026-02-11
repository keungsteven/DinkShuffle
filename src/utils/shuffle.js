/**
 * Shuffle algorithm for Dink Shuffle
 * Supports: Singles, Doubles (Random), Doubles (Mixed)
 */

/**
 * Fisher-Yates shuffle - randomizes array in place
 * @param {Array} array - Array to shuffle
 * @returns {Array} - Shuffled array (same reference)
 */
export function fisherYatesShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} name
 * @property {'male' | 'female'} gender
 */

/**
 * @typedef {Object} Score
 * @property {number | null} team1 - Score for team 1 (or player 1 in singles)
 * @property {number | null} team2 - Score for team 2 (or player 2 in singles)
 * @property {string | null} lastUpdatedBy - Name of person who last entered score
 * @property {number | null} lastUpdatedAt - Timestamp of last update
 */

/**
 * @typedef {Object} Court
 * @property {string} id
 * @property {number} courtNumber
 * @property {Player[]} players - 2 for singles, 4 for doubles
 * @property {Player[]} [team1] - For doubles display
 * @property {Player[]} [team2] - For doubles display
 * @property {'pending' | 'playing' | 'completed'} status
 * @property {Score} score - Game score
 */

/**
 * Create initial score object
 * @returns {Score}
 */
export function createInitialScore() {
  return {
    team1: null,
    team2: null,
    lastUpdatedBy: null,
    lastUpdatedAt: null,
  };
}

/**
 * @typedef {Object} Round
 * @property {string} id
 * @property {number} roundNumber
 * @property {Court[]} courts
 * @property {Player[]} sitOuts - Players sitting out this round
 */

/**
 * Generate all rounds for Singles play
 * @param {Player[]} players - All players
 * @param {number} numRounds - Number of rounds to generate
 * @param {number} numCourts - Number of available courts
 * @returns {Round[]} - Generated rounds
 */
export function generateSinglesRounds(players, numRounds, numCourts) {
  const rounds = [];
  const playersPerRound = numCourts * 2;
  const matchupHistory = new Map(); // Track who played whom

  // Initialize matchup tracking
  players.forEach((p) => matchupHistory.set(p.id, new Set()));

  for (let r = 0; r < numRounds; r++) {
    // Score players by how many times they've sat out and variety of opponents
    const shuffledPlayers = fisherYatesShuffle([...players]);

    // Select players for this round (prioritize those who sat out recently)
    const activePlayers = shuffledPlayers.slice(0, Math.min(playersPerRound, shuffledPlayers.length));
    const sitOuts = shuffledPlayers.slice(playersPerRound);

    // Pair players trying to avoid repeat matchups
    const pairs = pairPlayersForSingles(activePlayers, matchupHistory);

    const courts = pairs.slice(0, numCourts).map((pair, idx) => {
      // Update matchup history
      if (pair.length === 2) {
        matchupHistory.get(pair[0].id).add(pair[1].id);
        matchupHistory.get(pair[1].id).add(pair[0].id);
      }

      return {
        id: `r${r}c${idx}`,
        courtNumber: idx + 1,
        players: pair,
        status: 'pending',
        score: createInitialScore(),
      };
    });

    rounds.push({
      id: `round-${r}`,
      roundNumber: r + 1,
      courts,
      sitOuts,
    });
  }

  return rounds;
}

/**
 * Pair players for singles, minimizing repeat matchups
 * @param {Player[]} players
 * @param {Map<string, Set<string>>} history
 * @returns {Player[][]}
 */
function pairPlayersForSingles(players, history) {
  const pairs = [];
  const used = new Set();

  // Sort by fewest previous opponents (more variety)
  const sorted = [...players].sort(
    (a, b) => history.get(a.id).size - history.get(b.id).size
  );

  for (const player of sorted) {
    if (used.has(player.id)) continue;

    // Find best opponent (hasn't played against, or least times)
    let bestOpponent = null;
    let bestScore = Infinity;

    for (const opponent of sorted) {
      if (opponent.id === player.id || used.has(opponent.id)) continue;

      const hasPlayed = history.get(player.id).has(opponent.id) ? 1 : 0;
      if (hasPlayed < bestScore) {
        bestScore = hasPlayed;
        bestOpponent = opponent;
      }
    }

    if (bestOpponent) {
      pairs.push([player, bestOpponent]);
      used.add(player.id);
      used.add(bestOpponent.id);
    }
  }

  return pairs;
}

/**
 * Generate all rounds for Doubles play (Random pairing)
 * @param {Player[]} players - All players
 * @param {number} numRounds - Number of rounds
 * @param {number} numCourts - Number of courts
 * @returns {Round[]}
 */
export function generateDoublesRandomRounds(players, numRounds, numCourts) {
  const rounds = [];
  const playersPerRound = numCourts * 4;
  const partnerHistory = new Map(); // Track who partnered with whom
  const opponentHistory = new Map(); // Track who played against whom

  players.forEach((p) => {
    partnerHistory.set(p.id, new Map()); // partner id -> count
    opponentHistory.set(p.id, new Map()); // opponent id -> count
  });

  for (let r = 0; r < numRounds; r++) {
    const shuffledPlayers = fisherYatesShuffle([...players]);
    const activePlayers = shuffledPlayers.slice(0, Math.min(playersPerRound, shuffledPlayers.length));
    const sitOuts = shuffledPlayers.slice(playersPerRound);

    const courts = createDoublesCourtAssignments(
      activePlayers,
      numCourts,
      partnerHistory,
      opponentHistory,
      r
    );

    rounds.push({
      id: `round-${r}`,
      roundNumber: r + 1,
      courts,
      sitOuts,
    });
  }

  return rounds;
}

/**
 * Generate all rounds for Mixed Doubles (1 male + 1 female per team)
 * @param {Player[]} players - All players
 * @param {number} numRounds - Number of rounds
 * @param {number} numCourts - Number of courts
 * @returns {Round[]}
 */
export function generateMixedDoublesRounds(players, numRounds, numCourts) {
  const males = players.filter((p) => p.gender === 'male');
  const females = players.filter((p) => p.gender === 'female');

  const rounds = [];
  const partnerHistory = new Map();
  const opponentHistory = new Map();

  players.forEach((p) => {
    partnerHistory.set(p.id, new Map());
    opponentHistory.set(p.id, new Map());
  });

  // Determine how many complete mixed teams we can form per round
  const teamsPerRound = Math.min(males.length, females.length);
  const courtsPerRound = Math.min(numCourts, Math.floor(teamsPerRound / 2));

  if (courtsPerRound === 0) {
    // Not enough players for mixed doubles
    return [];
  }

  for (let r = 0; r < numRounds; r++) {
    const shuffledMales = fisherYatesShuffle([...males]);
    const shuffledFemales = fisherYatesShuffle([...females]);

    const courts = [];
    const usedMales = new Set();
    const usedFemales = new Set();

    for (let c = 0; c < courtsPerRound; c++) {
      // Form Team 1
      const team1 = formMixedTeam(
        shuffledMales,
        shuffledFemales,
        usedMales,
        usedFemales,
        partnerHistory
      );

      // Form Team 2
      const team2 = formMixedTeam(
        shuffledMales,
        shuffledFemales,
        usedMales,
        usedFemales,
        partnerHistory
      );

      if (team1.length === 2 && team2.length === 2) {
        // Update partner history
        updatePartnerHistory(partnerHistory, team1[0], team1[1]);
        updatePartnerHistory(partnerHistory, team2[0], team2[1]);

        // Update opponent history
        for (const p1 of team1) {
          for (const p2 of team2) {
            updateOpponentHistory(opponentHistory, p1, p2);
          }
        }

        courts.push({
          id: `r${r}c${c}`,
          courtNumber: c + 1,
          players: [...team1, ...team2],
          team1,
          team2,
          status: 'pending',
          score: createInitialScore(),
        });
      }
    }

    // Calculate sit outs
    const sitOutMales = males.filter((m) => !usedMales.has(m.id));
    const sitOutFemales = females.filter((f) => !usedFemales.has(f.id));

    rounds.push({
      id: `round-${r}`,
      roundNumber: r + 1,
      courts,
      sitOuts: [...sitOutMales, ...sitOutFemales],
    });
  }

  return rounds;
}

/**
 * Form a mixed team (1 male + 1 female) minimizing repeat partners
 */
function formMixedTeam(males, females, usedMales, usedFemales, partnerHistory) {
  let bestMale = null;
  let bestFemale = null;
  let bestScore = Infinity;

  for (const male of males) {
    if (usedMales.has(male.id)) continue;

    for (const female of females) {
      if (usedFemales.has(female.id)) continue;

      const score = partnerHistory.get(male.id)?.get(female.id) || 0;
      if (score < bestScore) {
        bestScore = score;
        bestMale = male;
        bestFemale = female;
      }
    }
  }

  if (bestMale && bestFemale) {
    usedMales.add(bestMale.id);
    usedFemales.add(bestFemale.id);
    return [bestMale, bestFemale];
  }

  return [];
}

/**
 * Create court assignments for random doubles
 */
function createDoublesCourtAssignments(players, numCourts, partnerHistory, opponentHistory, roundIdx) {
  const courts = [];
  const used = new Set();

  for (let c = 0; c < numCourts; c++) {
    const availablePlayers = players.filter((p) => !used.has(p.id));
    if (availablePlayers.length < 4) break;

    // Form two teams
    const team1 = formRandomTeam(availablePlayers, used, partnerHistory);
    const remainingPlayers = availablePlayers.filter((p) => !used.has(p.id));
    const team2 = formRandomTeam(remainingPlayers, used, partnerHistory);

    if (team1.length === 2 && team2.length === 2) {
      // Update histories
      updatePartnerHistory(partnerHistory, team1[0], team1[1]);
      updatePartnerHistory(partnerHistory, team2[0], team2[1]);

      for (const p1 of team1) {
        for (const p2 of team2) {
          updateOpponentHistory(opponentHistory, p1, p2);
        }
      }

      courts.push({
        id: `r${roundIdx}c${c}`,
        courtNumber: c + 1,
        players: [...team1, ...team2],
        team1,
        team2,
        status: 'pending',
        score: createInitialScore(),
      });
    }
  }

  return courts;
}

/**
 * Form a random team of 2, minimizing repeat partners
 */
function formRandomTeam(players, used, partnerHistory) {
  let bestPair = null;
  let bestScore = Infinity;

  for (let i = 0; i < players.length; i++) {
    if (used.has(players[i].id)) continue;

    for (let j = i + 1; j < players.length; j++) {
      if (used.has(players[j].id)) continue;

      const score = partnerHistory.get(players[i].id)?.get(players[j].id) || 0;
      if (score < bestScore) {
        bestScore = score;
        bestPair = [players[i], players[j]];
      }
    }
  }

  if (bestPair) {
    used.add(bestPair[0].id);
    used.add(bestPair[1].id);
    return bestPair;
  }

  return [];
}

function updatePartnerHistory(history, p1, p2) {
  const count1 = history.get(p1.id)?.get(p2.id) || 0;
  history.get(p1.id)?.set(p2.id, count1 + 1);

  const count2 = history.get(p2.id)?.get(p1.id) || 0;
  history.get(p2.id)?.set(p1.id, count2 + 1);
}

function updateOpponentHistory(history, p1, p2) {
  const count1 = history.get(p1.id)?.get(p2.id) || 0;
  history.get(p1.id)?.set(p2.id, count1 + 1);

  const count2 = history.get(p2.id)?.get(p1.id) || 0;
  history.get(p2.id)?.set(p1.id, count2 + 1);
}

/**
 * Main shuffle function - entry point
 * @param {Object} config
 * @param {Player[]} config.players - All players in the session
 * @param {'singles' | 'doubles'} config.gameType
 * @param {'random' | 'mixed'} [config.pairingMode] - Required for doubles
 * @param {number} config.numRounds
 * @param {number} config.numCourts
 * @returns {{ rounds: Round[], error: string | null }}
 */
export function shufflePlayers({ players, gameType, pairingMode, numRounds, numCourts }) {
  // Validation
  if (!players || players.length === 0) {
    return { rounds: [], error: 'No players in session' };
  }

  const minPlayers = gameType === 'singles' ? 2 : 4;
  if (players.length < minPlayers) {
    return {
      rounds: [],
      error: `Need at least ${minPlayers} players for ${gameType}`
    };
  }

  if (gameType === 'doubles' && pairingMode === 'mixed') {
    const males = players.filter((p) => p.gender === 'male');
    const females = players.filter((p) => p.gender === 'female');

    if (males.length < 2 || females.length < 2) {
      return {
        rounds: [],
        error: 'Mixed doubles requires at least 2 males and 2 females'
      };
    }
  }

  // Generate rounds based on game type
  let rounds;

  if (gameType === 'singles') {
    rounds = generateSinglesRounds(players, numRounds, numCourts);
  } else if (pairingMode === 'mixed') {
    rounds = generateMixedDoublesRounds(players, numRounds, numCourts);
  } else {
    rounds = generateDoublesRandomRounds(players, numRounds, numCourts);
  }

  return { rounds, error: null };
}

/**
 * Generate mock players for testing
 * @param {number} count - Total players
 * @param {number} maleCount - Number of males (rest are female)
 * @returns {Player[]}
 */
export function generateMockPlayers(count = 12, maleCount = 6) {
  const maleNames = ['Alex', 'Ben', 'Chris', 'Dan', 'Eric', 'Frank', 'George', 'Henry', 'Ivan', 'Jack'];
  const femaleNames = ['Amy', 'Beth', 'Cathy', 'Diana', 'Emma', 'Fiona', 'Grace', 'Helen', 'Ivy', 'Julia'];

  const players = [];

  for (let i = 0; i < maleCount && i < maleNames.length; i++) {
    players.push({
      id: `m${i}`,
      name: maleNames[i],
      gender: 'male',
    });
  }

  const femaleCount = count - maleCount;
  for (let i = 0; i < femaleCount && i < femaleNames.length; i++) {
    players.push({
      id: `f${i}`,
      name: femaleNames[i],
      gender: 'female',
    });
  }

  return players;
}
