"use client";

import { Plus, Trash } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";
import type { Portfolio, PortfolioHolding, Watchlist } from "~/types";

function formatInr(amount: number): string {
	return `₹${amount.toLocaleString("en-IN")}`;
}

export function PortfolioHoldingRow({
	holding,
	onChange,
	onRemove,
	variant = "compact",
}: {
	holding: PortfolioHolding;
	onChange: (holding: PortfolioHolding) => void;
	onRemove: () => void;
	variant?: "compact" | "table";
}) {
	const currentValue = holding.quantity * holding.averagePrice;

	if (variant === "table") {
		return (
			<div className="grid grid-cols-[minmax(0,1fr)_88px_104px_104px_40px] items-center gap-2">
				<Input
					aria-label="Symbol"
					onChange={(e) =>
						onChange({ ...holding, symbol: e.target.value.toUpperCase() })
					}
					placeholder="RELIANCE"
					value={holding.symbol}
				/>
				<Input
					aria-label="Quantity"
					min={0}
					onChange={(e) =>
						onChange({ ...holding, quantity: Number(e.target.value) || 0 })
					}
					placeholder="Qty"
					type="number"
					value={holding.quantity || ""}
				/>
				<Input
					aria-label="Average price"
					min={0}
					onChange={(e) =>
						onChange({
							...holding,
							averagePrice: Number(e.target.value) || 0,
						})
					}
					placeholder="Avg ₹"
					type="number"
					value={holding.averagePrice || ""}
				/>
				<span className="type-mono-data text-muted-foreground text-sm">
					{formatInr(currentValue)}
				</span>
				<Button
					aria-label="Remove holding"
					onClick={onRemove}
					size="icon"
					variant="ghost"
				>
					<Trash className="size-4" />
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-2 rounded-md border border-border/70 bg-background p-2.5">
			<div className="flex items-end gap-2">
				<div className="min-w-0 flex-1 space-y-1">
					<Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
						Symbol
					</Label>
					<Input
						className="h-8 text-xs"
						onChange={(e) =>
							onChange({ ...holding, symbol: e.target.value.toUpperCase() })
						}
						placeholder="RELIANCE"
						value={holding.symbol}
					/>
				</div>
				<Button
					aria-label="Remove holding"
					className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
					onClick={onRemove}
					size="icon"
					variant="ghost"
				>
					<Trash className="size-3.5" />
				</Button>
			</div>
			<div className="grid grid-cols-3 gap-2">
				<div className="space-y-1">
					<Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
						Qty
					</Label>
					<Input
						className="h-8 text-xs"
						min={0}
						onChange={(e) =>
							onChange({ ...holding, quantity: Number(e.target.value) || 0 })
						}
						placeholder="0"
						type="number"
						value={holding.quantity || ""}
					/>
				</div>
				<div className="space-y-1">
					<Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
						Avg ₹
					</Label>
					<Input
						className="h-8 text-xs"
						min={0}
						onChange={(e) =>
							onChange({
								...holding,
								averagePrice: Number(e.target.value) || 0,
							})
						}
						placeholder="0"
						type="number"
						value={holding.averagePrice || ""}
					/>
				</div>
				<div className="space-y-1">
					<Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
						Value
					</Label>
					<div className="type-mono-data flex h-8 items-center text-foreground text-xs">
						{formatInr(currentValue)}
					</div>
				</div>
			</div>
		</div>
	);
}

export function PortfolioCard({
	portfolio,
	holdings,
	onHoldingChange,
	onHoldingRemove,
	onAddHolding,
	onSave,
	onRemove,
	variant = "compact",
	autoSave = false,
}: {
	portfolio: Portfolio;
	holdings: PortfolioHolding[];
	onHoldingChange: (index: number, holding: PortfolioHolding) => void;
	onHoldingRemove: (index: number) => void;
	onAddHolding: () => void;
	onSave?: () => void;
	onRemove: () => void;
	variant?: "compact" | "table";
	autoSave?: boolean;
}) {
	const totalInvested = holdings.reduce(
		(sum, holding) => sum + holding.quantity * holding.averagePrice,
		0,
	);

	return (
		<div
			className={cn("overflow-hidden rounded-lg border border-border bg-card")}
		>
			<div className="flex items-start justify-between gap-2 border-border border-b bg-muted/30 px-3 py-2.5">
				<div className="min-w-0">
					<p className="truncate font-medium text-foreground text-sm">
						{portfolio.name}
					</p>
					<p className="type-mono-data mt-0.5 text-muted-foreground text-xs">
						{holdings.length} {holdings.length === 1 ? "holding" : "holdings"} ·{" "}
						{formatInr(totalInvested)}
					</p>
				</div>
				<Button
					aria-label={`Delete ${portfolio.name}`}
					className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
					onClick={onRemove}
					size="icon"
					variant="ghost"
				>
					<Trash className="size-3.5" />
				</Button>
			</div>

			<div className="space-y-2 p-3">
				{variant === "table" ? (
					<div className="grid grid-cols-[minmax(0,1fr)_88px_104px_104px_40px] gap-2 px-0.5 text-muted-foreground text-xs">
						<span>Symbol</span>
						<span>Qty</span>
						<span>Avg price</span>
						<span>Value</span>
						<span className="sr-only">Actions</span>
					</div>
				) : null}

				{holdings.length === 0 ? (
					<p className="rounded-md border border-border border-dashed px-3 py-4 text-center text-muted-foreground text-xs">
						No holdings yet. Add a stock to track.
					</p>
				) : (
					holdings.map((holding, index) => (
						<PortfolioHoldingRow
							holding={holding}
							key={`${portfolio.id}-holding-${index}`}
							onChange={(next) => onHoldingChange(index, next)}
							onRemove={() => onHoldingRemove(index)}
							variant={variant}
						/>
					))
				)}

				<div className="flex flex-wrap items-center gap-2 pt-1">
					<Button
						className="h-8 text-xs"
						onClick={onAddHolding}
						size="sm"
						variant="outline"
					>
						<Plus className="mr-1 size-3.5" />
						Add holding
					</Button>
					{autoSave ? (
						<span className="text-[10px] text-muted-foreground">
							Saved automatically for the assistant
						</span>
					) : onSave ? (
						<Button className="h-8 text-xs" onClick={onSave} size="sm">
							Save changes
						</Button>
					) : null}
				</div>
			</div>
		</div>
	);
}

export function PortfolioCreateForm({
	name,
	onNameChange,
	onSubmit,
	variant = "compact",
}: {
	name: string;
	onNameChange: (value: string) => void;
	onSubmit: () => void;
	variant?: "compact" | "table";
}) {
	const compact = variant === "compact";
	return (
		<div className="flex gap-2">
			<Input
				aria-label="New portfolio name"
				className={cn("min-w-0 flex-1", compact && "h-8 text-xs")}
				onChange={(e) => onNameChange(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") onSubmit();
				}}
				placeholder="New portfolio, e.g. Long term"
				value={name}
			/>
			<Button
				className={cn("shrink-0", compact && "h-8 px-3 text-xs")}
				disabled={!name.trim()}
				onClick={onSubmit}
				size="sm"
			>
				<Plus className="mr-1 size-3.5" />
				Add
			</Button>
		</div>
	);
}

export function WatchlistCreateForm({
	newName,
	newSymbols,
	onNameChange,
	onSymbolsChange,
	onAdd,
	variant = "compact",
	embedded = false,
}: {
	newName: string;
	newSymbols: string;
	onNameChange: (value: string) => void;
	onSymbolsChange: (value: string) => void;
	onAdd: () => void;
	variant?: "compact" | "table";
	embedded?: boolean;
}) {
	const compact = variant === "compact";

	return (
		<div
			className={cn(
				"space-y-2",
				!embedded && "rounded-lg border border-border bg-muted/20 p-3",
			)}
		>
			<div className="space-y-1">
				<Label
					className={cn(
						compact
							? "text-[10px] text-muted-foreground uppercase tracking-wide"
							: "text-xs",
					)}
					htmlFor="watchlist-name"
				>
					Name
				</Label>
				<Input
					className={compact ? "h-8 text-xs" : undefined}
					id="watchlist-name"
					onChange={(e) => onNameChange(e.target.value)}
					placeholder="IT majors"
					value={newName}
				/>
			</div>
			<div className="space-y-1">
				<Label
					className={cn(
						compact
							? "text-[10px] text-muted-foreground uppercase tracking-wide"
							: "text-xs",
					)}
					htmlFor="watchlist-symbols"
				>
					Symbols
				</Label>
				<Input
					className={compact ? "h-8 text-xs" : undefined}
					id="watchlist-symbols"
					onChange={(e) => onSymbolsChange(e.target.value)}
					placeholder="TCS, INFY, RELIANCE"
					value={newSymbols}
				/>
			</div>
			<Button
				className={cn("w-full", compact ? "h-8 text-xs" : "")}
				disabled={!newName.trim()}
				onClick={onAdd}
				size="sm"
				variant="outline"
			>
				<Plus className="mr-1 size-3.5" />
				Add watchlist
			</Button>
		</div>
	);
}

export function WatchlistList({
	watchlists,
	onRemove,
}: {
	watchlists: Watchlist[];
	onRemove: (id: string) => void;
}) {
	if (watchlists.length === 0) {
		return <p className="text-muted-foreground text-xs">No watchlists yet.</p>;
	}

	return (
		<div className="space-y-2">
			{watchlists.map((watchlist) => (
				<div
					className="rounded-lg border border-border bg-card p-3"
					key={watchlist.id}
				>
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0">
							<p className="font-medium text-foreground text-sm">
								{watchlist.name}
							</p>
							<p className="mt-0.5 text-muted-foreground text-xs">
								{watchlist.symbols.length}{" "}
								{watchlist.symbols.length === 1 ? "symbol" : "symbols"}
							</p>
						</div>
						<Button
							aria-label={`Delete ${watchlist.name}`}
							className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
							onClick={() => onRemove(watchlist.id)}
							size="icon"
							variant="ghost"
						>
							<Trash className="size-3.5" />
						</Button>
					</div>
					{watchlist.symbols.length > 0 ? (
						<div className="mt-2.5 flex flex-wrap gap-1.5">
							{watchlist.symbols.map((symbol) => (
								<Badge
									className="type-mono-data text-[11px]"
									key={symbol}
									variant="secondary"
								>
									{symbol}
								</Badge>
							))}
						</div>
					) : (
						<p className="mt-2 text-muted-foreground text-xs">
							No symbols added.
						</p>
					)}
				</div>
			))}
		</div>
	);
}

export function WatchlistSection({
	watchlists,
	newName,
	newSymbols,
	onNameChange,
	onSymbolsChange,
	onAdd,
	onRemove,
	variant = "compact",
	showCreateForm = true,
	showList = true,
}: {
	watchlists: Watchlist[];
	newName: string;
	newSymbols: string;
	onNameChange: (value: string) => void;
	onSymbolsChange: (value: string) => void;
	onAdd: () => void;
	onRemove: (id: string) => void;
	variant?: "compact" | "table";
	showCreateForm?: boolean;
	showList?: boolean;
}) {
	const [formOpen, setFormOpen] = useState(false);

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<p className="font-medium text-foreground text-xs">
					Watchlists
					{watchlists.length > 0 ? (
						<span className="ml-1 text-muted-foreground">
							({watchlists.length})
						</span>
					) : null}
				</p>
				{showCreateForm && !formOpen ? (
					<Button
						className="h-7 px-2 text-xs"
						onClick={() => setFormOpen(true)}
						size="sm"
						variant="ghost"
					>
						<Plus className="mr-1 size-3.5" />
						New watchlist
					</Button>
				) : null}
			</div>

			{showList ? (
				<WatchlistList onRemove={onRemove} watchlists={watchlists} />
			) : null}

			{showCreateForm && formOpen ? (
				<div className="an-step-in space-y-2">
					<WatchlistCreateForm
						newName={newName}
						newSymbols={newSymbols}
						onAdd={() => {
							onAdd();
							if (newName.trim()) setFormOpen(false);
						}}
						onNameChange={onNameChange}
						onSymbolsChange={onSymbolsChange}
						variant={variant}
					/>
					<button
						className="text-[11px] text-muted-foreground hover:text-foreground"
						onClick={() => setFormOpen(false)}
						type="button"
					>
						Cancel
					</button>
				</div>
			) : null}
		</div>
	);
}

export function PortfolioEmptyState({ children }: { children?: ReactNode }) {
	return (
		<p className="text-muted-foreground text-xs">
			{children ?? "No portfolios yet. Add one above, then add its stocks."}
		</p>
	);
}

export function PortfolioSectionDivider() {
	return <Separator className="my-1" />;
}
