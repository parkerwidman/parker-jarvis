import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RequestPerformanceCollector,
  isJarvisPerformanceLogsEnabled,
} from "@/lib/jarvis/performance/request-performance";

describe("RequestPerformanceCollector", () => {
  afterEach(() => {
    delete process.env.JARVIS_PERFORMANCE_LOGS;
    vi.restoreAllMocks();
  });

  it("records one model round duration", () => {
    const collector = new RequestPerformanceCollector("req-1", "main", 1000);
    collector.beginModelRound(1, 2000);
    collector.completeModelRound({
      toolCallsRequested: 0,
      finalTextRound: true,
      completedAt: 3500,
    });

    expect(collector.snapshot().modelRounds).toHaveLength(1);
    expect(collector.snapshot().modelRounds[0]?.durationMs).toBe(1500);
  });

  it("records two independent model round durations", () => {
    const collector = new RequestPerformanceCollector("req-2", "main", 1000);

    collector.beginModelRound(1, 2000);
    collector.completeModelRound({
      toolCallsRequested: 2,
      finalTextRound: false,
      completedAt: 4000,
    });

    collector.beginModelRound(2, 4100);
    collector.completeModelRound({
      toolCallsRequested: 0,
      finalTextRound: true,
      completedAt: 9000,
    });

    const rounds = collector.snapshot().modelRounds;
    expect(rounds).toHaveLength(2);
    expect(rounds[0]?.durationMs).toBe(2000);
    expect(rounds[1]?.durationMs).toBe(4900);
    expect(collector.metrics().modelMs).toBe(6900);
  });

  it("records first safe text only once overall", () => {
    const collector = new RequestPerformanceCollector("req-3", "main", 1000);
    collector.beginModelRound(1, 2000);
    collector.recordModelRoundFirstTextDelta(2500);
    collector.recordModelRoundFirstTextDelta(2600);
    collector.completeModelRound({
      toolCallsRequested: 0,
      finalTextRound: true,
      completedAt: 3000,
    });

    expect(collector.metrics().timeToFirstTextMs).toBe(1500);
    expect(collector.snapshot().modelRounds[0]?.firstTextMs).toBe(500);
  });

  it("leaves firstTextMs null when a tool round emits no safe text", () => {
    const collector = new RequestPerformanceCollector("req-4", "main", 1000);
    collector.beginModelRound(1, 2000);
    collector.completeModelRound({
      toolCallsRequested: 3,
      finalTextRound: false,
      completedAt: 15000,
    });

    expect(collector.snapshot().modelRounds[0]?.firstTextMs).toBeNull();
    expect(collector.metrics().timeToFirstTextMs).toBeNull();
  });

  it("records final round first text separately from completion", () => {
    const collector = new RequestPerformanceCollector("req-5", "main", 1000);

    collector.beginModelRound(1, 2000);
    collector.completeModelRound({
      toolCallsRequested: 2,
      finalTextRound: false,
      completedAt: 4000,
    });

    collector.beginModelRound(2, 4100);
    collector.recordModelRoundFirstTextDelta(5000);
    collector.completeModelRound({
      toolCallsRequested: 0,
      finalTextRound: true,
      completedAt: 9000,
    });

    expect(collector.metrics().finalRoundFirstTextMs).toBe(4000);
    expect(collector.snapshot().modelRounds[1]?.firstTextMs).toBe(900);
  });

  it("uses wall-clock batch duration rather than summed concurrent tool times", () => {
    const collector = new RequestPerformanceCollector("req-6", "main", 1000);
    collector.beginToolBatch(1, 5000);
    collector.completeToolBatch(5622);

    expect(collector.snapshot().toolBatches[0]?.durationMs).toBe(622);
    expect(collector.metrics().toolMs).toBe(622);
  });

  it("reports actual context elapsed duration", () => {
    const collector = new RequestPerformanceCollector("req-7", "main", 1000);
    collector.mark("auth_complete", 1010);
    collector.mark("thread_resolved", 1030);
    collector.mark("user_message_persisted", 1080);
    collector.mark("context_start", 1100);
    collector.mark("context_complete", 1250);
    collector.mark("stream_complete", 2000);

    expect(collector.metrics().contextMs).toBe(150);
    expect(collector.metrics().threadMs).toBe(20);
    expect(collector.metrics().userPersistMs).toBe(50);
  });

  it("does not include summary work in foreground timing marks", () => {
    const collector = new RequestPerformanceCollector("req-8", "main", 1000);
    collector.mark("stream_complete", 1500);

    const serialized = JSON.stringify(collector.snapshot());
    expect(serialized).not.toContain("summary");
    expect(collector.metrics().totalMs).toBe(500);
  });

  it("emits final performance line when logging is enabled", () => {
    process.env.JARVIS_PERFORMANCE_LOGS = "1";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const collector = new RequestPerformanceCollector("req-9", "main", 1000);

    collector.beginModelRound(1, 1100);
    collector.completeModelRound({
      toolCallsRequested: 0,
      finalTextRound: true,
      completedAt: 1500,
    });
    collector.success = true;
    collector.mark("stream_complete", 1600);
    collector.logIfEnabled();

    const output = logSpy.mock.calls.flat().join(" ");
    expect(isJarvisPerformanceLogsEnabled()).toBe(true);
    expect(output).toContain("[JARVIS_PERFORMANCE]");
    expect(output).toContain("requestId=req-9");
    expect(output).toContain("[JARVIS_PERFORMANCE_ROUND]");
    expect(output).toContain("round=1");

    logSpy.mockRestore();
  });

  it("emits safe timing on failed requests", () => {
    process.env.JARVIS_PERFORMANCE_LOGS = "1";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const collector = new RequestPerformanceCollector("req-10", "main", 1000);
    collector.failureCode = "prepare_failed";
    collector.mark("stream_complete", 1200);
    collector.logIfEnabled();

    const output = logSpy.mock.calls.flat().join(" ");
    expect(output).toContain("[JARVIS_PERFORMANCE]");
    expect(output).toContain("success=false");
    expect(output).toContain("failureCode=prepare_failed");
    expect(output).not.toContain("password");

    logSpy.mockRestore();
  });

  it("does not store prompt or private content in snapshots or logs", () => {
    process.env.JARVIS_PERFORMANCE_LOGS = "1";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const collector = new RequestPerformanceCollector("req-11", "main");

    collector.beginModelRound(1);
    collector.recordModelRoundFirstTextDelta();
    collector.completeModelRound({
      toolCallsRequested: 1,
      finalTextRound: false,
    });
    collector.logIfEnabled();

    const serialized = JSON.stringify(collector.snapshot());
    expect(serialized).not.toContain("message");
    expect(serialized).not.toContain("memory");
    expect(serialized).not.toContain("instructions");

    const output = logSpy.mock.calls.flat().join(" ");
    expect(output).not.toContain("Explain compound interest");

    logSpy.mockRestore();
  });

  it("records read fast path diagnostics without private content", () => {
    process.env.JARVIS_PERFORMANCE_LOGS = "1";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const collector = new RequestPerformanceCollector("req-fast", "main");

    collector.setFastPathMetadata({
      enabled: true,
      reason: "planning_tomorrow",
      prefetchedReads: 3,
    });
    collector.beginToolBatch(0, 1000);
    collector.completeToolBatch(1200);
    collector.toolCallCount = 3;
    collector.toolRoundCount = 1;
    collector.beginModelRound(1, 1300);
    collector.completeModelRound({
      toolCallsRequested: 0,
      finalTextRound: true,
      completedAt: 8200,
    });
    collector.mark("stream_complete", 9000);
    collector.logIfEnabled();

    expect(collector.snapshot().modelRoundCount).toBe(1);
    expect(collector.fastPath).toBe(true);
    expect(collector.prefetchedReads).toBe(3);

    const output = logSpy.mock.calls.flat().join(" ");
    expect(output).toContain("fastPath=true");
    expect(output).toContain("fastPathReason=planning_tomorrow");
    expect(output).toContain("prefetchedReads=3");
    expect(output).not.toContain("What should I focus");

    logSpy.mockRestore();
  });
});
