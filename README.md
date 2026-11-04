**Different prompts + canvas zoom:** There are no prompt fields in the menu. Before every round, each player writes a new prompt. Player 1 draws Player 2's prompt, and Player 2 draws Player 1's prompt. Each player can zoom their canvas from 100% to 400% and pan while zoomed in.

# Draw Duel — Online Drawing Battles

A complete browser drawing game with two modes:

- **Online (two different devices):** create a private 6-character room, share an invite URL or code, draw in real time on your own canvas, then vote. The host manages shared timing, round changes, and rematches. Rejoining from the same browser works with the stored room token while the server room exists.
- **Local (one device):** instant two-player mode that works from a downloaded HTML file, with independent canvases and local voting.

## Play on your computer (test the website)

1. Install **Node.js 20+** if it is not already installed.
2. Open a terminal in this folder.
3. Run `npm start` (or `node server.js`). **No `npm install` or other dependencies needed.**
4. Open **http://localhost:3000** in your browser.
5. Click **CREATE ONLINE ROOM**. To test with another tab, open the invite link and enter the room code. One browser tab hosts, the other joins.

For two computers or phones on the **same Wi-Fi network**, they can use the server computer's local-network IP address with port 3000 if the network/firewall allows it. For friends outside the home network, publish the server (below).

## Make it publicly accessible on the internet

This ZIP contains the entire app **and the multiplayer server**. Upload the contents into a GitHub repository, then deploy to a Node-compatible web service. For example, on **Render**:

1. Create a GitHub repository and upload the files (`server.js`, `package.json`, `public/index.html`, etc.).
2. In Render, create **New > Web Service** and connect that GitHub repo (not a Static Site).
3. Set **Runtime: Node**, **Build command: `npm install`** (no packages to install), and **Start command: `npm start`**. `/healthz` is the health-check URL. A `render.yaml` blueprint is also included if you prefer blueprint deployment.
4. Open the live `*.onrender.com` address. Create a room and use **Copy invite link** to send your friend the URL. Both players must open the deployed site.

**Important:** I can supply working code, but the website is **not publicly hosted** until you deploy it using your own hosting account. Since rooms are stored in server memory, a server restart or redeployment clears active rooms and drawings. Save important drawings as PNG. Free hosts may sleep or restart and interrupt active games. To scale beyond one server process or persist rooms long-term, connect a database/shared store.

## Features

- 10 drawing tools: pencil, marker, spray, eraser, bucket fill, line, rectangle, ellipse, eyedropper, text
- Palette + custom colors, brush slider, filled shapes, grid, undo/redo, canvas focus, 100–400% zoom with Pan mode/Shift-drag, clear, PNG export
- Responsive side-by-side canvas + tool rack (no scrolling between a canvas and its tools), plus keyboard shortcuts
- One unique prompt from each player before every drawing round; each artist receives the other person's prompt
- 45/60/90/120/180/300-second timer; 1/3/5/7/10 rounds; pause and +15 seconds
- Online room creation/joining, shared clock and scores, streamed drawings, two-person voting, tie results, next-round and rematch controls
- Local autosave and resume; browser-based sound effects and results gallery
- Lightweight Node.js built-in HTTP + Server-Sent Events backend (zero npm dependencies)

## Online game rules

Only the **room host** starts the match, controls the clock, adds time and advances rounds. After both players join, each submits one new prompt for round 1. The server swaps them so each artist draws the other artist's challenge. Both prompts must be different. This repeats before every later round. Each person sees only their own canvas and tools during online drawing, with both artworks shown during voting. When the timer ends or the host finishes the round, each player votes once for Player 1, Player 2, or a tie. If both agree, the chosen player wins; if the votes differ, the result is a tie. The final scoreboard appears after the chosen number of rounds.

## Files

- `server.js` — Multiplayer room server, timer, score and drawing synchronization
- `public/index.html` — Responsive game interface (also works alone for **local** games)
- `package.json` — `npm start` entry point
- `render.yaml` — Optional hosted deployment blueprint
- `start-windows.bat` — Convenience launcher for Windows with Node already installed

## Notes

No registration, lobby chat, or public matchmaking. Rooms are private-by-code and temporary. This version is intended for casual two-player games, not a production account system.

## Latest update — individual challenges and canvas zoom

In local and online modes, the menu has no prompt fields. After the match begins and **before every round**, each player submits exactly one new prompt. The challenges are swapped: Player 1 draws Player 2's prompt, and Player 2 draws Player 1's prompt. Each player sees their assigned prompt while drawing; both prompts are displayed beside the art during voting. During online drawing, each artist sees only their own canvas. The zoom controls next to each canvas support 100–400% viewing without changing the drawing or exported image. Press **Pan** then drag (also available with **Shift+drag** on desktop), or use Alt+mouse wheel to zoom. All drawing tools remain beside the canvas.
