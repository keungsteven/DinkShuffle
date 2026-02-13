/**
 * Shuffle algorithm for Dink Shuffle
 * Supports: Singles, Doubles (Random), Doubles (Mixed)
 *
 * Fair distribution guarantees:
 * - Sit-outs are evenly distributed (max difference of 1 across all players)
 * - Every player plays with/against every other player before repeats
 * - Weighted greedy matching with swap improvement prevents positional bias
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

// ─── Fairness Utilities ──────────────────────────────────────────────

/**
 * Create tracking state for fair distribution across rounds
 * @param {Player[]} players
 * @returns {{ sitOutCounts: Map, partnerCounts: Map, opponentCounts: Map, courtCounts: Map }}
 */
function createFairnessState(players) {
  const sitOutCounts = new Map();
  const partnerCounts = new Map();
  const opponentCounts = new Map();
  const courtCounts = new Map(); // playerId → Map(courtNumber → count)

  for (const p of players) {
    sitOutCounts.set(p.id, 0);
    partnerCounts.set(p.id, new Map());
    opponentCounts.set(p.id, new Map());
    courtCounts.set(p.id, new Map());
  }

  return { sitOutCounts, partnerCounts, opponentCounts, courtCounts };
}

/**
 * Read count from nested Map, defaulting to 0
 */
function getCount(countMap, id1, id2) {
  return countMap.get(id1)?.get(id2) || 0;
}

/**
 * Increment count symmetrically in nested Map
 */
function incrementCount(countMap, id1, id2) {
  if (!countMap.has(id1)) countMap.set(id1, new Map());
  if (!countMap.has(id2)) countMap.set(id2, new Map());
  countMap.get(id1).set(id2, (countMap.get(id1).get(id2) || 0) + 1);
  countMap.get(id2).set(id1, (countMap.get(id2).get(id1) || 0) + 1);
}

/**
 * Build a Court object with standard shape
 */
function buildCourtObject(roundIdx, courtIdx, players, team1, team2) {
  const court = {
    id: `r${roundIdx}c${courtIdx}`,
    courtNumber: courtIdx + 1,
    players,
    status: 'pending',
    score: createInitialScore(),
  };
  if (team1) court.team1 = team1;
  if (team2) court.team2 = team2;
  return court;
}

// ─── Fair Court Rotation ─────────────────────────────────────────────

/**
 * Find the optimal assignment of court groups to court numbers.
 * Ensures players rotate through all courts before repeating.
 *
 * @param {Array} courtGroups - Array of player groups (pairs or team objects)
 * @param {Map} courtCounts - playerId → Map(courtNumber → count)
 * @param {Function} getPlayers - Extracts player array from a court group
 * @returns {Array} - Reordered courtGroups for optimal court number assignment
 */
function assignCourtNumbers(courtGroups, courtCounts, getPlayers) {
  const n = courtGroups.length;
  if (n <= 1) return courtGroups;

  // Cost of assigning a group of players to a specific court number
  const costForCourt = (group, courtNumber) => {
    let cost = 0;
    for (const p of getPlayers(group)) {
      cost += courtCounts.get(p.id)?.get(courtNumber) || 0;
    }
    return cost;
  };

  if (n <= 8) {
    // Enumerate all permutations for small court counts (n! <= 40,320)
    let bestOrder = null;
    let bestCost = Infinity;

    const enumerate = (indices, remaining) => {
      if (remaining.length === 0) {
        let cost = 0;
        for (let i = 0; i < indices.length; i++) {
          cost += costForCourt(courtGroups[indices[i]], i + 1);
        }
        if (cost < bestCost || (cost === bestCost && Math.random() < 0.5)) {
          bestCost = cost;
          bestOrder = [...indices];
        }
        return;
      }
      for (let i = 0; i < remaining.length; i++) {
        enumerate(
          [...indices, remaining[i]],
          [...remaining.slice(0, i), ...remaining.slice(i + 1)]
        );
      }
    };

    enumerate([], Array.from({ length: n }, (_, i) => i));
    return bestOrder.map((i) => courtGroups[i]);
  }

  // Greedy fallback for large court counts (N > 8)
  const available = new Set(Array.from({ length: n }, (_, i) => i));
  const result = new Array(n);

  // For each court number (1..n), find the group with lowest cost
  for (let courtNum = 1; courtNum <= n; courtNum++) {
    let bestIdx = -1;
    let bestCost = Infinity;
    for (const idx of available) {
      const cost = costForCourt(courtGroups[idx], courtNum);
      if (cost < bestCost || (cost === bestCost && Math.random() < 0.5)) {
        bestCost = cost;
        bestIdx = idx;
      }
    }
    result[courtNum - 1] = courtGroups[bestIdx];
    available.delete(bestIdx);
  }

  return result;
}

