export type DemoRoleId = "admin" | "auditor" | "trial" | "traffic";

export interface DemoRole {
  id: DemoRoleId;
  /** Display name shown on the role card. */
  title: string;
  /** Single-line description. */
  tagline: string;
  /** Longer description shown beneath the tagline. */
  description: string;
  /** Deterministic email used by both /register and /login. */
  email: string;
  /** Workspace name passed to /register on first click. */
  workspaceName: string;
  /** Where to land after a successful role login. */
  landingRoute: string;
  /** Accent color tokens used for the card glow. */
  accent: {
    border: string;
    glow: string;
    text: string;
    chip: string;
  };
  /** Capabilities the user can expect to have in this persona. */
  capabilities: string[];
}

export const DEMO_ROLES: DemoRole[] = [
  {
    id: "admin",
    title: "Workspace Admin",
    tagline: "Full control of agents, policies, and review queue.",
    description:
      "The default owner view. Register agents, write policy rules, decide review items, and inspect every layer of the pipeline.",
    email: "demo-admin@a2afirewall.local",
    workspaceName: "demo-admin",
    landingRoute: "/",
    accent: {
      border: "border-blue-500/40",
      glow: "from-blue-500/20 via-blue-500/5 to-transparent",
      text: "text-blue-300",
      chip: "bg-blue-500/15 text-blue-200 border-blue-500/30",
    },
    capabilities: [
      "Register & rotate agents",
      "Author policy rules",
      "Decide review queue",
      "Inspect violation traces",
    ],
  },
  {
    id: "auditor",
    title: "Read-only Auditor",
    tagline: "Compliance view focused on violations and lineage.",
    description:
      "Lands directly on the violations tab. Same data, no mutation rights — useful for security review and post-incident analysis.",
    email: "demo-auditor@a2afirewall.local",
    workspaceName: "demo-auditor",
    landingRoute: "/violations",
    accent: {
      border: "border-amber-500/40",
      glow: "from-amber-500/20 via-amber-500/5 to-transparent",
      text: "text-amber-300",
      chip: "bg-amber-500/15 text-amber-200 border-amber-500/30",
    },
    capabilities: [
      "Browse violation ledger",
      "Walk task lineage trees",
      "Open OpenTelemetry traces",
      "Export forensic data",
    ],
  },
  {
    id: "trial",
    title: "New Trial Workspace",
    tagline: "Empty onboarding — register your first agent yourself.",
    description:
      "A pristine workspace with no agents, no policies, and no traffic. Perfect for demoing the registration flow and the empty-state dashboards.",
    email: "demo-trial@a2afirewall.local",
    workspaceName: "demo-trial",
    landingRoute: "/agents",
    accent: {
      border: "border-emerald-500/40",
      glow: "from-emerald-500/20 via-emerald-500/5 to-transparent",
      text: "text-emerald-300",
      chip: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
    },
    capabilities: [
      "Brand-new tenant",
      "Zero pre-seeded data",
      "Onboarding-first tour",
      "Reset between demos",
    ],
  },
  {
    id: "traffic",
    title: "High-traffic Workspace",
    tagline: "Pre-seeded planner → researcher → summarizer chain.",
    description:
      "Already wired with the three canonical agents and the research schema from the seed script. Use this when you want a dashboard that looks alive on first paint.",
    email: "demo-traffic@a2afirewall.local",
    workspaceName: "demo-traffic",
    landingRoute: "/",
    accent: {
      border: "border-violet-500/40",
      glow: "from-violet-500/20 via-violet-500/5 to-transparent",
      text: "text-violet-300",
      chip: "bg-violet-500/15 text-violet-200 border-violet-500/30",
    },
    capabilities: [
      "3 agents pre-registered",
      "Research schema bound",
      "Permissions wired",
      "Stats dashboard live",
    ],
  },
];

export function getDemoRole(id: DemoRoleId): DemoRole {
  const found = DEMO_ROLES.find((r) => r.id === id);
  if (!found) throw new Error(`Unknown demo role: ${id}`);
  return found;
}
