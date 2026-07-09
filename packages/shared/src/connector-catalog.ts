/**
 * Curated connector catalog — well-known remote MCP servers an agent can be
 * wired to with one click. This is the front door for non-coding agents: a
 * ticket reviewer gets Jira + Confluence, a product agent gets Linear + Notion,
 * a work agent points at an internal company endpoint via the custom option.
 *
 * Entries here are OAuth-based remote servers: the agent's CLI completes the
 * login in-session (`/mcp` in Claude Code), so Roster never touches
 * credentials. Company-internal servers (ServiceNow, an O365 gateway, a
 * self-hosted Confluence bridge) are added as custom connectors with whatever
 * URL/command IT provides.
 */

export interface CatalogConnector {
	/** Stable key; also the default server name written to .mcp.json. */
	id: string;
	label: string;
	/** One-line, user-facing: what the agent can do once connected. */
	description: string;
	type: "http" | "sse";
	url: string;
}

export const CONNECTOR_CATALOG: CatalogConnector[] = [
	{
		id: "atlassian",
		label: "Atlassian (Jira & Confluence)",
		description: "Read and update Jira tickets and Confluence pages",
		type: "sse",
		url: "https://mcp.atlassian.com/v1/sse",
	},
	{
		id: "linear",
		label: "Linear",
		description: "Search, create, and update Linear issues and projects",
		type: "http",
		url: "https://mcp.linear.app/mcp",
	},
	{
		id: "notion",
		label: "Notion",
		description: "Read and write Notion pages and databases",
		type: "http",
		url: "https://mcp.notion.com/mcp",
	},
	{
		id: "asana",
		label: "Asana",
		description: "Manage Asana tasks and projects",
		type: "sse",
		url: "https://mcp.asana.com/sse",
	},
	{
		id: "monday",
		label: "monday.com",
		description: "Work with monday.com boards and items",
		type: "sse",
		url: "https://mcp.monday.com/sse",
	},
	{
		id: "intercom",
		label: "Intercom",
		description: "Look up conversations and customers in Intercom",
		type: "http",
		url: "https://mcp.intercom.com/mcp",
	},
	{
		id: "sentry",
		label: "Sentry",
		description: "Investigate errors and performance issues in Sentry",
		type: "http",
		url: "https://mcp.sentry.dev/mcp",
	},
	{
		id: "github",
		label: "GitHub",
		description: "Work with GitHub repos, issues, and pull requests",
		type: "http",
		url: "https://api.githubcopilot.com/mcp/",
	},
	{
		id: "stripe",
		label: "Stripe",
		description: "Query Stripe customers, payments, and invoices",
		type: "http",
		url: "https://mcp.stripe.com",
	},
	{
		id: "zapier",
		label: "Zapier",
		description: "Trigger thousands of app actions through Zapier",
		type: "http",
		url: "https://mcp.zapier.com/api/mcp/mcp",
	},
];
