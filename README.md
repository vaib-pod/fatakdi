# Afterglow — Firecracker Night

A firecracker festival web game built with HTML, canvas, bundled face capture tools, and a Node.js party server. No build step, external services, npm dependencies, or API keys are needed.

## Run it

For multiplayer, install Node.js 22 or newer, run `npm start` in this folder, and open `http://localhost:3000`. The server serves the game and its party connections together. No npm install is needed. Set the `PORT` environment variable to change the port.

For solo play, VS Code's Live Server extension or `python -m http.server 8000 --bind 127.0.0.1` also works. Face capture needs localhost or HTTPS. Opening `index.html` directly supports the default solo game; party rooms require the Node server.

## Firecracker parties

1. Enter your name in **Firecracker party** and choose **Host a party**.
2. Copy the six-character room code or invite link and send it to friends. Invite links prefill the code; each guest enters their own name and chooses **Join**.
3. Up to **8 people** share the courtyard. Every player has their own cracker spot, choice of cracker, outfit, name label, and independent ignition/retreat sequence. Players can move and light crackers simultaneously. The shared camera shows the ground and characters at full size, smoothly widening when anyone launches Skyshots, a Rocket, or a Sky Lantern. It returns to the closer view after all airborne shows finish.
4. Face capture still happens on the user's device. After applying a face, enable **Share my face with this room** to show it to other players. Only the small transparent head cutout is sent, not the original camera frame. Leaving sharing unchecked uses the default face for other players. Uncheck it or remove your photo to remove the shared cutout.
5. **Leave party** returns to solo play. If the host leaves, another member becomes the host. A temporary connection loss retries automatically; a disconnected member is removed after about 45–55 seconds without updates. Refreshing requires joining again.

Rooms, sessions, active effects and shared cutouts live only in server memory. There are no accounts or saved photos. Empty rooms disappear; restarting the server ends all rooms. Anyone with the room code can join while space is available. Room codes are invitations rather than an account-based access system.

The server streams room events and receives player updates over same-origin HTTP. Face cutouts are sent only when changed, not with movement updates. Remote characters use the same drawing and spark simulation as the local character; fireworks start from shared server timestamps, and late joiners catch up to ongoing shows. Device speed and network delay can cause small timing differences.

Run `npm test` for server integration tests covering rooms, events, simultaneous shows, late joining, host transfer, face sharing/removal, room capacity, authorization, and static audio ranges.

## Controls

- **Jump / J** — a joyful hop while the fuse is burning or the firework show is running. Tap **Jump** on phones or click it on a laptop; press **J** as a keyboard shortcut. Jumping also works while walking or holding Fuljhadi, and is shared with party members. Your position on the ground still determines the retreat distance.
- On a phone, tap **Play fullscreen** and turn it sideways. The browser enters fullscreen and locks landscape when supported; otherwise the page fills the available viewport and shows a rotation prompt. **Options** opens the existing cracker, character, face and party controls in a drawer; **Done** returns to play and **Exit** restores the page.
- Slide and hold anywhere on the game canvas to move in that direction. Drag farther for full speed, move diagonally, and release to stop. This also works on the normal touch canvas. The light and arm rotation buttons stay available beside the play area.
- **W / ↑** — walk forward (toward the cracker)
- **S / ↓** — walk backward (away from the cracker)
- **A / ←** — move left
- **D / →** — move right
- **Space** or **Light it!** button — light the firecracker when nearby
- **R** or **Draw circles** — toggle circular arm motion while holding Fuljhadi
- Touchscreen: use the arrow pad and button in the game viewport
- **Sound on/off** and **Volume** — control the cracker audio in the sidebar

## Gameplay

Choose **Male** (kurta pajama) or **Female** (ghagra choli) in the character panel. You can switch at any time; your choice stays selected between rounds and when restarting the game.

Choose **Default face** or **Use my face** below the outfits. Use my face opens a camera preview and asks the browser for camera access, without requesting microphone access. Take a photo with your whole head visible; the app finds the face and removes the background, hair outline included. Review the transparent cutout, then choose **Use this face** or **Retake**. The captured face works with either outfit and appears when the character faces the camera; the existing rear-view animation is preserved. You can return to the default face, retake, or remove the photo at any time.

The camera switches off after taking a photo, cancelling, closing the dialog, or leaving the tab. Solo play pauses while the camera dialog is open; a multiplayer party continues, with local controls released and sounds muted during capture. Face detection and background removal run locally using the bundled MediaPipe models. Original camera photos are never uploaded or saved to browser storage. Only explicitly shared party cutouts are relayed through the server to room members. The face stays in memory through game restarts and is cleared when you remove it or reload the page. The face tools load only when requested, so they do not delay the default game. Good, even lighting and a clear view of one face produce the best cutout.

