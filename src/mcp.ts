// The agent-facing tools for this plugin's data.
//
// Two groups, matching two of the three tabs: timers (App Timer and Power Timer, which share one
// job shape across the `app-closer` and `power-timer` files) and startup programs. They moved
// out of the MCP server for the same reason the UI moved out of Deck — this plugin owns these
// formats, so the tools that write them belong beside the code that reads them.
//
// `deck_list` deliberately stayed in the server: it reads across timers, startup AND scripts to
// answer "what is scheduled on this machine", so it belongs to no single plugin. It only reads,
// so there is no second writer.
//
// Nothing is imported at run time — the server passes its own zod and store helpers in. The type
// import below is erased at build time.
import type {
  DeckMcp, McpServer, Job, JobFile, StartupProgram, Weekday,
} from "../shim/mcp.js";

export function register(server: McpServer, deck: DeckMcp) {
  const { z, ok, weekday, readJson, writeJson, newId, nextFire, ALL_DAYS, TIMER_MODULES } = deck;

  // ---- timers: app-closer and power-timer ----
  server.tool(
    "deck_add_timer",
    "Schedule an app to close or a power action (shutdown/restart/sleep/hibernate/lock). " +
      "Either delayMinutes (one-time) OR atTime 'HH:mm'. Recurring needs atTime + days.",
    {
      module: z.enum(TIMER_MODULES),
      target: z.string().describe("app process name (app-closer) or action shutdown|restart|sleep|hibernate|lock (power-timer)"),
      delayMinutes: z.number().int().positive().optional(),
      atTime: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/).optional(),
      recurring: z.boolean().default(false),
      days: z.array(weekday).default([]),
    },
    async ({ module, target, delayMinutes, atTime, recurring, days }) => {
      const now = Date.now();
      let mode: "delay" | "atTime";
      let fireAt: number | null;
      if (delayMinutes != null) {
        if (recurring) return ok("Error: recurring needs atTime, not delayMinutes.");
        mode = "delay"; fireAt = now + delayMinutes * 60_000;
      } else if (atTime) {
        if (recurring && days.length === 0) return ok("Error: recurring needs at least one day.");
        mode = "atTime";
        fireAt = nextFire({ mode, recurring, days, timeOfDay: atTime, fireAt: 0 }, now);
      } else {
        return ok("Error: provide delayMinutes or atTime.");
      }
      if (fireAt == null) return ok("Error: could not compute a fire time.");

      const payload = module === "app-closer" ? { app: target } : { action: target };
      const job: Job = {
        id: newId(), module, label: target, mode, recurring, days: days as Weekday[],
        timeOfDay: mode === "atTime" ? atTime : undefined, fireAt, warned: false, payload,
      };
      const f = readJson<JobFile>(module, { jobs: [] });
      f.jobs.push(job);
      writeJson(module, f);
      return ok(`Added ${module} timer '${target}' (id ${job.id}) firing ${new Date(fireAt).toISOString()}.`);
    },
  );

  server.tool(
    "deck_cancel_timer",
    "Cancel a timer by id (from deck_list).",
    { module: z.enum(TIMER_MODULES), id: z.string() },
    async ({ module, id }) => {
      const f = readJson<JobFile>(module, { jobs: [] });
      const before = f.jobs.length;
      f.jobs = f.jobs.filter((j) => j.id !== id);
      writeJson(module, f);
      return ok(before === f.jobs.length ? `No timer with id ${id}.` : `Cancelled ${id}.`);
    },
  );

  // ---- startup programs ----
  server.tool(
    "deck_add_startup",
    "Add a startup program that launches at logon within a day + time window.",
    {
      name: z.string(),
      path: z.string().describe("full path to the .exe (%VARS% allowed)"),
      args: z.array(z.string()).default([]),
      days: z.array(weekday).default(ALL_DAYS.slice(0, 5) as Weekday[]),
      start: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/).default("08:00"),
      end: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/).default("17:00"),
      enabled: z.boolean().default(true),
    },
    async ({ name, path, args, days, start, end, enabled }) => {
      const list = readJson<StartupProgram[]>("startup", []);
      const entry: StartupProgram = { Name: name, Path: path, Args: args, Days: days, Start: start, End: end, Enabled: enabled };
      const i = list.findIndex((p) => p.Name.toLowerCase() === name.toLowerCase());
      if (i >= 0) list[i] = entry; else list.push(entry);
      writeJson("startup", list);
      return ok(`${i >= 0 ? "Updated" : "Added"} startup program '${name}'.`);
    },
  );

  server.tool(
    "deck_set_startup_enabled",
    "Enable or disable a startup program by name.",
    { name: z.string(), enabled: z.boolean() },
    async ({ name, enabled }) => {
      const list = readJson<StartupProgram[]>("startup", []);
      const p = list.find((x) => x.Name.toLowerCase() === name.toLowerCase());
      if (!p) return ok(`No startup program named '${name}'.`);
      p.Enabled = enabled;
      writeJson("startup", list);
      return ok(`${enabled ? "Enabled" : "Disabled"} '${name}'.`);
    },
  );

  server.tool(
    "deck_remove_startup",
    "Remove a startup program by name.",
    { name: z.string() },
    async ({ name }) => {
      const list = readJson<StartupProgram[]>("startup", []);
      const next = list.filter((p) => p.Name.toLowerCase() !== name.toLowerCase());
      writeJson("startup", next);
      return ok(next.length === list.length ? `No startup program named '${name}'.` : `Removed '${name}'.`);
    },
  );
}
