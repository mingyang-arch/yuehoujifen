# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**阅后即焚 (yuehoujifen)** - A one-time secret sharing web application with end-to-end encryption. Users create encrypted secrets with configurable expiration and view limits. Content is encrypted client-side before transmission; the server never sees plaintext.

## Development Commands

```bash
npm install      # Install dependencies
npm start        # Production server
npm run dev      # Development with auto-reload (nodemon)
```

Server runs on `http://localhost:3000`.

## Architecture

### End-to-End Encryption Flow

**Creating a secret:**
1. Client generates 32-byte random master key
2. Client encrypts content with AES-256-GCM
3. If password protected: PBKDF2 derives key from password, XORs with master key
4. Ciphertext + IV + salt sent to server; master key stored in URL hash fragment
5. Full URL: `https://host/s/{id}#{base64url-encoded-master-key}`

**Viewing a secret:**
1. Client extracts master key from URL hash (never sent to server)
2. Fetches metadata via `GET /api/secret/:id/meta` (checks password requirement)
3. Fetches ciphertext via `POST /api/secret/:id/view` (with password hash if needed)
4. Decrypts locally using master key + optional password

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/secret` | POST | Create secret (ciphertext, iv, salt, passwordHash, expiresIn, maxViews) |
| `/api/secret/:id/meta` | GET | Get metadata (hasPassword, expiresAt, remainingViews) |
| `/api/secret/:id/view` | POST | Retrieve and consume view (returns ciphertext for decryption) |

### Key Files

- **server.js** - Express backend with rate limiting (express-rate-limit), validation (express-validator), bcrypt password verification
- **public/js/crypto.js** - Client-side AES-256-GCM encryption using Web Crypto API
- **public/index.html** - Creation UI (expiry selector, view count, password toggle)
- **public/view.html** - Viewing UI (password input, countdown timer, destroy animation)

### Storage Model

```javascript
secrets.set(id, {
  ciphertext,           // Base64 encrypted content
  iv,                   // Base64 initialization vector
  salt,                 // Base64 salt (if password protected)
  passwordHash,         // bcrypt hash of SHA-256(password)
  expiresAt,            // Date object
  maxViews,             // 1-10
  viewCount             // Current count
});
```

### Rate Limits

- Create: 30 requests/hour per IP
- View: 60 requests/minute per IP

## Security Notes

- Server stores only ciphertext; decryption requires URL hash fragment
- Password hashed twice: SHA-256 client-side, bcrypt server-side
- In-memory storage loses data on restart; production should use Redis
