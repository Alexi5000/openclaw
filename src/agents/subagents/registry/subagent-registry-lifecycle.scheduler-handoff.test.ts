import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import * as runtimeConfig from "../../../config/runtime-snapshot.js";
import { resetGatewayWorkAdmission } from "../../../process/gateway-work-admission.js";
import {
  beginSchedulerYieldHandoff,
  endSchedulerYieldHandoff,
} from "../../scheduler-yield-handoff.js";
import { persistSubagentSessionTiming } from "./subagent-registry-helpers.js";
import { makeSubagentCompletion } from "./subagent-registry-lifecycle-completion.test-support.js";
import {
  createLifecycleControllerFixture,
  createRunEntry,
} from "./subagent-registry-lifecycle-controller.test-support.js";
import type { SubagentLifecycleOptions } from "./subagent-registry-lifecycle.js";

vi.mock("./subagent-registry-helpers.js", { spy: true });

beforeEach(() => {
  resetGatewayWorkAdmission();
  runtimeConfig.setRuntimeConfigSnapshot({});
  vi.mocked(persistSubagentSessionTiming).mockResolvedValue(undefined);
});
afterEach(runtimeConfig.clearRuntimeConfigSnapshot);

// The scheduler keeps a yielded automation's session busy while it waits for these
// children, so delivering into that session would wait on the scheduler forever.
it.each([false, true])(
  "hands a finished child to its waiting scheduler after an automation yield (%s)",
  async (schedulerWaiting) => {
    const entry = createRunEntry({
      expectsCompletionMessage: true,
      requesterSessionKey: "agent:main:cron:job:run:session",
      requesterDisplayKey: "agent:main:cron:job:run:session",
    });
    if (schedulerWaiting) {
      beginSchedulerYieldHandoff(entry.requesterSessionKey, [entry.runId]);
      onTestFinished(() => endSchedulerYieldHandoff(entry.requesterSessionKey));
    }
    const owned: boolean[] = [];
    const runSubagentAnnounceFlow = vi.fn<SubagentLifecycleOptions["runSubagentAnnounceFlow"]>(
      async (params) => {
        owned.push(params.isCompletionOwnedByRequesterYield?.() === true);
        return "delivered";
      },
    );
    const controller = createLifecycleControllerFixture(
      { entry, runSubagentAnnounceFlow },
      {
        callGateway: async () => {
          throw new Error("Unexpected Gateway call");
        },
        cleanupBrowserSessionsForLifecycleEnd: vi.fn(async () => {}),
        ownersByEntry: new Map(),
      },
    );

    await controller.completeSubagentRun(makeSubagentCompletion(entry, { triggerCleanup: true }));
    await vi.waitFor(() => expect(runSubagentAnnounceFlow).toHaveBeenCalledOnce(), {
      interval: 1,
    });

    expect(owned).toEqual([schedulerWaiting]);
  },
);
