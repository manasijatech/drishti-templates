import type { Portfolio, PortfolioHolding } from "~/types";

function formatHolding(holding: PortfolioHolding): string {
	const parts = [holding.symbol.trim().toUpperCase()];
	if (holding.quantity > 0) {
		parts.push(`${holding.quantity} shares`);
	}
	if (holding.averagePrice > 0) {
		parts.push(`avg ₹${holding.averagePrice}`);
	}
	const invested = holding.quantity * holding.averagePrice;
	if (invested > 0) {
		parts.push(`(₹${invested.toLocaleString("en-IN")} invested)`);
	}
	return parts.join(", ");
}

function formatPortfolio(portfolio: Portfolio): string {
	const validHoldings = portfolio.holdings.filter((h) => h.symbol.trim());
	if (validHoldings.length === 0) {
		return `- "${portfolio.name}": no holdings saved yet (ask user to add symbols in Configuration → Portfolio, or paste holdings once)`;
	}

	const lines = validHoldings.map((h) => `  • ${formatHolding(h)}`);
	return `- "${portfolio.name}" (${validHoldings.length} holdings):\n${lines.join("\n")}`;
}

/**
 * Builds agent context for portfolios configured in the app.
 * Returns empty string when the user has no portfolios.
 */
export function portfolioToContext(portfolios: Portfolio[]): string {
	if (!portfolios.length) return "";

	const portfolioBlocks = portfolios.map(formatPortfolio).join("\n");
	const names = portfolios.map((p) => `"${p.name}"`).join(", ");

	return [
		"The user has configured the following portfolios in Drishti (local app settings).",
		`Available portfolio names: ${names}.`,
		"When the user mentions a portfolio by name (e.g. Deion, My portfolio), use the matching holdings below.",
		"Do NOT ask them to paste holdings if the portfolio exists here with symbols. Fetch live prices via Drishti MCP tools.",
		"If a named portfolio has no holdings saved, ask only for that portfolio's symbols — not a full lecture about broker apps.",
		"",
		portfolioBlocks,
	].join("\n");
}

export function findPortfolioByName(
	portfolios: Portfolio[],
	name: string,
): Portfolio | undefined {
	const normalized = name.trim().toLowerCase();
	return portfolios.find((p) => p.name.trim().toLowerCase() === normalized);
}
