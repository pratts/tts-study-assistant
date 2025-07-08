# Frontend — TTS Study Assistant

Modern React web app for managing and listening to your notes.

## Requirements

- Node.js 18+
- npm or yarn

## Setup

1. **Install dependencies:**

   ```sh
   cd frontend
   npm install
   # or
   yarn install
   ```

2. **Configure environment variables:**

   - Copy `.env.example` to `.env` and set:
     - `VITE_API_URL` — URL of the backend API (e.g. `http://localhost:3000/api/v1`)

3. **Run locally:**

   ```sh
   npm run dev
   # or
   yarn dev
   ```

4. **Build for production:**

   ```sh
   npm run build
   # or
   yarn build
   ```

5. **Deploy:**
   - Recommended: [Vercel](https://vercel.com/)
   - Set `VITE_API_URL` in Vercel dashboard for production

## API Integration

- All API calls require pre-hashed (SHA-256) passwords.
- Handles JWT/refresh token logic automatically.
