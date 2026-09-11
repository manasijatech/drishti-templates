"use client";

import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

type Theme = "dark" | "light" | "system" | (string & {});
type ResolvedTheme = "dark" | "light";

type ThemeContextValue = {
	theme?: Theme;
	setTheme: Dispatch<SetStateAction<Theme>>;
	themes: Theme[];
	resolvedTheme?: ResolvedTheme;
	systemTheme?: ResolvedTheme;
};

type ThemeProviderProps = {
	attribute?: "class" | `data-${string}`;
	children: ReactNode;
	defaultTheme?: Theme;
	disableTransitionOnChange?: boolean;
	enableSystem?: boolean;
	storageKey?: string;
	themes?: Theme[];
};

const MEDIA_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_STORAGE_KEY = "theme";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
	if (typeof window !== "undefined" && window.matchMedia(MEDIA_QUERY).matches) {
		return "dark";
	}

	return "light";
}

function getStoredTheme(storageKey: string, fallback: Theme): Theme {
	if (typeof window === "undefined") return fallback;

	try {
		return (localStorage.getItem(storageKey) as Theme | null) ?? fallback;
	} catch {
		return fallback;
	}
}

function disableTransitionsTemporarily() {
	const style = document.createElement("style");
	style.appendChild(
		document.createTextNode("*,*::before,*::after{transition:none!important}"),
	);
	document.head.appendChild(style);
	window.getComputedStyle(document.body);
	setTimeout(() => document.head.removeChild(style), 1);
}

export function ThemeProvider({
	attribute = "class",
	children,
	defaultTheme = "light",
	disableTransitionOnChange = false,
	enableSystem = true,
	storageKey = DEFAULT_STORAGE_KEY,
	themes = ["light", "dark"],
}: ThemeProviderProps) {
	const [theme, setThemeState] = useState<Theme>(() =>
		getStoredTheme(storageKey, defaultTheme),
	);
	const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
		getSystemTheme(),
	);

	const allThemes = useMemo(
		() => (enableSystem ? [...themes, "system"] : themes),
		[enableSystem, themes],
	);

	const resolvedTheme =
		theme === "system" && enableSystem ? systemTheme : theme;

	const applyTheme = useCallback(
		(nextTheme: Theme, nextSystemTheme = getSystemTheme()) => {
			if (typeof document === "undefined") return;

			const nextResolved =
				nextTheme === "system" && enableSystem ? nextSystemTheme : nextTheme;
			const root = document.documentElement;

			if (disableTransitionOnChange) {
				disableTransitionsTemporarily();
			}

			if (attribute === "class") {
				root.classList.remove(...allThemes);
				root.classList.add(nextResolved);
			} else {
				root.setAttribute(attribute, nextResolved);
			}

			if (nextResolved === "dark" || nextResolved === "light") {
				root.style.colorScheme = nextResolved;
			}
		},
		[allThemes, attribute, disableTransitionOnChange, enableSystem],
	);

	const setTheme = useCallback<Dispatch<SetStateAction<Theme>>>(
		(value) => {
			setThemeState((current) => {
				const nextTheme = typeof value === "function" ? value(current) : value;
				try {
					localStorage.setItem(storageKey, nextTheme);
				} catch {
					// Ignore storage failures; the in-memory theme still updates.
				}
				return nextTheme;
			});
		},
		[storageKey],
	);

	useEffect(() => {
		const media = window.matchMedia(MEDIA_QUERY);
		const handleChange = () => setSystemTheme(getSystemTheme());

		handleChange();
		media.addEventListener("change", handleChange);
		return () => media.removeEventListener("change", handleChange);
	}, []);

	useEffect(() => {
		applyTheme(theme, systemTheme);
	}, [applyTheme, theme, systemTheme]);

	useEffect(() => {
		const handleStorage = (event: StorageEvent) => {
			if (event.key === storageKey) {
				setThemeState((event.newValue as Theme | null) ?? defaultTheme);
			}
		};

		window.addEventListener("storage", handleStorage);
		return () => window.removeEventListener("storage", handleStorage);
	}, [defaultTheme, storageKey]);

	const value = useMemo<ThemeContextValue>(
		() => ({
			theme,
			setTheme,
			themes: allThemes,
			resolvedTheme: resolvedTheme === "dark" ? "dark" : "light",
			systemTheme,
		}),
		[allThemes, resolvedTheme, setTheme, systemTheme, theme],
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}

export function ThemeScript({
	attribute = "class",
	defaultTheme = "light",
	enableSystem = true,
	storageKey = DEFAULT_STORAGE_KEY,
	themes = ["light", "dark"],
}: Omit<ThemeProviderProps, "children" | "disableTransitionOnChange">) {
	const code = `(function(){try{var e=${JSON.stringify(storageKey)},t=${JSON.stringify(defaultTheme)},r=${JSON.stringify(enableSystem)},a=${JSON.stringify(attribute)},m=${JSON.stringify(MEDIA_QUERY)},s=${JSON.stringify(themes)},n=localStorage.getItem(e)||t,o=n==="system"&&r?window.matchMedia(m).matches?"dark":"light":n,d=document.documentElement;if(a==="class"){d.classList.remove.apply(d.classList,s.concat("system"));d.classList.add(o)}else d.setAttribute(a,o);if(o==="dark"||o==="light")d.style.colorScheme=o}catch(e){}})();`;

	return (
		// biome-ignore lint/security/noDangerouslySetInnerHtml: The theme class must be set before hydration to prevent a visible reload flash.
		<script dangerouslySetInnerHTML={{ __html: code }} />
	);
}

export function useTheme() {
	return (
		useContext(ThemeContext) ?? {
			setTheme: () => {},
			themes: [],
		}
	);
}
