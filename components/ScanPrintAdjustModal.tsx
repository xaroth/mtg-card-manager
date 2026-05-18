"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActionIcon,
  Group,
  Image,
  Modal,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconMinus, IconPlus } from "@tabler/icons-react";

import { SetIcon } from "@/components/SetIcon";
import type { BinderEntry, PrintRow } from "@/lib/mtg/schemas";
import type { ScanMatchResult } from "@/lib/scan/types";

type RowKey = { kind: "storage" } | { kind: "binder"; binderId: string };

function QtyControls({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <Group gap={4} justify="center" wrap="nowrap">
      <ActionIcon
        size="sm"
        variant="light"
        disabled={disabled || value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="Decrease"
      >
        <IconMinus size={14} />
      </ActionIcon>
      <Text size="sm" w={28} ta="center">
        {value}
      </Text>
      <ActionIcon
        size="sm"
        variant="light"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        aria-label="Increase"
      >
        <IconPlus size={14} />
      </ActionIcon>
    </Group>
  );
}

function AdjustBody({
  initial,
  match,
  onSaved,
}: {
  initial: PrintRow;
  match: ScanMatchResult;
  onSaved: () => void;
}) {
  const [binders, setBinders] = useState<BinderEntry[]>([]);
  const [row, setRow] = useState<PrintRow>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/binders")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((data: { binders: BinderEntry[] }) => {
        if (!cancelled) setBinders(data.binders ?? []);
      })
      .catch(() => {
        if (!cancelled) setBinders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const binderLabel = useMemo(() => {
    const m = new Map(binders.map((b) => [b.id, b.name?.trim() || "Unnamed binder"]));
    return (id: string) => m.get(id) ?? id;
  }, [binders]);

  const tableRows: RowKey[] = useMemo(() => {
    const keys: RowKey[] = [{ kind: "storage" }];
    const seen = new Set<string>();
    for (const b of binders) {
      keys.push({ kind: "binder", binderId: b.id });
      seen.add(b.id);
    }
    for (const slot of row?.binders ?? []) {
      if (!seen.has(slot.binder)) {
        keys.push({ kind: "binder", binderId: slot.binder });
      }
    }
    return keys;
  }, [binders, row?.binders]);

  const persist = useCallback(
    async (next: PrintRow) => {
      setSaving(true);
      try {
        const res = await fetch(
          `/api/prints/${encodeURIComponent(next.set)}/${encodeURIComponent(next.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next),
          },
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? res.statusText);
        }
        const saved = (await res.json()) as PrintRow;
        setRow(saved);
        onSaved();
      } catch (e) {
        notifications.show({
          title: "Save failed",
          message: e instanceof Error ? e.message : String(e),
          color: "red",
        });
      } finally {
        setSaving(false);
      }
    },
    [onSaved],
  );

  function getCounts(key: RowKey): { nonfoil: number; foil: number } {
    if (!row) return { nonfoil: 0, foil: 0 };
    if (key.kind === "storage") return { ...row.storage };
    const slot = row.binders.find((b) => b.binder === key.binderId);
    return { nonfoil: slot?.nonfoil ?? 0, foil: slot?.foil ?? 0 };
  }

  function setCounts(key: RowKey, field: "nonfoil" | "foil", value: number) {
    setRow((prev) => {
      if (!prev) return prev;
      const v = Math.max(0, value);
      let next: PrintRow;
      if (key.kind === "storage") {
        next = { ...prev, storage: { ...prev.storage, [field]: v } };
      } else {
        const slots = [...prev.binders];
        const idx = slots.findIndex((s) => s.binder === key.binderId);
        if (idx >= 0) {
          slots[idx] = { ...slots[idx]!, [field]: v };
        } else if (v > 0) {
          slots.push({
            binder: key.binderId,
            nonfoil: field === "nonfoil" ? v : 0,
            foil: field === "foil" ? v : 0,
          });
        }
        next = { ...prev, binders: slots };
      }
      void persist(next);
      return next;
    });
  }

  return (
    <Stack gap="md">
      {match.imageUrl && (
        <Image src={match.imageUrl} alt={match.name} mah={280} fit="contain" radius="sm" />
      )}
      <Group gap="xs">
        <SetIcon code={match.set} />
        <Title order={5}>
          {match.set.toUpperCase()} #{match.collector_number}
        </Title>
      </Group>

      <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Location</Table.Th>
                <Table.Th ta="center">Nonfoil</Table.Th>
                <Table.Th ta="center">Foil</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tableRows.map((key) => {
                const counts = getCounts(key);
                const label =
                  key.kind === "storage" ? "Storage" : binderLabel(key.binderId);
                return (
                  <Table.Tr key={key.kind === "storage" ? "storage" : key.binderId}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {label}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <QtyControls
                        value={counts.nonfoil}
                        disabled={saving}
                        onChange={(n) => setCounts(key, "nonfoil", n)}
                      />
                    </Table.Td>
                    <Table.Td>
                      <QtyControls
                        value={counts.foil}
                        disabled={saving}
                        onChange={(n) => setCounts(key, "foil", n)}
                      />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
    </Stack>
  );
}

export function ScanPrintAdjustModal({
  opened,
  onClose,
  match,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  match: ScanMatchResult | null;
  onSaved: () => void;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title={match?.name ?? "Print"} size="lg">
      {match?.print ? (
        <AdjustBody
          key={match.id}
          initial={match.print}
          match={match}
          onSaved={onSaved}
        />
      ) : match ? (
        <Text size="sm" c="dimmed">
          This card is not in your collection index. Add it from Search first.
        </Text>
      ) : null}
    </Modal>
  );
}
