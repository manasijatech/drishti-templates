"use client";

import { useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useMemoryStore } from "~/stores";
import type { PortfolioHolding } from "~/types";

function HoldingRow({
	holding,
	onChange,
	onRemove,
}: {
	holding: PortfolioHolding;
	onChange: (h: PortfolioHolding) => void;
	onRemove: () => void;
}) {
	const currentValue = holding.quantity * holding.averagePrice;
	return (
		<div className="grid grid-cols-[1fr_80px_100px_100px_40px] items-center gap-2">
			<Input
				onChange={(e) =>
					onChange({ ...holding, symbol: e.target.value.toUpperCase() })
				}
				placeholder="RELIANCE"
				value={holding.symbol}
			/>
			<Input
				min={0}
				onChange={(e) =>
					onChange({ ...holding, quantity: Number(e.target.value) || 0 })
				}
				placeholder="Qty"
				type="number"
				value={holding.quantity || ""}
			/>
			<Input
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
			<span className="type-mono-data text-muted-foreground">
				₹{currentValue.toLocaleString("en-IN")}
			</span>
			<Button onClick={onRemove} size="icon" variant="ghost">
				<Trash className="size-4" />
			</Button>
		</div>
	);
}

export function PortfolioPage() {
	const {
		portfolios,
		watchlists,
		addPortfolio,
		updatePortfolio,
		removePortfolio,
		addWatchlist,
		removeWatchlist,
	} = useMemoryStore();

	const [newPortfolioName, setNewPortfolioName] = useState("");
	const [newWatchlistName, setNewWatchlistName] = useState("");
	const [newWatchlistSymbols, setNewWatchlistSymbols] = useState("");
	const [editingHoldings, setEditingHoldings] = useState<
		Record<string, PortfolioHolding[]>
	>({});

	const handleCreatePortfolio = () => {
		if (!newPortfolioName.trim()) return;
		addPortfolio({
			name: newPortfolioName.trim(),
			holdings: [],
		});
		setNewPortfolioName("");
	};

	const handleCreateWatchlist = () => {
		if (!newWatchlistName.trim()) return;
		addWatchlist({
			name: newWatchlistName.trim(),
			symbols: newWatchlistSymbols
				.split(",")
				.map((s) => s.trim().toUpperCase())
				.filter(Boolean),
		});
		setNewWatchlistName("");
		setNewWatchlistSymbols("");
	};

	const getHoldings = (portfolioId: string, defaultHoldings: PortfolioHolding[]) =>
		editingHoldings[portfolioId] ?? defaultHoldings;

	const saveHoldings = (portfolioId: string) => {
		const holdings = editingHoldings[portfolioId];
		if (holdings) {
			updatePortfolio(portfolioId, { holdings });
		}
	};

	return (
		<div className="mx-auto max-w-4xl space-y-8 p-6 md:p-8">
			<div>
				<p className="type-eyebrow mb-2">Holdings</p>
				<h1 className="type-h2 text-foreground">Portfolio</h1>
				<p className="type-body-prose mt-2">
					Manage holdings and watchlists. Data stays local and is shared with the assistant as context.
				</p>
			</div>

			<Tabs defaultValue="portfolios">
				<TabsList>
					<TabsTrigger value="portfolios">Portfolios</TabsTrigger>
					<TabsTrigger value="watchlists">Watchlists</TabsTrigger>
				</TabsList>

				<TabsContent className="space-y-4" value="portfolios">
					<Card>
						<CardHeader>
							<CardTitle>Create Portfolio</CardTitle>
						</CardHeader>
						<CardContent className="flex gap-2">
							<Input
								onChange={(e) => setNewPortfolioName(e.target.value)}
								placeholder="My Portfolio"
								value={newPortfolioName}
							/>
							<Button onClick={handleCreatePortfolio}>
								<Plus className="mr-1 size-4" />
								Add
							</Button>
						</CardContent>
					</Card>

					{portfolios.map((portfolio) => {
						const holdings = getHoldings(portfolio.id, portfolio.holdings);
						const totalInvested = holdings.reduce(
							(sum, h) => sum + h.quantity * h.averagePrice,
							0,
						);

						return (
							<Card key={portfolio.id}>
								<CardHeader className="flex flex-row items-center justify-between">
									<div>
										<CardTitle>{portfolio.name}</CardTitle>
										<CardDescription>
											{holdings.length} holdings · ₹
											{totalInvested.toLocaleString("en-IN")} invested
										</CardDescription>
									</div>
									<Button
										onClick={() => removePortfolio(portfolio.id)}
										size="sm"
										variant="ghost"
									>
										<Trash className="size-4" />
									</Button>
								</CardHeader>
								<CardContent className="space-y-3">
									<div className="grid grid-cols-[1fr_80px_100px_100px_40px] gap-2 text-muted-foreground text-xs">
										<span>Symbol</span>
										<span>Qty</span>
										<span>Avg Price</span>
										<span>Value</span>
										<span />
									</div>
									{holdings.map((holding, idx) => (
										<HoldingRow
											holding={holding}
											key={`${portfolio.id}-${idx}`}
											onChange={(h) => {
												const updated = [...holdings];
												updated[idx] = h;
												setEditingHoldings((prev) => ({
													...prev,
													[portfolio.id]: updated,
												}));
											}}
											onRemove={() => {
												const updated = holdings.filter((_, i) => i !== idx);
												setEditingHoldings((prev) => ({
													...prev,
													[portfolio.id]: updated,
												}));
											}}
										/>
									))}
									<div className="flex gap-2">
										<Button
											onClick={() => {
												const current = getHoldings(
													portfolio.id,
													portfolio.holdings,
												);
												setEditingHoldings((prev) => ({
													...prev,
													[portfolio.id]: [
														...current,
														{ symbol: "", quantity: 0, averagePrice: 0 },
													],
												}));
											}}
											size="sm"
											variant="outline"
										>
											<Plus className="mr-1 size-4" />
											Add holding
										</Button>
										<Button
											onClick={() => saveHoldings(portfolio.id)}
											size="sm"
										>
											Save
										</Button>
									</div>
								</CardContent>
							</Card>
						);
					})}

					{portfolios.length === 0 && (
						<p className="text-center text-muted-foreground text-sm">
							No portfolios yet. Create one to track your holdings.
						</p>
					)}
				</TabsContent>

				<TabsContent className="space-y-4" value="watchlists">
					<Card>
						<CardHeader>
							<CardTitle>Create Watchlist</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<Input
								onChange={(e) => setNewWatchlistName(e.target.value)}
								placeholder="Watchlist name"
								value={newWatchlistName}
							/>
							<Input
								onChange={(e) => setNewWatchlistSymbols(e.target.value)}
								placeholder="TCS, INFY, RELIANCE"
								value={newWatchlistSymbols}
							/>
							<Button onClick={handleCreateWatchlist}>
								<Plus className="mr-1 size-4" />
								Add watchlist
							</Button>
						</CardContent>
					</Card>

					{watchlists.map((wl) => (
						<Card key={wl.id}>
							<CardHeader className="flex flex-row items-center justify-between">
								<CardTitle>{wl.name}</CardTitle>
								<Button
									onClick={() => removeWatchlist(wl.id)}
									size="sm"
									variant="ghost"
								>
									<Trash className="size-4" />
								</Button>
							</CardHeader>
							<CardContent className="flex flex-wrap gap-2">
								{wl.symbols.map((sym) => (
									<Badge key={sym} variant="secondary">
										{sym}
									</Badge>
								))}
							</CardContent>
						</Card>
					))}
				</TabsContent>
			</Tabs>
		</div>
	);
}
