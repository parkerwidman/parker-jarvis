export type ChatMessageInput = {
  id?: string;
  clientId?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

export type ChatMessage = ChatMessageInput & {
  clientId: string;
};

export function createClientMessageId(): string {
  return crypto.randomUUID();
}

export function createStreamingAssistantClientId(generationId: number): string {
  return `assistant-stream-${generationId}`;
}

export function getMessageRenderKey(
  message: Pick<ChatMessage, "id" | "clientId">,
): string {
  return message.id ?? message.clientId;
}

export function ensureChatMessageIdentity(message: {
  id?: string;
  clientId?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}): ChatMessage | null {
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }

  if (typeof message.content !== "string") {
    return null;
  }

  const content = message.content.trim();

  if (content.length === 0) {
    return null;
  }

  const clientId =
    message.clientId ??
    (typeof message.id === "string" ? message.id : createClientMessageId());

  return {
    id: typeof message.id === "string" ? message.id : undefined,
    clientId,
    role: message.role,
    content,
    createdAt: message.createdAt,
  };
}

export function normalizeChatMessages(
  messages: ChatMessageInput[],
): ChatMessage[] {
  return messages.flatMap((message) => {
    const normalized = ensureChatMessageIdentity(message);
    return normalized ? [normalized] : [];
  });
}

export function createOptimisticUserMessage(content: string): ChatMessage {
  return {
    clientId: createClientMessageId(),
    role: "user",
    content: content.trim(),
  };
}

export function createCompletedAssistantMessage(input: {
  content: string;
  clientId: string;
  id?: string;
}): ChatMessage {
  return {
    id: input.id,
    clientId: input.clientId,
    role: "assistant",
    content: input.content.trim(),
  };
}

export function chatMessagesEqual(
  left: ChatMessage[],
  right: ChatMessage[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every(
    (message, index) =>
      message.clientId === right[index]?.clientId &&
      message.id === right[index]?.id &&
      message.role === right[index]?.role &&
      message.content === right[index]?.content,
  );
}

export function collectMessageRenderKeys(messages: ChatMessage[]): string[] {
  return messages.map(getMessageRenderKey);
}

export function hasDuplicateRenderKeys(messages: ChatMessage[]): boolean {
  const keys = collectMessageRenderKeys(messages);
  return new Set(keys).size !== keys.length;
}
