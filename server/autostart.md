# Hub autostart (macOS)

Optional. The hub runs fine as `npm start` in a terminal; this just keeps it
up across logins.

Create `~/Library/LaunchAgents/com.agentbrowser.hub.plist`, substituting the
absolute path to your clone and to `node` (`which node`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>              <string>com.agentbrowser.hub</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/absolute/path/to/agentbrowser/server/hub.mjs</string>
  </array>
  <key>WorkingDirectory</key>   <string>/absolute/path/to/agentbrowser/server</string>
  <key>RunAtLoad</key>          <true/>
  <key>KeepAlive</key>          <true/>
  <key>StandardOutPath</key>    <string>/tmp/agentbrowser-hub.log</string>
  <key>StandardErrorPath</key>  <string>/tmp/agentbrowser-hub.log</string>
</dict>
</plist>
```

It starts `hub.mjs` at login, restarts it within about five seconds if it
exits, and sends stdout and stderr to `/tmp/agentbrowser-hub.log`.

`launchd` does not inherit the full shell `PATH`. The hub checks common macOS
locations, but for a CLI installed elsewhere add an `EnvironmentVariables`
dictionary to the plist with an absolute override, for example:

```xml
  <key>EnvironmentVariables</key>
  <dict>
    <key>AGENTCHAT_BIN_CODEX</key>
    <string>/absolute/path/to/codex</string>
  </dict>
```

Use the adapter name after `AGENTCHAT_BIN_` (for example `CODEX` or
`OPENCODE`).

```bash
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.agentbrowser.hub.plist   # load
launchctl bootout   "gui/$(id -u)/com.agentbrowser.hub"                                # unload
```

While the agent is loaded it owns `127.0.0.1:9010`, so running `node hub.mjs`
by hand exits with a port-in-use message. Bootout first, or set
`AGENTCHAT_PORT` to something else.