/**
 * Update court counts after players are assigned to a court number.
 */
function updateCourtCounts(players, courtNumber, courtCounts) {
  for (const p of players) {
    const playerMap = courtCounts.get(p.id);
    if (playerMap) {
      playerMap.set(courtNumber, (playerMap.get(courtNumber) || 0) + 1);
    }
  }
}

// ─── Fair Sit-Out Selection ──────────────────────────────────────────

/**
 * Select active players for a round, ensuring fair sit-out distribution.
 * Players who have sat out the most get priority to play.
 * Guarantees: max(sitOutCounts) - min(sitOutCounts) <= 1
 *
 * @param {Player[]} players - All players in pool
 * @param {number} needed - How many active players needed
 * @param {Map<string, number>} sitOutCounts - Tracking map (mutated)
 * @returns {{ active: Player[], sitOuts: Player[] }}
 */
function selectActivePlayers(players, needed, sitOutCounts) {
  if (players.length <= needed) {
    return { active: [...players], sitOuts: [] };
  }

  // Group players by sit-out count
  const groups = new Map();
  for (const p of players) {
    const count = sitOutCounts.get(p.id) || 0;
    if (!groups.has(count)) groups.set(count, []);
    groups.get(count).push(p);
  }

  // Sort by sit-out count descending (most sit-outs = highest priority to play)
  const sortedCounts = [...groups.keys()].sort((a, b) => b - a);

  const active = [];
  for (const count of sortedCounts) {
    const group = fisherYatesShuffle(groups.get(count));
    for (const p of group) {
      if (active.length < needed) {
        active.push(p);
      }
    }
  }

  const activeIds = new Set(active.map((p) => p.id));
  const sitOuts = players.filter((p) => !activeIds.has(p.id));

  // Update sit-out counts
  for (const p of sitOuts) {
    sitOutCounts.set(p.id, (sitOutCounts.get(p.id) || 0) + 1);
  }

  return { active, sitOuts };
}

// ─── Singles Assignment ──────────────────────────────────────────────

/**
 * Assign players to singles courts using weighted greedy + swap improvement.
 * Minimizes opponent frequency to ensure equal matchup distribution.
 *
 * @param {Player[]} activePlayers
 * @param {number} numCourts
 * @param {Map} opponentCounts
 * @returns {Player[][]} - Array of pairs
 */
function assignSinglesCourts(activePlayers, numCourts, opponentCounts) {
  const actualCourts = Math.min(numCourts, Math.floor(activePlayers.length / 2));
  if (actualCourts === 0) return [];

  // Generate all possible pairs with costs
  const allPairs = [];
  for (let i = 0; i < activePlayers.length; i++) {
    for (let j = i + 1; j < activePlayers.length; j++) {
      const cost = getCount(opponentCounts, activePlayers[i].id, activePlayers[j].id);
      allPairs.push({ players: [activePlayers[i], activePlayers[j]], cost });
    }
  }

  // Sort by cost ascending, randomize ties
  allPairs.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    return Math.random() - 0.5;
  });

  // Greedy assignment
  const used = new Set();
  const courts = [];
  for (const pair of allPairs) {
    if (courts.length >= actualCourts) break;
    if (used.has(pair.players[0].id) || used.has(pair.players[1].id)) continue;
    courts.push(pair.players);
    used.add(pair.players[0].id);
    used.add(pair.players[1].id);
  }

  // Swap improvement
  improveSinglesSwap(courts, opponentCounts);

  return courts;
}

/**
 * Local swap improvement for singles courts.
 * For each pair of courts [A,B] and [C,D], try [A,C]+[B,D] and [A,D]+[B,C].
 */
