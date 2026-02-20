/**
 * Session persistence for Dink Shuffle
 * Uses localStorage with 24-hour expiry
 * Optional Supabase write-through for logged-in users
 */

import { supabase } from './supabase';

const STORAGE_KEY = 'dink_shuffle_session';
const ORGANIZER_HISTORY_KEY = 'dink_shuffle_organizer_history';
const EXPIRY_HOURS = 24;

/**
 * @typedef {Object} SessionData
 * @property {string} sessionCode
 * @property {string} [sessionName]
 * @property {'organizer' | 'player'} role
 * @property {Object} config
 * @property {Array} players
 * @property {Array} rounds
 * @property {boolean} isShuffled
 * @property {Object} [playerInfo]
 * @property {number} savedAt
 * @property {number} expiresAt
 */

/**
 * @typedef {Object} OrganizerSessionRecord
 * @property {string} sessionCode
 * @property {string} sessionName
 * @property {number} createdAt
 * @property {number} lastEditedAt
 * @property {number} expiresAt
 */

/**
 * Save session data to storage
 * @param {SessionData} sessionData
 * @returns {Promise<boolean>}
 */
export async function saveSession(sessionData) {
  try {
    const now = Date.now();
    const dataToSave = {
      ...sessionData,
      savedAt: now,
      expiresAt: now + EXPIRY_HOURS * 60 * 60 * 1000,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    console.log('[Storage] Session saved:', sessionData.sessionCode);
    return true;
  } catch (error) {
    console.error('[Storage] Failed to save session:', error);
    return false;
  }
}

/**
 * Load session data from storage
 * @returns {Promise<SessionData | null>}
 */
export async function loadSession() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);

    if (!data) {
      console.log('[Storage] No session found');
      return null;
    }

    const sessionData = JSON.parse(data);

    // Check expiry
    if (sessionData.expiresAt && Date.now() > sessionData.expiresAt) {
      console.log('[Storage] Session expired, clearing');
      await clearSession();
      return null;
    }

    console.log('[Storage] Session loaded:', sessionData.sessionCode);
    return sessionData;
  } catch (error) {
    console.error('[Storage] Failed to load session:', error);
    return null;
  }
}

/**
 * Clear session data from storage
 * @returns {Promise<boolean>}
 */
export async function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[Storage] Session cleared');
    return true;
  } catch (error) {
    console.error('[Storage] Failed to clear session:', error);
    return false;
  }
}

/**
 * Check if a valid session exists
 * @returns {Promise<boolean>}
 */
export async function hasValidSession() {
  const session = await loadSession();
  return session !== null;
}

/**
 * Get remaining time until session expires
 * @returns {Promise<{ hours: number, minutes: number } | null>}
 */
export async function getSessionTimeRemaining() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;

    const sessionData = JSON.parse(data);
    if (!sessionData.expiresAt) return null;

    const remaining = sessionData.expiresAt - Date.now();
    if (remaining <= 0) return null;

    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

    return { hours, minutes };
  } catch {
    return null;
  }
}

/**
 * Update specific fields in session
 * @param {Partial<SessionData>} updates
 * @returns {Promise<boolean>}
 */
