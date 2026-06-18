"use client";

import type { Icon } from "@phosphor-icons/react";
import {
	ArrowsOut,
	Brain,
	Coins,
	Lightning,
	Rocket,
} from "@phosphor-icons/react";
import {
	MODEL_PRESET_DEFINITIONS,
	type ModelPreset,
} from "~/lib/openrouter-models-core";

export type ModelPresetWithIcon = ModelPreset & { icon: Icon };

const PRESET_ICONS = [Rocket, Brain, Lightning, Coins, ArrowsOut] as const;

export const MODEL_PRESETS: ModelPresetWithIcon[] = MODEL_PRESET_DEFINITIONS.map(
	(preset, index) => ({
		...preset,
		icon: PRESET_ICONS[index] ?? Rocket,
	}),
);
