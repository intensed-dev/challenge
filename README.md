# Challenge

Minecraft drawing challenge for two or more players.

## Pages
- `/` — player entry and drawing canvas
- `/admin/` — admin dashboard, timer, live submissions, review and duel scores
- `/results/` — public results after publication

## Backend setup (Cloudflare)

The frontend is static and can be hosted with GitHub Pages. Shared sessions, images and timer state require a Cloudflare Worker, D1 database and R2 bucket.

1. Create a D1 database named `challenge`.
2. Create an R2 bucket named `challenge-drawings`.
3. In the Cloudflare dashboard, open the D1 database and execute `api/schema.sql`.
4. Replace `REPLACE_WITH_D1_DATABASE_ID` in `api/wrangler.toml` with the D1 database ID.
5. Create a Worker using `api/worker.js`; configure the D1 binding `DB` and R2 binding `DRAWINGS` as shown in `api/wrangler.toml`.
6. Add the Worker secret `ADMIN_SECRET` in Worker Settings → Variables and Secrets. Use a long, private value.
7. Deploy the Worker and copy its URL into `src/js/config.js` as `API_URL`.
8. Enable GitHub Pages for this repository (Deploy from branch: `main`, folder: `/`).

## How a round works

- Admin creates a round and shares the code.
- Players join and select an item by ID or name. Suggestions and icons come from BlocksItems.
- Players draw the item **and its quantity on the canvas**. There is no quantity input.
- Admin starts the five-minute timer, then ends the drawing phase.
- An external person guesses each drawing; admin records only correct/incorrect.
- Admin records both players' mob kills after the 30-minute duel and publishes the results.

## Notes
- The default BlocksItems API version and Minecraft version are configured in `src/js/config.js`.
- The timer is controlled by the server, so all clients see the same remaining time.
- Drawing images are stored in the R2 bucket; D1 stores metadata and review decisions.
- Configure a custom domain / CORS allowlist before using this publicly. The current Worker returns permissive CORS headers for simple GitHub Pages deployment.
