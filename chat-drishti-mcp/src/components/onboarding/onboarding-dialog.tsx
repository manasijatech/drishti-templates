"use client";

import { CheckCircle, Eye, EyeSlash, Key, Sparkle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { DrishtiLogoMark } from "~/components/brand/drishti-logo";
import { ModelPicker, ProviderSelect } from "~/components/model/model-picker";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useModelsCatalog } from "~/hooks/use-models-catalog";
import { isValidModelForProvider } from "~/lib/models";
import { cn } from "~/lib/utils";
import { useModelStore } from "~/stores";

type OnboardingStep = "welcome" | "model" | "drishti" | "done";

const STEPS: OnboardingStep[] = ["welcome", "model", "drishti", "done"];

type OnboardingDialogProps = {
	open: boolean;
};

export function OnboardingDialog({ open }: OnboardingDialogProps) {
	const {
		activeProvider,
		activeModel,
		setActiveModel,
		setActiveProvider,
		saveConfig,
		saveDrishtiApiKey,
		configs,
		hasStoredApiKey,
		hasStoredDrishtiApiKey,
		completeOnboarding,
		skipOnboarding,
	} = useModelStore();

	const [step, setStep] = useState<OnboardingStep>("welcome");
	const [modelApiKey, setModelApiKey] = useState("");
	const [drishtiApiKey, setDrishtiApiKey] = useState("");
	const [showModelApiKey, setShowModelApiKey] = useState(false);
	const [showDrishtiApiKey, setShowDrishtiApiKey] = useState(false);
	const [baseUrl, setBaseUrl] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const existingConfig = configs.find((c) => c.provider === activeProvider);
	const { models: catalogModels } = useModelsCatalog({
		provider: activeProvider,
		ollamaBaseUrl: baseUrl || existingConfig?.baseUrl,
	});

	const stepIndex = STEPS.indexOf(step);
	const modelKeyReady =
		activeProvider === "ollama" || hasStoredApiKey(activeProvider);
	const drishtiKeyReady = hasStoredDrishtiApiKey();
	const isFormStep = step === "model" || step === "drishti";

	useEffect(() => {
		if (!open) {
			setStep("welcome");
			setModelApiKey("");
			setDrishtiApiKey("");
			setShowModelApiKey(false);
			setShowDrishtiApiKey(false);
			setBaseUrl("");
			setError(null);
			setSaving(false);
		}
	}, [open]);

	const handleSkip = () => {
		skipOnboarding();
	};

	const handleFinish = () => {
		completeOnboarding();
	};

	const handleSaveModelStep = async () => {
		setError(null);
		if (!isValidModelForProvider(activeProvider, activeModel, catalogModels)) {
			setError("Select or enter a valid model before continuing.");
			return;
		}

		const trimmedKey = modelApiKey.trim();
		if (activeProvider !== "ollama" && !trimmedKey && !existingConfig?.encryptedApiKey) {
			setError("Enter your model provider API key to continue.");
			return;
		}

		setSaving(true);
		try {
			if (trimmedKey || activeProvider === "ollama" || existingConfig?.encryptedApiKey) {
				await saveConfig({
					provider: activeProvider,
					model: activeModel,
					apiKey: trimmedKey,
					baseUrl: baseUrl || undefined,
				});
			}
			setModelApiKey("");
			setStep("drishti");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save model configuration.");
		} finally {
			setSaving(false);
		}
	};

	const handleSaveDrishtiStep = async () => {
		setError(null);

		if (drishtiKeyReady && !drishtiApiKey.trim()) {
			handleFinish();
			return;
		}

		const trimmedKey = drishtiApiKey.trim();
		if (!trimmedKey) {
			setError("Enter your Drishti MCP API key to continue.");
			return;
		}

		setSaving(true);
		try {
			await saveDrishtiApiKey(trimmedKey);
			setDrishtiApiKey("");
			setStep("done");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save Drishti API key.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog
			onOpenChange={(nextOpen) => {
				if (!nextOpen) handleSkip();
			}}
			open={open}
		>
			<DialogContent
				className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
				showCloseButton={false}
			>
				<div className="flex shrink-0 items-center justify-between gap-3 border-border border-b px-5 py-3">
					<div className="flex flex-1 items-center gap-2">
						{STEPS.slice(0, 3).map((item, index) => (
							<div
								className={cn(
									"h-1.5 flex-1 rounded-full transition-colors",
									index <= Math.min(stepIndex, 2) ? "bg-primary" : "bg-muted",
								)}
								key={item}
							/>
						))}
					</div>
					<Button
						className="h-7 shrink-0 px-2 text-muted-foreground text-xs hover:text-foreground"
						onClick={handleSkip}
						type="button"
						variant="ghost"
					>
						Skip for now
					</Button>
				</div>

				<div
					className={cn(
						"min-h-0 flex-1 overflow-y-auto px-5",
						isFormStep ? "py-4" : "py-6",
					)}
				>
					{step === "welcome" ? (
						<div className="flex flex-col items-center text-center">
							<DrishtiLogoMark className="mb-4" size={40} />
							<DialogHeader className="items-center gap-2 text-center">
								<DialogTitle className="font-heading text-lg">
									Welcome to Drishti
								</DialogTitle>
								<DialogDescription className="max-w-sm text-center text-balance">
									Connect your AI model and Drishti MCP keys to start asking
									about markets, portfolios, and news.
								</DialogDescription>
							</DialogHeader>
							<ul className="mt-6 w-full max-w-sm space-y-2 text-left text-muted-foreground text-xs">
								<li className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
									<Key className="mt-0.5 size-3.5 shrink-0 text-primary" weight="light" />
									<span>Model provider API key for chat responses</span>
								</li>
								<li className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
									<Sparkle className="mt-0.5 size-3.5 shrink-0 text-primary" weight="light" />
									<span>Drishti MCP key for market data tools</span>
								</li>
							</ul>
						</div>
					) : null}

					{step === "model" ? (
						<div className="space-y-4">
							<DialogHeader className="gap-1.5">
								<div className="flex items-center gap-2 text-primary">
									<Key className="size-4" weight="light" />
									<span className="font-medium text-xs uppercase tracking-wide">
										Step 1 of 2
									</span>
								</div>
								<DialogTitle>Model provider</DialogTitle>
								<DialogDescription>
									Choose your LLM provider and add an API key. Keys are encrypted
									server-side and stored locally as ciphertext.
								</DialogDescription>
							</DialogHeader>

							<div className="space-y-3">
								<ProviderSelect
									onProviderChange={setActiveProvider}
									provider={activeProvider}
								/>
								<div className="space-y-1.5">
									<Label className="text-xs">Model</Label>
									<ModelPicker
										model={activeModel}
										ollamaBaseUrl={baseUrl || existingConfig?.baseUrl}
										onModelChange={(nextModel) =>
											setActiveModel(activeProvider, nextModel)
										}
										provider={activeProvider}
									/>
								</div>
								<div className="space-y-1.5">
									<Label className="text-xs" htmlFor="onboarding-model-api-key">
										API Key
										{existingConfig?.encryptedApiKey || modelKeyReady ? (
											<span className="ml-1.5 text-emerald-600 text-xs">
												(saved)
											</span>
										) : null}
									</Label>
									<div className="relative">
										<Input
											autoComplete="off"
											className="h-9 pr-10 text-sm"
											id="onboarding-model-api-key"
											name="llm-provider-token"
											onChange={(e) => setModelApiKey(e.target.value)}
											placeholder={
												activeProvider === "ollama"
													? "Optional for local Ollama"
													: existingConfig?.encryptedApiKey
														? "••••••••  (saved)"
														: "Enter API key"
											}
											type={showModelApiKey ? "text" : "password"}
											value={modelApiKey}
										/>
										<Button
											aria-label={showModelApiKey ? "Hide API key" : "Show API key"}
											className="absolute inset-y-0 right-1 my-auto size-7 text-muted-foreground"
											disabled={!modelApiKey}
											onClick={() => setShowModelApiKey((v) => !v)}
											size="icon"
											type="button"
											variant="ghost"
										>
											{showModelApiKey ? (
												<EyeSlash className="size-4" />
											) : (
												<Eye className="size-4" />
											)}
										</Button>
									</div>
								</div>
								{(activeProvider === "openrouter" ||
									activeProvider === "ollama") && (
									<div className="space-y-1.5">
										<Label className="text-xs" htmlFor="onboarding-base-url">
											Base URL (optional)
										</Label>
										<Input
											className="h-9 text-sm"
											id="onboarding-base-url"
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
							</div>
						</div>
					) : null}

					{step === "drishti" ? (
						<div className="space-y-4">
							<DialogHeader className="gap-1.5">
								<div className="flex items-center gap-2 text-primary">
									<Sparkle className="size-4" weight="light" />
									<span className="font-medium text-xs uppercase tracking-wide">
										Step 2 of 2
									</span>
								</div>
								<DialogTitle>Drishti MCP</DialogTitle>
								<DialogDescription>
									Required for market data tools — news, movers, portfolio
									analysis, and filings.
								</DialogDescription>
							</DialogHeader>

							<div className="space-y-1.5">
								<Label className="text-xs" htmlFor="onboarding-drishti-api-key">
									Drishti MCP API Key
									{drishtiKeyReady ? (
										<span className="ml-1.5 text-emerald-600 text-xs">(saved)</span>
									) : null}
								</Label>
								<div className="relative">
									<Input
										autoComplete="off"
										className="h-9 pr-10 text-sm"
										id="onboarding-drishti-api-key"
										name="drishti-mcp-token"
										onChange={(e) => setDrishtiApiKey(e.target.value)}
										placeholder={
											drishtiKeyReady
												? "••••••••  (saved)"
												: "Enter Drishti MCP API key"
										}
										type={showDrishtiApiKey ? "text" : "password"}
										value={drishtiApiKey}
									/>
									<Button
										aria-label={
											showDrishtiApiKey
												? "Hide Drishti API key"
												: "Show Drishti API key"
										}
										className="absolute inset-y-0 right-1 my-auto size-7 text-muted-foreground"
										disabled={!drishtiApiKey}
										onClick={() => setShowDrishtiApiKey((v) => !v)}
										size="icon"
										type="button"
										variant="ghost"
									>
										{showDrishtiApiKey ? (
											<EyeSlash className="size-4" />
										) : (
											<Eye className="size-4" />
										)}
									</Button>
								</div>
							</div>
						</div>
					) : null}

					{step === "done" ? (
						<div className="flex flex-col items-center py-2 text-center">
							<CheckCircle
								className="mb-4 size-10 text-emerald-600"
								weight="light"
							/>
							<DialogHeader className="items-center gap-2 text-center">
								<DialogTitle>You&apos;re all set</DialogTitle>
								<DialogDescription className="text-center text-balance">
									{modelKeyReady && drishtiKeyReady
										? "Both keys are saved. Start exploring the market."
										: "You can add missing keys anytime in Configuration."}
								</DialogDescription>
							</DialogHeader>
						</div>
					) : null}

					{error ? <p className="mt-3 text-destructive text-xs">{error}</p> : null}
				</div>

				<DialogFooter className="mx-0 mb-0 shrink-0 border-t bg-muted/30 px-5 py-4">
					{step === "welcome" ? (
						<Button className="w-full sm:ml-auto sm:w-auto" onClick={() => setStep("model")}>
							Get started
						</Button>
					) : null}

					{step === "model" ? (
						<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
							<Button
								onClick={() => setStep("welcome")}
								type="button"
								variant="ghost"
							>
								Back
							</Button>
							<Button
								disabled={saving}
								onClick={() => void handleSaveModelStep()}
								type="button"
							>
								{saving ? "Saving…" : modelKeyReady ? "Continue" : "Save & continue"}
							</Button>
						</div>
					) : null}

					{step === "drishti" ? (
						<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
							<Button
								onClick={() => setStep("model")}
								type="button"
								variant="ghost"
							>
								Back
							</Button>
							<Button
								disabled={saving}
								onClick={() => void handleSaveDrishtiStep()}
								type="button"
							>
								{saving
									? "Saving…"
									: drishtiKeyReady && !drishtiApiKey.trim()
										? "Continue"
										: "Save & finish"}
							</Button>
						</div>
					) : null}

					{step === "done" ? (
						<Button className="w-full sm:ml-auto sm:w-auto" onClick={handleFinish} type="button">
							Start chatting
						</Button>
					) : null}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
