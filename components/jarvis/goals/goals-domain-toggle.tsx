"use client";

import { domainLabel } from "@/lib/jarvis/goals/types";
import { useGoalsDomain } from "./goals-domain-provider";

export function GoalsDomainToggle() {
  const { domain, setDomain } = useGoalsDomain();

  return (
    <div className="goals-domain-seg" role="group" aria-label="Goal domain">
      <button
        type="button"
        className={`goals-domain-seg-btn goals-domain-seg-btn--personal${
          domain === "personal" ? " goals-domain-seg-btn--active" : ""
        }`}
        onClick={() => setDomain("personal")}
        aria-pressed={domain === "personal"}
      >
        {domainLabel("personal")}
      </button>
      <button
        type="button"
        className={`goals-domain-seg-btn goals-domain-seg-btn--melusi${
          domain === "melusi" ? " goals-domain-seg-btn--active" : ""
        }`}
        onClick={() => setDomain("melusi")}
        aria-pressed={domain === "melusi"}
      >
        {domainLabel("melusi")}
      </button>
    </div>
  );
}
