import { useState } from "react";
import { motion } from "framer-motion";
import { Power, RotateCw, Moon, Snowflake, Lock } from "lucide-react";
import { useScheduler } from "./useScheduler";
import { type HistoryEntry } from "../shim/bridge.js";
import { specFromHistory } from "./scheduler";
import { Field, Tabs } from "../shim/ui.js";
import { ScheduleForm } from "./ScheduleForm";
import { JobList } from "./JobList";
import { WarningDialog } from "./WarningDialog";
import { History } from "./History";

const ACTIONS = [
  { value: "shutdown", label: "Shutdown", icon: Power },
  { value: "restart", label: "Restart", icon: RotateCw },
  { value: "sleep", label: "Sleep", icon: Moon },
  { value: "hibernate", label: "Hibernate", icon: Snowflake },
  { value: "lock", label: "Lock", icon: Lock },
];

export default function PowerTimer() {
  const [action, setAction] = useState("shutdown");
  const [tab, setTab] = useState<"active" | "history">("active");

  const sched = useScheduler("power-timer");

  const labelFor = (v: string) => ACTIONS.find((a) => a.value === v)?.label ?? v;

  const describe = (e: HistoryEntry) => labelFor(e.payload?.action ?? e.label);
  const repeat = (e: HistoryEntry) => {
    const act = e.payload?.action ?? "shutdown";
    sched.add({ ...specFromHistory(e), label: labelFor(act), payload: { action: act } });
  };

  const count = sched.jobs.length;

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <div className="scroll-thin min-h-0 flex-1 space-y-6 overflow-y-auto pb-2">
        {/* Composer — flat, card-free. */}
        <div className="flex flex-col">
          <ScheduleForm
            buttonLabel="Start timer"
            extraField={
              <Field label="Action" hint="Sleep may hibernate if hibernation is enabled system-wide.">
                <div className="grid grid-cols-5 gap-2">
                  {ACTIONS.map((a) => {
                    const Icon = a.icon;
                    const active = a.value === action;
                    return (
                      <motion.button
                        key={a.value}
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setAction(a.value)}
                        className="relative flex flex-col items-center gap-1.5 rounded-lg border py-2.5 transition-colors"
                        style={{
                          borderColor: active ? "var(--accent)" : "var(--border-subtle)",
                          background: active ? "var(--accent-soft)" : "var(--bg-elev)",
                          color: active ? "var(--text-primary)" : "var(--text-secondary)",
                        }}
                      >
                        <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                        <span className="text-[10px] font-medium leading-none">{a.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </Field>
            }
            onSubmit={(spec) => {
              sched.add({ ...spec, label: labelFor(action), payload: { action } });
              return null;
            }}
          />
        </div>

        {/* Active | History — stacked below the composer. */}
        <div className="flex min-h-0 flex-col border-t border-subtle pt-5">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[{ value: "active", label: `Active${count ? ` (${count})` : ""}` }, { value: "history", label: "History" }]}
          />
          <div className="mt-4">
            {tab === "active"
              ? <JobList jobs={sched.jobs} now={sched.now} onRemove={sched.remove} />
              : <History module="power-timer" describe={describe} onRepeat={repeat} embedded />}
          </div>
        </div>
      </div>

      <WarningDialog
        job={sched.warning}
        verb={sched.warning ? labelFor((sched.warning.payload as any).action) : ""}
        onCancel={() => sched.warning && sched.cancelWarned(sched.warning.id)}
        onNow={() => sched.warning && sched.fireNow(sched.warning.id)}
        onDismiss={sched.dismissWarning}
      />
    </div>
  );
}
