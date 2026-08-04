export type MelusiProductSurface = {
  label: string;
  url: string;
};

export type MelusiProductLine = {
  name: string;
  audience: "B2C" | "B2B" | "Content";
  surfaces: MelusiProductSurface[];
};

export const MELUSI_PRODUCT_LINES: MelusiProductLine[] = [
  {
    name: "AI Foundations",
    audience: "B2C",
    surfaces: [
      { label: "Main site", url: "https://melusi.ai" },
      { label: "Learn", url: "https://learn.melusi.ai" },
      { label: "Quiz", url: "https://quiz.melusi.ai" },
    ],
  },
  {
    name: "AI Foundations for Real Estate",
    audience: "B2B",
    surfaces: [
      { label: "Main site", url: "https://realestate.melusi.ai" },
      { label: "Learn", url: "https://learnrealestate.melusi.ai" },
    ],
  },
  {
    name: "Blog",
    audience: "Content",
    surfaces: [{ label: "Blog", url: "https://blog.melusi.ai" }],
  },
];

export type MelusiIntegrationKey =
  | "revenue"
  | "social"
  | "leads"
  | "research"
  | "knowledge";

export type MelusiIntegrationStatus = {
  key: MelusiIntegrationKey;
  label: string;
  connected: false;
  setupHint: string;
  futureRoute: string | null;
};

export const MELUSI_INTEGRATIONS: MelusiIntegrationStatus[] = [
  {
    key: "revenue",
    label: "Sales & revenue",
    connected: false,
    setupHint: "Gumroad and Mercury integrations are not connected yet.",
    futureRoute: "/melusi/revenue",
  },
  {
    key: "social",
    label: "Social performance",
    connected: false,
    setupHint: "Metricool and social platform integrations are not connected yet.",
    futureRoute: "/melusi/social",
  },
  {
    key: "leads",
    label: "Leads",
    connected: false,
    setupHint: "Lead tracking is not connected yet.",
    futureRoute: null,
  },
  {
    key: "research",
    label: "Live research",
    connected: false,
    setupHint: "Live web research tools are not connected yet.",
    futureRoute: null,
  },
  {
    key: "knowledge",
    label: "Knowledge base",
    connected: false,
    setupHint: "Document ingestion is not connected yet.",
    futureRoute: "/melusi/knowledge",
  },
];

export type MelusiQuickAction = {
  id: string;
  label: string;
  prompt: string;
  requiresIntegration: MelusiIntegrationKey | null;
  setupMessage: string | null;
};

export const MELUSI_QUICK_ACTIONS: MelusiQuickAction[] = [
  {
    id: "create-content",
    label: "Create content",
    prompt: "Help me plan content for Melusi this week.",
    requiresIntegration: null,
    setupMessage: null,
  },
  {
    id: "plan-week",
    label: "Plan this week",
    prompt: "Review my active Melusi projects and tasks and help me plan this week.",
    requiresIntegration: null,
    setupMessage: null,
  },
  {
    id: "research-topic",
    label: "Research a topic",
    prompt: "I want to research a business topic for Melusi.",
    requiresIntegration: "research",
    setupMessage:
      "Live web research is not connected yet. I can still help you think through the topic, outline questions, and suggest an experiment plan using your stored Melusi project data.",
  },
  {
    id: "review-social",
    label: "Review social performance",
    prompt: "Review Melusi social performance.",
    requiresIntegration: "social",
    setupMessage:
      "Social analytics are not connected yet. Connect Metricool or social platforms to review performance data.",
  },
  {
    id: "analyze-revenue",
    label: "Analyze revenue",
    prompt: "Analyze Melusi revenue trends.",
    requiresIntegration: "revenue",
    setupMessage:
      "Revenue data is not connected yet. Connect Gumroad and Mercury to analyze sales and revenue.",
  },
  {
    id: "follow-up-leads",
    label: "Find leads to follow up",
    prompt: "Which Melusi leads need follow-up?",
    requiresIntegration: "leads",
    setupMessage:
      "Lead tracking is not connected yet. I can help review Melusi tasks and project updates related to outreach instead.",
  },
  {
    id: "strategic-advice",
    label: "Ask for strategic advice",
    prompt: "Give me strategic advice on Melusi's current priorities.",
    requiresIntegration: null,
    setupMessage: null,
  },
  {
    id: "search-knowledge",
    label: "Search Melusi knowledge",
    prompt: "Search Melusi knowledge for relevant context.",
    requiresIntegration: "knowledge",
    setupMessage:
      "Knowledge search is not connected yet. I can use your stored Melusi projects, tasks, and project updates instead.",
  },
];
