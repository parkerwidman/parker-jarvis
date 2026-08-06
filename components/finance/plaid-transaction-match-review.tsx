"use client";

import {
  importPlaidReviewAsNew,
  matchPlaidReviewCandidate,
  type PlaidReviewResolutionActionResult,
} from "@/app/finance/plaid-review/actions";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import {
  JarvisAlert,
  JarvisCard,
  JarvisEmptyState,
} from "@/components/jarvis/jarvis-ui";
import {
  getPlaidReviewPagePresentation,
  type PlaidTransactionMatchReviewData,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-review-types";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type PlaidTransactionMatchReviewProps = {
  data: PlaidTransactionMatchReviewData;
  loadError: string | null;
};

type PendingConfirmation =
  | {
      kind: "match";
      reviewKey: string;
      candidateKey: string;
      merchantLabel: string;
    }
  | {
      kind: "import";
      reviewKey: string;
      merchantLabel: string;
    };

function resolutionSuccessMessage(
  code: "matched_existing" | "imported_new",
): string {
  if (code === "matched_existing") {
    return "Matched to your existing Rocket Money transaction.";
  }

  return "Imported as a new Plaid transaction.";
}

export function getPlaidReviewPagePresentationForTests(
  data: PlaidTransactionMatchReviewData,
) {
  return getPlaidReviewPagePresentation(data);
}

