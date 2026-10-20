/**
 * Plain-English labels for Drishti MCP operations, so tool steps read like
 * "Reading exchange filings" instead of "Got Announcements get_announcements".
 */

type StepLabel = { active: string; done: string };

const LABELS: Record<string, StepLabel> = {
  read_me: { active: "Planning the research", done: "Planned the research" },
  search_tools: { active: "Finding the right data", done: "Found the right data" },
  describe_tools: { active: "Preparing data requests", done: "Prepared data requests" },
  get_workflow_prompt: { active: "Loading a research plan", done: "Loaded a research plan" },
  resolve_symbols: { active: "Finding the company", done: "Found the company" },
  get_symbols: { active: "Looking up company details", done: "Looked up company details" },
  get_daily_summary: { active: "Reading the market report", done: "Read the market report" },
  get_top_movers: { active: "Checking top gainers and losers", done: "Checked top gainers and losers" },
  get_top_traded: { active: "Checking volume spikes", done: "Checked volume spikes" },
  get_52w_data: { active: "Checking 52-week highs and lows", done: "Checked 52-week highs and lows" },
  get_price_and_volume_since: { active: "Fetching price history", done: "Fetched price history" },
  get_sectoral_data: { active: "Checking sector data", done: "Checked sector data" },
  get_sector_wise_companies: { active: "Finding peer companies", done: "Found peer companies" },
  get_news: { active: "Reading news", done: "Read news" },
  search_news: { active: "Searching news", done: "Searched news" },
  get_announcements: { active: "Reading exchange filings", done: "Read exchange filings" },
  search_announcements: { active: "Searching exchange filings", done: "Searched exchange filings" },
  get_announcement_categories: { active: "Loading filing types", done: "Loaded filing types" },
  get_events: { active: "Checking the event calendar", done: "Checked the event calendar" },
  get_upcoming_earnings: { active: "Checking upcoming results", done: "Checked upcoming results" },
  list_earnings: { active: "Finding results", done: "Found results" },
  get_earnings_filing: { active: "Reading quarterly results", done: "Read quarterly results" },
  get_concalls: { active: "Reading earnings calls", done: "Read earnings calls" },
  search_concalls: { active: "Searching earnings calls", done: "Searched earnings calls" },
  get_upcoming_concalls: { active: "Checking upcoming earnings calls", done: "Checked upcoming earnings calls" },
  get_block_deals: { active: "Checking block deals", done: "Checked block deals" },
};

function humanize(name: string): string {
  const words = name.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The Drishti operation a tool part runs (execute_tool wraps the real one). */
export function getDrishtiOperation(part: any): string {
  const toolName = typeof part?.toolName === "string" ? part.toolName : "";
  if (toolName === "execute_tool" && typeof part.input?.name === "string") {
    return part.input.name;
  }
  return toolName || "tool";
}

export function getStepLabel(operation: string, isActive: boolean): string {
  const label = LABELS[operation];
  if (label) return isActive ? label.active : label.done;
  return humanize(operation);
}

function asList(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && value.length > 0) {
    const items = value.filter((v) => typeof v === "string") as string[];
    if (items.length === 0) return null;
    return items.length > 3
      ? `${items.slice(0, 3).join(", ")} +${items.length - 3}`
      : items.join(", ");
  }
  return null;
}

/** A short detail for a step, e.g. "BANKNIFTY · last 7 days" or "\"capex\"". */
export function getStepDetail(part: any): string {
  const input = part?.input ?? {};
  const args =
    part?.toolName === "execute_tool" ? (input.arguments ?? {}) : input;
  const params =
    args && typeof args.query === "object" && args.query !== null
      ? { ...args, ...args.query }
      : args;
  if (!params || typeof params !== "object") return "";

  const bits: string[] = [];
  const symbols = asList(params.symbols) ?? asList(params.symbol);
  if (symbols) bits.push(symbols);
  if (typeof params.search_query === "string" && params.search_query) {
    bits.push(`"${params.search_query}"`);
  } else if (typeof params.query === "string" && params.query) {
    bits.push(`"${params.query}"`);
  }
  const days = params.lookback_days ?? params.days ?? params.days_count;
  if (typeof days === "number" && days > 0) {
    bits.push(days === 1 ? "last day" : `last ${days} days`);
  }
  const text = bits.join(" · ");
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}
