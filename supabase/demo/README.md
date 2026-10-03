# Demo data

`acme-demo.sql` creates "Acme Logistics (demo)": a fictional client reviewing the demo site
(`e2e/site`, deployed on its own origin), with two client reviewers, realistic feedback across
desktop, phone and the pricing page, replies, and AI triage queued.

Anchors were captured by clicking the real elements of the demo site, so every pin lands on its
element. Sign up on the deployed app first, set `v_email` and `v_site` at the top, then run the
file once in the Supabase SQL editor. Nothing here contains credentials.
