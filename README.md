# Web Messenger 🌐

A modern, responsive, secure web messaging application built with **Flutter Web** and powered by a high-performance **NestJS** backend with **PostgreSQL**, **Socket.IO** real-time bidirectional communication, and end-to-end field-level **AES-256-GCM** encryption. 

**Web Messenger** expands the functionality of the Mobile Messenger project, sharing a **single codebase** and **single database** across web, desktop, and mobile platforms. It is accessible from any computer via modern web browsers and incorporates desktop-adapted responsive UI, group chats, message search with highlighting, resilient error handling, multi-panel chat views, and group polls.

---

## 📑 Table of Contents

1. [Project Overview & The Situation](#-project-overview--the-situation)
   - [The Situation & Motivation](#the-situation--motivation)
   - [Unified Codebase & Database Architecture](#unified-codebase--database-architecture)
   - [Expected Outcomes](#expected-outcomes)
2. [Key Features](#-key-features)
   - [Web Messenger Core Innovations](#1-web-messenger-core-innovations)
   - [Extra Web Requirements](#2-extra-web-requirements)
   - [Inherited Base Features (from Mobile Messenger)](#3-inherited-base-features-from-mobile-messenger)
3. [Architecture & Security](#-architecture--security)
   - [Cryptographic Architecture (AES-256-GCM)](#cryptographic-architecture-aes-256-gcm)
   - [Web-Safe Platform Adaptation Layer](#web-safe-platform-adaptation-layer)
   - [Authentication & JWT Session Lifecycle](#authentication--jwt-session-lifecycle)
4. [Project Structure](#-project-structure)
   - [Directory Tree](#directory-tree)
   - [Backend Architecture (NestJS)](#backend-architecture-nestjs)
   - [Frontend Architecture (Flutter)](#frontend-architecture-flutter)
5. [Prerequisites & Environment Configuration](#-prerequisites--environment-configuration)
   - [Prerequisites](#prerequisites)
   - [Environment Variables Reference (`backend/.env`)](#environment-variables-reference-backendenv)
   - [Database Seeding Configuration](#database-seeding-configuration)
6. [Backend Deployment](#-backend-deployment)
   - [Option A: One-Command Docker Setup (Recommended)](#option-a-one-command-docker-setup-recommended)
   - [Option B: Local Node.js & PostgreSQL Setup](#option-b-local-nodejs--postgresql-setup)
   - [Database Seeding (`npm run seed`)](#database-seeding-npm-run-seed)
7. [Running & Deploying Frontend on Web](#-running--deploying-frontend-on-web)
   - [Running in Development Mode (Google Chrome / Edge)](#1-running-in-development-mode-google-chrome--edge)
   - [Building for Production](#2-building-for-production)
   - [Testing the Production Web Build Locally](#3-testing-the-production-web-build-locally)
   - [Web Deployment Options](#4-web-deployment-options)
8. [Cross-Platform Execution (Mobile & Desktop)](#-cross-platform-execution-mobile--desktop)
   - [Windows Desktop](#windows-desktop)
   - [Android Emulator & Physical Device](#android-emulator--physical-device)
   - [iOS Simulator & Device](#ios-simulator--device)
9. [Automated & Penetration Testing](#-automated--penetration-testing)
   - [Backend Automated Test Suites (16 Suites)](#backend-automated-test-suites-16-suites)
   - [Backend Penetration Security Suite (42 Tests)](#backend-penetration-security-suite-42--42-pass)
   - [Frontend Widget & Unit Test Suites (19 Suites - 87 Tests)](#frontend-widget--unit-test-suites-19-suites---87-tests)
10. [Reviewer Quickstart & Walkthrough Guide](#-reviewer-quickstart--walkthrough-guide)
    - [Quickstart in 3 Steps](#quickstart-in-3-steps)
    - [Full Evaluation Walkthrough](#full-evaluation-walkthrough)
    - [Review & Demonstration Checklist](#review--demonstration-checklist)

---

## 🎯 Project Overview & The Situation

### The Situation & Motivation
To make the messaging application even more accessible and convenient, the **Mobile Messenger** system was expanded into **Web Messenger**. Users can now access their conversations, contacts, and media seamlessly from any computer browser without installing native binaries, while preserving full data confidentiality and security.

### Unified Codebase & Database Architecture
Flutter's multi-platform capabilities enable **Web Messenger** and **Mobile Messenger** to share a **single codebase** and **single database schema**:
- **Single Client Codebase**: All business logic, state management, HTTP/WebSocket network layers, and Material 3 UI widgets reside in `frontend/lib/`. Adaptive widgets automatically adjust layout based on screen width breakpoints ($\ge 768\text{px}$ desktop master–detail layout vs. $< 768\text{px}$ mobile stacked layout).
- **Single Backend & Database**: The NestJS server (`backend/`) and PostgreSQL database serve both mobile and web clients through the same REST API endpoints (`/api/*`) and real-time Socket.IO gateway (`/messenger`).

### Expected Outcomes
- ✅ **Web Accessibility**: Runs natively in any modern browser (Chrome, Edge, Firefox, Safari) and is ready for cloud deployment.
- ✅ **Complete Data Encryption**: Sensitive fields and media files are encrypted at rest using AES-256-GCM.
- ✅ **Individual & Group Chats**: Seamless communication with 1-on-1 contacts and multi-user group chats.
- ✅ **In-Chat Message Search**: Instant server-side search across encrypted message history with highlight navigation.
- ✅ **Resilient Error Recovery**: Robust feedback on disconnections or API errors with automatic reconnection.
- ✅ **Multi-Panel Split Views & Polls**: Side-by-side chat panels on wide screens and interactive polls for group decisions.

---

## ✨ Key Features

### 1. Web Messenger Core Innovations

- **🖥️ Responsive Adaptive UI for Web**:
  - Breakpoint-aware layout: Wide displays ($\ge 768\text{px}$) render a **master–detail side-by-side view** (chat list sidebar ~350px alongside active conversation panel), while compact screens ($< 768\text{px}$) maintain stacked mobile-friendly navigation.
  - Desktop keyboard shortcuts: Press <kbd>Enter</kbd> to send messages and <kbd>Shift</kbd> + <kbd>Enter</kbd> to insert a newline in the input bar.
  - Web-safe storage: Replaces mobile-only secure storage with cross-platform persistent storage (`shared_preferences`).
  - Web-safe media processing: Direct memory buffer streaming (`Uint8List`) replacing `dart:io` `File` references.

- **👥 Group Chats**:
  - Create group chats with custom group names, optional group avatars, and multiple initial participants.
  - Group invitation lifecycle: Send invitations, view pending invites in Sent/Received tabs, and accept or decline.
  - Multi-user real-time broadcast: Real-time message dispatch to all group members simultaneously.
  - Group roles & administration: Role tracking (`owner`, `admin`, `member`), group settings management, and safe "Leave group" action with automated ownership transfer.

- **🔍 In-Chat Message Search**:
  - Full-text search across individual and group chat message history.
  - Server-side decrypted search (`GET /api/chats/:id/messages/search?q=<query>`) preserving database encryption at rest.
  - Search overlay with in-chat highlight markers for matching text fragments.
  - Interactive navigation: Up/down arrows to cycle through matches with a dynamic match counter (*"3 of 12"*).

- **🛡️ Resilient Error Handling & State Recovery**:
  - Non-blocking visual feedback (Material SnackBars and inline alert banners) on network interruptions or API failures.
  - Auto-reconnect with exponential backoff (1s, 2s, 4s, up to 30s) on WebSocket disconnection.
  - Prominent top-of-screen status banner: *"Offline — Reconnecting…"*.
  - Manual retry action button on failed message bubbles.
  - Automatic fallback preventing blank screens and returning the user to the last stable state.

### 2. Extra Web Requirements

- **📊 Group Chat Polls**:
  - Create interactive polls inside group chats with custom question text and $\ge 2$ configurable options.
  - Voting modes: Support for both **anonymous** and **public** voter visibility.
  - Real-time vote counts and percentage progress bars.
  - Flexibility to change or retract votes, and poll closure controls for creators.

- **🪟 Multi-Panel Chat Screens**:
  - Support for opening **at least 2 chats simultaneously** on the same web page.
  - On wide desktop displays ($\ge 1200\text{px}$), the interface supports dual-panel split layouts or tabbed/tiled chat views.
  - State isolation: Each active chat panel maintains its own independent message feed, scroll position, and WebSocket listeners.

### 3. Inherited Base Features (from Mobile Messenger)

- **🔐 Registration & Authentication**:
  - Email, username, and password registration with duplicate prevention (`409 Conflict`).
  - Real-time dynamic password checklist ($\ge 8$ chars, uppercase, lowercase, digit, special character).
  - 6-digit OTP email verification (console simulation in dev, SMTP ready).
  - Dual JWT token architecture (15-minute access token + 30-day refresh token) with auto-login session persistence.
  - 2-step password recovery flow via OTP verification.

- **👤 User Profile & Encrypted Media**:
  - Profile customization: username, avatar picture, and encrypted "About me" bio.
  - Avatar uploads supporting JPEG/PNG up to 5MB with magic-bytes validation.
  - Media encrypted at rest on disk with AES-256-GCM and streamed through authenticated decryptor endpoints (`/api/media/stream/:id`).

- **🚫 User Blocking & Blacklist Management**:
  - User blocking and unblocking capabilities (`POST/DELETE /api/users/:id/block`).
  - Dedicated **Blocked Users Screen** for moderation.
  - Automatic filtering: blocked users cannot send chat messages or invitations.

- **🔍 Discovery & Contact Management**:
  - Debounced real-time user search by username or email.
  - Contact invitations: Send, Received/Sent tabs, Accept (creates chat), and Decline.

- **💬 Real-Time Messaging & Status Lifecycle**:
  - WebSocket transport via Socket.IO (`/messenger` namespace).
  - Status progression: `pending` $\rightarrow$ `sent` $\rightarrow$ `delivered` $\rightarrow$ `read` $\rightarrow$ `failed`.
  - Message editing with `(edited)` audit label and clean message deletion.
  - Typing indicators with 2.5s debounce and live presence indicators (green online dot).

- **🎙️ Voice Messages & Rich Media**:
  - In-chat voice memos with duration timer, playback controls, and speed selector (1.0x, 1.5x, 2.0x).
  - Image and video attachments up to 20MB with client-side compression.

- **📂 Chat Management**:
  - Active chat feed sorted descending by latest message activity.
  - Archive/unarchive conversations and per-chat notification mute toggles.

- **🌱 Database Seeding**:
  - Automated seeder using `@faker-js/faker` to generate 100+ realistic users with avatars, encrypted bios, and hashed credentials.

---

## 🔒 Architecture & Security

### Cryptographic Architecture (AES-256-GCM)

All sensitive data is protected using industry-standard authenticated encryption before writing to disk or database:

| Layer | Encrypted Entity | Algorithm | Implementation Details |
| :--- | :--- | :--- | :--- |
| **Database** | Chat messages (`content_encrypted`) | AES-256-GCM | 96-bit random IV + 128-bit authentication tag stored in JSON payload |
| **Database** | Profile bio (`about_encrypted`) | AES-256-GCM | Encrypted using `MASTER_ENCRYPTION_KEY` |
| **Database** | Poll question & options | AES-256-GCM | Field-level encryption before persistence |
| **Disk Storage** | Avatars & Chat Media | AES-256-GCM | Binary encryption at rest; streamed via `/api/media/stream/:id` |
| **Credentials** | Passwords | bcrypt (cost 12) | Salted one-way hash; never exposed in plaintext or API responses |
| **Verification** | Email OTP & Reset Codes | SHA-256 | Hashed before persistence, validated in constant time |

### Web-Safe Platform Adaptation Layer

To maintain a single codebase between web and mobile:
- **`kIsWeb` Guarding**: Core utilities detect the web execution context without crashing on missing native libraries.
- **No `dart:io` on Web**: Files and streams use `Uint8List` byte buffers and browser-compatible packages (`file_selector`, `http`, `shared_preferences`).
- **Universal Storage**: Replaced mobile-specific secure storage with `shared_preferences` across all target platforms.
- **CORS-Compliant Backend**: NestJS backend allows browser requests with credentials enabled (`origin: true`, `credentials: true`).

### Authentication & JWT Session Lifecycle

```
[ Browser / Client ]                                    [ NestJS Backend ]
        |                                                        |
        |--- 1. POST /api/auth/login { username, password } ---->|
        |<-- 2. Return { accessToken (15m), refreshToken (30d) } -|
        |                                                        |
        |--- 3. Store tokens in shared_preferences -------------->|
        |                                                        |
        |--- 4. WebSocket connect with auth token --------------->|
        |<-- 5. Socket authenticated (/messenger) ---------------|
        |                                                        |
        |--- 6. Access token expires (401 Unauthorized) -------->|
        |--- 7. POST /api/auth/refresh { refreshToken } -------->|
        |<-- 8. Return fresh accessToken ------------------------|
```

---

## 📁 Project Structure

The project maintains the robust, modular base structure established in the Mobile Messenger project, organized into separate `backend/`, `frontend/`, and `docs/` directories:

### Directory Tree

```text
web-messenger/
├── .env                       # Backend environment credentials (never committed)
├── .gitignore                 # Protected git ignore rules
├── docker-compose.yml         # Containerized PostgreSQL + NestJS Backend
├── README.md                  # Comprehensive project documentation
│
├── backend/                   # NestJS Backend API & WebSocket Server
│   ├── Dockerfile             # Production container build
│   ├── package.json           # Dependencies (NestJS, Socket.IO, pg, bcrypt, faker)
│   ├── tsconfig.json          # TypeScript compiler configuration
│   ├── .env.example           # Template for backend environment variables
│   ├── src/
│   │   ├── main.ts            # Entrypoint (global /api prefix, CORS for web)
│   │   ├── app.module.ts      # Root NestJS module
│   │   ├── auth/              # Registration, Login, OTP, Recovery, JWT Guard
│   │   ├── chats/             # Chats, Messages, In-Chat Search, Archive, Mute
│   │   ├── groups/            # Group chats & member management controller
│   │   ├── common/            # Global exception filters & interceptors
│   │   ├── crypto/            # AES-256-GCM buffer & field encryption service
│   │   ├── faker/             # Mock data generator & database seeder (seed.ts)
│   │   ├── gateway/           # Socket.IO WebSocket gateway & presence
│   │   ├── invitations/       # Contact invitation system (send, accept, decline)
│   │   ├── media/             # Encrypted file upload & streaming decryptor
│   │   ├── notifications/     # Notification service (FCM push / mock mode)
│   │   ├── store/             # PostgreSQL persistence layer (Facade Design Pattern)
│   │   │   ├── database.ts    # Schema initialization & table creation
│   │   │   ├── store.service.ts # Central store facade
│   │   │   ├── auth.store.ts  # Auth facade (tokens, verification, password)
│   │   │   ├── auth/          # Submodules: auth-tokens, auth-verification, auth-password
│   │   │   ├── chats.store.ts # Chats facade (conversations, messages, groups, polls)
│   │   │   ├── chats/         # Submodules: chat-conversations, chat-messages, chat-groups, chat-polls
│   │   │   ├── invitations.store.ts # Invitations facade (queries, actions)
│   │   │   ├── invitations/   # Submodules: invitation-queries, invitation-actions
│   │   │   ├── users.store.ts # Users facade (profile, search, blocking)
│   │   │   └── users/         # Submodules: user-profile, user-search, user-blocking
│   │   └── users/             # Profile, avatar, search, blocking & blacklist
│   └── test/                  # 16 Automated Test Suites + Penetration Security Suite
│       ├── penetration.spec.ts # Comprehensive P1–P8 security suite (42 tests)
│       └── ...
│
├── frontend/                  # Flutter Client Application (Web, Desktop, Mobile)
│   ├── pubspec.yaml           # Flutter dependencies (http, socket_io_client, etc.)
│   ├── lib/
│   │   ├── main.dart          # Entrypoint & error boundary handlers
│   │   ├── app/               # MaterialApp, theme & SessionGate
│   │   │   ├── app.dart       # MaterialApp configuration ('Web Messenger')
│   │   │   └── session_gate.dart # Authentication & session router
│   │   ├── core/              # Core utilities, constants, network & services
│   │   │   ├── constants/     # API endpoints & dart-define base URL
│   │   │   ├── network/       # HTTP API Client with tunnel/proxy support
│   │   │   ├── services/      # Notification service & connectivity monitors
│   │   │   ├── widgets/       # ConnectivityBanner (offline status indicator)
│   │   │   └── auth_validator.dart # Password checklist & email validation
│   │   └── features/
│   │       ├── auth/          # Login, Register, OTP verify, Password recovery
│   │       ├── chats/         # Multi-panel chat, search, voice memos & polls
│   │       │   ├── controllers/ # ChatSocketController, ChatPresenceController, HomeSocketController
│   │       │   ├── screens/   # HomeScreen, ChatScreen, ResponsiveShell (Dual Panel)
│   │       │   ├── services/  # ChatService, ChatAudioRecorder
│   │       │   └── widgets/   # HomeAppBar, ChatListItem, ChatAppBar, ChatInputBar, PollBubble...
│   │       ├── groups/        # Group management & invitation UI
│   │       │   ├── screens/   # CreateGroupScreen, GroupInfoScreen
│   │       │   └── services/  # GroupService (invite, leave, members)
│   │       ├── invitations/   # Pending invites (Received, Sent, Groups tabs)
│   │       ├── profile/       # Profile edit, avatar picker, Blocked Users Screen
│   │       └── search/        # Debounced user discovery delegate
│   ├── web/                   # Web-specific assets, index.html & manifest
│   ├── windows/               # Windows native desktop runner
│   ├── android/               # Android native runner
│   └── test/                  # 19 Widget and Unit Test Suites (87/87 tests passed)
└── uploads/                   # AES-256-GCM encrypted media files at rest
```

### Backend Architecture (NestJS & Facade Pattern)

To ensure high maintainability, testability, and separation of concerns, the backend persistence layer (`backend/src/store/`) implements the **Facade Design Pattern**:
- **`AuthStore`**: Coordinates token generation, email OTP verification, and password resets by delegating to `AuthTokensStore`, `AuthVerificationStore`, and `AuthPasswordStore`.
- **`ChatsStore`**: Coordinates conversation life-cycles, message history/search, group chat memberships/invites, and polls by delegating to `ChatConversationsStore`, `ChatMessagesStore`, `ChatGroupsStore`, and `ChatPollsStore`.
- **`InvitationsStore`**: Coordinates relationship queries and accept/decline actions via `InvitationQueriesStore` and `InvitationActionsStore`.
- **`UsersStore`**: Coordinates user profiles, directory searches, and user blocking/blacklist moderation via `UserProfileStore`, `UserSearchStore`, and `UserBlockingStore`.

All controllers interact exclusively with the unified facades, allowing database queries to scale independently without polluting business controllers.

### Frontend Architecture (Flutter & Modular Decoupling)

The Flutter web frontend utilizes clean, decoupled architecture separating presentation widgets, reactive controllers, and HTTP/WebSocket network services:
- **Modular Controllers**:
  - `ChatSocketController`: Encapsulates Socket.IO event listeners for real-time messages, delivery status updates, typing indicators, and message edits/deletions.
  - `ChatPresenceController`: Handles user online/offline presence pinging and active conversation state.
  - `HomeSocketController`: Manages user room subscriptions, reconnection backoff, and reactive updates for chat deletions, group member changes, and contact invitations.
- **Dedicated Components**:
  - `HomeAppBar`: Encapsulates archive toggling, invitation notifications, profile access, and logout.
  - `ChatListItem`: Encapsulates swipe-to-delete gestures (`Dismissible`), 1500ms long-press interactions, avatar online badges, and message status ticks.
  - `ChatAppBar`: Encapsulates partner/group information, real-time typing indicators, and header actions.
  - `ChatInputBar`: Handles text inputs, desktop keyboard shortcuts (<kbd>Enter</kbd> / <kbd>Shift</kbd>+<kbd>Enter</kbd>), attachments, and audio recorder triggers.
  - `ConnectivityBanner`: Real-time network banner indicating connection loss and automated recovery.

---

## ⚙️ Prerequisites & Environment Configuration

### Prerequisites
- **Node.js**: $\ge 18$ (Node 20+ LTS recommended)
- **PostgreSQL**: $\ge 14$ (or Docker Desktop)
- **Flutter SDK**: $\ge 3.24.0$ with Dart $\ge 3.4.0$
- **Google Chrome / Microsoft Edge**: For web execution and debugging
- **Docker Desktop**: (Optional, for containerized one-command execution)

---

### Environment Variables Reference (`backend/.env`)

Create or update `backend/.env` with the following parameters:

```env
# Server & Network Configuration
PORT=3000
NODE_ENV=development
API_PREFIX=/api
BACKEND_URL=http://localhost:3000
CORS_ORIGIN=*

# PostgreSQL Database Configuration
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=mobile_messenger_db
DATABASE_URL=postgresql://postgres:your_postgres_password@localhost:5432/mobile_messenger_db

# Client & Gateway Endpoints
API_URL=http://localhost:3000
SOCKET_URL=http://localhost:3000/messenger

# Security & Authentication (JWT & Password Hashing)
JWT_SECRET=web_messenger_jwt_access_secret_key_2026_super_secure
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=web_messenger_jwt_refresh_secret_key_2026_super_secure
JWT_REFRESH_EXPIRES_IN=30d
BCRYPT_SALT_ROUNDS=12
OTP_EXPIRATION_MINUTES=15

# AES-256-GCM Encryption Key (Must be 32 bytes in hex = 64 characters)
MASTER_ENCRYPTION_KEY=a7f2e1c94b38d05e2f6a89c41d7e35b0c8491f2e6d3a5b7c8e9f0123456789ab
ENCRYPTION_ALGORITHM=aes-256-gcm

# Media Storage Configuration
UPLOAD_DIR=./uploads
MAX_AVATAR_SIZE_BYTES=5242880
MAX_MEDIA_SIZE_BYTES=20971520

# Email & Verification Configuration
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=no-reply@messenger.com
DEV_EMAIL_SIMULATION=true

# Database Seeding Configuration
FAKER_COUNT=100
```

---

### Database Seeding Configuration

To populate your database with test users:
- Set `FAKER_COUNT=100` (or your desired number) in `backend/.env`.
- Run the seeder (see [Database Seeding](#database-seeding-npm-run-seed)).
- Pass `--force` to force re-seeding even if the database already contains users.

---

## 🚀 Backend Deployment

### Option A: One-Command Docker Setup (Recommended)

Requires only [Docker Desktop](https://www.docker.com/products/docker-desktop/). No manual Node.js or PostgreSQL installation needed.

1. Open a terminal in the root directory:
   ```bash
   docker compose up --build -d
   ```
2. Verify both containers (`mobile-messenger-postgres` and `mobile-messenger-backend`) are healthy:
   ```bash
   docker compose ps
   ```
3. Test backend health:
   ```bash
   curl.exe -i http://localhost:3000/api/auth/me
   # Expected response: HTTP/1.1 401 Unauthorized
   ```
4. View real-time logs (e.g. to inspect OTP codes):
   ```bash
   docker compose logs -f backend
   ```
5. Stop services:
   ```bash
   docker compose down
   ```

---

### Option B: Local Node.js & PostgreSQL Setup

1. **Start PostgreSQL**:
   Ensure PostgreSQL is running locally on port `5432` with database `mobile_messenger_db`.
2. **Install & Build Backend**:
   ```bash
   cd backend
   npm install --legacy-peer-deps
   npm run build
   ```
3. **Start the Server**:
   ```bash
   npm run start:dev
   # Or for production:
   npm start
   ```
4. Confirm terminal output:
   ```text
   Backend server is running on port 3000
   ```

---

### Database Seeding (`npm run seed`)

Populate your database with realistic mock users and contacts:
```bash
cd backend
# Check if DB is empty; if so, populate with FAKER_COUNT users (default 100):
npm run seed

# Or force generate users regardless of existing records:
npm run seed -- --force
```

Each generated user includes:
- Username, first/last name, email.
- Pre-hashed password adhering to strength criteria.
- AES-256-GCM encrypted bio ("About me").
- Avatar image placeholder.

---

## 🌐 Running & Deploying Frontend on Web

Navigate to the `frontend/` directory:
```bash
cd frontend
flutter pub get
```

### 1. Running in Development Mode (Google Chrome / Edge)

Launch Web Messenger directly in your browser with hot reload:

```bash
flutter run -d chrome --dart-define=API_URL=http://localhost:3000
```

To run on Microsoft Edge:
```bash
flutter run -d edge --dart-define=API_URL=http://localhost:3000
```

> [!TIP]
> If your backend is running on a different port or a remote URL, update `--dart-define=API_URL=<YOUR_BACKEND_URL>`.

---

### 2. Building for Production

Compile an optimized, minified production web bundle:

```bash
cd frontend
flutter build web --release --dart-define=API_URL=https://your-backend-domain.com
```

The resulting build is output to `frontend/build/web/`. It contains `index.html`, compiled WebAssembly/JavaScript assets, and static web resources ready for hosting.

---

### 3. Testing the Production Web Build Locally

You can test the release web bundle locally using any lightweight HTTP server:

- **Using Node.js `serve`**:
  ```bash
  npx serve frontend/build/web -p 8080
  ```
- **Using Python**:
  ```bash
  python -m http.server --directory frontend/build/web 8080
  ```

Open your browser at `http://localhost:8080` to interact with the production build.

---

### 4. Web Deployment Options

The static output directory `frontend/build/web` can be hosted on any web platform:

#### Option 1: GitHub Pages
1. Install `gh-pages` or use a GitHub Actions workflow:
   ```bash
   cd frontend
   flutter build web --release --base-href "/web-messenger/" --dart-define=API_URL=https://your-backend.com
   npx gh-pages -d build/web
   ```
2. Set repository settings $\rightarrow$ Pages $\rightarrow$ Source: `gh-pages` branch.

#### Option 2: Vercel
1. Install Vercel CLI: `npm install -g vercel`.
2. Deploy the `frontend/build/web` folder:
   ```bash
   vercel frontend/build/web --prod
   ```

#### Option 3: Firebase Hosting
1. Initialize Firebase Hosting in the project:
   ```bash
   firebase init hosting
   ```
   Specify `frontend/build/web` as the public directory and configure as a single-page app (rewrite all URLs to `/index.html`).
2. Deploy:
   ```bash
   firebase deploy --only hosting
   ```

#### Option 4: Containerized Nginx (Docker)
A minimal `nginx.conf` with SPA routing:
```nginx
server {
    listen 80;
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```
Mount `frontend/build/web` into `/usr/share/nginx/html`.

---

## 💻 Cross-Platform Execution (Mobile & Desktop)

Because Web Messenger shares a single Flutter codebase with the mobile and desktop builds, you can also run it natively on other platforms:

### Windows Desktop
Run natively on Windows with hardware acceleration:
```bash
cd frontend
flutter run -d windows --dart-define=API_URL=http://localhost:3000
```

### Android Emulator & Physical Device
- **Android Emulator**:
  ```bash
  flutter run --dart-define=API_URL=http://10.0.2.2:3000
  ```
- **Physical Device**:
  ```bash
  flutter run -d <DEVICE_ID> --dart-define=API_URL=http://<YOUR_LOCAL_IP>:3000
  ```

### iOS Simulator & Device
```bash
open -a Simulator
flutter run -d iPhone --dart-define=API_URL=http://localhost:3000
```

---

## 🧪 Automated & Penetration Testing

The project maintains comprehensive test suites verifying functionality, responsiveness, cryptographic security, and backend stability.

### Backend Automated Test Suites (16 Suites)
```bash
cd backend
npm test
```
Executes 16 sequential test suites (`--runInBand --forceExit`):
- `test/blocking.spec.ts`: User blocking, blacklist enforcement, and message rejection.
- `test/faker-data.spec.ts`: Mock users generator and database seeding integrity.
- `test/password.spec.ts`: Password strength criteria validator.
- `test/step5-auth.spec.ts`: Registration, bcrypt hashing, email OTP.
- `test/step6-session.spec.ts`: Session persistence, token refresh, logout.
- `test/step7-password-recovery.spec.ts`: Forgot password OTP & reset.
- `test/step8-profile.spec.ts`: Profile view, edit username, encrypted bio.
- `test/step9-avatar.spec.ts`: Avatar upload (JPEG/PNG $\le$ 5MB, AES-256-GCM disk encryption).
- `test/step10-search.spec.ts`: Search users by username & email.
- `test/step11-invitations.spec.ts`: Send, receive, accept, decline invitations.
- `test/step12-chats.spec.ts`: Chat list activity sorting, archive/mute, chat deletion.
- `test/step13-messages.spec.ts`: Message delivery & read receipts.
- `test/step14-edit-delete.spec.ts`: Edit & delete own messages, audit trail.
- `test/step15-typing.spec.ts`: Real-time WebSocket typing indicators & activity states.
- `test/step16-media.spec.ts`: Rich media upload $\le$ 20MB, streaming decrypt.
- `test/penetration.spec.ts`: Full security penetration suite (42 tests).

### Backend Penetration Security Suite (42 / 42 PASS)
```bash
cd backend
npm run test:pen
```
Verifies immunity against:
- **[P1] SQL Injection**: 14 tests across auth endpoints and search queries.
- **[P2] Authentication Bypass**: 5 tests preventing `alg=none`, forged secrets, refresh token tampering.
- **[P3] IDOR & Authorization**: Cross-user chat message isolation, profile modification guards, unauthorized archiving/deletion.
- **[P4] Sensitive Data Exposure**: Password hash, OTP, and stack trace leak prevention.
- **[P5] File Upload Vulnerabilities**: Blocked double extensions, ZIP bombs, SSRF / UNC paths.
- **[P6] Rate Limiting**: Brute-force mitigation on login and registration endpoints.
- **[P7] Cryptographic Standards**: Bcrypt `$2b$` format, AES-256-GCM format validation.
- **[P8] Session Management**: Access token 15m expiration, token revocation on logout.

### Frontend Widget & Unit Test Suites (19 Suites - 87 Tests)
```bash
cd frontend
flutter test
```
Executes 19 widget and unit test suites (87 of 87 tests passing):
- `chat_presence_display_test.dart`: Online/offline presence dot and status indicator.
- `notifications_service_test.dart`: Notification handling and suppression in active chats.
- `step12_swipe_delete_test.dart`: Conversation deletion with confirmation modal.
- `user_blocking_test.dart`: Block/unblock actions and blacklist moderation.
- `auth_validator_test.dart`: Password validator criteria.
- `step5_auth_widget_test.dart`: Registration UI, dynamic checklist & email verification dialog.
- `step6_session_persistence_test.dart`: Session persistence & logout flows.
- `step7_password_recovery_test.dart`: Password recovery screens & forms.
- `step8_step9_profile_test.dart`: Profile navigation & avatar upload triggers.
- `step10_user_search_test.dart`: User discovery & relationship actions.
- `step11_invitations_test.dart`: Invitations screen (Received & Sent tabs).
- `step12_chat_list_archiving_test.dart`: Chat feed activity sorting & archiving.
- `step13_step14_messaging_test.dart`: Bubble status indicators, clean deletion, edit actions.
- `step15_typing_indicators_test.dart`: Animated typing cues in chat header.
- `step16_rich_media_test.dart`: Media attachment actions.
- `step17_audio_and_extras_test.dart`: Audio recorder, playback speed toggles & offline banners.
- `step18_media_upload_platform_test.dart`: Platform-specific media selection and upload handlers.
- `create_group_test.dart`: Group creation contact requirement and input validation.
- `chat_input_bar_test.dart`: Keyboard shortcuts (<kbd>Enter</kbd> / <kbd>Shift</kbd>+<kbd>Enter</kbd>), text input, and message submission.

---

## 👨‍💻 Reviewer Quickstart & Walkthrough Guide

### Quickstart in 3 Steps

1. **Launch the Backend (Docker)**:
   ```bash
   docker compose up -d
   ```
   Backend will be accessible at `http://localhost:3000`.

2. *(Optional)* **Seed 100 Test Users**:
   ```bash
   cd backend && npm run seed
   ```

3. **Launch Web Messenger in Chrome**:
   ```bash
   cd frontend
   flutter run -d chrome --dart-define=API_URL=http://localhost:3000
   ```

---

### Full Evaluation Walkthrough

Follow these steps to experience and verify the complete Web Messenger lifecycle:

1. **User Registration & Real-Time Password Checklist**:
   - In Chrome, click **"Create account"**.
   - Enter username (e.g. `web_reviewer`), email (`reviewer@messenger.com`), and password.
   - Notice the **dynamic real-time checklist** dynamically turning requirements green ($\ge 8$ chars, lowercase, uppercase, digit, special character).
   - Click **Register**.

2. **6-Digit OTP Email Verification**:
   - The app transitions to the **Verify Email** view.
   - Check the backend terminal console (or `docker compose logs backend`) for the log:
     ```text
     [AUTH] Verification code for reviewer@messenger.com: XXXXXX
     ```
   - Enter the 6-digit code and click **Verify Email**.
   - The user is authenticated, tokens are saved to `shared_preferences`, and the app navigates to the responsive **HomeScreen**.

3. **Desktop Master–Detail Layout Inspection**:
   - On a standard browser window ($\ge 768\text{px}$), observe the desktop layout:
     - The **chat list sidebar** appears on the left (~350px width).
     - The **detail area** occupies the remaining viewport.
   - Resize the browser window to $< 768\text{px}$ to observe automatic adaptation to a single-column mobile view.

4. **User Profile & Encrypted Avatar Upload**:
   - Open the **Profile** section.
   - Click the avatar upload button to select an image from your computer.
   - Update your "About me" bio.
   - Both the avatar (on disk) and bio (in PostgreSQL) are saved encrypted with **AES-256-GCM**.

5. **User Search & Invitations**:
   - Click the search icon in the sidebar.
   - Search for a seeded user (e.g., from `npm run seed`) or another registered account.
   - View their profile modal and click **Send Invitation**.
   - Open a secondary browser incognito window to log in as the recipient, open the **Invitations** screen, and click **Accept**.
   - An active chat room is instantly created and appears in both users' feeds.

6. **Real-Time Messaging & Status Lifecycle**:
   - Open the conversation in both browser windows side by side.
   - Start typing in one window; observe the live typing indicator in the other.
   - Press <kbd>Enter</kbd> to send a message; press <kbd>Shift</kbd> + <kbd>Enter</kbd> to insert a newline.
   - Watch the status progression: Sent ($\checkmark$) $\rightarrow$ Delivered ($\checkmark\checkmark$) $\rightarrow$ Read ($\checkmark\checkmark$ blue).
   - Edit a message: notice the inline `(edited)` label.
   - Delete a message: notice it disappears cleanly from both chat feeds.

7. **In-Chat Message Search**:
   - Click the search icon in the chat header.
   - Type a query into the search bar.
   - Matching messages are retrieved via `GET /api/chats/:id/messages/search?q=...` (decrypted server-side).
   - Use the up/down navigation arrows to cycle through matches; watch the counter update (*"1 of 3"*) and the message bubble scroll into view with highlighting.

8. **Voice Memos & Rich Media**:
   - Click the media attachment icon to send images or videos.
   - Play back audio messages; switch playback speed between 1.0x, 1.5x, and 2.0x.

9. **Resilient Error Recovery & Reconnection**:
   - Simulate a network disconnect by stopping the backend (`docker compose stop backend`) or disconnecting your internet.
   - Notice the prominent top banner: *"Offline — Reconnecting…"*.
   - Restart the backend (`docker compose start backend`).
   - The WebSocket gateway automatically reconnects with exponential backoff and returns to the stable active state without requiring a page reload.

---

### Review & Demonstration Checklist

| Requirement / Deliverable | Status | Verification Reference |
| :--- | :---: | :--- |
| **Flutter Web Application** | ✅ Done | Compiles with `flutter build web`, runs in Chrome/Edge |
| **Deployable to Web Platform** | ✅ Done | Build output in `frontend/build/web/` compatible with GitHub Pages, Vercel, Firebase |
| **Single Shared Codebase & DB** | ✅ Done | Shared models, logic, and PostgreSQL schema between web and mobile |
| **Responsive UI Adaptation** | ✅ Done | Master–detail split on desktop ($\ge 768\text{px}$), mobile layout on $< 768\text{px}$ |
| **Group Chats & Invitations** | ✅ Done | Group creation, member roles, invite lifecycle, broadcast messaging |
| **In-Chat Message Search** | ✅ Done | Search endpoint, match highlights, match counter, up/down navigation |
| **Error Handling & Resilience** | ✅ Done | Reconnection banner, exponential backoff, retry button, non-blocking feedback |
| **Group Chat Polls** | ✅ Done | Interactive voting, anonymous/public modes, real-time result bars |
| **Multi-Panel Chat Screens** | ✅ Done | Dual-panel / split view for opening $\ge 2$ chats simultaneously |
| **AES-256-GCM Field Encryption** | ✅ Done | Encrypted at rest for messages, bios, and disk media |
| **Automated Testing** | ✅ Done | 16 Backend suites + 42 Penetration tests + 19 Frontend suites (87/87 tests passed) |
