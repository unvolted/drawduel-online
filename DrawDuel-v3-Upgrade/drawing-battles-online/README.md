# Draw Duel v3 — multiplayer drawing and animation battles

**Live website:** https://drawduel-online.onrender.com

This version adds **2–8 player online rooms**, a **flipbook animation battle mode**, **208 prompts without landscapes or places**, an **opacity slider**, an improved **anti-aliased paint bucket**, and a finish celebration animation.

## What's new

- Online room hosts choose the room size (2–8) and can start once at least two artists are connected. The invitation link and six-character room code work the same way as before.
- Everyone draws simultaneously in the same round. Remote canvases update live. Each artist casts one vote per round; the most-voted artwork wins a point, and tied leaders each earn a point. The host can reveal votes early if a disconnected artist cannot vote.
- Choose **Drawing battle** or **Flipbook animation** in the setup. In animation mode, each artist can make up to 12 frames, duplicate frames, insert blank frames, go back and forth, preview at 4 FPS, and export WebM. Animation previews also play in the voting gallery. The finish screen celebrates with a short confetti animation (respecting reduced-motion settings).
- 208 creative character/creature/food/gadget/action prompts. There are no landscape or place prompts; the old Places category is removed.
- Every drawing board has a 1–100% opacity slider. The bucket now handles anti-aliased boundary pixels to reduce dark fringes while preserving solid black outlines.
- Local two-player mode still works in a browser, including flipbook animation.

## Run locally

1. Install Node.js 20+.
2. Open a terminal **inside `drawing-battles-online/`**, the folder containing `server.js` and `package.json`.
3. Run `npm start` (there are no third-party dependencies).
4. Visit `http://localhost:3000`.

For local mode only, you can open `public/index.html` without running the server. Online play requires the Node server.

## Update the existing Render website

The existing GitHub repository is `https://github.com/unvolted/drawduel-online`, and the live web service is `https://drawduel-online.onrender.com`.

If your GitHub repository currently contains a `drawing-battles-online/` folder, upload or replace the files **inside that same folder** (not in a newly nested folder). The changed files for this upgrade are:

- `drawing-battles-online/server.js`
- `drawing-battles-online/public/index.html`
- `drawing-battles-online/public/prompts.json`
- `drawing-battles-online/README.md`

Once the changed files are committed to the `main` branch, the existing Render service's auto-deploy feature rebuilds the site. The current Render service is configured as a Node web service using:

- Build command: `cd drawing-battles-online && npm install`
- Start command: `cd drawing-battles-online && npm start`
- Health endpoint: `/healthz`

For a new deployment, use the same commands if your repository still has the `drawing-battles-online/` folder at the root. Alternatively set Render's root directory to `drawing-battles-online` and then use `npm install` / `npm start`.

## Notes

This project stores rooms in memory, so a redeployment or free-host sleep can reset active battles. Art and animation frames are temporary. Save artwork as PNG or exported animations as WebM before leaving. Multiple simultaneous service instances require shared room state (not included).

No accounts, public chat, or public matchmaking are needed: rooms are private by their invite codes. Avoid sharing room codes publicly if you want a private battle.
