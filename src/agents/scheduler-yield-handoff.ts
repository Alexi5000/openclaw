/**
 * Children released by an automation turn that ended with sessions_yield. The
 * scheduler keeps the run's session busy while it waits for them, so their
 * completions hand off to it instead of being delivered into that session.
 */
import { resolveGlobalSingleton } from "../shared/global-singleton.js";

const handoffs = resolveGlobalSingleton(
  Symbol.for("openclaw.schedulerYieldHandoffs"),
  () => new Map<string, Set<string>>(),
);

/** Records children whose completion the scheduler collects for this run session. */
export function beginSchedulerYieldHandoff(sessionKey: string, childRunIds: readonly string[]) {
  const key = sessionKey.trim();
  if (!key || childRunIds.length === 0) {
    return;
  }
  const runIds = handoffs.get(key) ?? new Set<string>();
  for (const runId of childRunIds) {
    runIds.add(runId);
  }
  handoffs.set(key, runIds);
}

/** The scheduler finished with this run session; its children deliver normally again. */
export function endSchedulerYieldHandoff(sessionKey: string) {
  handoffs.delete(sessionKey.trim());
}

export function isSchedulerYieldHandoff(entry: {
  requesterSessionKey: string;
  runId: string;
  taskRunId?: string;
}): boolean {
  const runIds = handoffs.get(entry.requesterSessionKey.trim());
  return runIds !== undefined && runIds.has(entry.taskRunId ?? entry.runId);
}
