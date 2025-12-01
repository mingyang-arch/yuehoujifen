# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**阅后即焚 (yuehoujifen)** - A minimalist one-time secret sharing web application. Users can input secret content (passwords, private messages, etc.) and generate a one-time link. Once the content is accessed, it's immediately destroyed on the server.

## Development Commands

```bash
# Install dependencies
npm install

# Start production server
npm start

# Start development server with auto-reload
npm run dev
```

Server runs on `http://localhost:3000` by default.

## Architecture

### Backend (server.js)
- **Framework**: Express.js
- **Storage**: In-memory Map (production should use Redis)
- **ID Generation**: nanoid for generating unique 10-character IDs
- **Key Routes**:
  - `POST /api/secret` - Create new secret, returns one-time URL
  - `GET /api/secret/:id` - Retrieve and immediately delete secret
  - `GET /s/:id` - View page for secrets
  - `GET /` - Main homepage

### Storage Logic
- Secrets stored in `Map` with structure: `{ content: string, createdAt: Date }`
- One-time access: Secret deleted immediately after retrieval (`secrets.delete(id)`)
- Auto-cleanup: Interval runs hourly to remove secrets older than 24 hours
- Unique IDs: nanoid(10) generates URL-safe identifiers

### Frontend
- **public/index.html**: Main page for creating secrets
  - Single textarea input
  - Generate button creates secret via POST /api/secret
  - Displays one-time link with copy functionality
- **public/view.html**: Secret viewing page
  - Automatically loads secret on page load
  - Displays content once, then shows destruction warning
  - Gracefully handles already-accessed or non-existent secrets

### Key Features
- One-time access enforcement at API level
- 24-hour expiration for unread secrets
- Gradient purple design theme (#667eea to #764ba2)
- Copy to clipboard functionality
- Mobile-responsive design

## Important Notes

- Current implementation uses in-memory storage - data lost on server restart
- No authentication - anyone can create secrets
- No rate limiting implemented
- Content length limited to 10,000 characters (client-side)
- For production: Consider Redis, HTTPS, rate limiting, and proper logging
