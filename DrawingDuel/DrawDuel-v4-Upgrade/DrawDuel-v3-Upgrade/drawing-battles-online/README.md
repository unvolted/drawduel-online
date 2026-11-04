# Draw Duel v4 — player-written prompt exchange

Draw Duel is a drawing and flipbook-animation battle game for 2–8 online players, plus local two-player mode.

## New prompt exchange (every round)

1. The host starts a room, and everyone enters the **Write 3 Prompts** screen.
2. Each artist writes exactly **3 different drawing prompts**, each 4–90 characters.
3. When all players have submitted, the server randomly assigns one of the three prompts from **a different artist** to each player. No artist ever receives their own prompt. Each person also contributes exactly one selected challenge per round.
4. Each participant sees **only their own assigned challenge** during drawing. After the round, the voting screen reveals each finished drawing with its assigned prompt and author.
5. Each new round starts a **new three-prompt submission** phase.

Online submissions synchronize immediately, with private per-player input and a visible submission counter. The prompt-writing phase never starts the drawing timer. The host starts the timer when all assignments are ready.

Local two-player mode passes the device between players to write three prompts each, then assigns one from the other player. The existing drawing utilities, opacity slider, fill tool, flipbook mode, scoring, voting and exports are unchanged.

The original idea bank still provides an optional **Get three idea starters** button; participants can edit the suggestions before submitting. Landscapes and places are not in the built-in suggested prompts.

## Quick local launch

Node.js 20 or newer:

```bash
npm install
npm start
```

Open http://localhost:3000 in a browser. For the hosted game, you must deploy the Node.js server as a **web service**, not as a static site, because live rooms use Server-Sent Events.

## Updating the existing hosted site

Your GitHub repository is `unvolted/drawduel-online`. On GitHub, the existing v3 app is located at:

`DrawDuel-v3-Upgrade/drawing-battles-online/`

To update the existing v3 Render service (`drawduel-v3`), upload the new files **to exactly that folder structure** and commit them on `main`:

* `DrawDuel-v3-Upgrade/drawing-battles-online/server.js`
* `DrawDuel-v3-Upgrade/drawing-battles-online/public/index.html`
* `DrawDuel-v3-Upgrade/drawing-battles-online/package.json`
* and the accompanying files (the prompts bank is unchanged).

The file paths in `DrawDuel-v4-Upgrade.zip` already match your repository's path. Do not add another outer folder called `DrawDuel-v4-Upgrade` to your GitHub repository. Render has automatic deployment enabled; after a successful commit, the new game will appear at https://drawduel-v3.onrender.com once Render builds and starts the server. Check Render's deploy status.

## Smoke tests used

- Automated API integration tests covering four and eight artists.
- Verified three-submission validation, no self-assignment, each author selected once, private submissions before vote, and new submission phase each round.
- Node.js syntax checks for the client and server.

Note: Browser automation was blocked by this environment's Chromium administrator policy, so visual browser testing needs to be completed after deployment.

## Private battles (v5)

Online players see **only their own full-width drawing canvas** while the timer runs. The server masks every other participant's artwork in battle state messages, and no longer streams live art updates to opponents. All drawings and animation frames become visible together during voting. Local two-person play is unchanged.
