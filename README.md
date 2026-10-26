# Staying Alive

A tiny Zepp OS game for the Amazfit T-Rex 3 Pro: a man sits by a campfire, and the fire only keeps burning while you wear the watch.

## How it plays

- **Wear the watch → the fire burns.** While the watch is on your wrist, warmth builds up and the fire grows. A warmer wrist gives a bigger fire.
- **Take it off → the fire dies.** Warmth slowly drops, the fire shrinks to embers, and the man starts to freeze: he hugs himself and shivers.
- **The sky follows the clock.** Morning (5–10), day (10–17), sunset (17–21), night (21–5).

## Logic

- **Warmth (0–100)** is updated every second from the wear sensor (`Wear`) and the wrist temperature sensor (`BodyTemperature`):
  - On the wrist, warmth moves toward a target set by the wrist temperature:
    - 28 °C or less: 25, a small fire.
    - 34 °C or more: 100, a full fire.
    - In between: linear.
    - No reading: 100.
  - So the man never freezes while the watch is worn.
  - Warming is +100 in ~30 s.
  - Off the wrist: −100 in ~1.5 min.
  - When the watch is unsure whether it is worn, warmth stays the same.
- **Fire level:**
  - Warmth ≥ 60: big fire.
  - Warmth ≥ 20: small fire.
  - Below 20: embers.
- **Man:** warms his hands while there is a fire, freezes on embers.
- **While the app is closed:**
  - Warmth and a timestamp are saved to `localStorage` on exit, when the screen turns off and when the watch is put on or taken off.
  - On the next launch the elapsed time is replayed minute by minute.
  - A minute counts as worn if there was a heart rate reading within 15 minutes of it in today's per-minute history. Heart rate is only measured on the wrist.
  - Without heart rate access, the watch is assumed to have stayed on if it was worn both at exit and at launch.

All timings and thresholds are constants at the top of [page/index.js](page/index.js).

## Phone settings

The app's settings page in the Zepp phone app has a **character name** field. The name is shown above the man.

- [setting/index.js](setting/index.js): the settings page.
- [app-side/index.js](app-side/index.js): the side service on the phone. It answers `name.get` and pushes `name.changed` when the name is edited.
- On the watch, the name is cached in `localStorage`, so it shows right away even without the phone. It is written only when it changes.

## Debug screen

When `DEBUG = true` in [utils/config.js](utils/config.js), swiping right on the main screen opens [page/debug.js](page/debug.js). It shows these values, refreshed every second:

- Permissions.
- Wear status.
- Wrist temperature.

Swipe right again to go back.

With the flag on, swipe right no longer exits the app from the main screen, so set `DEBUG = false` for release.

## Permissions

- `device:os.local_storage`: saves the fire state.
- `data:user.hd.heart_rate`: reads today's heart rate history. The watch asks for it on first launch.
- `data:user.hd.body_temp`: wrist temperature, which sets how big the fire gets.

## Assets

Assets are in `assets/default.r/`:

- `bg_morning.png`, `bg_day.png`, `bg_sunset.png`, `bg_night.png`: 480×480 backgrounds without the man.
- `fire_small/`, `fire_big/`: 6-frame fire animations.
- `man_<pose>/man_<i>.png`: man animation frames, 100×172 with transparency, drawn at (96, 212).
  - `warm`: 1 frame.
  - `cold`: 4 shivering frames.

To add a pose:

1. Drop the frames into a new `man_<pose>/` folder.
2. Add its frame count to `MAN_FRAMES` in [page/index.js](page/index.js).

## Run

```sh
npm install
zeus dev       # simulator
zeus preview   # QR code to install on the watch
```
