# Schedules

Startup programs, app timers and power timers.

Three related things in one tab: what launches when you log in (and within which time window),
closing an app after a delay, and shutting down or sleeping at a time. Rust owns the firing, so a
timer still fires with the tab closed - the plugin owns the list and the interface.

## What it exports

| Export | Where it renders |
|---|---|
| `default` | the tab |
| `Settings` | defaults for new jobs |
| `mcp` | adding and cancelling timers, for an agent |

## Checks

```sh
node plugins/schedules/scheduler.check.mjs
```

Working out when a schedule next fires, classifying it, and the countdown - the arithmetic that
decides whether a timer is right.

## Build

```sh
node plugins/schedules/build.mjs
```

See [../README.md](../README.md) for how the build and the shims work.

## Install

Copy `plugin.json` and `plugin.js`, `mcp.js` into `%APPDATA%\Deck\plugins\schedules\` (`Deck-Dev` for a
debug build) and restart Deck.
