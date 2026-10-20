"use client";

import {
	bind,
	play,
	type SoundName,
	setEnabled,
	setTheme,
	setVolume,
	type ThemeName,
	unlock,
} from "cuelume";
import { useCallback, useSyncExternalStore } from "react";

/**
 * UI sound effects (cuelume). Interactive elements are tagged automatically
 * with `data-cuelume-*` attributes by what they do, and cuelume's `bind()`
 * plays the cue on press and release. Add `data-sfx="off"` to opt an element
 * out, or set a `data-cuelume-*` attribute yourself to choose its cue.
 */

const STORAGE_KEY = "drishti-sound-prefs";
const CHANGE_EVENT = "drishti-sound-change";
const VOLUME = 0.4;

export type SoundPrefs = {
	enabled: boolean;
	typing: boolean;
	theme: ThemeName;
};

export const SOUND_THEMES: { id: ThemeName; label: string }[] = [
	{ id: "default", label: "Glass" },
	{ id: "bubble", label: "Bubble" },
	{ id: "mech", label: "Mech" },
	{ id: "press", label: "Press" },
];

const DEFAULT_PREFS: SoundPrefs = {
	enabled: true,
	typing: true,
	theme: "default",
};

let cachedRaw: string | null | undefined;
let cachedPrefs: SoundPrefs = DEFAULT_PREFS;

function readPrefs(): SoundPrefs {
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(STORAGE_KEY);
	} catch {
		// Storage blocked; use defaults.
	}
	if (raw === cachedRaw) return cachedPrefs;
	cachedRaw = raw;
	try {
		cachedPrefs = raw
			? { ...DEFAULT_PREFS, ...JSON.parse(raw) }
			: DEFAULT_PREFS;
	} catch {
		cachedPrefs = DEFAULT_PREFS;
	}
	return cachedPrefs;
}

function applyPrefs(prefs: SoundPrefs) {
	setEnabled(prefs.enabled);
	setTheme(prefs.theme);
	setVolume(VOLUME);
	document.documentElement.toggleAttribute("data-sfx-typing", prefs.typing);
}

function subscribe(onChange: () => void) {
	window.addEventListener(CHANGE_EVENT, onChange);
	window.addEventListener("storage", onChange);
	return () => {
		window.removeEventListener(CHANGE_EVENT, onChange);
		window.removeEventListener("storage", onChange);
	};
}

/** Sound preferences, saved in this browser. */
export function useSoundPrefs(): [
	SoundPrefs,
	(patch: Partial<SoundPrefs>) => void,
] {
	const prefs = useSyncExternalStore(subscribe, readPrefs, () => DEFAULT_PREFS);
	const update = useCallback((patch: Partial<SoundPrefs>) => {
		const next = { ...readPrefs(), ...patch };
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch {
			// Storage blocked; still apply for this page.
		}
		applyPrefs(next);
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}, []);
	return [prefs, update];
}

/** Play a cue now (for events that are not clicks, e.g. an answer finishing). */
export function playCue(
	name: SoundName,
	emphasis: "subtle" | "normal" | "strong" = "normal",
) {
	if (!readPrefs().enabled) return;
	play(name, { emphasis });
}

// ---------------------------------------------------------------------------
// Automatic tagging

const CUE_ATTRS = [
	"data-cuelume-tap",
	"data-cuelume-type",
	"data-cuelume-select",
	"data-cuelume-toggle",
	"data-cuelume-open",
	"data-cuelume-close",
	"data-cuelume-navigate",
] as const;

const AUTO = "data-sfx-auto";

const CANDIDATES = [
	"button",
	"a[href]",
	"summary",
	"select",
	'[role="button"]',
	'[role="switch"]',
	'[role="checkbox"]',
	'[role="option"]',
	'[role="menuitem"]',
	'[role="menuitemradio"]',
	'[role="tab"]',
	'textarea[name="chat-message"]',
].join(",");

type Tag = { cue: (typeof CUE_ATTRS)[number] | null; emphasis?: string };

