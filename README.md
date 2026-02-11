# Dink Shuffle

A web app for organizing pickleball mixer games. Create sessions, shuffle players into teams, track scores, and view results.

## Features

- **Session Management** - Create named sessions with unique 5-digit codes
- **Player Roster** - Add players with gender for mixed doubles pairing
- **Game Modes** - Singles, Doubles (Random), and Mixed Doubles
- **Smart Shuffle** - Generates rounds minimizing repeat partners/opponents
- **Score Tracking** - Enter scores per court with automatic win/loss calculation
- **Results & Rankings** - View standings by win rate or total points with medal awards
- **Session Persistence** - Sessions saved for 24 hours with auto-restore
- **Organizer History** - Return to previous sessions via saved session list

## Tech Stack

- **React 19** with hooks
- **React Native Web** for cross-platform components
- **Vite** for fast development and builds
- **localStorage** for client-side persistence

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

This app is configured for Vercel deployment:

1. Push to GitHub
2. Import repository in Vercel
3. Vercel auto-detects Vite and configures:
   - Build Command: `npm run build`
   - Output Directory: `dist`

## Project Structure

```
src/
├── components/
│   ├── ResultsModal.jsx    # Rankings with medals
│   └── ScoreEntry.jsx      # Score input modal
├── screens/
│   ├── LandingScreen.jsx   # Home/Join screen
│   └── OrganizerScreen.jsx # Game management
├── utils/
│   ├── shuffle.js          # Player shuffling algorithm
│   ├── responsive.js       # Responsive design utilities
│   └── storage.js          # localStorage persistence
├── App.jsx                 # Main app with routing
└── main.jsx                # Entry point
```

## License

MIT
