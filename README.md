# Production Player Cloud Beta

This is the small cloud relay used by Production Player PRO Premium.

## What it does

- Gives the phone an HTTPS remote page.
- Relays only cue names and button presses.
- Does not upload or stream MP3 files.
- Creates separate session rooms for each active Production Player.

## Deploy on Render

1. Create a free GitHub account if you do not already have one.
2. Create a new empty GitHub repository.
3. Upload all files from this folder to that repository.
4. Create a free Render account.
5. In Render, choose **New → Blueprint**.
6. Connect the GitHub repository.
7. Deploy the `render.yaml` Blueprint.
8. Open the new service and copy its HTTPS address.

It will look similar to:

`https://production-player-cloud-beta.onrender.com`

## Test

Open:

`https://YOUR-RENDER-ADDRESS/health`

You should see a JSON response containing `"ok": true`.

## Next step

The HTTPS Render address and generated `DESKTOP_SECRET` must be placed into the
desktop Production Player project. The desktop app can then create a session and
generate a QR code that opens:

`https://YOUR-RENDER-ADDRESS/remote/SESSIONCODE`

## Free beta limitation

Render free web services can pause when idle. The first connection after a pause
may take longer. This is suitable for testing demand, not yet the final paid service.
