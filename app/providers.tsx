"use client";

import { Notifications } from "@mantine/notifications";

import { ThemeProvider } from "./theme";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <Notifications position="top-right" />
      {children}
    </ThemeProvider>
  );
}
