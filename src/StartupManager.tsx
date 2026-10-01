import { useEffect, useRef, useState } from "react";
import { listen } from "../shim/event.js";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Plus, Trash2, FolderOpen, Check } from "lucide-react";
import {
  startupRead, startupWrite, pickExe, listInstalled,
  type StartupProgram, type AppProc,
} from "../shim/bridge.js";
import { TextInput, TimeInput, DayPicker } from "../shim/ui.js";
import { AppCombo } from "./AppCombo";
import { fmtTime } from "./timeFormat";

function summarizeDays(days: string[]): string {
  if (days.length === 7) return "Every day";
  const wd = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  if (days.length === 5 && wd.every((d) => days.includes(d))) return "Mon–Fri";
  return days.map((d) => d.slice(0, 2)).join(", ");
}

// Would this program launch right now (today in Days, now within Start–End)?
function launchesNow(p: StartupProgram): boolean {
  if (!p.Enabled) return false;
  const now = new Date();
  const today = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getDay()];
  if (!p.Days.includes(today)) return false;
  const [sh, sm] = p.Start.split(":").map(Number);
  const [eh, em] = p.End.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= sh * 60 + sm && mins <= eh * 60 + em;
}

const EMPTY: StartupProgram = {
  Name: "", Path: "", Args: [], Days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  Start: "08:00", End: "17:00", Enabled: true,
};

