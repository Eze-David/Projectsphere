# ProjectSphere

Construction project management app (React + Vite + React Router).

## Supabase setup (logins + shared team data)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste in `supabase/migrations/20261015000000_init.sql`, and run it
   (or with the CLI: `supabase link --project-ref <ref>` then `supabase db push`).
3. Copy `.env.example` to `.env.local` and fill in the URL and anon/publishable key from **Project Settings → API**.
4. In **Authentication → URL Configuration**, set the Site URL to where the app runs
   (e.g. `http://localhost:5173` for development, your Vercel URL in production) so confirmation and reset emails link back correctly.
5. For deploys, add the same two `VITE_SUPABASE_*` variables to the host's environment settings.

Access model: you see a project only if you're a member. Whoever creates a project is its owner; owners invite people by
email on the Team page (people without an account get access automatically when they sign up with that email).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Structure

- `src/components/AppShell.jsx` — icon rail (Me, Projects, Reports, People, search) around every page
- `src/pages/projects.jsx` — projects list, and the project sidebar (switcher, task lists, views)
- `src/pages/tasks.jsx` — task board/table and the task editor (assignees, labels, progress, comments)
- `src/pages/planning.jsx` — Gantt and Calendar
- `src/pages/sections.jsx` — Overview, Milestones, Budget, RFIs, Daily logs, Team
- `src/pages/workspace.jsx` — My tasks, Reports, People (across all projects)
- `src/auth.jsx` — sign in / sign up / password reset, and the gate in front of the app
- `src/store.jsx` — project state: loads from Supabase, saves each change, live-refreshes on teammates' changes
- `src/db.js` — maps app objects ⇄ database rows; bulk import of sample/browser-saved projects
- `supabase/migrations/` — database schema, row-level security, invites, realtime
- `src/data/projects.js` — dropdown options, labels, and seed projects

When deploying, configure the host to serve `index.html` for all routes (SPA fallback).
