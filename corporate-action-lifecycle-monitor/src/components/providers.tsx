"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { getQueryClient } from "@/lib/query-client";
import { Toaster } from "./ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
	return (
		<QueryClientProvider client={getQueryClient()}>
			{children}
			<Toaster />
		</QueryClientProvider>
	);
}
