"use client";

import { play, type SoundName, setEnabled, setVolume, unlock } from "cuelume";
import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "drishti-sound";
const CHANGE_EVENT = "drishti-sound-change";
const VOLUME = 0.35;

function readEnabled(): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) !== "off";
	} catch {
		return true;
	}
}

function subscribe(onChange: () => void) {
	window.addEventListener(CHANGE_EVENT, onChange);
	window.addEventListener("storage", onChange);
	return () => {
		window.removeEventListener(CHANGE_EVENT, onChange);
		window.removeEventListener("storage", onChange);
	};
}

/** Sound on/off preference, saved in this browser. On by default. */
export function useSoundEnabled(): [boolean, (enabled: boolean) => void] {
	const enabled = useSyncExternalStore(subscribe, readEnabled, () => false);
	const update = useCallback((next: boolean) => {
		try {
			localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
		} catch {
			// Storage blocked; the toggle still works for this page.
		}
		setEnabled(next);
		if (next) {
			void unlock();
			play("toggle", { volume: VOLUME });
		}
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}, []);
	return [enabled, update];
}

/** Play a cue if sound is on. Call from a click first so browsers allow audio. */
export function playCue(name: SoundName) {
	if (!readEnabled()) return;
	setEnabled(true);
	setVolume(VOLUME);
	if (name === "tap") void unlock();
	play(name, { volume: VOLUME });
}
