import "server-only";

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  isMetricoolDeniedTool,
  isMetricoolReadOnlyTool,
  TRUSTED_BRAND_ID,
} from "./metricool-config";
import { MetricoolSafeError } from "./metricool-types";

type ToolArguments = Record<string, unknown>;

function sanitizeToolArguments(
  toolName: string,
  args: ToolArguments,
): ToolArguments {
  const sanitized = { ...args };

  if ("brandId" in sanitized) {
    sanitized.brandId = TRUSTED_BRAND_ID;
  }

  if ("blogId" in sanitized) {
    sanitized.blogId = TRUSTED_BRAND_ID;
  }

  if (toolName === "getAnalyticsDataByMetrics" && !("brandId" in sanitized)) {
    sanitized.brandId = TRUSTED_BRAND_ID;
  }

  if (toolName === "getBestTimeToPostByNetwork" && !("brandId" in sanitized)) {
    sanitized.brandId = TRUSTED_BRAND_ID;
  }

  if (toolName === "getScheduledPosts" && !("brandId" in sanitized)) {
    sanitized.brandId = TRUSTED_BRAND_ID;
  }

  return sanitized;
}

export function assertMetricoolReadOnlyTool(toolName: string): void {
  if (isMetricoolDeniedTool(toolName)) {
    throw new MetricoolSafeError("tool_not_allowed");
  }

  if (!isMetricoolReadOnlyTool(toolName)) {
    throw new MetricoolSafeError("tool_not_allowed");
  }
}

export async function callMetricoolReadOnlyTool(
  client: Client,
  toolName: string,
  args: ToolArguments = {},
): Promise<unknown> {
  assertMetricoolReadOnlyTool(toolName);

  const result = await client.callTool({
    name: toolName,
    arguments: sanitizeToolArguments(toolName, args),
  });

  return result;
}

export async function runMinimalReadOnlyProbe(client: Client): Promise<void> {
  await callMetricoolReadOnlyTool(client, "getAnalyticsAvailableMetrics", {
    network: "instagram",
    connector: "evolution",
  });
}