function improveSinglesSwap(courts, opponentCounts) {
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations++;
    for (let i = 0; i < courts.length; i++) {
      for (let j = i + 1; j < courts.length; j++) {
        const [a, b] = courts[i];
        const [c, d] = courts[j];
        const currentCost =
          getCount(opponentCounts, a.id, b.id) +
          getCount(opponentCounts, c.id, d.id);

        const swap1Cost =
          getCount(opponentCounts, a.id, c.id) +
          getCount(opponentCounts, b.id, d.id);

        const swap2Cost =
          getCount(opponentCounts, a.id, d.id) +
          getCount(opponentCounts, b.id, c.id);

        if (swap1Cost < currentCost && swap1Cost <= swap2Cost) {
          courts[i] = [a, c];
          courts[j] = [b, d];
          improved = true;
        } else if (swap2Cost < currentCost) {
          courts[i] = [a, d];
          courts[j] = [b, c];
          improved = true;
        }
      }
    }
  }
}

// ─── Doubles Assignment ──────────────────────────────────────────────

/**
 * Calculate opponent cost for a doubles court (team1 vs team2)
 */
function courtOpponentCost(team1, team2, opponentCounts) {
  let cost = 0;
  for (const p1 of team1) {
    for (const p2 of team2) {
      cost += getCount(opponentCounts, p1.id, p2.id);
    }
  }
  return cost;
}

/**
 * Calculate full cost for a doubles court (partner + opponent costs)
 */
function fullCourtCost(team1, team2, partnerCounts, opponentCounts) {
  return (
    getCount(partnerCounts, team1[0].id, team1[1].id) +
    getCount(partnerCounts, team2[0].id, team2[1].id) +
    courtOpponentCost(team1, team2, opponentCounts)
  );
}

/**
 * Find optimal 2+2 split of 4 players minimizing partner cost.
 * There are only 3 ways to split 4 into two pairs.
 */
function bestTeamSplit(fourPlayers, partnerCounts) {
  const [a, b, c, d] = fourPlayers;
  const splits = [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ];

  let best = splits[0];
  let bestCost = Infinity;
  for (const split of splits) {
    const cost =
      getCount(partnerCounts, split.team1[0].id, split.team1[1].id) +
      getCount(partnerCounts, split.team2[0].id, split.team2[1].id);
    if (cost < bestCost) {
      bestCost = cost;
      best = split;
    }
  }
  return best;
}

/**
 * Assign players to doubles courts using two-stage weighted greedy + swap.
 * Stage A: Form partner pairs (minimize partner frequency)
 * Stage B: Pair teams into courts (minimize opponent frequency)
 * Stage C: Local swap improvement
 *
 * @param {Player[]} activePlayers
 * @param {number} numCourts
 * @param {Map} partnerCounts
 * @param {Map} opponentCounts
 * @returns {{ team1: Player[], team2: Player[] }[]}
 */
function assignDoublesCourts(activePlayers, numCourts, partnerCounts, opponentCounts) {
  const actualCourts = Math.min(numCourts, Math.floor(activePlayers.length / 4));
  if (actualCourts === 0) return [];

  // Stage A: form partner pairs
  const allPairs = [];
  for (let i = 0; i < activePlayers.length; i++) {
    for (let j = i + 1; j < activePlayers.length; j++) {
      const cost = getCount(partnerCounts, activePlayers[i].id, activePlayers[j].id);
      allPairs.push({ players: [activePlayers[i], activePlayers[j]], cost });
    }
  }
  allPairs.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    return Math.random() - 0.5;
  });

  const used = new Set();
  const teams = [];
  for (const pair of allPairs) {
    if (teams.length >= actualCourts * 2) break;
    if (used.has(pair.players[0].id) || used.has(pair.players[1].id)) continue;
    teams.push(pair.players);
    used.add(pair.players[0].id);
    used.add(pair.players[1].id);
  }

  // Stage B: pair teams into courts (minimize opponent cost)
  const teamPairs = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const cost = courtOpponentCost(teams[i], teams[j], opponentCounts);
      teamPairs.push({ idx1: i, idx2: j, cost });
    }
  }
  teamPairs.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    return Math.random() - 0.5;
  });

  const usedTeams = new Set();
  const courts = [];
  for (const tp of teamPairs) {
    if (courts.length >= actualCourts) break;
    if (usedTeams.has(tp.idx1) || usedTeams.has(tp.idx2)) continue;
    courts.push({ team1: teams[tp.idx1], team2: teams[tp.idx2] });
    usedTeams.add(tp.idx1);
    usedTeams.add(tp.idx2);
  }

  // Stage C: swap improvement
  improveDoublesSwap(courts, partnerCounts, opponentCounts);

  return courts;
}

