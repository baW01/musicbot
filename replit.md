# TS Music Bot - TeamSpeak Music Player

## Overview
A TeamSpeak music bot with a web control panel. Supports YouTube and SoundCloud - single songs and playlists. The web panel manages the music queue, playback, and TeamSpeak bot connection.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui with sidebar layout
- **Backend**: Express.js + WebSocket for real-time state sync
- **Database**: PostgreSQL via Drizzle ORM (playlists, bot config)
- **Music**: yt-dlp for audio extraction, youtube-sr for YouTube search
- **TeamSpeak**: ts3-nodejs-library for ServerQuery connection

## Key Files
- `shared/schema.ts` - Data models (playlists, playlistSongs, botConfig) + TypeScript interfaces
- `server/routes.ts` - API routes + WebSocket handler
- `server/queue-manager.ts` - In-memory queue/playback state management
- `server/youtube-service.ts` - YouTube/SoundCloud search and playlist loading
- `server/teamspeak-bot.ts` - TeamSpeak ServerQuery bot
- `server/storage.ts` - Database CRUD operations
- `client/src/App.tsx` - Main app with sidebar navigation
- `client/src/hooks/use-player.ts` - WebSocket-based player state hook
- `client/src/components/` - UI components (NowPlaying, PlayerControls, QueueList, SearchPanel, PlaylistManager, BotSettings)
- `client/src/pages/` - Pages (player, search, playlists, settings)

## API Endpoints
- `GET /api/search/youtube?q=` - Search YouTube
- `GET /api/search/soundcloud?q=` - Search SoundCloud
- `GET /api/playlist/load?url=` - Load playlist from YouTube/SoundCloud URL
- `GET /api/player/state` - Get player state
- `GET /api/playlists` - List saved playlists
- `POST /api/playlists` - Create playlist
- `DELETE /api/playlists/:id` - Delete playlist
- `GET /api/playlists/:id/songs` - Get playlist songs
- `POST /api/playlists/:id/songs` - Save songs to playlist
- `GET /api/bot/config` - Get TeamSpeak config
- `PUT /api/bot/config` - Update TeamSpeak config
- `GET /api/bot/status` - Get bot connection status
- `POST /api/bot/connect` - Connect to TeamSpeak
- `POST /api/bot/disconnect` - Disconnect from TeamSpeak

## WebSocket
- Path: `/ws`
- Messages: play, pause, skip, stop, volume, seek, addToQueue, removeFromQueue, clearQueue, moveInQueue
- Server broadcasts: playerState updates

## Running
- `npm run dev` starts Express + Vite on port 5000
- System deps: yt-dlp, ffmpeg

## Recent Changes
- 2026-02-09: Fixed yt-dlp audio extraction - added user-agent and player_client fallback (web → android) to bypass YouTube bot detection
- 2026-02-09: Fixed critical duration bug - songs with "0:00" duration (livestreams) no longer get immediately skipped; parseDuration defaults to 300s minimum
- 2026-02-09: Added REST fallback for addToQueue (POST /api/queue/add) in case WebSocket is not connected
- 2026-02-09: Initial build - full music bot with web panel, YouTube/SoundCloud support, playlist management, TeamSpeak integration
