"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { refreshSession } from "../lib/api";
import { useAuthStore } from "../lib/auth-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  const setSession = useAuthStore((state) => state.setSession);
  const setStatus = useAuthStore((state) => state.setStatus);
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    const publicRoute = pathname === "/" || pathname.startsWith("/auth");
    if (publicRoute) {
      setStatus("unauthenticated");
      return () => {
        active = false;
      };
    }
    setStatus("loading");
    refreshSession()
      .then((session) => {
        if (active) setSession(session.accessToken, session.user);
      })
      .catch(() => {
        if (active) useAuthStore.getState().clearSession();
      });
    return () => {
      active = false;
    };
  }, [pathname, setSession, setStatus]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
