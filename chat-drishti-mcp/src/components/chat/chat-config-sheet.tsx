"use client";

import { GearSix } from "@phosphor-icons/react";
import { ChatConfigPanelContent } from "~/components/chat/chat-config-panel";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "~/components/ui/sheet";

export function ChatConfigSheet({
	open,
	onOpenChange,
	focusModelSignal = 0,
	showTrigger = true,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	focusModelSignal?: number;
	showTrigger?: boolean;
}) {
	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			{showTrigger ? (
				<SheetTrigger
					render={
						<Button
							aria-label="Open configuration"
							size="icon"
							variant="outline"
						/>
					}
				>
					<GearSix className="size-4" weight="light" />
				</SheetTrigger>
			) : null}
			<SheetContent className="flex w-full min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-md" side="right">
				<SheetHeader className="shrink-0 border-border border-b px-4 py-3">
					<SheetTitle>Configuration</SheetTitle>
				</SheetHeader>
				<ScrollArea className="min-h-0 flex-1">
					<ChatConfigPanelContent
						apiKeyInputId="chat-llm-provider-token-sheet"
						focusModelSignal={focusModelSignal}
					/>
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
}
