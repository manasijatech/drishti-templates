import { describe, expect, test } from "bun:test";

import type {
	CorporateActionLifecycle,
	LifecycleAiValidation,
	LifecycleSocketMessage,
} from "@lifecycle/contracts";
import type { SourceAnnouncement } from "../src/domain";
import { LifecycleService } from "../src/lifecycle-service";
import type { LifecycleValidator } from "../src/lifecycle-validator";
import type {
	AnnouncementWindow,
	MarketDataSource,
	StreamCallbacks,
	StreamHandle,
	SymbolIdentity,
} from "../src/market-data";
import { MemoryLifecycleRepository } from "./memory-repository";

const rightsAnnouncement: SourceAnnouncement = {
	id: "rights-1",
	symbol: "TCS",
	companyName: "Tata Consultancy Services Ltd.",
	date: "2026-09-10T10:00:00.000Z",
	headline: "Rights issue record date",
	category: "Rights Issue",
	relatedCategories: [],
	exchange: "NSE/BSE",
	extractedInformation: {
		rights_issue: { record_date: "2026-09-20", entitlement_ratio: "1:4" },
	},
};

class RecordingMarket implements MarketDataSource {
	readonly operations: string[] = [];
	readonly windows: AnnouncementWindow[] = [];
	callbacks?: StreamCallbacks;
	onAnnouncement?: (announcement: SourceAnnouncement) => void;
	connected = true;

	async resolveSymbol(symbol: string): Promise<SymbolIdentity | undefined> {
		return {
			symbol,
			companyName: "Tata Consultancy Services Ltd.",
		};
	}

	async listAnnouncements(
		_symbol: string,
		window: AnnouncementWindow = {},
	): Promise<SourceAnnouncement[]> {
		this.operations.push("rest");
		this.windows.push(window);
		return [rightsAnnouncement];
	}

	async openStream(
		_symbols: string[],
		onAnnouncement: (announcement: SourceAnnouncement) => void,
		callbacks: StreamCallbacks,
	): Promise<StreamHandle> {
		this.operations.push("stream");
		this.callbacks = callbacks;
		this.onAnnouncement = onAnnouncement;
		callbacks.onConnected(false);
		return {
			close: async () => {
				this.connected = false;
			},
			connected: () => this.connected,
			replaceSymbols: async () => undefined,
		};
	}

	async getSourceDocument(): Promise<Response> {
		return new Response("pdf");
	}
}

class RecordingValidator implements LifecycleValidator {
	readonly inputs: CorporateActionLifecycle[] = [];

	async validate(
		lifecycle: CorporateActionLifecycle,
	): Promise<LifecycleAiValidation> {
		this.inputs.push(lifecycle);
		return {
			status: "verified",
			model: "test-model",
			processedAt: "2026-09-11T11:00:00.000Z",
			rationale: "The filing evidence supports this lifecycle.",
			suggestions: ["Monitor the payment stage."],
		};
	}
}

class FailingValidator implements LifecycleValidator {
	async validate(): Promise<LifecycleAiValidation> {
		throw new Error("provider unavailable");
	}
}

describe("lifecycle coordinator", () => {
	test("starts the stream before full backfill and uses a bounded later catch-up", async () => {
		const repository = new MemoryLifecycleRepository();
		await repository.addSymbol("TCS", "Tata Consultancy Services Ltd.");
		const market = new RecordingMarket();
		const service = new LifecycleService(repository, market);

		await service.start();
		expect(market.operations).toEqual(["stream", "rest"]);
		expect(market.windows[0].from).toBeUndefined();
		expect(market.windows[0].to).toBeString();

		await service.syncSymbol("TCS");
		expect(market.windows[1].from).toBe("2026-09-10T09:50:00.000Z");
		expect(market.windows[1].to).toBeString();
		await service.stop();
	});

	test("broadcasts a lifecycle update for a streamed announcement", async () => {
		const repository = new MemoryLifecycleRepository();
		await repository.addSymbol("TCS", "Tata Consultancy Services Ltd.");
		const market = new RecordingMarket();
		const service = new LifecycleService(repository, market);
		const messages: LifecycleSocketMessage[] = [];
		service.subscribe((message) => messages.push(message));

		await service.start();
		market.onAnnouncement?.({
			...rightsAnnouncement,
			id: "rights-2",
			date: "2026-09-11T10:00:00.000Z",
			headline: "Rights issue terms announced",
		});
		await Bun.sleep(0);
		await Bun.sleep(0);

		expect(
			messages.some(
				(message) =>
					message.type === "lifecycle.upsert" &&
					message.data.announcements.some((item) => item.id === "rights-2"),
			),
		).toBe(true);
		await service.stop();
	});

	test("adds advisory AI validation after REST and streamed lifecycle rebuilds", async () => {
		const repository = new MemoryLifecycleRepository();
		await repository.addSymbol("TCS", "Tata Consultancy Services Ltd.");
		const market = new RecordingMarket();
		const validator = new RecordingValidator();
		const service = new LifecycleService(repository, market, validator);

		await service.start();
		expect(validator.inputs).toHaveLength(1);
		expect(
			(await service.listLifecycles()).data[0]?.aiValidation,
		).toMatchObject({
			status: "verified",
			model: "test-model",
		});

		market.onAnnouncement?.({
			...rightsAnnouncement,
			id: "rights-3",
			date: "2026-09-11T10:00:00.000Z",
			headline: "Rights issue payment announced",
		});
		await Bun.sleep(0);
		await Bun.sleep(0);

		expect(validator.inputs).toHaveLength(2);
		expect(
			(await service.listLifecycles()).data[0]?.aiValidation?.suggestions,
		).toEqual(["Monitor the payment stage."]);
		await service.stop();
	});

	test("keeps source-derived lifecycles when AI validation fails or is absent", async () => {
		for (const validator of [undefined, new FailingValidator()] as const) {
			const repository = new MemoryLifecycleRepository();
			await repository.addSymbol("TCS", "Tata Consultancy Services Ltd.");
			const service = new LifecycleService(
				repository,
				new RecordingMarket(),
				validator,
			);

			await service.start();
			const [lifecycle] = (await service.listLifecycles()).data;
			expect(lifecycle).toMatchObject({
				actionType: "Rights Issue",
				status: "Record Date",
			});
			expect(lifecycle?.aiValidation).toBeUndefined();
			await service.stop();
		}
	});
});
