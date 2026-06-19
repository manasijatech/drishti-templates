export function buildShortTermContext(messages: { role: string; content: string }[]): string {
	return messages
		.slice(-10)
		.map((m) => `${m.role}: ${m.content}`)
		.join("\n");
}

export function buildLongTermContext(memory: {
	favoriteSectors?: string[];
	watchlists?: { name: string; symbols: string[] }[];
}): string {
	const parts: string[] = [];
	if (memory.favoriteSectors?.length) {
		parts.push(`Favorite sectors: ${memory.favoriteSectors.join(", ")}`);
	}
	if (memory.watchlists?.length) {
		parts.push(
			`Watchlists: ${memory.watchlists.map((w) => `${w.name} (${w.symbols.join(", ")})`).join("; ")}`,
		);
	}
	return parts.join("\n");
}
