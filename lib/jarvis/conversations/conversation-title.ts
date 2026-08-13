const MAX_TITLE_LENGTH = 70;

export function deriveConversationTitle(firstMessage: string): string {
  const collapsed = firstMessage.replace(/\s+/g, " ").trim();
  const withoutControl = collapsed.replace(/[\u0000-\u001F\u007F]/g, "");
  const withoutMarkdown = withoutControl.replace(/[#*_`>[\]()]/g, "").trim();

  if (withoutMarkdown.length === 0) {
    return "New conversation";
  }

  if (withoutMarkdown.length <= MAX_TITLE_LENGTH) {
    return withoutMarkdown;
  }

  return `${withoutMarkdown.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}