/**
 * Local swap improvement for doubles courts.
 * For each pair of courts, try swapping one player between them
 * and re-optimizing team splits.
 */
function improveDoublesSwap(courts, partnerCounts, opponentCounts) {
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations++;
    for (let i = 0; i < courts.length; i++) {
      for (let j = i + 1; j < courts.length; j++) {
        const allEight = [
          ...courts[i].team1, ...courts[i].team2,
          ...courts[j].team1, ...courts[j].team2,
        ];
        const currentCost =
          fullCourtCost(courts[i].team1, courts[i].team2, partnerCounts, opponentCounts) +
          fullCourtCost(courts[j].team1, courts[j].team2, partnerCounts, opponentCounts);

        // Try all ways to split 8 into two groups of 4
        let bestCost = currentCost;
        let bestConfig = null;

        const splits = allSplitsOf8Into4And4(allEight);
        for (const [group1, group2] of splits) {
          const split1 = bestTeamSplit(group1, partnerCounts);
          const split2 = bestTeamSplit(group2, partnerCounts);
          const cost =
            fullCourtCost(split1.team1, split1.team2, partnerCounts, opponentCounts) +
            fullCourtCost(split2.team1, split2.team2, partnerCounts, opponentCounts);
          if (cost < bestCost) {
            bestCost = cost;
            bestConfig = [split1, split2];
          }
        }

        if (bestConfig) {
          courts[i] = bestConfig[0];
          courts[j] = bestConfig[1];
          improved = true;
        }
      }
    }
  }
}

/**
 * Generate all ways to split 8 items into two groups of 4.
 * Returns C(8,4)/2 = 35 unique splits.
 */
function allSplitsOf8Into4And4(items) {
  const splits = [];
  const n = items.length;
  if (n !== 8) return splits;

  // Generate all C(8,4) = 70 combinations, take only half (avoid duplicates)
  for (let mask = 0; mask < (1 << n); mask++) {
    if (popcount(mask) !== 4) continue;
    // Only take masks where bit 0 is set (to avoid duplicate complement)
    if (!(mask & 1)) continue;

    const group1 = [];
    const group2 = [];
    for (let bit = 0; bit < n; bit++) {
      if (mask & (1 << bit)) {
        group1.push(items[bit]);
      } else {
        group2.push(items[bit]);
      }
    }
    splits.push([group1, group2]);
  }
  return splits;
}

function popcount(n) {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

// ─── Mixed Doubles Assignment ────────────────────────────────────────

/**
 * Assign players to mixed doubles courts.
 * Each team must be exactly 1 male + 1 female.
 * Uses same two-stage approach but with gender constraint on partner pairs.
 */
function assignMixedDoublesCourts(activeMales, activeFemales, numCourts, partnerCounts, opponentCounts) {
  const actualCourts = Math.min(numCourts, Math.floor(activeMales.length / 2), Math.floor(activeFemales.length / 2));
  if (actualCourts === 0) return [];

  // Stage A: form mixed partner pairs (1M + 1F)
  const allPairs = [];
  for (const male of activeMales) {
    for (const female of activeFemales) {
      const cost = getCount(partnerCounts, male.id, female.id);
      allPairs.push({ players: [male, female], cost });
    }
  }
  allPairs.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    return Math.random() - 0.5;
  });

  const usedMales = new Set();
  const usedFemales = new Set();
  const teams = [];
  for (const pair of allPairs) {
    if (teams.length >= actualCourts * 2) break;
    if (usedMales.has(pair.players[0].id) || usedFemales.has(pair.players[1].id)) continue;
    teams.push(pair.players);
    usedMales.add(pair.players[0].id);
    usedFemales.add(pair.players[1].id);
  }

  // Stage B: pair teams into courts (minimize opponent cost)
  const teamPairs = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const cost = courtOpponentCost(teams[i], teams[j], opponentCounts);
      teamPairs.push({ idx1: i, idx2: j, cost });
    }
  }
  teamPairs.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    return Math.random() - 0.5;
  });

  const usedTeams = new Set();
  const courts = [];
  for (const tp of teamPairs) {
    if (courts.length >= actualCourts) break;
    if (usedTeams.has(tp.idx1) || usedTeams.has(tp.idx2)) continue;
    courts.push({ team1: teams[tp.idx1], team2: teams[tp.idx2] });
    usedTeams.add(tp.idx1);
    usedTeams.add(tp.idx2);
  }

  // Stage C: swap improvement (respecting gender constraint)
  improveMixedDoublesSwap(courts, partnerCounts, opponentCounts);

  return courts;
}

