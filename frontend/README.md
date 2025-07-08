# TTS Study Assistant Frontend

A modern, responsive notes app frontend for TTS Study Assistant, built with React, TypeScript, and Chakra UI. Matches the Chrome extension's color scheme and UX.

## Features

- Login & Registration (with secure token storage)
- Dashboard: stats, most recent note, domain-wise notes
- Notes list: domain, site, length, read time, copy/delete
- Profile: view/update user info, change password
- Logout
- Responsive, clean UI with blue gradient theme

## Stack

- React + TypeScript
- Chakra UI (easy to swap for Tailwind if preferred)
- React Router
- React Query (for API data)
- Web Speech API (for TTS)

## Structure

```
frontend/
  src/
    api/
      apiClient.ts
    components/
      Auth/
        LoginForm.tsx
        RegisterForm.tsx
      Dashboard/
        StatsCard.tsx
        RecentNote.tsx
        DomainTable.tsx
      Layout/
        Sidebar.tsx
        MainLayout.tsx
      Notes/
        NotesTable.tsx
      Profile/
        ProfileForm.tsx
    context/
      AuthContext.tsx
    pages/
      Home.tsx
      Dashboard.tsx
      Notes.tsx
      Profile.tsx
    theme/
      index.ts
    App.tsx
    index.tsx
  package.json
  tsconfig.json
  README.md
```

## Getting Started

1. `cd frontend`
2. `npm install`
3. `npm run dev`

## API URL

- Set the API URL in `src/api/apiClient.ts` or use an environment variable.

## Deployment

- Build with `npm run build` and deploy to Vercel, Netlify, or serve as static files from your Go backend.
