# BLACKSITE: OUTBREAK

A browser-first, first-person voxel survival game set inside a sealed Northstar research facility. Built with Three.js and Vite; world props, machines, weapons and infected models in this build are generated from geometry in the project.

> **Development status:** playable first gameplay build. This repository started empty. This is a working foundation with the connected survival loop and major progression machines implemented; it is not yet a final CrazyGames submission or a claim of completed QA across every browser.

## Features in this build

- First-person 3D movement with mouse look, sprint, jump, crouch, pointer lock, aim, reload and weapon switching.
- Procedurally generated nine-area research facility, corridor bulkheads, collision and zombie spawn points.
- Round-based survival with escalating spawn counts, health and enemy types.
- Five standard infected variants: infected, rusher, armoured, volatile and elite.
- Three boss encounters at rounds 5, 10 and 15: The Brute, The Experiment and The Overseer.
- Point rewards, headshot bonuses, seven perk machines, power relay, Pack-a-Punch, Mystery Crate and purchasable doors.
- Seven wall-buy weapons, a starting pistol and an experimental Mystery Crate weapon.
- Local progress/settings saves, with CrazyGames Data-module storage when the CrazyGames SDK is initialized.
- Procedural Web Audio for combat, reload, damage, purchases, power and round events.
- Responsive HUD, main menu, field manual, settings, pause and death screens.
- Optional rewarded revive on CrazyGames when the v3 SDK and rewarded ads are available. It is hidden on ordinary web hosts and remains optional.

## Controls

| Input | Action |
|---|---|
| W A S D | Move |
| Mouse | Look |
| Left mouse | Fire |
| Right mouse | Aim |
| Shift | Sprint |
| Space | Jump |
| Ctrl | Crouch |
| R | Reload |
| 1 / 2 / 3 | Switch weapon |
| E | Interact / purchase |
| F | Interact |
| Esc | Pause / release pointer |

Click DEPLOY to start and capture the mouse. Click the game again if your browser requires a second pointer-lock gesture.

## Requirements

- Node.js 20.19+ or 22.12+ recommended.
- npm 10+.
- A modern desktop browser with WebGL 2 support.

## Development

~~~bash
npm install
npm run dev
~~~

Vite prints a local URL, normally http://localhost:5173.

## Production build

~~~bash
npm run build
npm run preview
~~~

The production build is written to dist/. Upload the contents of dist/ as the HTML5 game package. Do not upload the Vite source folder as the playable build.

## GitHub Pages

A GitHub Actions workflow builds the project and deploys dist/ to GitHub Pages on pushes to main. In the repository's Settings → Pages, set the source to GitHub Actions.

For a custom deployment, run npm run build and publish the generated dist/ directory.

## CrazyGames SDK

The HTML5 SDK v3 script is loaded in index.html. src/platform/CrazyGames.js initializes it defensively and exposes:

- gameplayStart() / gameplayStop() for gameplay-state reporting.
- The SDK Data module for the same save key used by the local fallback.
- The muteAudio setting listener.
- A user-initiated rewarded revive using the documented rewarded-ad callbacks.

The SDK is optional outside CrazyGames. When it is absent or reports the disabled environment, the game uses localStorage and does not call SDK APIs. CrazyGames disables ads during Basic Launch; the revive offer only appears in the live CrazyGames environment and the ordinary restart path always remains available.

CrazyGames automatically provides its own fullscreen control; this project does not add a competing in-game fullscreen button.

## Project layout

~~~text
src/
  main.js                 boot and loading screen
  style.css               menus, HUD and responsive layout
  platform/
    CrazyGames.js         SDK v3 adapter and save bridge
  game/
    Audio.js              procedural Web Audio
    Game.js               state machine and game loop
    Player.js             FPS movement and damage
    Progression.js        points, purchases, perks and objectives
    Save.js               settings and progression persistence
    Weapons.js            weapon stats, models, ammo and firing
    World.js              voxel facility, doors, props and machines
    Zombies.js            enemy models, damage and AI
  ui/
    GameUI.js             HUD and menu state
~~~

## Notes before submission

- Run npm run build and test the generated dist/ folder in a production-style server.
- Test 800×450 and common desktop aspect ratios, pointer lock, tab focus changes and pause/resume.
- Run the CrazyGames QA Tool / preview environment after uploading the build.
- CrazyGames approval, ad availability and account-save syncing must be verified in the developer portal. A successful local build does not guarantee acceptance.
- The generated art and sound in this build are original procedural assets. No Call of Duty assets are included.
