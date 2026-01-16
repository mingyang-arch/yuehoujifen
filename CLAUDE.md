# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**阅后即焚 (yuehoujifen)** - A one-time secret sharing web application with end-to-end encryption. Users create encrypted secrets (text, images, or both) with configurable expiration and view limits. Content is encrypted client-side before transmission; the server never sees plaintext.

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

Metadata structure by content type:
- **text**: `{ type: "text" }` — content bytes are the text
- **image**: `{ type: "image", fileName, mimeType }` — content bytes are the image
- **mixed**: `{ type: "mixed", text: "...", fileName, mimeType }` — text stored in metadata, content bytes are the image

**Creating a secret:**
1. Client generates 32-byte random master key
2. Client encrypts content with AES-256-GCM
3. If password protected: PBKDF2 derives key from password, XORs with master key
4. Ciphertext + IV + salt + contentType sent to server; master key stored in URL hash fragment
5. Full URL: `https://host/s/{id}#{base64url-encoded-master-key}`

**Viewing a secret:**
1. Client extracts master key from URL hash (never sent to server)
2. Fetches metadata via `GET /api/secret/:id/meta`
3. Fetches ciphertext via `POST /api/secret/:id/view` (with password hash if needed)
4. Decrypts locally, parses metadata to determine content type
5. Displays text, image, or both based on content type

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/secret` | POST | Create secret (ciphertext, iv, salt, passwordHash, expiresIn, maxViews, contentType) |
| `/api/secret/:id/meta` | GET | Get metadata (hasPassword, expiresAt, remainingViews, contentType) |
| `/api/secret/:id/view` | POST | Retrieve and consume view (returns ciphertext, contentType for decryption) |

### Key Files

- **server.js** - Express backend with rate limiting, validation, bcrypt password verification
- **public/js/crypto.js** - Client-side AES-256-GCM encryption using Web Crypto API
- **public/index.html** - Creation UI: text input above, image upload below (both optional, at least one required)
- **public/view.html** - Viewing UI: displays text, image, or both depending on content type

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
  contentType           // 'text', 'image', or 'mixed'
});
```

### Crypto Module API

```javascript
// Unified encryption for text, images, or both
CryptoUtils.encryptContent({ text, file, password })
// Returns: { ciphertext, iv, salt, keyFragment, passwordHash, contentType }

// Unified decryption
CryptoUtils.decryptContent(ciphertext, iv, keyFragment, salt, password)
// Returns: { content: ArrayBuffer|string, text?: string, metadata: { type, fileName?, mimeType? } }
```

### Rate Limits

- Create: 30 requests/hour per IP
- View: 60 requests/minute per IP

### File Upload Constraints

- Supported formats: image/jpeg, image/png, image/gif, image/webp
- Max file size: 2MB

## Security Notes

- Server stores only ciphertext; decryption requires URL hash fragment
- Password hashed twice: SHA-256 client-side, bcrypt server-side
- File metadata (name, type) and text content encrypted together
- In-memory storage loses data on restart; production should use Redis
