"use client";

import { useState } from "react";
import {
	PortfolioCard,
	PortfolioCreateForm,
	PortfolioEmptyState,
	WatchlistCreateForm,
	WatchlistList,
} from "~/components/portfolio/portfolio-ui";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useMemoryStore } from "~/stores";
import type { PortfolioHolding } from "~/types";

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
					Manage holdings and watchlists. Data stays local and is shared with
					the assistant as context.
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
							<CardTitle>Create portfolio</CardTitle>
							<CardDescription>
								Group stocks you want the assistant to analyze together.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<PortfolioCreateForm
								name={newPortfolioName}
								onNameChange={setNewPortfolioName}
								onSubmit={() => {
									if (!newPortfolioName.trim()) return;
									addPortfolio({
										name: newPortfolioName.trim(),
										holdings: [],
									});
									setNewPortfolioName("");
								}}
								variant="table"
							/>
						</CardContent>
					</Card>

					{portfolios.length === 0 ? (
						<PortfolioEmptyState>
							No portfolios yet. Create one to track your holdings.
						</PortfolioEmptyState>
					) : (
						portfolios.map((portfolio) => {
							const holdings = getHoldings(portfolio.id, portfolio.holdings);

							return (
								<PortfolioCard
									holdings={holdings}
									key={portfolio.id}
									onAddHolding={() => {
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
									onHoldingChange={(index, holding) => {
										const updated = [...holdings];
										updated[index] = holding;
										setEditingHoldings((prev) => ({
											...prev,
											[portfolio.id]: updated,
										}));
									}}
									onHoldingRemove={(index) => {
										const updated = holdings.filter((_, i) => i !== index);
										setEditingHoldings((prev) => ({
											...prev,
											[portfolio.id]: updated,
										}));
									}}
									onRemove={() => removePortfolio(portfolio.id)}
									onSave={() => saveHoldings(portfolio.id)}
									portfolio={portfolio}
									variant="table"
								/>
							);
						})
					)}
				</TabsContent>

				<TabsContent className="space-y-4" value="watchlists">
					<Card>
						<CardHeader>
							<CardTitle>Create watchlist</CardTitle>
							<CardDescription>
								Track symbols you follow without full position details.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<WatchlistCreateForm
								embedded
								newName={newWatchlistName}
								newSymbols={newWatchlistSymbols}
								onAdd={() => {
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
								}}
								onNameChange={setNewWatchlistName}
								onSymbolsChange={setNewWatchlistSymbols}
								variant="table"
							/>
						</CardContent>
					</Card>

					<WatchlistList
						onRemove={removeWatchlist}
						watchlists={watchlists}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