1. Select Skyshot, Double Skyshot, Rocket, Fuljhadi, Flower Pot, Peacock, Kitkat, Chakri, Sky Lantern, Mirchi, or Aloo Bomb in the right panel.
2. Walk close enough for the Light it button to appear.
3. Press Light it to light the cracker in the original courtyard view. Seen from behind, the character stands upright, bows forward at the waist, and reaches a slim lighting taper to the fuse. The feet stay planted and the camera stays in place. Once the character stands up, movement unlocks and the full retreat countdown starts, so you can walk back yourself. Fuljhadi stays in hand, and lantern ignition targets the burner.
4. Once the countdown begins, walk *outside* the glowing safety circle.
5. Stay beyond the circle until the countdown reaches zero. A successful retreat triggers the effects and adds a point; otherwise the round restarts without launching.
6. For Skyshot, choose **Single burst**, **6 shots**, or **12 shots**. Single burst pans to a bloom in your chosen flare colour. Multi-shot modes use a firing box and smoothly zoom out to keep the box, launches, and sky in the same view. Shots fire in sequence with different colours, cycling through straight up, left diagonal, and right diagonal paths while retaining the same long, curved trails. The sequence selection stays set between rounds and restarts; one completed sequence counts as one successful show.
7. For Sky Lantern, press **Light & release** or Space when nearby. The lantern lights and floats into the sky, adding one successful show without a fuse countdown or retreat step. You can keep walking while it flies; your position is preserved when the lantern round ends. No flight message overlays the scene.
8. Rocket starts in a translucent glass bottle. After lighting and retreating, the camera widens to show the bottle, whistling rocket flight, and a short bomb-like aerial blast with a circular shockwave, smoke, and quick sparks. It does not produce Skyshot's long flare trails.
9. Fuljhadi stays in the character's hand. Selecting it zooms toward the character; press **Light fuljhadi** or Space from any position, keep walking, and press **R** or **Draw circles** to rotate the arm and leave glowing spark circles. Its ignition timing is unchanged. After ignition, its sparks and recorded sound burn for **10 seconds**, followed by a short fade of the remaining spark trails; then it can be relit. Your position is preserved.
10. For Mirchi, choose the original **10 crackers**, **50 crackers**, or **100 crackers**. The original option keeps its short chain and cracker size; the 100-cracker option has twice the length of the 50-cracker chain. Every cracker is drawn individually. Approach the fuse at the left end, light it, and retreat from the boundary around the full chain. Crackers pop from left to right and disappear one by one in time with the supplied recording. Your chain selection stays set between rounds and restarts.

For Fuljhadi and single-shot Skyshot, choose **Golden**, **Red**, **Green**, **Blue**, **Orange**, or **Purple** before lighting. Each has its own colour selection, retained between rounds and restarts.

Sparks leave glowing streaks that follow their motion. Flower Pot sends up a white-and-gold fountain with drifting smoke. Peacock uses a compact five-tube fan: one jet rises straight up and two angle out to each side, with golden trails, bright white crackling mini-bursts, and drifting smoke. It uses the same approach, forward lighting pose, and 4.3-second retreat countdown as Flower Pot, and works in party rooms. Chakri spins rapidly with 420 flares per second; Mirchi fires a chain of 10, 50, or 100 pops; Aloo Bomb has a single golden blast and an expanding ground ring. Mirchi has small individual crackers along its chain, and Aloo Bomb has a compact prop. Sky Lantern has reddish paper, glows warmly, sways, and gently rises into the night.

Kitkat is a small upright red tube with a narrow orange-gold plume. Its rising streaks split into small warm crackling branches, with a bright base and drifting smoke. The active jet burns for **6.5 seconds**; leftover sparks fade for another 1.8 seconds. Its lighting pose and 4.3-second retreat countdown match the other ground crackers, and it works in party rooms.

Double Skyshot uses the single-shot Skyshot's rising glowing ball and upward camera movement, at 85% speed. The camera follows into a full sky view, where gold spokes spread through a 3D sphere and end in purple glowing tips, with a soft violet haze and small crackles. Perspective, larger brighter foreground flares and smaller dimmer background flares give the burst depth. Slight variation in direction and radius keeps the rounded silhouette natural. The full trails remain visible behind the tips. Exactly one second later, an inner golden bloom expands and its trails curve downward before fading, staying within the sky. The mortar has no printed wordmark. It uses the existing forward lighting pose and retreat countdown, counts as one show, and works in party rooms. Party rooms keep the same shared wide view used by normal Skyshots so other players remain visible.

Animations use small simulation steps, curved spark trails, cached glow textures, and a cached courtyard layer. Flower Pot, Peacock, Kitkat, and Chakri build up and fade out gradually.

Terracotta diyas line the back and side edges of the courtyard, with warm ground glows and gently flickering flames. The front edge stays clear, and there are no ground light poles.

Aloo Bomb and Mirchi both have a **four-second retreat countdown**. Aloo Bomb uses `sounds/aloo_bomb.mp3`, starting about 8.28 seconds into the recording so the main bang at 12.28 seconds matches the visual explosion without the long wait. A continuous fuse hiss accompanies the waiting time and stops at the blast; the recorded audio tail continues afterward. Mirchi uses the active crackling section of `sounds/mirchi.mp3`; measured pop cues drive its 10-, 50-, or 100-cracker sequence, and playback ends after the selected number of pops. Muting keeps the same visual timing; unmuting or returning to the tab rejoins the current position. Keep the `sounds` folder alongside `index.html` when publishing.

