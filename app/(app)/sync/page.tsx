"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Code, Group, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";

export default function SyncPage() {
  const [state, setState] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sync");
      setState(await res.json());
    } catch {
      setState({ error: "Could not read sync state" });
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function trigger() {
    setBusy(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: string }).error ?? res.statusText);
      notifications.show({
        title: "Sync scheduled",
        message: "Heavy collections should use `pnpm sync` on the server. Status updates every few seconds.",
        color: "blue",
      });
      await refresh();
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => void refresh(), 4000);
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 180_000);
    } catch (e) {
      notifications.show({
        title: "Sync request failed",
        message: e instanceof Error ? e.message : String(e),
        color: "red",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="md">
      <Title order={2}>Sync</Title>
      <Text size="sm" c="dimmed">
        Refreshes catalog cards, Scryfall sets, set icons, symbology JSON, card-symbol SVGs, and the
        scan visual index under your MTG_DATA_DIR. Each run skips assets last fetched within 12 hours
        unless you use{" "}
        <Code>pnpm sync -- --full</Code> or <Code>pnpm sync:full</Code>. Card JSON only:{" "}
        <Code>pnpm sync -- --cards-only</Code> (with <Code>--full</Code> if needed). Scan index only:{" "}
        <Code>pnpm scan-index</Code>. Prefer <Code>pnpm sync</Code> for long runs.
      </Text>
      <Group>
        <Button loading={busy} onClick={() => void trigger()}>
          Run sync (background)
        </Button>
        <Button variant="default" onClick={() => void refresh()}>
          Refresh status
        </Button>
      </Group>
      <Code block>{JSON.stringify(state, null, 2)}</Code>
    </Stack>
  );
}
