"use client";

import { CaretRight, Check, Copy, X } from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import { useMemo, useState } from "react";
import { unwrapMcpOutput } from "~/components/agent-elements/tools/mcp-tool";
import {
	getDrishtiOperation,
	getStepDetail,
} from "~/components/agent-elements/utils/drishti-labels";
import { normalizeToolPart } from "~/components/agent-elements/utils/tool-part-normalizer";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
	buildTraceTurns,
	extractSourceLinks,
	formatBytes,
	formatDuration,
	redactSecrets,
	type TraceCall,
	type TraceTurn,
	toJsonRpcRequest,
} from "~/lib/tool-trace";
import { cn } from "~/lib/utils";

/** Long responses are cut so the panel stays fast; the full text is one click away. */
const RESPONSE_PREVIEW_CHARS = 4000;

function prettyJson(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			aria-label="Copy"
			className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
			onClick={() => {
				void navigator.clipboard.writeText(text).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1200);
				});
			}}
			type="button"
		>
			{copied ? <Check className="size-3" /> : <Copy className="size-3" />}
			{copied ? "Copied" : "Copy"}
		</button>
	);
}

function CodeBlock({ label, text }: { label: string; text: string }) {
	const [expanded, setExpanded] = useState(false);
	const cut = !expanded && text.length > RESPONSE_PREVIEW_CHARS;
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between">
				<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
					{label}
				</p>
				<CopyButton text={text} />
			</div>
			<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">
				{cut ? `${text.slice(0, RESPONSE_PREVIEW_CHARS)}\n…` : text}
			</pre>
			{text.length > RESPONSE_PREVIEW_CHARS ? (
				<button
					className="text-[11px] text-primary hover:underline"
					onClick={() => setExpanded((v) => !v)}
					type="button"
				>
					{expanded
						? "Show less"
						: `Show full response (${formatBytes(text.length)})`}
				</button>
			) : null}
		</div>
	);
}

function StatusDot({ call }: { call: TraceCall }) {
	const { state, errorText } = call.part;
	const failed =
		Boolean(errorText) || state === "output-error" || call.timing?.isError;
	const running = !failed && state !== "output-available";
	return (
		<span
			className={cn(
				"size-1.5 shrink-0 rounded-full",
				failed && "bg-red-500",
				running && "animate-pulse bg-amber-500",
				!failed && !running && "bg-emerald-500",
			)}
		/>
	);
}

function TraceCallRow({ call, index }: { call: TraceCall; index: number }) {
	const part = normalizeToolPart(call.part) as TraceCall["part"];
	const operation = getDrishtiOperation(part);
	const wrapped = operation !== part.toolName;
	const detail = getStepDetail(part);

	const request = useMemo(
		() =>
			redactSecrets(prettyJson(toJsonRpcRequest(part.toolName, part.input))),
		[part.toolName, part.input],
	);
	const response = useMemo(() => {
		if (part.errorText) return redactSecrets(part.errorText);
		if (part.output === undefined) return "";
		return redactSecrets(prettyJson(unwrapMcpOutput(part.output)));
	}, [part.output, part.errorText]);
	const sources = useMemo(() => extractSourceLinks(response), [response]);

	return (
		<details className="group border-border border-b last:border-b-0">
			<summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5 hover:bg-muted/40">
				<CaretRight className="mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
				<span className="mt-px w-5 shrink-0 font-mono text-[10px] text-muted-foreground">
					{String(index + 1).padStart(2, "0")}
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						<StatusDot call={call} />
						<span className="truncate font-medium font-mono text-xs">
							{operation}
						</span>
					</div>
					<p className="mt-0.5 truncate text-[11px] text-muted-foreground">
						{wrapped ? (
							<span className="font-mono">via {part.toolName}</span>
						) : null}
						{wrapped && detail ? " · " : null}
						{detail}
					</p>
				</div>
				<div className="shrink-0 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
					{call.timing ? (
						<>
							<div className="text-foreground">
								{formatDuration(call.timing.durationMs)}
							</div>
							<div>{formatBytes(call.timing.responseBytes)}</div>
						</>
					) : part.state === "output-available" ? null : (
						<div>running</div>
					)}
				</div>
			</summary>
			<div className="space-y-3 px-3 pt-1 pb-3 pl-10">
				<CodeBlock label="Request · JSON-RPC" text={request} />
				{response ? <CodeBlock label="Response" text={response} /> : null}
				{sources.length > 0 ? (
					<div className="space-y-1">
						<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
							Sources returned
						</p>
						<ul className="space-y-0.5">
							{sources.map((url) => (
								<li
									className="truncate font-mono text-[11px] text-primary"
									key={url}
									title={url}
								>
									{url}
								</li>
							))}
						</ul>
					</div>
				) : null}
			</div>
		</details>
	);
}

