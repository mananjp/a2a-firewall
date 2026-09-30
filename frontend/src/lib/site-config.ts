/**
 * Single source of truth for public, legally-binding site metadata.
 *
 * Every compliance page (/terms, /privacy, /refund, /pricing, /contact) and the
 * shared footer read from here, so an email, price, or address change happens in
 * exactly one place.
 *
 * NOTE: the identity strings below MUST stay byte-identical to the name on the
 * operator's PAN and settlement bank account. Payment-processor reviews compare
 * the "Operated by" line against the payout bank; a mismatch is a review flag.
 */

export const SITE = {
  brandName: "A2A Firewall",
  tagline: "Zero-Trust Inter-Agent Security & Governance Mesh",

  /** Public origin of the deployed Next.js frontend. Used for metadataBase. */
  siteUrl: "https://a2a-firewall.onrender.com",

  /** Must match the PAN / settlement bank account holder name. */
  legalName: "Panchal Manan Jayeshkumar",

  /** Sole proprietorship of the individual named above. */
  tradingAs: "A2A Firewall",
  entityLine: 'Panchal Manan Jayeshkumar, sole proprietor, trading as "A2A Firewall"',

  /** Rendered on /contact and in the ToS "Notices to" clause. */
  addressLines: [
    "F-104, Veda Apartments",
    "TP-13, Near Chhani Canal Road",
    "Vadodara, Gujarat 390024",
    "India",
  ],

  /**
   * All four roles resolve to the same mailbox. These were previously
   * privacy@/security@a2a-firewall.io, but a2a-firewall.io does not resolve in
   * DNS (NXDOMAIN) so those addresses were undeliverable.
   */
  emails: {
    support: "mananjpanchal11@gmail.com",
    privacy: "mananjpanchal11@gmail.com",
    security: "mananjpanchal11@gmail.com",
    billing: "mananjpanchal11@gmail.com",
  },

  governingLaw: "India",
  jurisdiction: "Vadodara, Gujarat",

  /** Human-readable, rendered in the masthead of every legal page. */
  effectiveDate: "30 September 2026",

  /** Promise windows quoted on /contact. Also referenced from the legal pages. */
  responseTimes: {
    support: "2 business days",
    privacy: "30 days",
    billing: "7 business days",
    security: "3 business days",
  },

  repositoryUrl: "https://github.com/mananjp/a2a-firewall",
} as const;

/** Flat, mailto-ready address list used by /contact and the footer. */
export const CONTACT_CHANNELS = [
  {
    key: "support",
    label: "Support",
    email: SITE.emails.support,
    description: "Setup help, SDK integration, agent onboarding, and general questions.",
    sla: SITE.responseTimes.support,
  },
  {
    key: "billing",
    label: "Billing & Subscriptions",
    email: SITE.emails.billing,
    description: "Invoices, plan changes, cancellation, and refund requests.",
    sla: SITE.responseTimes.billing,
  },
  {
    key: "privacy",
    label: "Privacy & Data Requests",
    email: SITE.emails.privacy,
    description: "Access, correction, or erasure requests; Grievance Officer contact.",
    sla: SITE.responseTimes.privacy,
  },
  {
    key: "security",
    label: "Security Disclosures",
    email: SITE.emails.security,
    description: "Responsible disclosure of vulnerabilities affecting the Service.",
    sla: SITE.responseTimes.security,
  },
] as const;

export type PlanId = "free" | "pro" | "team" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  blurb: string;
  /** INR per month. `null` means "not self-serve — contact sales". */
  priceMonthly: number | null;
  /** INR per year, billed as a single annual charge. `null` = contact sales. */
  priceAnnual: number | null;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
}

