# ShipLog roadmap

- [x] Phase 1: auth, tables with RLS, main log screen (date picker, note, autosave, past entries), settings (GitHub connection, timezone, week start)
- [x] Phase 2: GitHub sync (7 activity types, rate limits, dedupe), nightly job 11:30 pm IST, activity panel + Sync button
- [x] Phase 3: AI work items (generate, review, approve/edit/reject, impact follow-up), stats cards, reports (standup, weekly, brag) with copy/download/Slack and history
- [x] Final checks: no secrets in browser bundle, token never readable, no duplicate sync rows, users isolated, demo data button
- [x] Visual style: match the Wispr Flow reference (cream background, serif italic headlines, lavender buttons, deep green accents, pill tabs)
- [x] Optional weekly report email via Gmail (Settings switch, send now button)
- [ ] Live GitHub sync against a real account: waiting on a real token from Rishi
- [x] Insights dashboard: contribution heatmap, category mix over time, review-to-code ratio, busiest repos, streak
- [x] Calendar import: Google Calendar meetings feed the standup (built; first real connect needs Rishi to sign in with Google)
- [x] Shareable read-only report link: signed, expiring, no login
