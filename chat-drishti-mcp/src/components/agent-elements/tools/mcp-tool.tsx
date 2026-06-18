import { memo, useMemo } from "react";
import { Streamdown } from "streamdown";
import { createCodePlugin } from "@streamdown/code";
import { getToolStatus, areToolPropsEqual } from "../utils/format-tool";
import type { McpToolInfo } from "./tool-registry";
import { ToolRowBase } from "./tool-row-base";

export type McpToolProps = {
  part: any;
  mcpInfo: McpToolInfo;
  chatStatus?: string;
  defaultOpen?: boolean;
};

const PRIORITY_ARGS = [
  "query",
  "question",
  "symbol",
  "email",
  "name",
  "id",
  "customer",
  "url",
  "issue",
  "body",
  "summary",
  "title",
];

const ACTIVE_VERBS: Record<string, string> = {
  List: "Listing",
  Get: "Getting",
  Create: "Creating",
  Update: "Updating",
  Delete: "Deleting",
  Search: "Searching",
  Fetch: "Fetching",
  Retrieve: "Retrieving",
  Send: "Sending",
  Generate: "Generating",
  Add: "Adding",
  Remove: "Removing",
  Modify: "Modifying",
  Draft: "Drafting",
  Manage: "Managing",
  Query: "Querying",
  Start: "Starting",
  Set: "Setting",
  Check: "Checking",
  Find: "Finding",
};

const COMPLETED_VERBS: Record<string, string> = {
  List: "Listed",
  Get: "Got",
  Create: "Created",
  Update: "Updated",
  Delete: "Deleted",
  Search: "Searched",
  Fetch: "Fetched",
  Retrieve: "Retrieved",
  Send: "Sent",
  Generate: "Generated",
  Add: "Added",
  Remove: "Removed",
  Modify: "Modified",
  Draft: "Drafted",
  Manage: "Managed",
  Query: "Queried",
  Start: "Started",
  Set: "Set",
  Check: "Checked",
  Find: "Found",
};

function getActiveTitle(info: McpToolInfo): string {
  const words = info.displayName.split(" ");
  const verb = words[0] ?? "";
  const rest = words.slice(1).join(" ");
  const active = ACTIVE_VERBS[verb];
  if (active) return rest ? `${active} ${rest}` : active;
  return info.displayName;
}

function getCompletedTitle(info: McpToolInfo): string {
  const words = info.displayName.split(" ");
  const verb = words[0] ?? "";
  const rest = words.slice(1).join(" ");
  const completed = COMPLETED_VERBS[verb];
  return completed
    ? rest
      ? `${completed} ${rest}`
      : completed
    : info.displayName;
}

const INPUT_LABELS: Record<string, string> = {
  query: "Query",
  question: "Question",
  symbol: "Symbol",
  email: "Email",
  name: "Name",
  id: "ID",
  customer: "Customer",
  url: "URL",
  issue: "Issue",
  body: "Body",
  summary: "Summary",
  title: "Title",
};

type PrimaryInput = {
  key: string;
  label: string;
  value: string;
};

function getInputEntries(input: unknown): [string, unknown][] {
  if (!input || typeof input !== "object") return [];
  return Object.entries(input).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
}

function sortInputEntries(entries: [string, unknown][]): [string, unknown][] {
  return [...entries].sort(([a], [b]) => {
    const ai = PRIORITY_ARGS.indexOf(a);
    const bi = PRIORITY_ARGS.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });
}

function stringifyInputValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function extractPrimaryInput(input: unknown): PrimaryInput | null {
  const entries = sortInputEntries(getInputEntries(input));
  if (entries.length === 0) return null;

  const [key, value] = entries[0]!;
  return {
    key,
    label: INPUT_LABELS[key] ?? key.replace(/_/g, " "),
    value: stringifyInputValue(value),
  };
}

function formatMcpArgs(input: any): string {
  const primary = extractPrimaryInput(input);
  if (primary) {
    const display =
      primary.value.length > 50
        ? `${primary.value.slice(0, 47)}...`
        : primary.value;
    return display;
  }

  const entries = sortInputEntries(getInputEntries(input));
  if (entries.length === 0) return "";

  const parts: string[] = [];
  for (const [key, value] of entries) {
    if (parts.length >= 2) break;
    const val = stringifyInputValue(value);
    const display = val.length > 30 ? `${val.slice(0, 27)}...` : val;
    parts.push(`${key}: ${display}`);
  }
  return parts.join("  ");
}

function formatInputForDisplay(input: unknown): string | null {
  const entries = getInputEntries(input);
  if (entries.length === 0) return null;
  const text = JSON.stringify(Object.fromEntries(entries), null, 2);
  return text.length > 3000 ? `${text.slice(0, 3000)}\n...` : text;
}

function shouldShowFullInputJson(
  input: unknown,
  primary: PrimaryInput | null,
): boolean {
  const entries = getInputEntries(input);
  if (entries.length === 0) return false;
  if (!primary) return true;
  if (entries.length > 1) return true;
  const [onlyValue] = entries[0] ?? [];
  if (onlyValue !== primary.key) return true;
  return primary.value.length > 120 || primary.value.includes("\n");
}

