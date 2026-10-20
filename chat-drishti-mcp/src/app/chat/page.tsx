import { MarketChat } from "~/components/chat/market-chat";
import { env } from "~/env";

export const dynamic = "force-dynamic";

export default function ChatPage() {
	return <MarketChat serverHasDrishtiKey={Boolean(env.DRISHTI_API_KEY)} />;
}
