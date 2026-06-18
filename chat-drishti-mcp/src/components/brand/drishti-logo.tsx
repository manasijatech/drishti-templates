const WORD_MARK_URL = "https://drishti.manasija.in/word-mark.svg";
const LOGO_MARK_URL = "https://drishti.manasija.in/logo-mark.svg";

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
