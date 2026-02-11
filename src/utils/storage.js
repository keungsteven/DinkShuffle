/**
 * Session persistence for Dink Shuffle
 * Uses localStorage with 24-hour expiry
 */

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