/**
 * Swap improvement for mixed doubles.
 * Only allows swaps that maintain the 1M+1F team constraint.
 */
function improveMixedDoublesSwap(courts, partnerCounts, opponentCounts) {
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations++;
    for (let i = 0; i < courts.length; i++) {
      for (let j = i + 1; j < courts.length; j++) {
        const currentCost =
          fullCourtCost(courts[i].team1, courts[i].team2, partnerCounts, opponentCounts) +
          fullCourtCost(courts[j].team1, courts[j].team2, partnerCounts, opponentCounts);

        // Collect all males and females from both courts
        const allPlayers = [
          ...courts[i].team1, ...courts[i].team2,
          ...courts[j].team1, ...courts[j].team2,
        ];
        const males = allPlayers.filter((p) => p.gender === 'male');
        const females = allPlayers.filter((p) => p.gender === 'female');

        // Try all valid mixed team configurations
        // 4 males, 4 females → each team needs 1M+1F → 4 teams
        // We need to assign each male to a female, then pair teams
        let bestCost = currentCost;
        let bestConfig = null;

        // Generate all permutations of female assignments to males
        const femalePerms = permutations(females);
        for (const femPerm of femalePerms) {
          // Teams: [males[0], femPerm[0]], [males[1], femPerm[1]], etc.
          const newTeams = males.map((m, idx) => [m, femPerm[idx]]);

          // Try all ways to pair 4 teams into 2 courts
          // C(4,2)/2 = 3 ways
          const courtPairings = [
            [0, 1, 2, 3],
            [0, 2, 1, 3],
            [0, 3, 1, 2],
          ];

          for (const [a, b, c, d] of courtPairings) {
            const cost =
              fullCourtCost(newTeams[a], newTeams[b], partnerCounts, opponentCounts) +
              fullCourtCost(newTeams[c], newTeams[d], partnerCounts, opponentCounts);
            if (cost < bestCost) {
              bestCost = cost;
              bestConfig = [
                { team1: newTeams[a], team2: newTeams[b] },
                { team1: newTeams[c], team2: newTeams[d] },
              ];
            }
          }
        }

        if (bestConfig) {
          courts[i] = bestConfig[0];
          courts[j] = bestConfig[1];
          improved = true;
        }
      }
    }
  }
}

/**
 * Generate all permutations of an array (for small arrays only, max 4 elements)
 */
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}

// ─── Round Generation Functions ──────────────────────────────────────

/**
 * Generate all rounds for Singles play
 * @param {Player[]} players - All players
 * @param {number} numRounds - Number of rounds to generate
 * @param {number} numCourts - Number of available courts
 * @returns {Round[]} - Generated rounds
 */
