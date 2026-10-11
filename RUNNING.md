# Run the NZZ Reader

The original assignment is in `README.md`. The Expo / React Native TypeScript app is in `mobile/`. The supplied `fixture/` and `sdk/tracker.ts` are unchanged; the app includes an identical copy of the SDK in `mobile/src/vendor/`.

## Requirements

- Node.js 22.13 or newer (an LTS release is recommended).
- Expo Go compatible with SDK 57, on an Android emulator or physical iPhone / Android phone.
- Phone and computer on the same Wi-Fi. The phone must be able to reach the fixture server and Metro.

## Start

From this repository directory, in one terminal:

```sh
node fixture/server.mjs
```

In another terminal:

```sh
cd mobile
npm ci
npm start
```

Scan the terminal QR code with the iPhone camera and open Expo Go. For an Android emulator, start the emulator and press `a` in the Expo terminal. If the computer is short on memory, use `npm start -- --max-workers 1`.

The app normally derives the fixture host from the Expo development server's LAN address, using port 8787. To override it, create `mobile/.env.local`:

```dotenv
EXPO_PUBLIC_SERVER_URL=http://YOUR_COMPUTER_WIFI_ADDRESS:8787
```

Use `http://10.0.2.2:8787` for an Android emulator or `http://localhost:8787` for an iOS simulator when only testing that device. A physical iPhone cannot use your computer's `localhost`. Restart Metro after changing the environment variable. A Metro tunnel does not tunnel the fixture server.

Open `http://localhost:8787/control` on the computer to control consent, server availability, article versions and faults. The server prints the LAN address for testing from a phone.

## Checks

Run from `mobile/`:

```sh
npm run typecheck
npm run lint
npm test
```

`npm run test:browser` additionally runs the unmodified pages in headless Chrome or Edge against a separate fixture on port 8788. It checks the injected bridge, app context, height changes, links and final-line detection. Set `CHROME_PATH` if Chrome / Edge is installed outside the usual locations. These tests do not replace device testing.

## Device test route

1. Open the front page, then a normal article. Check the title is below the native toolbar.
2. Toggle the native bookmark and the page's bookmark. They should agree. Change text size and theme, then go back: the front page should already reflect the changes without a reload.
3. Reach the final line of article text. Go back and check Recently read and the read teaser marker. Opening without reading to the end should not mark an article read.
4. Use the control panel's tracking list to compare the app read event against the page's independent end-of-text observation. Check that no collector events are flagged.
5. Try the front-page section jumps, article contents links, Jump button, related articles and external links. Query strings should appear in the next article's Page status.
6. Open the deliberately broken / delayed articles. A missing ready message must produce an error with Retry. A duplicate ready message must not apply settings twice.
7. Set consent to **Reader has not chosen yet**, restart the app and check the empty ad. Set consent to **Reader has chosen**, background and foreground the app, and wait: the previously consent-free document should reload once with its ad.
8. Change an existing consent string, then background and foreground the app: the current document should stay in place. Pull to refresh to use the new string.
9. Set the server to **Unreachable**, then refresh. Restore **Normal**: the failed screen should retry automatically. Also test actual device disconnection separately.
10. Restart the app and check theme, font scale, bookmarks and read history persist. Repeat on both platforms, including rotation and short articles.

The optional offline saving feature is not part of this first implementation. Device verification and the final submission recording are separate from the automated checks.