/**
 * Plan limits are transcribed from the live enforcement table at
 * `backend/src/a2a_firewall/core/quota_manager.py` (TIER_LIMITS). If quotas
 * change there, change them here.
 *
 * All prices are INCLUSIVE of all applicable taxes — the operator is not
 * GST-registered and does not levy GST, so the advertised figure is exactly
 * what a customer is charged.
 */
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    blurb: "Evaluate the full inspection pipeline on a single workspace.",
    priceMonthly: 0,
    priceAnnual: 0,
    features: [
      "10,000 inspections / month",
      "1 workspace",
      "2 API keys",
      "1 member",
      "7-day log retention",
      "Full 6-gate inspection pipeline",
      "Community support",
    ],
    cta: { label: "Start free", href: "/login" },
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "Semantic LLM detection, DLP vault, and MCP proxy for one operator.",
    priceMonthly: 1499,
    priceAnnual: 14990,
    features: [
      "100,000 inspections / month",
      "3 workspaces",
      "10 API keys",
      "1 member",
      "30-day log retention",
      "LLM detection layer",
      "DLP vault & PII scrubbing",
      "MCP proxy",
    ],
    cta: { label: "Start free", href: "/login" },
    highlight: true,
  },
  {
    id: "team",
    name: "Team",
    blurb: "Shared governance with alerting, RBAC, and longer retention.",
    priceMonthly: 4999,
    priceAnnual: 49990,
    features: [
      "500,000 inspections / month",
      "10 workspaces",
      "50 API keys",
      "25 members",
      "90-day log retention",
      "Everything in Pro",
      "Real-time alerting",
      "RBAC & audit export",
    ],
    cta: { label: "Start free", href: "/login" },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    blurb: "Unlimited volume, SSO/SCIM, and contractual security requirements.",
    priceMonthly: null,
    priceAnnual: null,
    features: [
      "Unlimited inspections",
      "Unlimited workspaces",
      "Unlimited API keys & members",
      "365-day log retention (compliance floor)",
      "Everything in Team",
      "SSO / SAML & SCIM provisioning",
      "Custom compliance packs",
      "Contractual DPA & security review",
    ],
    cta: { label: "Contact sales", href: "/contact" },
  },
];

/** Comparison-matrix rows for the /pricing table. */
export interface ComparisonRow {
  label: string;
  values: Record<PlanId, string>;
}

export const COMPARISON: ComparisonRow[] = [
  {
    label: "Inspections / month",
    values: { free: "10,000", pro: "100,000", team: "500,000", enterprise: "Unlimited" },
  },
  {
    label: "Workspaces",
    values: { free: "1", pro: "3", team: "10", enterprise: "Unlimited" },
  },
  {
    label: "API keys",
    values: { free: "2", pro: "10", team: "50", enterprise: "Unlimited" },
  },
  {
    label: "Members",
    values: { free: "1", pro: "1", team: "25", enterprise: "Unlimited" },
  },
  {
    label: "Log retention",
    values: { free: "7 days", pro: "30 days", team: "90 days", enterprise: "365 days" },
  },
  {
    label: "6-gate inspection pipeline",
    values: { free: "Yes", pro: "Yes", team: "Yes", enterprise: "Yes" },
  },
  {
    label: "LLM detection layer",
    values: { free: "No", pro: "Yes", team: "Yes", enterprise: "Yes" },
  },
  {
    label: "DLP vault & PII scrubbing",
    values: { free: "No", pro: "Yes", team: "Yes", enterprise: "Yes" },
  },
  {
    label: "MCP proxy",
    values: { free: "No", pro: "Yes", team: "Yes", enterprise: "Yes" },
  },
  {
    label: "Real-time alerting",
    values: { free: "No", pro: "No", team: "Yes", enterprise: "Yes" },
  },
  {
    label: "RBAC & audit export",
    values: { free: "No", pro: "No", team: "Yes", enterprise: "Yes" },
  },
  {
    label: "SSO / SAML & SCIM",
    values: { free: "No", pro: "No", team: "No", enterprise: "Yes" },
  },
];

/** "₹14,990" — en-IN grouping, no decimals. */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Annual saving as a percentage of paying monthly, rounded to a whole number. */
export function annualSavingPercent(plan: Plan): number | null {
  if (plan.priceMonthly === null || plan.priceAnnual === null || plan.priceMonthly === 0) {
    return null;
  }
  const monthlyYearly = plan.priceMonthly * 12;
  if (monthlyYearly <= plan.priceAnnual) return null;
  return Math.round(((monthlyYearly - plan.priceAnnual) / monthlyYearly) * 100);
}

/** Cross-link bar shown at the top of every legal page. */
export const LEGAL_PAGES = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund", label: "Cancellation & Refund" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
] as const;