export default function StartupManager() {
  const [list, setList] = useState<StartupProgram[]>([]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [running, setRunning] = useState<AppProc[]>([]);
  const ensureInstalled = () => { if (running.length === 0) listInstalled().then(setRunning).catch(() => {}); };
  // Last text we read-from / wrote-to disk. Autosave only fires when the list
  // actually differs from this — so loads (mount or config-changed) never echo
  // back a write, and there's no fragile "hydrating" flag race.
  const lastSynced = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A load that started before the newest edit must not apply its stale result on top of it.
  // config-changed fires on Deck's OWN writes (and again via Syncthing, since most config lives
  // in the vault), so several loads are routinely in flight at once; without this the last one
  // to resolve wins rather than the newest one to start.
  const loadTicket = useRef(0);
  const load = () => {
    const ticket = ++loadTicket.current;
    return startupRead().then((t) => {
      if (ticket !== loadTicket.current) return; // a newer load started; this result is stale
      try {
        const a = JSON.parse(t);
        const arr = Array.isArray(a) ? a : [];
        lastSynced.current = JSON.stringify(arr);
        setList(arr);
      } catch { /* leave current on parse error */ }
    }).catch(() => { /* leave current */ });
  };
  useEffect(() => {
    load();
    let unlisten: (() => void) | undefined;
    listen("config-changed", load).then((u) => (unlisten = u));
    return () => unlisten?.();
    /* eslint-disable-next-line */
  }, []);

  // Autosave (debounced) only when the list differs from what's on disk.
  useEffect(() => {
    const cur = JSON.stringify(list);
    if (lastSynced.current === null || cur === lastSynced.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      // Claim the value BEFORE the write, not after. The write itself trips the config watcher,
      // which fires `config-changed` and re-runs load() — and until lastSynced names what we are
      // writing, that load reads the pre-write file and setLists it back over the edit. The user
      // sees a change they just made silently revert, which reads as "it isn't saving".
      lastSynced.current = cur;
      loadTicket.current++; // invalidate any in-flight load; disk is about to be older than us
      await startupWrite(JSON.stringify(list, null, 2));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1400);
    }, 500);
  }, [list]);

  const update = (i: number, patch: Partial<StartupProgram>) =>
    setList((l) => l.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const remove = (i: number) => { setList((l) => l.filter((_, idx) => idx !== i)); setOpenIdx(null); };
  const add = () => { setList((l) => [...l, { ...EMPTY }]); setOpenIdx(list.length); };

  const browse = async (i: number) => { const p = await pickExe(); if (p) update(i, { Path: p }); };

  return (
    <div className="relative flex h-full w-full flex-col">
      <AnimatePresence>
        {savedFlash && (
          <motion.span
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute right-0 top-0 z-10 flex items-center gap-1 text-xs" style={{ color: "var(--accent)" }}
          >
            <Check size={13} /> Saved
          </motion.span>
        )}
      </AnimatePresence>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
       <div className="divide-y divide-subtle overflow-hidden rounded-xl border border-subtle" style={{ background: "var(--bg-card-glass)" }}>
        {list.map((p, i) => {
          const open = openIdx === i;
          const live = launchesNow(p);
          return (
            <motion.div
              key={i}
              layout
              className="overflow-hidden transition-colors"
              style={{ background: open ? "color-mix(in srgb, var(--accent) 5%, var(--bg-card))" : "transparent" }}
            >
              {/* Row header */}
              <button
                onClick={() => setOpenIdx(open ? null : i)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--bg-elev)]"
              >
                <span
                  className="relative h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: p.Enabled ? "var(--accent)" : "var(--border-strong)" }}
                >
                  {live && (
                    <span className="absolute inset-0 animate-ping rounded-full" style={{ background: "var(--accent)" }} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {p.Name || "(unnamed)"}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {summarizeDays(p.Days)} · {fmtTime(p.Start)}–{fmtTime(p.End)}
                    {live && <span style={{ color: "var(--accent)" }}> · would launch now</span>}
                  </div>
                </div>
                {/* enabled toggle */}
                <span
                  role="switch"
                  aria-checked={p.Enabled}
                  onClick={(e) => { e.stopPropagation(); update(i, { Enabled: !p.Enabled }); }}
                  className="relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors"
                  style={{ background: p.Enabled ? "var(--accent)" : "var(--border-strong)" }}
                >
                  <motion.span
                    layout
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white"
                    style={{ left: p.Enabled ? "18px" : "2px" }}
                  />
                </span>
                <ChevronDown
                  size={16}
                  className="shrink-0 text-text-muted transition-transform"
                  style={{ transform: open ? "rotate(180deg)" : "none" }}
                />
              </button>

              {/* Inline editor */}
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {/* Editor: constrained column, aligned under the row title. Short fields
                        pair into a 2-col grid (reference style); long path field is full-width. */}
                    <div className="border-t border-subtle py-4 pl-[38px] pr-4">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-text-secondary">Name</span>
                          <TextInput value={p.Name} onChange={(e) => update(i, { Name: e.target.value })} placeholder="Display name" />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-text-secondary">Arguments <span className="text-text-muted">· optional</span></span>
                          <input type="text" value={p.Args.join(" ")}
                            onChange={(e) => update(i, { Args: e.target.value.split(" ").filter(Boolean) })}
                            placeholder="Space-separated"
                            className="h-9 w-full rounded-md border border-strong bg-elev px-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent" />
                        </label>

                        <label className="col-span-2 block">
                          <span className="mb-1 block text-[11px] font-medium text-text-secondary">Application</span>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <AppCombo
                                value={p.Path}
                                onChange={(v) => update(i, { Path: v })}
                                onPickName={(name) => update(i, { Name: list[i].Name || name })}
                                apps={running}
                                onRefresh={ensureInstalled}
                                pickField="path"
                                placeholder="Search installed apps or type a path…"
                              />
                            </div>
                            <button onClick={() => browse(i)} title="Browse for .exe"
                              className="grid h-9 w-10 shrink-0 place-items-center rounded-md border border-strong bg-elev text-text-secondary transition hover:text-text-primary">
                              <FolderOpen size={16} />
                            </button>
                          </div>
                        </label>

                        <div className="col-span-2">
                          <span className="mb-1.5 block text-[11px] font-medium text-text-secondary">Active days</span>
                          <DayPicker value={p.Days} onChange={(d) => update(i, { Days: d })} />
                        </div>

                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-text-secondary">Start</span>
                          <TimeInput value={p.Start} onChange={(v) => update(i, { Start: v })} className="w-full" />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-text-secondary">End</span>
                          <TimeInput value={p.End} onChange={(v) => update(i, { End: v })} className="w-full" />
                        </label>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <button onClick={() => remove(i)}
                          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-text-muted transition hover:bg-elev hover:text-danger">
                          <Trash2 size={14} /> Remove program
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
       </div>

        {/* Add */}
        <button
          onClick={add}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-subtle py-2.5 text-sm text-text-muted transition hover:border-accent hover:text-text-primary"
        >
          <Plus size={16} /> New program
        </button>
      </div>
    </div>
  );
}
