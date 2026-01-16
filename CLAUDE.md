# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**阅后即焚 (yuehoujifen)** - A one-time secret sharing web application with end-to-end encryption. Users create encrypted secrets (text or images) with configurable expiration and view limits. Content is encrypted client-side before transmission; the server never sees plaintext.

## Development Commands

```bash
npm install      # Install dependencies
npm start        # Production server
npm run dev      # Development with auto-reload (nodemon)
```

Server runs on `http://localhost:3000`.

## Architecture

### End-to-End Encryption Flow

**Data format for encryption:**
`[4-byte metadata length][JSON metadata][raw content]`

Metadata includes: `{ type: "text"|"image", fileName?, mimeType? }`

**Creating a secret:**
1. Client generates 32-byte random master key
2. Client encrypts content with AES-256-GCM (text or binary)
3. If password protected: PBKDF2 derives key from password, XORs with master key
4. Ciphertext + IV + salt + contentType sent to server; master key stored in URL hash fragment
5. Full URL: `https://host/s/{id}#{base64url-encoded-master-key}`

**Viewing a secret:**
1. Client extracts master key from URL hash (never sent to server)
2. Fetches metadata via `GET /api/secret/:id/meta`
3. Fetches ciphertext via `POST /api/secret/:id/view` (with password hash if needed)
4. Decrypts locally, parses metadata to determine content type
5. Displays text in textarea or image via Blob URL

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/secret` | POST | Create secret (ciphertext, iv, salt, passwordHash, expiresIn, maxViews, contentType) |
| `/api/secret/:id/meta` | GET | Get metadata (hasPassword, expiresAt, remainingViews, contentType) |
| `/api/secret/:id/view` | POST | Retrieve and consume view (returns ciphertext, contentType for decryption) |

### Key Files

- **server.js** - Express backend with rate limiting, validation, bcrypt password verification, 10MB payload limit
- **public/js/crypto.js** - Client-side AES-256-GCM encryption using Web Crypto API; supports text and binary (images)
- **public/index.html** - Creation UI with text/image tabs, drag-drop upload, expiry selector, password toggle
- **public/view.html** - Viewing UI with text/image display, download button, countdown timer, destroy animation

### Storage Model

```javascript
secrets.set(id, {
  ciphertext,           // Base64 encrypted content
  iv,                   // Base64 initialization vector
  salt,                 // Base64 salt (if password protected)
  passwordHash,         // bcrypt hash of SHA-256(password)
  expiresAt,            // Date object
  maxViews,             // 1-10
  viewCount,            // Current count
  contentType           // 'text' or 'image'
});
```

### Crypto Module API

```javascript
// Unified encryption for text and images
CryptoUtils.encryptContent(content, contentType, password)
// Returns: { ciphertext, iv, salt, keyFragment, passwordHash, contentType, fileName, mimeType }

// Unified decryption
CryptoUtils.decryptContent(ciphertext, iv, keyFragment, salt, password)
// Returns: { content: ArrayBuffer|string, metadata: { type, fileName?, mimeType? } }
```

### Rate Limits

- Create: 30 requests/hour per IP
- View: 60 requests/minute per IP

### File Upload Constraints

- Supported formats: image/jpeg, image/png, image/gif, image/webp
- Max file size: 10MB

## Security Notes

- Server stores only ciphertext; decryption requires URL hash fragment
- Password hashed twice: SHA-256 client-side, bcrypt server-side
- File metadata (name, type) encrypted along with content
- In-memory storage loses data on restart; production should use Redis
