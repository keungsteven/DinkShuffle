import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { useResponsive, colors, spacing } from '../utils/responsive';
import { loadOrganizerHistory, removeOrganizerSession, uploadAvatar, getAvatarUrl } from '../utils/storage';
import { supabase } from '../utils/supabase';

export default function LandingScreen({ onCreateSession, onJoinSession, onRejoinAsOrganizer, onViewHistory, user }) {
  const { isDesktop } = useResponsive();
  const [mode, setMode] = useState(null); // 'create' | 'join' | 'auth' | null
  const [joinTab, setJoinTab] = useState('players'); // 'players' | 'organizers'
  const [sessionCode, setSessionCode] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState(null); // 'male' | 'female'
  const [error, setError] = useState('');
  const [organizerHistory, setOrganizerHistory] = useState([]);
  const [organizerCode, setOrganizerCode] = useState('');

  // Auth form state
  const [authTab, setAuthTab] = useState('login'); // 'login' | 'signup'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Avatar state
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Load avatar when user changes
  useEffect(() => {
    if (user && supabase) {
      getAvatarUrl().then(setAvatarUrl);
    } else {
      setAvatarUrl(null);
    }
  }, [user]);

  const handleAvatarPress = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError('Image must be under 1MB');
      return;
    }
    setAvatarLoading(true);
    const url = await uploadAvatar(file);
    if (url) {
      setAvatarUrl(url);
    }
    setAvatarLoading(false);
  };

  // Load organizer history when entering join mode
  useEffect(() => {
    if (mode === 'join') {
      loadOrganizerHistory().then(setOrganizerHistory);
    }
  }, [mode]);

  const handleCreateSession = () => {
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    console.log('Created session with code:', code);
    onCreateSession(code);
  };

  const handleJoinSession = () => {
    setError('');

    if (!sessionCode || sessionCode.length !== 5) {
      setError('Please enter a valid 5-digit session code');
      return;
    }
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!gender) {
      setError('Please select your gender');
      return;
    }

    console.log('Joining session:', { sessionCode, name, gender });
    onJoinSession({ sessionCode, name, gender });
  };

  const resetToHome = () => {
    setMode(null);
    setJoinTab('players');
    setSessionCode('');
    setName('');
    setGender(null);
    setError('');
    setOrganizerCode('');
  };

  const handleRejoinOrganizer = (code) => {
    if (onRejoinAsOrganizer) {
      onRejoinAsOrganizer(code);
    }
  };

  const handleDeleteSession = async (code) => {
    await removeOrganizerSession(code);
    const updated = await loadOrganizerHistory();
    setOrganizerHistory(updated);
  };

  const handleManualRejoin = () => {
    setError('');
    if (!organizerCode || organizerCode.length !== 5) {
      setError('Please enter a valid 5-digit session code');
      return;
    }
    handleRejoinOrganizer(organizerCode);
  };

  const handleLogin = async () => {
    if (!authEmail.trim() || !authPassword) {
      setError('Please enter email and password');
      return;
    }
    setAuthLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    });
    setAuthLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setMode(null);
      setAuthEmail('');
      setAuthPassword('');
    }
  };

  const handleSignUp = async () => {
    if (!authEmail.trim() || !authPassword) {
      setError('Please enter email and password');
      return;
    }
    if (!authDisplayName.trim()) {
      setError('Please enter your display name');
      return;
    }
    setAuthLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signUp({
      email: authEmail.trim(),
      password: authPassword,
      options: { data: { display_name: authDisplayName.trim() } },
    });
    setAuthLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setMode(null);
      setAuthEmail('');
      setAuthPassword('');
      setAuthDisplayName('');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const getTimeRemaining = (expiresAt) => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return 'Expired';
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Logo/Brand Section */}
        <View style={styles.brandSection}>
          <Text style={[styles.title, isDesktop && styles.titleDesktop]}>
            Dink Shuffle
          </Text>
          <Text style={[styles.subtitle, isDesktop && styles.subtitleDesktop]}>
            Pickleball Mixer
          </Text>
        </View>

        {/* Auth Status (shown only when logged in) */}
        {supabase && user && (
          <View style={styles.authStatus}>
            <View style={styles.authLoggedIn}>
              <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.7}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarPlaceholderText}>
                      {(user.user_metadata?.display_name || user.email || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <View>
                <Text style={styles.authUserText}>
                  {user.user_metadata?.display_name || user.email}
                </Text>
                <TouchableOpacity onPress={handleLogout} activeOpacity={0.7}>
                  <Text style={styles.authLinkText}>Sign out</Text>
                </TouchableOpacity>
              </View>
              {Platform.OS === 'web' && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleFileSelected}
                />
              )}
            </View>
          </View>
        )}

        {/* Card Container */}
        <View style={[styles.card, isDesktop && styles.cardDesktop]}>
          {!mode && (
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.primaryButton, isDesktop && styles.buttonDesktop]}
                onPress={handleCreateSession}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>Create Session</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButton, isDesktop && styles.buttonDesktop]}
                onPress={() => setMode('join')}
                activeOpacity={0.8}
              >
                <Text style={styles.secondaryButtonText}>Join Session</Text>
              </TouchableOpacity>

              {supabase && !user && (
                <TouchableOpacity
                  style={[styles.authButton, isDesktop && styles.buttonDesktop]}
                  onPress={() => setMode('auth')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.authButtonText}>Sign In / Create Account</Text>
                </TouchableOpacity>
              )}

              {user && onViewHistory && (
                <TouchableOpacity
                  style={[styles.historyButton, isDesktop && styles.buttonDesktop]}
                  onPress={onViewHistory}
                  activeOpacity={0.8}
                >
                  <Text style={styles.historyButtonText}>Match History</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {mode === 'join' && (
            <View style={styles.form}>
              {/* Tabs */}
              <View style={styles.tabRow}>
                <TouchableOpacity
                  style={[styles.tab, joinTab === 'players' && styles.tabActive]}
                  onPress={() => { setJoinTab('players'); setError(''); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, joinTab === 'players' && styles.tabTextActive]}>
                    Players
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, joinTab === 'organizers' && styles.tabActive]}
                  onPress={() => { setJoinTab('organizers'); setError(''); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, joinTab === 'organizers' && styles.tabTextActive]}>
                    Organizers
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Players Tab */}
              {joinTab === 'players' && (
                <>
                  <TextInput
                    style={[styles.input, isDesktop && styles.inputDesktop]}
                    placeholder="Session Code"
                    placeholderTextColor="#999"
                    value={sessionCode}
                    onChangeText={(text) => setSessionCode(text.replace(/[^0-9]/g, '').slice(0, 5))}
                    keyboardType="number-pad"
                    maxLength={5}
                  />

                  <TextInput
                    style={[styles.input, isDesktop && styles.inputDesktop]}
                    placeholder="Your Name"
                    placeholderTextColor="#999"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />

                  <Text style={styles.label}>Gender (for mixed doubles)</Text>
                  <View style={styles.genderRow}>
                    <TouchableOpacity
                      style={[
                        styles.genderButton,
                        gender === 'male' && styles.genderButtonSelected,
                        isDesktop && styles.genderButtonDesktop,
                      ]}
                      onPress={() => setGender('male')}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.genderButtonText,
                          gender === 'male' && styles.genderButtonTextSelected,
                        ]}
                      >
                        Male
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.genderButton,
                        gender === 'female' && styles.genderButtonSelected,
                        isDesktop && styles.genderButtonDesktop,
                      ]}
                      onPress={() => setGender('female')}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.genderButtonText,
                          gender === 'female' && styles.genderButtonTextSelected,
                        ]}
                      >
                        Female
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <TouchableOpacity
                    style={[styles.primaryButton, isDesktop && styles.buttonDesktop]}
                    onPress={handleJoinSession}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.primaryButtonText}>Join Session</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Organizers Tab */}
              {joinTab === 'organizers' && (
                <>
                  {organizerHistory.length > 0 ? (
                    <ScrollView style={styles.sessionList} nestedScrollEnabled>
                      <Text style={styles.sessionListLabel}>Your Saved Sessions</Text>
                      {organizerHistory.map((session) => (
                        <View key={session.sessionCode} style={styles.sessionItem}>
                          <TouchableOpacity
                            style={styles.sessionItemContent}
                            onPress={() => handleRejoinOrganizer(session.sessionCode)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.sessionItemName}>
                              {session.sessionName || `Session ${session.sessionCode}`}
                            </Text>
                            <View style={styles.sessionItemMeta}>
                              <Text style={styles.sessionItemCode}>#{session.sessionCode}</Text>
                              <Text style={styles.sessionItemExpiry}>
                                {getTimeRemaining(session.expiresAt)} left
                              </Text>
                            </View>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.sessionDeleteBtn}
                            onPress={() => handleDeleteSession(session.sessionCode)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.sessionDeleteText}>×</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={styles.noSessions}>
                      <Text style={styles.noSessionsText}>No saved sessions</Text>
                      <Text style={styles.noSessionsSubtext}>
                        Create a session or enter a code below
                      </Text>
                    </View>
                  )}

                  <View style={styles.manualEntry}>
                    <Text style={styles.manualEntryLabel}>Or enter session code:</Text>
                    <View style={styles.manualEntryRow}>
                      <TextInput
                        style={[styles.input, styles.manualEntryInput]}
                        placeholder="Code"
                        placeholderTextColor="#999"
                        value={organizerCode}
                        onChangeText={(text) => setOrganizerCode(text.replace(/[^0-9]/g, '').slice(0, 5))}
                        keyboardType="number-pad"
                        maxLength={5}
                      />
                      <TouchableOpacity
                        style={styles.manualEntryBtn}
                        onPress={handleManualRejoin}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.manualEntryBtnText}>Rejoin</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {error ? <Text style={styles.error}>{error}</Text> : null}
                </>
              )}

              <TouchableOpacity style={styles.backButton} onPress={resetToHome}>
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
            </View>
          )}

          {mode === 'auth' && supabase && (
            <View style={styles.form}>
              <View style={styles.tabRow}>
                <TouchableOpacity
                  style={[styles.tab, authTab === 'login' && styles.tabActive]}
                  onPress={() => { setAuthTab('login'); setError(''); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, authTab === 'login' && styles.tabTextActive]}>
                    Log In
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, authTab === 'signup' && styles.tabActive]}
                  onPress={() => { setAuthTab('signup'); setError(''); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, authTab === 'signup' && styles.tabTextActive]}>
                    Sign Up
                  </Text>
                </TouchableOpacity>
              </View>

              {authTab === 'signup' && (
                <TextInput
                  style={[styles.input, isDesktop && styles.inputDesktop]}
                  placeholder="Display Name"
                  placeholderTextColor="#999"
                  value={authDisplayName}
                  onChangeText={setAuthDisplayName}
                  autoCapitalize="words"
                />
              )}

              <TextInput
                style={[styles.input, isDesktop && styles.inputDesktop]}
                placeholder="Email"
                placeholderTextColor="#999"
                value={authEmail}
                onChangeText={setAuthEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <TextInput
                style={[styles.input, isDesktop && styles.inputDesktop]}
                placeholder="Password"
                placeholderTextColor="#999"
                value={authPassword}
                onChangeText={setAuthPassword}
                secureTextEntry
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryButton, isDesktop && styles.buttonDesktop, authLoading && styles.buttonDisabled]}
                onPress={authTab === 'login' ? handleLogin : handleSignUp}
                activeOpacity={0.8}
                disabled={authLoading}
              >
                <Text style={styles.primaryButtonText}>
                  {authLoading ? 'Please wait...' : authTab === 'login' ? 'Log In' : 'Create Account'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.backButton} onPress={resetToHome}>
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>Organize your pickleball games with ease</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
    ...Platform.select({
      web: {
        userSelect: 'none',
      },
    }),
  },
  titleDesktop: {
    fontSize: 52,
  },
  subtitle: {
    fontSize: 18,
    color: colors.textSecondary,
    ...Platform.select({
      web: {
        userSelect: 'none',
      },
    }),
  },
  subtitleDesktop: {
    fontSize: 20,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: spacing.lg,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 4,
      },
    }),
  },
  cardDesktop: {
    maxWidth: 400,
    padding: spacing.xl,
  },
  buttonGroup: {
    gap: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      },
    }),
  },
  buttonDesktop: {
    paddingVertical: 18,
    ...Platform.select({
      web: {
        ':hover': {
          transform: 'translateY(-1px)',
        },
      },
    }),
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    ...Platform.select({
      web: {
        userSelect: 'none',
      },
    }),
  },
  secondaryButton: {
    backgroundColor: colors.secondary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
      },
    }),
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    ...Platform.select({
      web: {
        userSelect: 'none',
      },
    }),
  },
  form: {
    width: '100%',
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 4,
    marginBottom: spacing.lg,
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
  sessionList: {
    maxHeight: 180,
    marginBottom: spacing.md,
  },
  sessionListLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderRadius: 10,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  sessionItemContent: {
    flex: 1,
    padding: spacing.md,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  sessionItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  sessionItemMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 4,
  },
  sessionItemCode: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
  },
  sessionItemExpiry: {
    fontSize: 12,
    color: colors.textMuted,
  },
  sessionDeleteBtn: {
    padding: spacing.md,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  sessionDeleteText: {
    fontSize: 20,
    color: colors.textMuted,
  },
  noSessions: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  noSessionsText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  noSessionsSubtext: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  manualEntry: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  manualEntryLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  manualEntryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  manualEntryInput: {
    flex: 1,
    marginBottom: 0,
  },
  manualEntryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  manualEntryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.secondary,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: spacing.md,
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
  inputDesktop: {
    paddingVertical: 16,
    fontSize: 17,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  genderRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  genderButton: {
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
  genderButtonDesktop: {
    paddingVertical: 16,
  },
  genderButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  genderButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    ...Platform.select({
      web: {
        userSelect: 'none',
      },
    }),
  },
  genderButtonTextSelected: {
    color: '#fff',
  },
  error: {
    color: colors.error,
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
    backgroundColor: colors.errorLight,
    padding: spacing.sm,
    borderRadius: 8,
  },
  backButton: {
    marginTop: spacing.lg,
    alignItems: 'center',
    padding: spacing.sm,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  backButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  footer: {
    marginTop: spacing.xl,
    fontSize: 14,
    color: colors.textMuted,
    ...Platform.select({
      web: {
        userSelect: 'none',
      },
    }),
  },
  authStatus: {
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  authLoggedIn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  authUserText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  authLinkText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: spacing.sm,
  },
  avatarPlaceholder: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  authButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      },
    }),
  },
  authButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
    ...Platform.select({
      web: { userSelect: 'none' },
    }),
  },
  historyButton: {
    backgroundColor: colors.primaryLight,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      },
    }),
  },
  historyButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
    ...Platform.select({
      web: { userSelect: 'none' },
    }),
  },
});
