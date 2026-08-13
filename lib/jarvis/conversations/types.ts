export type MainConversationSummary = {
  id: string;
  title: string;
  lastMessageAt: string | null;
  updatedAt: string;
};

export type MessagePageCursor = {
  createdAt: string;
  id: string;
};
