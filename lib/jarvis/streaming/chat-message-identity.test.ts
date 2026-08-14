import { describe, expect, it } from "vitest";

import {
  chatMessagesEqual,
  collectMessageRenderKeys,
  createClientMessageId,
  createCompletedAssistantMessage,
  createOptimisticUserMessage,
  createStreamingAssistantClientId,
  ensureChatMessageIdentity,
  getMessageRenderKey,
  hasDuplicateRenderKeys,
  normalizeChatMessages,
} from "@/lib/jarvis/streaming/chat-message-identity";

const DUPLICATE_PROMPT = "Explain compound interest in three sentences.";

describe("chat message identity", () => {
  it("gives identical user messages unique render identities", () => {
    const first = createOptimisticUserMessage(DUPLICATE_PROMPT);
    const second = createOptimisticUserMessage(DUPLICATE_PROMPT);

    expect(first.content).toBe(second.content);
    expect(first.clientId).not.toBe(second.clientId);
    expect(hasDuplicateRenderKeys([first, second])).toBe(false);
  });

  it("gives identical assistant messages unique render identities", () => {
    const first = createCompletedAssistantMessage({
      clientId: createClientMessageId(),
      content: "Compound interest grows on principal plus prior interest.",
    });
    const second = createCompletedAssistantMessage({
      clientId: createClientMessageId(),
      content: "Compound interest grows on principal plus prior interest.",
    });

    expect(first.content).toBe(second.content);
    expect(first.clientId).not.toBe(second.clientId);
    expect(hasDuplicateRenderKeys([first, second])).toBe(false);
  });

  it("creates optimistic user IDs once and preserves them across normalization", () => {
    const optimistic = createOptimisticUserMessage("Plan my next move.");

    const normalizedOnce = normalizeChatMessages([optimistic]);
    const normalizedTwice = normalizeChatMessages(normalizedOnce);

    expect(normalizedOnce[0]?.clientId).toBe(optimistic.clientId);
    expect(normalizedTwice[0]?.clientId).toBe(optimistic.clientId);
    expect(chatMessagesEqual(normalizedOnce, normalizedTwice)).toBe(true);
  });

  it("keeps one stable streaming assistant identity across deltas", () => {
    const generationId = 7;
    const streamClientId = createStreamingAssistantClientId(generationId);

    expect(createStreamingAssistantClientId(generationId)).toBe(streamClientId);

    const afterFirstDelta = createCompletedAssistantMessage({
      clientId: streamClientId,
      content: "Compound interest",
    });
    const afterFinalDelta = createCompletedAssistantMessage({
      clientId: streamClientId,
      content:
        "Compound interest grows on principal plus prior interest. It accelerates over time. Small regular contributions can compound significantly.",
    });

    expect(afterFirstDelta.clientId).toBe(streamClientId);
    expect(afterFinalDelta.clientId).toBe(streamClientId);
    expect(getMessageRenderKey(afterFinalDelta)).toBe(streamClientId);
  });

  it("finalizes streaming without creating a duplicate bubble identity", () => {
    const streamClientId = createStreamingAssistantClientId(3);
    const finalized = createCompletedAssistantMessage({
      clientId: streamClientId,
      content: "Done.",
    });

    const conversation = [
      createOptimisticUserMessage(DUPLICATE_PROMPT),
      finalized,
    ];

    expect(hasDuplicateRenderKeys(conversation)).toBe(false);
    expect(conversation).toHaveLength(2);
    expect(conversation[1]?.clientId).toBe(streamClientId);
  });

  it("uses durable database IDs for persisted reopen with identical content", () => {
    const persisted = normalizeChatMessages([
      {
        id: "11111111-1111-4111-8111-111111111111",
        role: "user",
        content: DUPLICATE_PROMPT,
        createdAt: "2026-08-13T12:00:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        role: "user",
        content: DUPLICATE_PROMPT,
        createdAt: "2026-08-13T12:01:00.000Z",
      },
    ]);

    expect(collectMessageRenderKeys(persisted)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(hasDuplicateRenderKeys(persisted)).toBe(false);
    expect(ensureChatMessageIdentity(persisted[0]!)?.clientId).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("never derives render keys from role and content", () => {
    const message = createOptimisticUserMessage(DUPLICATE_PROMPT);
    const renderKey = getMessageRenderKey(message);

    expect(renderKey).not.toBe(`user:${DUPLICATE_PROMPT}`);
    expect(renderKey).toBe(message.clientId);
  });
});
