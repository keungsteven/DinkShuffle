import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, StyleSheet, ActivityIndicator, View } from 'react-native';
import LandingScreen from './screens/LandingScreen';
import OrganizerScreen from './screens/OrganizerScreen';
import { loadSession, saveSession, clearSession, saveOrganizerSession } from './utils/storage';

export default function App() {
  const [screen, setScreen] = useState('landing'); // 'landing' | 'organizer' | 'player'
  const [sessionCode, setSessionCode] = useState(null);
  const [playerInfo, setPlayerInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [restoredSession, setRestoredSession] = useState(null);

  // Load session on mount
  useEffect(() => {
    async function restoreSession() {
      try {
        const session = await loadSession();
        if (session) {
          setSessionCode(session.sessionCode);
          setScreen(session.role);
          if (session.playerInfo) {
            setPlayerInfo(session.playerInfo);
          }
          setRestoredSession(session);
          console.log('[App] Session restored:', session.sessionCode);
        }
      } catch (error) {
        console.error('[App] Failed to restore session:', error);
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
  }, []);

  const handleCreateSession = useCallback((code) => {
    setSessionCode(code);
    setScreen('organizer');
    setRestoredSession(null);

    const now = Date.now();

    saveSession({
      sessionCode: code,
      sessionName: '',
      role: 'organizer',
      config: null,
      players: [],
      rounds: [],
      isShuffled: false,
    });

    // Save to organizer history for later access
    saveOrganizerSession({
      sessionCode: code,
      sessionName: '',
      createdAt: now,
    });
  }, []);

  const handleJoinSession = useCallback(({ sessionCode: code, name, gender }) => {
    const info = { name, gender };
    setSessionCode(code);
    setPlayerInfo(info);
    setScreen('player');

    saveSession({
      sessionCode: code,
      role: 'player',
      playerInfo: info,
    });

    console.log('Player joined:', { code, name, gender });
  }, []);

  const handleLeaveSession = useCallback(async () => {
    setScreen('landing');
    setSessionCode(null);
    setPlayerInfo(null);
    setRestoredSession(null);
    await clearSession();
  }, []);

  const handleSessionUpdate = useCallback((sessionData) => {
    saveSession({
      sessionCode,
      role: 'organizer',
      ...sessionData,
    });

    // Sync session name with organizer history
    if (sessionData.sessionName !== undefined) {
      saveOrganizerSession({
        sessionCode,
        sessionName: sessionData.sessionName,
      });
    }
  }, [sessionCode]);

  const handleRejoinAsOrganizer = useCallback(async (code) => {
    // Try to load existing session data
    const session = await loadSession();

    if (session && session.sessionCode === code && session.role === 'organizer') {
      // Session still in main storage - restore it
      setSessionCode(code);
      setScreen('organizer');
      setRestoredSession(session);
      console.log('[App] Rejoined existing session:', code);
    } else {
      // Session expired from main storage, start fresh with same code
      setSessionCode(code);
      setScreen('organizer');
      setRestoredSession(null);

      saveSession({
        sessionCode: code,
        sessionName: '',
        role: 'organizer',
        config: null,
        players: [],
        rounds: [],
        isShuffled: false,
      });

      console.log('[App] Started fresh session with code:', code);
    }
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {screen === 'landing' && (
        <LandingScreen
          onCreateSession={handleCreateSession}
          onJoinSession={handleJoinSession}
          onRejoinAsOrganizer={handleRejoinAsOrganizer}
        />
      )}
      {screen === 'organizer' && (
        <OrganizerScreen
          sessionCode={sessionCode}
          onLeave={handleLeaveSession}
          onSessionUpdate={handleSessionUpdate}
          initialData={restoredSession}
        />
      )}
      {screen === 'player' && (
        <LandingScreen
          onCreateSession={handleCreateSession}
          onJoinSession={handleJoinSession}
          onRejoinAsOrganizer={handleRejoinAsOrganizer}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
