"use client";

import { Eye, EyeSlash, Sparkle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { DrishtiLogoMark, DRISHTI_CHAT_PRODUCT_NAME } from "~/components/brand/drishti-logo";
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

type OnboardingStep = "model" | "drishti";

type OnboardingDialogProps = {
	open: boolean;
	/** When the server has DRISHTI_API_KEY, the Drishti step is skipped. */
	serverHasDrishtiKey?: boolean;
};

export function OnboardingDialog({
	open,
	serverHasDrishtiKey = false,
}: OnboardingDialogProps) {
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

	const [step, setStep] = useState<OnboardingStep>("model");
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

	const totalSteps = serverHasDrishtiKey ? 1 : 2;
	const stepNumber = step === "model" ? 1 : 2;
	const modelKeyReady =
		activeProvider === "ollama" || hasStoredApiKey(activeProvider);
	const drishtiKeyReady = hasStoredDrishtiApiKey();

	useEffect(() => {
		if (!open) {
			setStep("model");
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

	const handleSaveModelStep = async () => {
		setError(null);
		if (!isValidModelForProvider(activeProvider, activeModel, catalogModels)) {
			setError("Pick a model from the list first.");
			return;
		}

		const trimmedKey = modelApiKey.trim();
		if (activeProvider !== "ollama" && !trimmedKey && !existingConfig?.encryptedApiKey) {
			setError("Enter your API key to continue.");
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
			if (serverHasDrishtiKey) {
				completeOnboarding();
			} else {
				setStep("drishti");
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not save. Please try again.");
		} finally {
			setSaving(false);
		}
	};

	const handleSaveDrishtiStep = async () => {
		setError(null);

		if (drishtiKeyReady && !drishtiApiKey.trim()) {
			completeOnboarding();
			return;
		}

		const trimmedKey = drishtiApiKey.trim();
		if (!trimmedKey) {
			setError("Enter your Drishti API key to continue.");
			return;
		}

		setSaving(true);
		try {
			await saveDrishtiApiKey(trimmedKey);
			setDrishtiApiKey("");
			completeOnboarding();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not save. Please try again.");
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
						{Array.from({ length: totalSteps }, (_, index) => (
							<div
								className={cn(
									"h-1.5 flex-1 rounded-full transition-colors",
									index < stepNumber ? "bg-primary" : "bg-muted",
								)}
								key={index}
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

				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
					{step === "model" ? (
						<div className="space-y-4">
							<DialogHeader className="gap-1.5">
								<div className="flex items-center gap-2 text-primary">
									<DrishtiLogoMark size={18} />
									<span className="font-medium text-xs uppercase tracking-wide">
										Step 1 of {totalSteps}
									</span>
								</div>
								<DialogTitle>Welcome to {DRISHTI_CHAT_PRODUCT_NAME}</DialogTitle>
								<DialogDescription>
									Pick the AI model that will answer questions and paste its API
									key. The key is encrypted and saved only in this browser.
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
										API key
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
								<DialogTitle>Connect live market data</DialogTitle>
								<DialogDescription>
									Paste your Drishti API key. It gives the assistant live
									prices, news, company filings, and results.
								</DialogDescription>
							</DialogHeader>

							<div className="space-y-1.5">
								<Label className="text-xs" htmlFor="onboarding-drishti-api-key">
									Drishti API key
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
												: "Enter Drishti API key"
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

					{error ? <p className="mt-3 text-destructive text-xs">{error}</p> : null}
				</div>

				<DialogFooter className="mx-0 mb-0 shrink-0 border-t bg-muted/30 px-5 py-4">
					{step === "model" ? (
						<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
							<span />
							<Button
								disabled={saving}
								onClick={() => void handleSaveModelStep()}
								type="button"
							>
								{saving
									? "Saving…"
									: serverHasDrishtiKey
										? "Start chatting"
										: "Next"}
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
								{saving ? "Saving…" : "Start chatting"}
							</Button>
						</div>
					) : null}

				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
