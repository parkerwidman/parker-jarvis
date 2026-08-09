import { describe, expect, it, vi } from "vitest";
import {
  buildGoalLevelsPayload,
  computeGapPositions,
  createJarvisGoalWithRoadmap,
  validateGoalBuilderInput,
  type GoalBuilderInput,
} from "./create-goal";
import { buildGoalLevelViews, deriveLevelStates } from "./goal-roadmap";
import type { RawGoalLevel, RawGoalTask } from "./goal-roadmap";

function validInput(overrides: Partial<GoalBuilderInput> = {}): GoalBuilderInput {
  return {
    title: "Get into Tippie",
    description: "Academic recovery plan",
    domain: "personal",
    levels: [
      {
        name: "File the withdrawal",
        tasks: ["Submit retroactive withdrawal form", "Gather supporting documents"],
      },
      {
        name: "Apply",
        tasks: ["Submit Tippie application"],
      },
    ],
    ...overrides,
  };
}

describe("validateGoalBuilderInput", () => {
  it("J. rejects a blank goal title", () => {
    const result = validateGoalBuilderInput(validInput({ title: "   " }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("title");
    }
  });

  it("K. rejects an invalid domain", () => {
    const result = validateGoalBuilderInput(
      validInput({ domain: "work" as GoalBuilderInput["domain"] }),
    );
    expect(result.ok).toBe(false);
  });

  it("L. rejects zero levels", () => {
    const result = validateGoalBuilderInput(validInput({ levels: [] }));
    expect(result.ok).toBe(false);
  });

  it("M. rejects a blank level name", () => {
    const result = validateGoalBuilderInput(
      validInput({
        levels: [{ name: "  ", tasks: ["Do the thing"] }],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("N. rejects a level with zero valid tasks", () => {
    const result = validateGoalBuilderInput(
      validInput({
        levels: [{ name: "Level 1", tasks: [] }],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("O. rejects blank task titles instead of silently ignoring them", () => {
    const result = validateGoalBuilderInput(
      validInput({
        levels: [{ name: "Level 1", tasks: ["Valid task", "   "] }],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("D/E. accepts personal and melusi domains", () => {
    expect(validateGoalBuilderInput(validInput({ domain: "personal" })).ok).toBe(true);
    expect(validateGoalBuilderInput(validInput({ domain: "melusi" })).ok).toBe(true);
  });

  it("F-H. accepts one level with one task and multi-level/multi-task roadmaps", () => {
    expect(
      validateGoalBuilderInput(
        validInput({
          levels: [{ name: "Only level", tasks: ["Only task"] }],
        }),
      ).ok,
    ).toBe(true);

    expect(validateGoalBuilderInput(validInput()).ok).toBe(true);
    expect(
      validateGoalBuilderInput(
        validInput({
          levels: [
            {
              name: "Parallel work",
              tasks: ["Task A", "Task B", "Task C"],
            },
          ],
        }),
      ).ok,
    ).toBe(true);
  });

  it("I. assigns gap-based positions in the RPC payload order", () => {
    const validated = validateGoalBuilderInput(validInput());
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }

    expect(computeGapPositions(validated.value.levels.length)).toEqual([10, 20]);
    expect(computeGapPositions(validated.value.levels[0]?.tasks.length ?? 0)).toEqual([
      10, 20,
    ]);
    expect(buildGoalLevelsPayload(validated.value.levels)).toEqual([
      {
        name: "File the withdrawal",
        tasks: ["Submit retroactive withdrawal form", "Gather supporting documents"],
      },
      {
        name: "Apply",
        tasks: ["Submit Tippie application"],
      },
    ]);
  });
});

function createSupabaseRpcMock() {
  const rpc = vi.fn();

  return {
    supabase: { rpc },
    rpc,
  };
}

describe("createJarvisGoalWithRoadmap", () => {
  it("A-C. publishes the route-scoped goal types through the RPC", async () => {
    for (const goalType of ["short_term", "three_month", "long_term"] as const) {
      const { supabase, rpc } = createSupabaseRpcMock();
      rpc.mockResolvedValueOnce({
        data: { success: true, goal_id: `${goalType}-goal` },
        error: null,
      });

      const result = await createJarvisGoalWithRoadmap(
        supabase as never,
        goalType,
        validInput(),
      );

      expect(result).toEqual({ success: true, goalId: `${goalType}-goal` });
      expect(rpc).toHaveBeenCalledWith(
        "create_jarvis_goal_with_roadmap",
        expect.objectContaining({
          p_goal_type: goalType,
          p_domain: "personal",
        }),
      );
    }
  });

  it("P. never sends a client-supplied user id to the RPC", async () => {
    const { supabase, rpc } = createSupabaseRpcMock();
    rpc.mockResolvedValueOnce({
      data: { success: true, goal_id: "goal-1" },
      error: null,
    });

    await createJarvisGoalWithRoadmap(supabase as never, "short_term", validInput());

    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_user_id");
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("user_id");
  });

  it("Q. surfaces RPC failure without claiming success", async () => {
    const { supabase, rpc } = createSupabaseRpcMock();
    rpc.mockResolvedValueOnce({
      data: { success: false, code: "invalid_level_tasks" },
      error: null,
    });

    const result = await createJarvisGoalWithRoadmap(
      supabase as never,
      "short_term",
      validInput(),
    );

    expect(result).toEqual({
      success: false,
      error: "Each level needs at least one task.",
    });
  });

  it("R. sends matching goal and level task references in structured payload", async () => {
    const { supabase, rpc } = createSupabaseRpcMock();
    rpc.mockResolvedValueOnce({
      data: { success: true, goal_id: "goal-1" },
      error: null,
    });

    await createJarvisGoalWithRoadmap(supabase as never, "long_term", validInput());

    expect(rpc).toHaveBeenCalledWith(
      "create_jarvis_goal_with_roadmap",
      expect.objectContaining({
        p_levels: [
          {
            name: "File the withdrawal",
            tasks: ["Submit retroactive withdrawal form", "Gather supporting documents"],
          },
          {
            name: "Apply",
            tasks: ["Submit Tippie application"],
          },
        ],
      }),
    );
  });
});

describe("created roadmap derivation", () => {
  it("S. treats Level 1 as current and later levels as locked for new todo tasks", () => {
    const levels: RawGoalLevel[] = [
      { id: "level-1", name: "Level 1", position: 10, goal_id: "goal-1" },
      { id: "level-2", name: "Level 2", position: 20, goal_id: "goal-1" },
      { id: "level-3", name: "Level 3", position: 30, goal_id: "goal-1" },
    ];
    const tasksByLevelId = new Map<string, RawGoalTask[]>([
      [
        "level-1",
        [
          {
            id: "task-1",
            title: "Task A",
            status: "todo",
            position: 10,
            notes: null,
            blocked_at: null,
            blocked_reason: null,
            goal_level_id: "level-1",
          },
          {
            id: "task-2",
            title: "Task B",
            status: "todo",
            position: 20,
            notes: null,
            blocked_at: null,
            blocked_reason: null,
            goal_level_id: "level-1",
          },
        ],
      ],
      [
        "level-2",
        [
          {
            id: "task-3",
            title: "Task C",
            status: "todo",
            position: 10,
            notes: null,
            blocked_at: null,
            blocked_reason: null,
            goal_level_id: "level-2",
          },
        ],
      ],
      [
        "level-3",
        [
          {
            id: "task-4",
            title: "Task D",
            status: "todo",
            position: 10,
            notes: null,
            blocked_at: null,
            blocked_reason: null,
            goal_level_id: "level-3",
          },
        ],
      ],
    ]);

    const states = deriveLevelStates(levels, tasksByLevelId);
    const views = buildGoalLevelViews(levels, tasksByLevelId);

    expect(states.get("level-1")).toBe("current");
    expect(states.get("level-2")).toBe("locked");
    expect(states.get("level-3")).toBe("locked");
    expect(views[0]?.state).toBe("current");
    expect(views[1]?.state).toBe("locked");
    expect(views[0]?.tasks).toHaveLength(2);
  });
});
