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
			<SheetContent className="w-full gap-0 p-0 sm:max-w-md" side="right">
				<SheetHeader className="border-border border-b px-4 py-3">
					<SheetTitle>Configuration</SheetTitle>
				</SheetHeader>
				<ScrollArea className="flex-1">
					<ChatConfigPanelContent
						apiKeyInputId="chat-apiKey-sheet"
						focusModelSignal={focusModelSignal}
					/>
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
}
