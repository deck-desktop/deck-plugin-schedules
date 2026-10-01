import { useState } from "react";
import { Field, Segmented, Select } from "../shim/ui.js";
import { useSettings, saveSettings } from "../shim/settings.js";
import { AnimatePresence, motion } from "framer-motion";
import { Rocket, AlarmClock, Power } from "lucide-react";
import StartupManager from "./StartupManager";
import AppCloser from "./AppCloser";
import PowerTimer from "./PowerTimer";

// The three scheduling tools (Startup / App Timer / Power Timer) share one sidebar
// slot; a top tab bar switches between them. Each tool's own UI is unchanged.
type TabId = "startup" | "app-timer" | "power";

const TABS: { id: TabId; label: string; icon: typeof Rocket; Component: React.ComponentType }[] = [
  { id: "startup",   label: "Startup",     icon: Rocket,     Component: StartupManager },
  { id: "app-timer", label: "App Timer",   icon: AlarmClock, Component: AppCloser },
  { id: "power",     label: "Power Timer", icon: Power,      Component: PowerTimer },
];

export default function Schedules() {
  const [tab, setTab] = useState<TabId>("startup");
  const active = TABS.find((t) => t.id === tab)!;
  const Panel = active.Component;

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      {/* Tab bar — filled-pill segmented tabs (reference style): icon + label,
          active tab gets a soft violet-tinted pill, inactive are plain text. */}
      <div className="mb-5 flex shrink-0 gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === tab;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
              style={{ color: isActive ? "var(--text-primary)" : "var(--text-muted)" }}>
              {isActive && (
                <motion.span layoutId="schedules-pill"
                  className="absolute inset-0 rounded-lg"
                  style={{ background: "var(--accent-soft)", boxShadow: "inset 0 0 0 1px var(--accent-soft)" }}
                  transition={{ type: "spring", stiffness: 500, damping: 34 }} />
              )}
              <Icon size={15} strokeWidth={1.9} className="relative z-10"
                style={{ color: isActive ? "var(--accent)" : undefined }} />
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Selected tool */}
      <div className="min-h-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.div key={tab}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="h-full">
            <Panel />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * This plugin's settings, rendered in its own row under Settings > Plugins.
 *
 * These live in DECK'S settings.json rather than a plugin config file, and that is deliberate:
 * the warning is raised by Rust's scheduler thread (src-tauri/src/scheduler.rs), which fires
 * whether or not Deck's window is open and reads settings.json directly. A plugin config file is
 * something only the webview reads, so moving these there would leave the panel adjusting a
 * value nothing acts on.
 *
 * So the panel moved here — beside the timers it governs, rather than in General where it sat
 * next to the user's name — and the storage did not.
 */
export function Settings() {
  const s = useSettings();
  return (
    <div className="space-y-3">
      <Field
        label="Warning before an action fires"
        hint="Timers fire even when Deck is closed — the warning comes from Deck's background scheduler, not this tab."
      >
        <Segmented
          layoutId="sched-warn-mode"
          value={s.warningMode}
          onChange={(m) => saveSettings({ ...s, warningMode: m as typeof s.warningMode })}
          options={[
            { value: "toast", label: "Toast" },
            { value: "window", label: "Open window" },
            { value: "none", label: "None" },
          ]}
        />
      </Field>

      {/* Pointless while nothing is warned, so it goes rather than sitting there disabled. */}
      {s.warningMode !== "none" && (
        <Field label="Warn this many minutes before">
          <Select
            value={String(s.warnLeadMin)}
            onChange={(e) => saveSettings({ ...s, warnLeadMin: Number(e.target.value) })}
            className="w-32"
          >
            {[1, 2, 5, 10, 15].map((n) => <option key={n} value={n}>{n} min</option>)}
          </Select>
        </Field>
      )}
    </div>
  );
}
