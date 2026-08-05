"use client";

import type {
  NetworkBestTimes,
  ScheduledSocialPost,
  TopContentHighlight,
} from "@/lib/jarvis/integrations/metricool/metricool-social-types";
import {
  NETWORK_DISPLAY_NAMES,
  SOCIAL_CAVEATS,
  bestTimeRankLabel,
} from "@/lib/jarvis/integrations/metricool/metricool-social-display";
import { SocialInfoDisclosure } from "@/components/melusi/social/social-info-disclosure";

function formatPostDate(isoString: string, timeZone: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function SocialScheduleList({
  posts,
  timeZone,
}: {
  posts: ScheduledSocialPost[];
  timeZone: string;
}) {
  if (posts.length === 0) {
    return <p className="social-quiet-note">No upcoming posts scheduled.</p>;
  }

  return (
    <ul className="social-schedule-list">
      {posts.map((post, index) => (
        <li key={`${post.publicationDate}-${index}`} className="social-schedule-row">
          <time dateTime={post.publicationDate}>
            {formatPostDate(post.publicationDate, timeZone)}
          </time>
          <span className="social-schedule-networks">
            {post.networks.map((network) => NETWORK_DISPLAY_NAMES[network]).join(" · ") ||
              "Networks pending"}
          </span>
          <span className="social-schedule-type">{post.postType}</span>
          <span className="social-schedule-status">
            {post.draft ? "Draft" : "Scheduled"}
            {post.autoPublish === false ? " · Manual publish" : ""}
          </span>
          <p className="social-schedule-caption">
            {post.caption ? post.caption : "No caption"}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function SocialBestTimesPanel({
  bestTimes,
}: {
  bestTimes: NetworkBestTimes[];
}) {
  return (
    <div className="social-best-times-panel">
      <p className="social-section-footnote">
        Rankings are relative within each platform.
        <SocialInfoDisclosure label="About posting times" content={SOCIAL_CAVEATS.bestTimes} />
      </p>
      <div className="social-best-times-grid">
        {bestTimes.map((entry) => (
          <div key={entry.network} className="social-best-times-card">
            <h3>{NETWORK_DISPLAY_NAMES[entry.network]}</h3>
            {entry.available && entry.slots.length > 0 ? (
              <>
                {!entry.weekdayLabelsAvailable && entry.weekdayLimitation ? (
                  <p className="social-quiet-note">{entry.weekdayLimitation}</p>
                ) : null}
                <ul className="social-best-times-slots">
                  {entry.slots.slice(0, 3).map((slot, slotIndex) => (
                    <li key={`${entry.network}-${slotIndex}-${slot.hourOfDay}`}>
                      <span className={`social-best-times-rank social-best-times-rank--${slot.rank}`}>
                        {bestTimeRankLabel(slot.rank)}
                      </span>
                      <span>
                        {slot.day.label ? `${slot.day.label} · ` : ""}
                        {slot.timeLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="social-quiet-note">
                {entry.warning ?? "No best-time data returned."}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SocialContentHighlights({
  topPerforming,
  weakestMature,
}: {
  topPerforming: TopContentHighlight | null;
  weakestMature: TopContentHighlight | null;
}) {
  return (
    <div className="social-highlight-row">
      <article className="social-highlight-item social-highlight-item--top">
        <h3>Top comparable content</h3>
        {topPerforming ? (
          <>
            <p className="social-highlight-meta">
              {NETWORK_DISPLAY_NAMES[topPerforming.network]} · {topPerforming.postType} ·{" "}
              {topPerforming.metricLabel}: {topPerforming.metricValue}
            </p>
            <p className="social-highlight-caption">{topPerforming.caption}</p>
            {topPerforming.permalink ? (
              <a
                href={topPerforming.permalink}
                className="social-post-link"
                target="_blank"
                rel="noreferrer noopener"
              >
                Open on platform
              </a>
            ) : null}
          </>
        ) : (
          <p className="social-quiet-note">Not enough comparable posts yet.</p>
        )}
      </article>
      <article className="social-highlight-item">
        <h3>Weakest mature comparable</h3>
        {weakestMature ? (
          <>
            <p className="social-highlight-meta">
              {NETWORK_DISPLAY_NAMES[weakestMature.network]} · {weakestMature.postType} ·{" "}
              {weakestMature.metricLabel}: {weakestMature.metricValue}
            </p>
            <p className="social-highlight-caption">{weakestMature.caption}</p>
            {weakestMature.permalink ? (
              <a
                href={weakestMature.permalink}
                className="social-post-link"
                target="_blank"
                rel="noreferrer noopener"
              >
                Open on platform
              </a>
            ) : null}
          </>
        ) : (
          <p className="social-quiet-note">Not enough comparable posts yet.</p>
        )}
      </article>
    </div>
  );
}