export function PlaidTransactionMatchReview({
  data,
  loadError,
}: PlaidTransactionMatchReviewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(
    null,
  );
  const [confirmChecked, setConfirmChecked] = useState(false);

  const presentation = getPlaidReviewPagePresentation(data);

  function beginConfirmation(next: PendingConfirmation) {
    setActionError(null);
    setSuccessMessage(null);
    setConfirmChecked(false);
    setConfirmation(next);
  }

  function cancelConfirmation() {
    setConfirmation(null);
    setConfirmChecked(false);
  }

  function handleResolutionResult(result: PlaidReviewResolutionActionResult) {
    if (!result.success) {
      setActionError(result.error);
      return;
    }

    setConfirmation(null);
    setConfirmChecked(false);
    setSuccessMessage(resolutionSuccessMessage(result.code));
    router.refresh();
  }

  function submitConfirmation() {
    if (!confirmation || !confirmChecked || isPending) {
      return;
    }

    const formData = new FormData();
    formData.set("reviewItemId", confirmation.reviewKey);
    formData.set("confirmed", "true");

    if (confirmation.kind === "match") {
      formData.set("candidateId", confirmation.candidateKey);
    }

    startTransition(async () => {
      const result =
        confirmation.kind === "match"
          ? await matchPlaidReviewCandidate(formData)
          : await importPlaidReviewAsNew(formData);

      handleResolutionResult(result);
    });
  }

  return (
    <>
      <JarvisPageHeader
        title="Plaid transaction match review"
        subtitle="Resolve uncertain matches between synced bank activity and Rocket Money imports."
        backHref="/finance"
        backLabel="Back to Finance"
      />

      {loadError ? <JarvisAlert variant="error">{loadError}</JarvisAlert> : null}
      {actionError ? <JarvisAlert variant="error">{actionError}</JarvisAlert> : null}
      {successMessage ? (
        <JarvisAlert variant="success">{successMessage}</JarvisAlert>
      ) : null}

      {presentation.showEmpty ? (
        <JarvisEmptyState
          title="No pending transaction matches"
          description="Jarvis will queue uncertain matches here after a Plaid sync."
        />
      ) : null}

      {presentation.showPending ? (
        <section className="finance-plaid-review-section" aria-label="Pending review items">
          <div className="finance-plaid-review-section-header">
            <h2 className="finance-plaid-review-section-title">Pending review</h2>
            <span className="jv-section-count">{presentation.pendingCount}</span>
          </div>

          <div className="finance-plaid-review-list">
            {data.pendingItems.map((item) => (
              <JarvisCard
                key={item.reviewKey}
                title={item.merchantLabel}
                accent="amber"
                className="finance-plaid-review-card"
              >
                <div className="finance-plaid-review-summary">
                  <p className="finance-plaid-review-meta">
                    Transaction date {item.transactionDate} · Posted{" "}
                    {item.postedDate}
                  </p>
                  <p className="finance-plaid-review-meta">
                    {item.formattedAmount} · {item.transactionTypeLabel}
                  </p>
                  {item.accountDisplayLabel ? (
                    <p className="finance-plaid-review-meta">
                      Account {item.accountDisplayLabel}
                    </p>
                  ) : null}
                </div>

                <div className="finance-plaid-review-pause">
                  <h3 className="finance-plaid-review-subtitle">Why Jarvis paused</h3>
                  <p className="finance-plaid-review-copy">{item.pauseReason}</p>
                  <p className="finance-plaid-review-copy">
                    {item.candidateCount} possible Rocket Money match
                    {item.candidateCount === 1 ? "" : "es"} found.
                  </p>
                </div>

                {item.candidates.length > 0 ? (
                  <div className="finance-plaid-review-candidates">
                    <h3 className="finance-plaid-review-subtitle">
                      Possible Rocket Money matches
                    </h3>
                    {item.candidates.map((candidate) => (
                      <article
                        key={candidate.candidateKey}
                        className="finance-plaid-review-candidate"
                      >
                        <div className="finance-plaid-review-candidate-main">
                          <strong>{candidate.merchantLabel}</strong>
                          <p className="finance-plaid-review-meta">
                            Transaction date {candidate.transactionDate}
                            {candidate.postedDate
                              ? ` · Posted ${candidate.postedDate}`
                              : null}
                          </p>
                          <p className="finance-plaid-review-meta">
                            {candidate.formattedAmount} ·{" "}
                            {candidate.personalOrBusinessLabel}
                          </p>
                          {candidate.recurringStatusLabel ? (
                            <p className="finance-plaid-review-meta">
                              {candidate.recurringStatusLabel}
                            </p>
                          ) : null}
                          <p className="finance-plaid-review-meta">
                            Match score {candidate.matchScore}
                          </p>
                          <ul className="finance-plaid-review-reasons">
                            {candidate.matchReasonLabels.map((label) => (
                              <li key={label}>{label}</li>
                            ))}
                          </ul>
                        </div>
                        <button
                          type="button"
                          className="jv-btn jv-btn--secondary"
                          disabled={isPending || confirmation !== null}
                          aria-busy={isPending}
                          onClick={() =>
                            beginConfirmation({
                              kind: "match",
                              reviewKey: item.reviewKey,
                              candidateKey: candidate.candidateKey,
                              merchantLabel: candidate.merchantLabel,
                            })
                          }
                        >
                          Match this expense
                        </button>
                      </article>
                    ))}
                  </div>
                ) : null}

                <div className="finance-plaid-review-import">
                  <p className="finance-plaid-review-warning">
                    Import as new will create a separate Finance transaction from
                    this bank activity. It will not change your Rocket Money rows.
                  </p>
                  <button
                    type="button"
                    className="jv-btn jv-btn--primary"
                    disabled={isPending || confirmation !== null}
                    aria-busy={isPending}
                    onClick={() =>
                      beginConfirmation({
                        kind: "import",
                        reviewKey: item.reviewKey,
                        merchantLabel: item.merchantLabel,
                      })
                    }
                  >
                    Import as new transaction
                  </button>
                </div>
              </JarvisCard>
            ))}
          </div>
        </section>
      ) : null}

      {confirmation ? (
        <div className="finance-plaid-review-confirm-overlay" role="dialog" aria-modal="true">
          <JarvisCard title="Confirm resolution" accent="amber">
            {confirmation.kind === "match" ? (
              <p className="finance-plaid-review-copy">
                Match this bank activity to the Rocket Money transaction{" "}
                <strong>{confirmation.merchantLabel}</strong>? This links the
                bank feed to your existing import and keeps Rocket Money fields
                unchanged.
              </p>
            ) : (
              <p className="finance-plaid-review-copy">
                Import <strong>{confirmation.merchantLabel}</strong> as a new
                Plaid transaction? This creates a separate Finance row and does
                not modify Rocket Money candidates.
              </p>
            )}

            <label className="finance-plaid-review-confirm-checkbox">
              <input
                type="checkbox"
                checked={confirmChecked}
                disabled={isPending}
                onChange={(event) => setConfirmChecked(event.target.checked)}
              />
              <span>I reviewed this decision and understand it cannot be undone.</span>
            </label>

            <div className="finance-plaid-review-confirm-actions">
              <button
                type="button"
                className="jv-btn jv-btn--ghost"
                disabled={isPending}
                onClick={cancelConfirmation}
              >
                Cancel
              </button>
              <button
                type="button"
                className="jv-btn jv-btn--primary"
                disabled={!confirmChecked || isPending}
                aria-busy={isPending}
                onClick={submitConfirmation}
              >
                {isPending ? "Saving…" : "Confirm"}
              </button>
            </div>
          </JarvisCard>
        </div>
      ) : null}

      {presentation.showRecent ? (
        <section
          className="finance-plaid-review-section"
          aria-label="Recent resolutions"
        >
          <h2 className="finance-plaid-review-section-title">Recent resolutions</h2>
          <div className="finance-plaid-review-history">
            {data.recentResolvedItems.map((item) => (
              <article
                key={item.reviewKey}
                className="finance-plaid-review-history-item"
              >
                <div className="finance-plaid-review-history-main">
                  <strong>{item.merchantLabel}</strong>
                  <p className="finance-plaid-review-meta">
                    {item.formattedAmount} · {item.transactionTypeLabel}
                  </p>
                  <p className="finance-plaid-review-meta">
                    Transaction date {item.transactionDate} · Posted {item.postedDate}
                  </p>
                </div>
                <div className="finance-plaid-review-history-outcome">
                  <span className="jv-badge jv-badge--ready">
                    {item.resolutionOutcomeLabel}
                  </span>
                  <p className="finance-plaid-review-meta">{item.resolvedAtLabel}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
