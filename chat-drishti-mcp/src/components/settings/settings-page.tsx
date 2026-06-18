"use client";

import { useState } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ModelPicker, ProviderSelect } from "~/components/model/model-picker";
import { useModelsCatalog } from "~/hooks/use-models-catalog";
import { isValidModelForProvider } from "~/lib/models";
import { useMemoryStore, useModelStore } from "~/stores";

export function SettingsPage() {
	const {
		activeProvider,
		activeModel,
		setActiveModel,
		setActiveProvider,
		saveConfig,
		configs,
	} = useModelStore();
	const { preferences, updatePreferences } = useMemoryStore();

	const [apiKey, setApiKey] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const existingConfig = configs.find((c) => c.provider === activeProvider);
	const { models: catalogModels } = useModelsCatalog({
		provider: activeProvider,
		ollamaBaseUrl: baseUrl || existingConfig?.baseUrl,
	});

	const handleSave = async () => {
		setError(null);
		if (!isValidModelForProvider(activeProvider, activeModel, catalogModels)) {
			setError("Select or enter a valid model ID before saving.");
			return;
		}
		try {
			const trimmedKey = apiKey.trim();
			if (activeProvider !== "ollama" && !trimmedKey && !existingConfig?.encryptedApiKey) {
				setError("Enter an API key before saving.");
				return;
			}

			await saveConfig({
				provider: activeProvider,
				model: activeModel,
				apiKey: trimmedKey,
				baseUrl: baseUrl || undefined,
			});
			setSaved(true);
			setApiKey("");
			setTimeout(() => setSaved(false), 2000);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save");
		}
	};

	return (
		<div className="mx-auto max-w-2xl space-y-8 p-6 md:p-8">
			<div>
				<p className="type-eyebrow mb-2">Configuration</p>
				<h1 className="type-h2 text-foreground">Settings</h1>
				<p className="type-body-prose mt-2">
					Bring your own model. API keys are encrypted on the server and stored as
					ciphertext in your browser.
				</p>
			</div>

			<Tabs defaultValue="model">
				<TabsList>
					<TabsTrigger value="model">Model</TabsTrigger>
					<TabsTrigger value="preferences">Preferences</TabsTrigger>
				</TabsList>

				<TabsContent className="space-y-4" value="model">
					<Card className="border-border shadow-none">
						<CardHeader>
							<CardTitle>Model Provider</CardTitle>
							<CardDescription>
								Select your AI provider and model. Switch anytime during chat.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<ProviderSelect
								onProviderChange={setActiveProvider}
								provider={activeProvider}
							/>

							<div className="space-y-2">
								<Label>Model</Label>
								<ModelPicker
									model={activeModel}
									ollamaBaseUrl={baseUrl || existingConfig?.baseUrl}
									onModelChange={(nextModel) =>
										setActiveModel(activeProvider, nextModel)
									}
									provider={activeProvider}
								/>
							</div>

							<Separator />

							<div className="space-y-2">
								<Label htmlFor="apiKey">
									API Key
									{existingConfig && (
										<span className="ml-2 text-emerald-600 text-xs">
											(saved)
										</span>
									)}
								</Label>
								<Input
									id="apiKey"
									onChange={(e) => setApiKey(e.target.value)}
									placeholder={
										activeProvider === "ollama"
											? "Optional for local Ollama"
											: "Enter API key"
									}
									type="password"
									value={apiKey}
								/>
							</div>

							{(activeProvider === "openrouter" ||
								activeProvider === "ollama") && (
								<div className="space-y-2">
									<Label htmlFor="baseUrl">Base URL (optional)</Label>
									<Input
										id="baseUrl"
										onChange={(e) => setBaseUrl(e.target.value)}
										placeholder={
											activeProvider === "ollama"
												? "http://localhost:11434/v1"
												: "https://openrouter.ai/api/v1"
										}
										value={baseUrl}
									/>
								</div>
							)}

							{error && (
								<p className="text-destructive text-sm">{error}</p>
							)}

							<Button className="w-full" onClick={handleSave}>
								{saved ? "Saved!" : "Save configuration"}
							</Button>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent className="space-y-4" value="preferences">
					<Card className="border-border shadow-none">
						<CardHeader>
							<CardTitle>Long-term Memory</CardTitle>
							<CardDescription>
								Preferences are included in agent context automatically.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label>Risk Profile</Label>
								<Select
									onValueChange={(v) =>
										updatePreferences({
											riskProfile: v as
												| "conservative"
												| "moderate"
												| "aggressive",
										})
									}
									value={preferences.riskProfile}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="conservative">
											Conservative
										</SelectItem>
										<SelectItem value="moderate">Moderate</SelectItem>
										<SelectItem value="aggressive">
											Aggressive
										</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="sectors">Favorite Sectors</Label>
								<Input
									id="sectors"
									onChange={(e) =>
										updatePreferences({
											favoriteSectors: e.target.value
												.split(",")
												.map((s) => s.trim())
												.filter(Boolean),
										})
									}
									placeholder="IT, Banking, Pharma"
									value={preferences.favoriteSectors.join(", ")}
								/>
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