function chooseTag(el: Element): Tag {
	const label = (el.getAttribute("aria-label") ?? "").toLowerCase();
	const role = el.getAttribute("role");
	const tag = el.tagName;

	if (tag === "TEXTAREA") {
		return { cue: "data-cuelume-type", emphasis: "subtle" };
	}
	if (
		tag === "SELECT" ||
		role === "option" ||
		role === "menuitem" ||
		role === "menuitemradio" ||
		role === "tab"
	) {
		return { cue: "data-cuelume-select" };
	}
	if (
		role === "switch" ||
		role === "checkbox" ||
		el.getAttribute("data-slot") === "switch"
	) {
		return { cue: "data-cuelume-toggle" };
	}
	if (/^(close|dismiss)/.test(label)) {
		return { cue: "data-cuelume-close", emphasis: "subtle" };
	}
	if (label === "stop generating") return { cue: "data-cuelume-close" };
	if (/pin chat/.test(label))
		return { cue: "data-cuelume-toggle", emphasis: "subtle" };
	if (/^(remove|delete)/.test(label)) {
		return { cue: "data-cuelume-close", emphasis: "subtle" };
	}

	const expanded = el.getAttribute("aria-expanded");
	if (expanded !== null) {
		return {
			cue: expanded === "true" ? "data-cuelume-close" : "data-cuelume-open",
			emphasis: "subtle",
		};
	}
	const popup = el.getAttribute("aria-haspopup");
	if (popup && popup !== "false") return { cue: "data-cuelume-open" };

	if (tag === "A") return { cue: "data-cuelume-navigate", emphasis: "subtle" };
	if (el.hasAttribute("aria-current"))
		return { cue: "data-cuelume-select", emphasis: "subtle" };

	// Plain buttons: weight follows how prominent the button looks.
	const cls = el.getAttribute("class") ?? "";
	const isPrimary = /\bbg-primary\b/.test(cls) && !/hover:bg-primary/.test(cls);
	const isQuiet =
		/\b(size-6|size-7|h-7)\b/.test(cls) || /ghost|hover:bg-sidebar/.test(cls);
	return {
		cue: "data-cuelume-tap",
		emphasis: isPrimary ? "strong" : isQuiet ? "subtle" : "normal",
	};
}

function clearAutoTag(el: Element) {
	if (!el.hasAttribute(AUTO)) return;
	for (const a of CUE_ATTRS) el.removeAttribute(a);
	el.removeAttribute("data-cuelume-emphasis");
	el.removeAttribute(AUTO);
}

function tagElement(el: Element) {
	if (el.closest('[data-sfx="off"]')) {
		clearAutoTag(el);
		return;
	}
	const hasOwn = CUE_ATTRS.some((a) => el.hasAttribute(a));
	if (hasOwn && !el.hasAttribute(AUTO)) return; // set by hand; respect it

	const next = chooseTag(el);
	for (const a of CUE_ATTRS) {
		if (a !== next.cue) el.removeAttribute(a);
	}
	if (!next.cue) return;
	if (
		next.cue === "data-cuelume-type" &&
		!document.documentElement.hasAttribute("data-sfx-typing")
	) {
		el.removeAttribute(next.cue);
		return;
	}
	el.setAttribute(next.cue, "");
	el.setAttribute(AUTO, "");
	if (next.emphasis) el.setAttribute("data-cuelume-emphasis", next.emphasis);
	else el.removeAttribute("data-cuelume-emphasis");
}

function tagTree(root: ParentNode) {
	if (root instanceof Element && root.matches(CANDIDATES)) tagElement(root);
	for (const el of root.querySelectorAll(CANDIDATES)) tagElement(el);
}

let started = false;

/** Start UI sounds for the whole page. Safe to call more than once. */
export function startSoundEffects(): () => void {
	if (started || typeof window === "undefined") return () => undefined;
	started = true;

	applyPrefs(readPrefs());
	tagTree(document.body);
	const unbind = bind(document);

	// Browsers only allow audio after a user gesture.
	const unlockOnce = () => void unlock();
	window.addEventListener("pointerdown", unlockOnce, { once: true });
	window.addEventListener("keydown", unlockOnce, { once: true });

	const observer = new MutationObserver((mutations) => {
		for (const m of mutations) {
			if (m.type === "attributes" && m.target instanceof Element) {
				if (m.target.matches(CANDIDATES)) tagElement(m.target);
				continue;
			}
			for (const node of m.addedNodes) {
				if (node instanceof Element) tagTree(node);
			}
		}
	});
	observer.observe(document.body, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: [
			"aria-expanded",
			"aria-label",
			"role",
			"class",
			"data-sfx",
		],
	});

	// Re-tag when the typing preference changes.
	const onPrefs = () => tagTree(document.body);
	window.addEventListener(CHANGE_EVENT, onPrefs);

	return () => {
		started = false;
		observer.disconnect();
		unbind();
		window.removeEventListener(CHANGE_EVENT, onPrefs);
	};
}