export function unwrapMcpOutput(output: any): any {
  if (!output) return output;
  if (Array.isArray(output)) {
    const textParts: string[] = [];
    for (const block of output) {
      if (block?.type === "text" && typeof block?.text === "string") {
        textParts.push(block.text);
      }
    }
    if (textParts.length > 0) {
      const combined = textParts.join("");
      try {
        return JSON.parse(combined);
      } catch {
        return combined;
      }
    }
    return output;
  }
  if (output?.type === "text" && typeof output?.text === "string") {
    try {
      return JSON.parse(output.text);
    } catch {
      return output.text;
    }
  }
  if (typeof output === "string") {
    try {
      return JSON.parse(output);
    } catch {
      return output;
    }
  }
  return output;
}

function formatOutputForDisplay(output: any): string {
  const unwrapped = unwrapMcpOutput(output);
  if (typeof unwrapped === "string") {
    return unwrapped.length > 3000
      ? unwrapped.slice(0, 3000) + "\n..."
      : unwrapped;
  }
  const text = JSON.stringify(unwrapped, null, 2);
  return text.length > 3000 ? text.slice(0, 3000) + "\n..." : text;
}

const code = createCodePlugin({
  themes: ["github-light", "github-dark"],
});

export const McpTool = memo(function McpTool({
  part,
  mcpInfo,
  chatStatus,
  defaultOpen,
}: McpToolProps) {
  const { isPending, isInterrupted } = getToolStatus(part, chatStatus);

  const title = useMemo(() => {
    if (part.state === "input-streaming")
      return `Preparing ${mcpInfo.displayName}`;
    if (isPending) return getActiveTitle(mcpInfo);
    return getCompletedTitle(mcpInfo);
  }, [part.state, isPending, mcpInfo]);

  const primaryInput = useMemo(
    () => extractPrimaryInput(part.input),
    [part.input],
  );

  const subtitle = useMemo(() => {
    if (part.state === "input-streaming") return "";
    return formatMcpArgs(part.input);
  }, [part.input, part.state]);

  const inputJson = useMemo(
    () => formatInputForDisplay(part.input),
    [part.input],
  );

  const showFullInputJson = useMemo(
    () => shouldShowFullInputJson(part.input, primaryInput),
    [part.input, primaryInput],
  );

  const inputCodeBlock = useMemo(() => {
    if (!inputJson || !showFullInputJson) return null;
    return `\`\`\`json\n${inputJson}\n\`\`\``;
  }, [inputJson, showFullInputJson]);

  const displayOutput = useMemo(() => {
    if (!part.output) return null;
    return formatOutputForDisplay(part.output);
  }, [part.output]);

  const codeBlock = useMemo(() => {
    if (!displayOutput) return null;
    const trimmed = displayOutput.trim();
    if (!trimmed) return null;
    const language =
      trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "text";
    return `\`\`\`${language}\n${displayOutput}\n\`\`\``;
  }, [displayOutput]);

  const hasExpandableContent = !!(inputJson || codeBlock);

  if (isInterrupted && !part.output) {
    return (
      <span className="text-sm text-an-tool-color-muted">
        {mcpInfo.displayName} interrupted
      </span>
    );
  }

  return (
    <div className="an-tool-mcp">
      <ToolRowBase
        shimmerLabel={title}
        completeLabel={title}
        isAnimating={isPending}
        detail={subtitle || undefined}
        trailingContent={undefined}
        expandable={hasExpandableContent}
        defaultOpen={defaultOpen}
      >
        {(primaryInput || inputCodeBlock || codeBlock) && (
          <div className="rounded-an-tool-border-radius overflow-hidden border border-border bg-an-tool-background">
            {primaryInput && (
              <div className="flex min-h-7 items-center gap-1 border-an-tool-border-color border-b px-2.5 py-1 text-xs">
                <span className="shrink-0 font-medium text-foreground">
                  {primaryInput.label}
                </span>
                <span className="min-w-0 truncate text-muted-foreground">
                  &ldquo;{primaryInput.value}&rdquo;
                </span>
              </div>
            )}
            {!primaryInput && inputJson && (
              <div className="flex min-h-7 items-center border-an-tool-border-color border-b px-2.5 py-1 text-xs">
                <span className="font-medium text-foreground">Input</span>
              </div>
            )}
            {inputCodeBlock && (
              <div className="an-markdown border-an-tool-border-color border-b px-2 py-1.5 text-[12px] last:border-b-0">
                <Streamdown plugins={{ code }} controls={{ code: false }}>
                  {inputCodeBlock}
                </Streamdown>
              </div>
            )}
            {codeBlock && (
              <>
                {inputJson && (
                  <div className="flex min-h-7 items-center border-an-tool-border-color border-b px-2.5 py-1 text-xs">
                    <span className="font-medium text-foreground">Result</span>
                  </div>
                )}
                <div className="an-markdown px-2 py-1.5 text-[12px]">
                  <Streamdown plugins={{ code }} controls={{ code: false }}>
                    {codeBlock}
                  </Streamdown>
                </div>
              </>
            )}
          </div>
        )}
      </ToolRowBase>
    </div>
  );
}, areToolPropsEqual);
