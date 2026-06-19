import { cn } from "~/lib/utils";

const WORD_MARK_URL = "https://drishti.manasija.in/word-mark.svg";
const LOGO_MARK_URL = "https://drishti.manasija.in/logo-mark.svg";

export const DRISHTI_CHAT_PRODUCT_NAME = "Drishti Chat";

export function DrishtiWordMark({
	className,
	height = 22,
}: {
	className?: string;
	height?: number;
}) {
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img
			alt="Drishti"
			className={className}
			height={height}
			src={WORD_MARK_URL}
			style={{ height, width: "auto" }}
		/>
	);
}

export function DrishtiChatWordMark({
	className,
	height = 22,
}: {
	className?: string;
	height?: number;
}) {
	const chatFontSize = Math.round(height * 0.82);

	return (
		<span
			aria-label={DRISHTI_CHAT_PRODUCT_NAME}
			className={cn("inline-flex items-baseline gap-1", className)}
			role="img"
		>
			<DrishtiWordMark className="block shrink-0" height={height} />
			<span
				className="font-heading font-medium text-foreground leading-none"
				style={{ fontSize: chatFontSize }}
			>
				Chat
			</span>
		</span>
	);
}

export function DrishtiLogoMark({
	className,
	size = 28,
}: {
	className?: string;
	size?: number;
}) {
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img
			alt=""
			aria-hidden
			className={className}
			height={size}
			src={LOGO_MARK_URL}
			width={size}
		/>
	);
}