export async function updateSession(updates) {
  try {
    const current = await loadSession();
    if (!current) {
      console.log('[Storage] No session to update');
      return false;
    }

    const now = Date.now();
    const updated = {
      ...current,
      ...updates,
      savedAt: now,
      expiresAt: now + EXPIRY_HOURS * 60 * 60 * 1000, // Reset expiry on every edit
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    console.log('[Storage] Session updated, expiry reset');
    return true;
  } catch (error) {
    console.error('[Storage] Failed to update session:', error);
    return false;
  }
}

/**
 * Save or update an organizer session in history
 * @param {OrganizerSessionRecord} record
 * @returns {Promise<boolean>}
 */
export async function saveOrganizerSession(record) {
  try {
    const history = await loadOrganizerHistory();
    const now = Date.now();
    const expiresAt = now + EXPIRY_HOURS * 60 * 60 * 1000;

    const existingIndex = history.findIndex((s) => s.sessionCode === record.sessionCode);

    if (existingIndex >= 0) {
      // Update existing
      history[existingIndex] = {
        ...history[existingIndex],
        ...record,
        lastEditedAt: now,
        expiresAt,
      };
    } else {
      // Add new
      history.push({
        sessionCode: record.sessionCode,
        sessionName: record.sessionName || '',
        createdAt: record.createdAt || now,
        lastEditedAt: now,
        expiresAt,
      });
    }

    localStorage.setItem(ORGANIZER_HISTORY_KEY, JSON.stringify(history));
    console.log('[Storage] Organizer session saved:', record.sessionCode);
    return true;
  } catch (error) {
    console.error('[Storage] Failed to save organizer session:', error);
    return false;
  }
}

/**
 * Load all non-expired organizer sessions
 * @returns {Promise<OrganizerSessionRecord[]>}
 */
export async function loadOrganizerHistory() {
  try {
    const data = localStorage.getItem(ORGANIZER_HISTORY_KEY);
    if (!data) return [];

    const history = JSON.parse(data);
    const now = Date.now();

    // Filter out expired sessions
    const validSessions = history.filter((s) => s.expiresAt && s.expiresAt > now);

    // If some were expired, update storage
    if (validSessions.length !== history.length) {
      localStorage.setItem(ORGANIZER_HISTORY_KEY, JSON.stringify(validSessions));
      console.log('[Storage] Cleaned up expired organizer sessions');
    }

    return validSessions;
  } catch (error) {
    console.error('[Storage] Failed to load organizer history:', error);
    return [];
  }
}

/**
 * Remove a session from organizer history
 * @param {string} sessionCode
 * @returns {Promise<boolean>}
 */
export async function removeOrganizerSession(sessionCode) {
  try {
    const history = await loadOrganizerHistory();
    const filtered = history.filter((s) => s.sessionCode !== sessionCode);

    localStorage.setItem(ORGANIZER_HISTORY_KEY, JSON.stringify(filtered));
    console.log('[Storage] Organizer session removed:', sessionCode);
    return true;
  } catch (error) {
    console.error('[Storage] Failed to remove organizer session:', error);
    return false;
  }
}

// ─── Supabase Write-Through (Cloud Persistence) ─────────────────────

/**
 * Get the current authenticated user ID, or null if not logged in
 */
async function getAuthUserId() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Save or update a session in Supabase (called alongside localStorage save)
 * @param {string} sessionCode
 * @param {Object} sessionData - config, players, rounds, etc.
 * @returns {Promise<string|null>} Supabase session UUID or null
 */
export async function saveSessionToCloud(sessionCode, sessionData) {
  const userId = await getAuthUserId();
  if (!userId || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('sessions')
      .upsert({
        session_code: sessionCode,
        session_name: sessionData.sessionName || '',
        organizer_id: userId,
        game_type: sessionData.config?.gameType || null,
        pairing_mode: sessionData.config?.pairingMode || null,
        num_rounds: sessionData.config?.numRounds || 3,
        num_courts: sessionData.config?.numCourts || 2,
        court_names: sessionData.courtNames || {},
        is_shuffled: sessionData.isShuffled || false,
      }, { onConflict: 'session_code' })
      .select('id')
      .single();

    if (error) throw error;
    console.log('[Storage] Session saved to cloud:', sessionCode);
    return data.id;
  } catch (error) {
    console.error('[Storage] Failed to save session to cloud:', error);
    return null;
  }
}

/**
 * Save shuffle results (players + rounds + courts) to Supabase
 * @param {string} sessionCode
 * @param {Array} players - Local player objects
 * @param {Array} rounds - Local round objects with courts
 * @returns {Promise<boolean>}
 */
export async function saveShuffleResultsToCloud(sessionCode, players, rounds) {
  const userId = await getAuthUserId();
  if (!userId || !supabase) return false;

  try {
    // Find the session in Supabase
    const { data: session } = await supabase
      .from('sessions')
      .select('id')
      .eq('session_code', sessionCode)
      .single();

    if (!session) return false;
    const sessionId = session.id;

    // Upsert players
    const playerRows = players.map((p, i) => ({
      session_id: sessionId,
      player_name: p.name,
      gender: p.gender,
      slot_number: i + 1,
    }));

    const { data: savedPlayers, error: playerError } = await supabase
      .from('session_players')
      .upsert(playerRows, { onConflict: 'session_id,slot_number' })
      .select();

    if (playerError) throw playerError;

    // Build local-id → db-id mapping
    const playerIdMap = new Map();
    savedPlayers.forEach((sp) => {
      const original = players[sp.slot_number - 1];
      if (original) playerIdMap.set(original.id, sp.id);
    });

    // Save rounds and courts
    for (const round of rounds) {
      const { data: savedRound, error: roundError } = await supabase
        .from('rounds')
        .upsert({
          session_id: sessionId,
          round_number: round.roundNumber,
          sit_out_player_ids: (round.sitOuts || [])
            .map((p) => playerIdMap.get(p.id))
            .filter(Boolean),
        }, { onConflict: 'session_id,round_number' })
        .select()
        .single();

      if (roundError) throw roundError;

      const courtRows = round.courts.map((c) => ({
        round_id: savedRound.id,
        court_number: c.courtNumber,
        player_ids: c.players.map((p) => playerIdMap.get(p.id)).filter(Boolean),
        team1_ids: c.team1?.map((p) => playerIdMap.get(p.id)).filter(Boolean) || null,
        team2_ids: c.team2?.map((p) => playerIdMap.get(p.id)).filter(Boolean) || null,
        status: c.status,
        score_team1: c.score?.team1 ?? null,
        score_team2: c.score?.team2 ?? null,
        score_updated_by: c.score?.lastUpdatedBy ?? null,
        score_updated_at: c.score?.lastUpdatedAt
          ? new Date(c.score.lastUpdatedAt).toISOString()
          : null,
      }));

      const { error: courtError } = await supabase
        .from('courts')
        .upsert(courtRows, { onConflict: 'round_id,court_number' });

      if (courtError) throw courtError;
    }

    console.log('[Storage] Shuffle results saved to cloud:', sessionCode);
    return true;
  } catch (error) {
    console.error('[Storage] Failed to save shuffle results to cloud:', error);
    return false;
  }
}

/**
 * Load a session from Supabase by session code
 * @param {string} sessionCode
 * @returns {Promise<Object|null>} Session data in local format, or null
 */
export async function loadSessionFromCloud(sessionCode) {
  if (!supabase) return null;

  try {
    const { data: session, error } = await supabase
      .from('sessions')
      .select(`
        *,
        session_players (*)
      `)
      .eq('session_code', sessionCode)
      .single();

    if (error || !session) return null;

    // Load rounds with courts
    const { data: roundsData } = await supabase
      .from('rounds')
      .select(`*, courts (*)`)
      .eq('session_id', session.id)
      .order('round_number');

    // Build db-id → local player map
    const dbPlayers = (session.session_players || [])
      .sort((a, b) => a.slot_number - b.slot_number);

    const players = dbPlayers.map((sp) => ({
      id: sp.id,
      name: sp.player_name,
      gender: sp.gender,
    }));

    const playerMap = new Map(dbPlayers.map((sp) => [sp.id, sp]));

    const rounds = (roundsData || []).map((r) => ({
      id: `round-${r.round_number - 1}`,
      roundNumber: r.round_number,
      sitOuts: (r.sit_out_player_ids || [])
        .map((pid) => playerMap.get(pid))
        .filter(Boolean)
        .map((sp) => ({ id: sp.id, name: sp.player_name, gender: sp.gender })),
      courts: (r.courts || [])
        .sort((a, b) => a.court_number - b.court_number)
        .map((c) => {
          const courtPlayers = (c.player_ids || [])
            .map((pid) => playerMap.get(pid))
            .filter(Boolean)
            .map((sp) => ({ id: sp.id, name: sp.player_name, gender: sp.gender }));

          const mapIds = (ids) => ids
            ? ids.map((pid) => playerMap.get(pid)).filter(Boolean)
              .map((sp) => ({ id: sp.id, name: sp.player_name, gender: sp.gender }))
            : null;

          return {
            id: `r${r.round_number - 1}c${c.court_number - 1}`,
            courtNumber: c.court_number,
            players: courtPlayers,
            team1: mapIds(c.team1_ids),
            team2: mapIds(c.team2_ids),
            status: c.status,
            score: {
              team1: c.score_team1,
              team2: c.score_team2,
              lastUpdatedBy: c.score_updated_by,
              lastUpdatedAt: c.score_updated_at ? new Date(c.score_updated_at).getTime() : null,
            },
          };
        }),
    }));

    return {
      sessionCode: session.session_code,
      sessionName: session.session_name,
      role: 'organizer',
      config: {
        gameType: session.game_type,
        pairingMode: session.pairing_mode,
        numRounds: session.num_rounds,
        numCourts: session.num_courts,
      },
      players,
      rounds,
      isShuffled: session.is_shuffled,
      courtNames: session.court_names || {},
    };
  } catch (error) {
    console.error('[Storage] Failed to load session from cloud:', error);
    return null;
  }
}

/**
 * Update a single court's score/status in Supabase
 * @param {string} sessionCode
 * @param {number} roundNumber
 * @param {number} courtNumber
 * @param {Object} updates - { status, score_team1, score_team2, score_updated_by }
 */
export async function updateCourtInCloud(sessionCode, roundNumber, courtNumber, updates) {
  if (!supabase) return;

  try {
    const { data: session } = await supabase
      .from('sessions')
      .select('id')
      .eq('session_code', sessionCode)
      .single();
    if (!session) return;

    const { data: round } = await supabase
      .from('rounds')
      .select('id')
      .eq('session_id', session.id)
      .eq('round_number', roundNumber)
      .single();
    if (!round) return;

    await supabase
      .from('courts')
      .update({
        ...updates,
        score_updated_at: new Date().toISOString(),
      })
      .eq('round_id', round.id)
      .eq('court_number', courtNumber);
  } catch (error) {
    console.error('[Storage] Failed to update court in cloud:', error);
  }
}

// ─── Avatar Upload ──────────────────────────────────────────────────

/**
 * Upload a profile avatar image to Supabase Storage
 * @param {File} file - The image file to upload
 * @returns {Promise<string|null>} Public URL of the uploaded avatar, or null
 */
export async function uploadAvatar(file) {
  const userId = await getAuthUserId();
  if (!userId || !supabase) return null;

  try {
    const ext = file.type === 'image/png' ? 'png'
      : file.type === 'image/webp' ? 'webp'
      : 'jpg';
    const filePath = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    if (profileError) throw profileError;

    console.log('[Storage] Avatar uploaded:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('[Storage] Failed to upload avatar:', error);
    return null;
  }
}

/**
 * Get the current user's avatar URL from their profile
 * @returns {Promise<string|null>}
 */
export async function getAvatarUrl() {
  const userId = await getAuthUserId();
  if (!userId || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data?.avatar_url || null;
  } catch (error) {
    console.error('[Storage] Failed to get avatar URL:', error);
    return null;
  }
}

// ─── Match History ──────────────────────────────────────────────────

/**
 * Load the current user's match history from the my_match_history view
 * @returns {Promise<Object[]>} Array of session records with matches
 */
export async function loadMatchHistory() {
  const userId = await getAuthUserId();
  if (!userId || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('my_match_history')
      .select('*')
      .order('session_date', { ascending: false });

    if (error) throw error;

    const sessionMap = new Map();
    for (const row of (data || [])) {
      if (!sessionMap.has(row.session_code)) {
        sessionMap.set(row.session_code, {
          sessionCode: row.session_code,
          sessionName: row.session_name || `Session ${row.session_code}`,
          gameType: row.game_type,
          pairingMode: row.pairing_mode,
          sessionDate: row.session_date,
          matches: [],
        });
      }
      sessionMap.get(row.session_code).matches.push({
        courtId: row.court_id,
        courtNumber: row.court_number,
        roundNumber: row.round_number,
        status: row.status,
        scoreTeam1: row.score_team1,
        scoreTeam2: row.score_team2,
        playerIds: row.player_ids,
        team1Ids: row.team1_ids,
        team2Ids: row.team2_ids,
      });
    }

    return Array.from(sessionMap.values());
  } catch (error) {
    console.error('[Storage] Failed to load match history:', error);
    return [];
  }
}

/**
 * Resolve player IDs to names for match history display
 * @param {string[]} playerIds - Array of session_player UUIDs
 * @returns {Promise<Map<string, string>>} Map of player_id -> player_name
 */
export async function resolvePlayerNames(playerIds) {
  if (!supabase || !playerIds || playerIds.length === 0) return new Map();

  try {
    const uniqueIds = [...new Set(playerIds)];
    const { data, error } = await supabase
      .from('session_players')
      .select('id, player_name')
      .in('id', uniqueIds);

    if (error) throw error;

    const nameMap = new Map();
    for (const row of (data || [])) {
      nameMap.set(row.id, row.player_name);
    }
    return nameMap;
  } catch (error) {
    console.error('[Storage] Failed to resolve player names:', error);
    return new Map();
  }
}
