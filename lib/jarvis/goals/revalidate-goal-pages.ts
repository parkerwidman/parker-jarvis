import "server-only";

import { GOAL_PAGE_CONFIG } from "@/lib/jarvis/goals/types";
import { revalidatePath } from "next/cache";

export function revalidateGoalPages(): void {
  for (const config of Object.values(GOAL_PAGE_CONFIG)) {
    revalidatePath(config.route);
  }
  revalidatePath("/");
  revalidatePath("/tasks");
}

export function revalidateAfterTaskCompletion(goalTaskCompleted: boolean): void {
  if (goalTaskCompleted) {
    revalidateGoalPages();
    return;
  }

  revalidatePath("/");
  revalidatePath("/tasks");
}