function TurnSummary({ turn }: { turn: TraceTurn }) {
	const bits = [
		`${turn.calls.length} MCP ${turn.calls.length === 1 ? "call" : "calls"}`,
		turn.totalMcpMs > 0 ? `${formatDuration(turn.totalMcpMs)} in Drishti` : "",
		turn.usage ? `${turn.usage.totalTokens.toLocaleString()} tokens` : "",
		turn.usage ? `${turn.usage.requests} model turns` : "",
	].filter(Boolean);
	return (
		<p className="font-mono text-[10px] text-muted-foreground tabular-nums">
			{bits.join(" · ")}
		</p>
	);
}

export function TracePanelContent({ messages }: { messages: UIMessage[] }) {
	const turns = useMemo(() => buildTraceTurns(messages), [messages]);

	if (turns.length === 0) {
		return (
			<div className="space-y-2 px-4 py-6 text-muted-foreground text-sm">
				<p>Ask a question to see the trace.</p>
				<p className="text-xs">
					Each MCP call shows the operation the model chose, the exact
					arguments, the JSON-RPC request, the response, and how long Drishti
					took.
				</p>
			</div>
		);
	}

	return (
		<div className="divide-y divide-border">
			{turns.map((turn, i) => (
				<section className="py-1" key={turn.id}>
					<div className="space-y-1 px-3 pt-3 pb-2">
						<p className="line-clamp-2 font-medium text-sm">
							{turn.question || "Question"}
						</p>
						<TurnSummary turn={turn} />
					</div>
					{i === 0 ? (
						turn.calls.map((call, index) => (
							<TraceCallRow
								call={call}
								index={index}
								key={call.part.toolCallId}
							/>
						))
					) : (
						<details className="group">
							<summary className="cursor-pointer list-none px-3 pb-2 text-[11px] text-primary hover:underline">
								Show {turn.calls.length} calls
							</summary>
							{turn.calls.map((call, index) => (
								<TraceCallRow
									call={call}
									index={index}
									key={call.part.toolCallId}
								/>
							))}
						</details>
					)}
				</section>
			))}
		</div>
	);
}

export function TracePanel({
	messages,
	onClose,
}: {
	messages: UIMessage[];
	onClose: () => void;
}) {
	return (
		<aside className="hidden h-full min-h-0 w-[26rem] shrink-0 flex-col overflow-hidden border-border border-l bg-card lg:flex">
			<div className="flex shrink-0 items-center justify-between border-border border-b px-4 py-2">
				<div>
					<p className="type-eyebrow">Trace</p>
					<p className="text-[11px] text-muted-foreground">
						What the model asked Drishti MCP for
					</p>
				</div>
				<Button
					aria-label="Close trace"
					className="size-8"
					onClick={onClose}
					size="icon"
					variant="ghost"
				>
					<X className="size-4" />
				</Button>
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<TracePanelContent messages={messages} />
			</ScrollArea>
			<p className="shrink-0 border-border border-t px-4 py-2 text-[10px] text-muted-foreground">
				Timings are measured on the app server around each MCP call. API keys
				are hidden.
			</p>
		</aside>
	);
}