export function generateSinglesRounds(players, numRounds, numCourts) {
  const playersPerRound = numCourts * 2;
  const { sitOutCounts, opponentCounts, courtCounts } = createFairnessState(players);
  const rounds = [];

  for (let r = 0; r < numRounds; r++) {
    const { active, sitOuts } = selectActivePlayers(players, playersPerRound, sitOutCounts);
    const courtPairs = assignSinglesCourts(active, numCourts, opponentCounts);

    // Optimize court number assignments for fair rotation
    const orderedPairs = assignCourtNumbers(courtPairs, courtCounts, (pair) => pair);

    const courts = orderedPairs.map((pair, idx) => {
      incrementCount(opponentCounts, pair[0].id, pair[1].id);
      updateCourtCounts(pair, idx + 1, courtCounts);
      return buildCourtObject(r, idx, pair, null, null);
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
 * Generate all rounds for Doubles play (Random pairing)
 * @param {Player[]} players - All players
 * @param {number} numRounds - Number of rounds
 * @param {number} numCourts - Number of courts
 * @returns {Round[]}
 */
export function generateDoublesRandomRounds(players, numRounds, numCourts) {
  const playersPerRound = numCourts * 4;
  const { sitOutCounts, partnerCounts, opponentCounts, courtCounts } = createFairnessState(players);
  const rounds = [];

  for (let r = 0; r < numRounds; r++) {
    const { active, sitOuts } = selectActivePlayers(players, playersPerRound, sitOutCounts);
    const courtAssignments = assignDoublesCourts(active, numCourts, partnerCounts, opponentCounts);

    // Optimize court number assignments for fair rotation
    const ordered = assignCourtNumbers(courtAssignments, courtCounts, (a) => [...a.team1, ...a.team2]);

    const courts = ordered.map((assignment, idx) => {
      incrementCount(partnerCounts, assignment.team1[0].id, assignment.team1[1].id);
      incrementCount(partnerCounts, assignment.team2[0].id, assignment.team2[1].id);
      for (const p1 of assignment.team1) {
        for (const p2 of assignment.team2) {
          incrementCount(opponentCounts, p1.id, p2.id);
        }
      }
      const allPlayers = [...assignment.team1, ...assignment.team2];
      updateCourtCounts(allPlayers, idx + 1, courtCounts);
      return buildCourtObject(r, idx, allPlayers, assignment.team1, assignment.team2);
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
 * Generate all rounds for Mixed Doubles (1 male + 1 female per team)
 * @param {Player[]} players - All players
 * @param {number} numRounds - Number of rounds
 * @param {number} numCourts - Number of courts
 * @returns {Round[]}
 */
export function generateMixedDoublesRounds(players, numRounds, numCourts) {
  const males = players.filter((p) => p.gender === 'male');
  const females = players.filter((p) => p.gender === 'female');

  const maxCourts = Math.min(numCourts, Math.floor(males.length / 2), Math.floor(females.length / 2));
  if (maxCourts === 0) return [];

  const { sitOutCounts, partnerCounts, opponentCounts, courtCounts } = createFairnessState(players);
  const rounds = [];

  for (let r = 0; r < numRounds; r++) {
    // Select active players per gender independently for fair sit-outs
    const { active: activeMales, sitOuts: sitOutMales } = selectActivePlayers(males, maxCourts * 2, sitOutCounts);
    const { active: activeFemales, sitOuts: sitOutFemales } = selectActivePlayers(females, maxCourts * 2, sitOutCounts);

    const courtAssignments = assignMixedDoublesCourts(activeMales, activeFemales, maxCourts, partnerCounts, opponentCounts);

    // Optimize court number assignments for fair rotation
    const ordered = assignCourtNumbers(courtAssignments, courtCounts, (a) => [...a.team1, ...a.team2]);

    const courts = ordered.map((assignment, idx) => {
      incrementCount(partnerCounts, assignment.team1[0].id, assignment.team1[1].id);
      incrementCount(partnerCounts, assignment.team2[0].id, assignment.team2[1].id);
      for (const p1 of assignment.team1) {
        for (const p2 of assignment.team2) {
          incrementCount(opponentCounts, p1.id, p2.id);
        }
      }
      const allPlayers = [...assignment.team1, ...assignment.team2];
      updateCourtCounts(allPlayers, idx + 1, courtCounts);
      return buildCourtObject(r, idx, allPlayers, assignment.team1, assignment.team2);
    });

    rounds.push({
      id: `round-${r}`,
      roundNumber: r + 1,
      courts,
      sitOuts: [...sitOutMales, ...sitOutFemales],
    });
  }

  return rounds;
}

// ─── Main Entry Point ────────────────────────────────────────────────

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