All Skyshot modes use `sounds/sky_shot.mp3`. Each shot has its own playback of the recording, with the visible launch matched to the attack near 0.455 seconds and the bloom matched to the aerial burst near 4.665 seconds. Flight lasts about 4.21 seconds to match these cues; the spark animation and full recorded tail continue afterward. Overlapping shots retain independent audio, and mute/resume rejoins their current positions without replaying earlier bangs.

Rocket uses `sounds/rocket.mp3`: its ascent begins with the whistle near 9.15 seconds, and its compact aerial blast matches the later boom near 10.72 seconds. Playback starts at 8 seconds to skip unrelated leading audio, and the recorded tail plays out after the blast. Fuljhadi uses a continuous 10-second section of `sounds/fuljhadi.mp3`, starting at 2 seconds into the file, with a short audio fade at the burn's end. Its ignition duration remains 1.55 seconds, with lighter contact at 0.9 seconds.

Chakri uses the later spinning section of `sounds/chakri.mp3` through its 3.75-second spin, starting at 9.37 seconds into the file. Flower Pot uses the active section of `sounds/flower_pot.mp3` from 16 seconds into the file for its 3.8-second fountain. These recordings follow the existing animation timings and fade out with each effect.

Peacock uses `sounds/peacock.mp3`, skipping to 4.95 seconds where the sustained fan/crackle begins. Its five jets burn for **14.8 seconds**, ending at 19.75 seconds in the recording, followed by two seconds for the remaining sparks and smoke to fade. Muting preserves the animation; unmuting rejoins the recording at the current position. Party members receive the same recording section and effect timing. A synthesized fountain hiss with crackles is used if the recording cannot play.

Kitkat uses the short active crackling section of `sounds/kitkat.mp3`, from **1.45 to 3.78 seconds**, looped for its full **6.5-second burn**. Web Audio decodes that section once and blends 20 milliseconds at the join, so the loop skips the recording's lead-in and quiet tail. The visual clock keeps advancing across audio loops. Muting, returning to the tab, or joining a party mid-show resumes at the current loop position, and the sound fades out at the end of the burn. Decoded audio is shared between local and remote Kitkat effects in the same tab. A synthesized hiss/crackle is used for local playback if the recording cannot load.

Double Skyshot uses the same `sounds/sky_shot.mp3` recording as the normal Skyshot, played at 85% speed with its pitch preserved. From the start of the show, launch occurs at about **0.54 seconds**, the outer purple flare at **5.49 seconds**, and the inner gold flare at **6.49 seconds**. The spherical purple burst expands, glows and crackles while its gold spokes stay visible; the smaller inner gold layer falls in bounded curved paths. Both layers remain in the sky and the round finishes at about 11.4 seconds. Muting and resuming preserve the same visual timing, including in party rooms. The lighting pose and retreat countdown retain their normal duration.

Fuse hisses and the Sky Lantern's quiet burner are synthesized locally with Web Audio. Sounds start after an interaction, follow the active effect, and stop or fade when muted, restarting, switching crackers, or leaving the page. Mute and volume settings persist between rounds. If a recording cannot play, synthesized sounds are used.

## Customize

Game visuals and mechanics live in `index.html`; `face-avatar.js` handles the camera, cutout preview, and custom face. `cracker-audio.js` handles blended, timed audio loops shared by local and party playback. Bundled face models and their source notices live in `vendor/mediapipe/`.

In `index.html`:
- CSS color variables in `:root` control the website theme.
- The `state` object defines game state.
- `range`, `safeRadius`, and `target` affect interaction distances and the stage position.
- The `drawPlayer`, `drawFirecracker`, and `drawSky` functions handle character, props, and backdrop rendering.
- `burst` and the show branch in `update` control effects.

## Deploy multiplayer

Deploy this folder to a host that runs a persistent Node.js process. Use `npm start` as the start command, with the platform's assigned `PORT`. Include `index.html`, `face-avatar.js`, `cracker-audio.js`, `party.js`, `party.css`, `server.mjs`, `package.json`, `sounds/`, and `vendor/`. Serve the public address over HTTPS for camera access. Configure any reverse proxy to allow long-lived `/api/party/events` responses without buffering or caching.

Use a **single server instance** for this version: rooms are held in that process's memory. Multiple instances would need shared room storage and event delivery. Static hosting alone (including a static Vercel deployment) supports solo play but cannot run these party rooms. Hosting bandwidth and process limits still apply.

For testing on the same Wi-Fi, friends can open `http://YOUR-COMPUTER-LAN-IP:3000` while the server is running and the port is accessible. Camera access on other devices requires an HTTPS address; `localhost` invite links work only on the host's own machine. For internet parties, share the deployed HTTPS address.

For safety and clarity this is a purely fictional visual simulation, not instructions for handling real fireworks.
