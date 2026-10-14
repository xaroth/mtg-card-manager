"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  Accordion,
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Image,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { DataTable, type DataTableColumn } from "mantine-datatable";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconPlaylistAdd, IconTrash } from "@tabler/icons-react";

import { SetIcon } from "@/components/SetIcon";
import type { BinderSlot, CatalogCard, PrintRow } from "@/lib/mtg/schemas";
import { sortPrintRows } from "@/lib/mtg/sort-prints";
import { isWishlistRow, rowTotals } from "@/lib/mtg/totals";

type PrintPayload = PrintRow & { set: string; cardmarket_id?: number };

function matchesTokens(r: PrintPayload, raw: string): boolean {
  const parts = raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return true;
  const hay = `${r.name} ${r.set} ${r.collector_number} ${r.note}`.toLowerCase();
  return parts.every((p) => hay.includes(p));
}

/** Sort by set code, then collector number within set (via sortPrintRows). */
function sortPrintsCollection(prints: PrintPayload[]): PrintPayload[] {
  const bySet = new Map<string, PrintPayload[]>();
  for (const p of prints) {
    const k = p.set.toLowerCase();
    let arr = bySet.get(k);
    if (!arr) {
      arr = [];
      bySet.set(k, arr);
    }
    arr.push(p);
  }
  const out: PrintPayload[] = [];
  for (const k of [...bySet.keys()].sort((a, b) => a.localeCompare(b))) {
    out.push(...sortPrintRows(bySet.get(k)!));
  }
  return out;
}

function catalogPreviewImage(card: CatalogCard): string | undefined {
  const top =
    card.image_uris?.normal ??
    card.image_uris?.large ??
    card.image_uris?.small ??
    card.image_uris?.png;
  if (top) return top;
  const face = card.card_faces?.[0]?.image_uris;
  return face?.normal ?? face?.large ?? face?.small ?? face?.png;
}

function EditModalCatalogPreview({ print }: { print: PrintPayload }) {
  const [card, setCard] = useState<CatalogCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/catalog/cards/${encodeURIComponent(print.id)}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) {
          setNotFound(true);
          return;
        }
        if (!r.ok) {
          setNotFound(true);
          return;
        }
        const j = (await r.json()) as CatalogCard;
        setCard(j);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [print.id]);

  const imgUrl = card ? catalogPreviewImage(card) : undefined;
  const scryfallHref =
    card?.scryfall_uri?.trim() ||
    `https://scryfall.com/card/${print.set.toLowerCase()}/${encodeURIComponent(print.collector_number)}`;

  return (
    <Paper withBorder p="md" radius="md" mb="xs">
      <Group align="flex-start" wrap="nowrap" gap="md">
        <Box w={220} style={{ flexShrink: 0 }}>
          {loading ? (
            <Skeleton height={308} radius="sm" />
          ) : imgUrl ? (
            <Image
              src={imgUrl}
              alt={print.name}
              radius="sm"
              h={308}
              fit="contain"
              style={{ width: "100%" }}
            />
          ) : (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              No image in catalog
            </Text>
          )}
        </Box>
        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <Title order={4} lineClamp={3}>
            {print.name}
          </Title>
          <Group gap="xs">
            <Badge variant="filled" color="indigo">
              {print.set.toUpperCase()}
            </Badge>
            <Badge variant="light">#{print.collector_number}</Badge>
            {card?.rarity ? (
              <Badge variant="outline" tt="capitalize">
                {card.rarity}
              </Badge>
            ) : null}
          </Group>
          {card?.set_name ? (
            <Text size="sm" fw={500}>
              {card.set_name}
            </Text>
          ) : null}
          {card?.type_line ? (
            <Text size="sm" c="dimmed">
              {card.type_line}
            </Text>
          ) : null}
          {notFound && !loading ? (
            <Text size="xs" c="dimmed">
              Catalog file not found for this print id — sync the catalog or use Scryfall to
              confirm art and details.
            </Text>
          ) : null}
          <Anchor href={scryfallHref} target="_blank" rel="noopener noreferrer" size="sm">
            Open on Scryfall
          </Anchor>
          <Text size="xs" c="dimmed" ff="monospace">
            Print id: {print.id}
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
}

export default function CollectionPage() {
  const [rows, setRows] = useState<PrintPayload[]>([]);
  const [binderIds, setBinderIds] = useState<{ value: string; label: string }[]>([]);
  const [filter, setFilter] = useState<"all" | "owned" | "wishlist">("all");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText] = useDebouncedValue(searchText, 300);
  const [limitSets, setLimitSets] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<"none" | "set">("none");
  const [expandedSets, setExpandedSets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<PrintPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/prints");
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      const data = (await res.json()) as {
        binders: { binders: { id: string; name: string }[] };
        prints: PrintPayload[];
      };
      setRows(data.prints);
      setBinderIds(
        data.binders.binders.map((b) => ({
          value: b.id,
          label: b.name?.trim() ? b.name.trim() : "Unnamed binder",
        })),
      );
    } catch (e) {
      notifications.show({
        title: "Load failed",
        message: e instanceof Error ? e.message : String(e),
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const typeFiltered = useMemo(() => {
    return rows.filter((r) => {
      const w = isWishlistRow(r);
      if (filter === "wishlist") return w;
      if (filter === "owned") return !w;
      return true;
    });
  }, [rows, filter]);

  const setOptions = useMemo(() => {
    const u = new Map<string, string>();
    for (const r of typeFiltered) {
      u.set(r.set.toLowerCase(), r.set);
    }
    return [...u.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([lower, canonical]) => ({ value: lower, label: canonical.toUpperCase() }));
  }, [typeFiltered]);

  const limitSetsFiltered = useMemo(() => {
    if (!limitSets.length) return typeFiltered;
    const allow = new Set(limitSets.map((s) => s.toLowerCase()));
    return typeFiltered.filter((r) => allow.has(r.set.toLowerCase()));
  }, [typeFiltered, limitSets]);

  const searchFiltered = useMemo(
    () => limitSetsFiltered.filter((r) => matchesTokens(r, debouncedSearchText)),
    [limitSetsFiltered, debouncedSearchText],
  );

  const sortedFlat = useMemo(() => sortPrintsCollection(searchFiltered), [searchFiltered]);

  const groupedBySet = useMemo(() => {
    const m = new Map<string, PrintPayload[]>();
    for (const r of searchFiltered) {
      const k = r.set.toLowerCase();
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, ps]) => [code, sortPrintRows(ps)] as const);
  }, [searchFiltered]);

  const groupKeys = useMemo(() => groupedBySet.map(([k]) => k), [groupedBySet]);

  const binderNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of binderIds) {
      m.set(o.value, o.label);
    }
    return m;
  }, [binderIds]);

  async function saveEdit() {
    if (!edit) return;
    try {
      const res = await fetch(
        `/api/prints/${encodeURIComponent(edit.set)}/${encodeURIComponent(edit.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(edit),
        },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      notifications.show({ title: "Saved", message: edit.name, color: "teal" });
      setEdit(null);
      await load();
    } catch (e) {
      notifications.show({
        title: "Save failed",
        message: e instanceof Error ? e.message : String(e),
        color: "red",
      });
    }
  }

  async function deleteRow(r: PrintPayload) {
    if (!confirm(`Remove ${r.name} from ${r.set}?`)) return;
    try {
      const res = await fetch(
        `/api/prints/${encodeURIComponent(r.set)}/${encodeURIComponent(r.id)}`,
        { method: "DELETE" },
      );
      if (res.status === 204) {
        notifications.show({ title: "Removed", message: r.name, color: "gray" });
        await load();
        return;
      }
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      notifications.show({ title: "Removed", message: r.name, color: "gray" });
      await load();
    } catch (e) {
      notifications.show({
        title: "Delete failed",
        message: e instanceof Error ? e.message : String(e),
        color: "red",
      });
    }
  }

  function binderSummary(b: BinderSlot[]) {
    if (!b.length) return "—";
    return b
      .map((s) => {
        const label = binderNameById.get(s.binder) ?? "Unknown binder";
        return `${label}: ${s.nonfoil}/${s.foil}`;
      })
      .join("; ");
  }

  function updateSlot(i: number, patch: Partial<BinderSlot>) {
    if (!edit) return;
    const binders = [...edit.binders];
    binders[i] = { ...binders[i]!, ...patch };
    setEdit({ ...edit, binders });
  }

  function addSlot() {
    if (!edit) return;
    const first = binderIds[0]?.value;
    if (!first) {
      notifications.show({
        title: "No binders",
        message: "Create a binder first.",
        color: "yellow",
      });
      return;
    }
    setEdit({
      ...edit,
      binders: [...edit.binders, { binder: first, nonfoil: 0, foil: 0 }],
    });
  }

  function removeSlot(i: number) {
    if (!edit) return;
    const binders = edit.binders.filter((_, j) => j !== i);
    setEdit({ ...edit, binders });
  }

  const columns: DataTableColumn<PrintPayload>[] = [
    {
      accessor: "set",
      title: "Set",
      width: 118,
      render: (r) => (
        <Badge
          variant="outline"
          leftSection={<SetIcon code={r.set} />}
          styles={{
            root: {
              display: "inline-flex",
              alignItems: "center",
            },
            section: {
              marginRight: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
            label: {
              display: "flex",
              alignItems: "center",
              lineHeight: 1,
            },
          }}
        >
          {r.set.toUpperCase()}
        </Badge>
      ),
    },
    { accessor: "name", title: "Name", ellipsis: true },
    { accessor: "collector_number", title: "#", width: 70 },
    {
      accessor: "storage",
      title: "Storage nf/f",
      render: (r) => `${r.storage.nonfoil} / ${r.storage.foil}`,
    },
    {
      accessor: "totals",
      title: "Totals nf/f",
      render: (r) => {
        const t = rowTotals(r);
        return `${t.nonfoil} / ${t.foil}`;
      },
    },
    {
      accessor: "wishlist",
      title: "Wishlist",
      render: (r) =>
        isWishlistRow(r) ? (
          <Badge color="gray">wishlist</Badge>
        ) : (
          <Badge color="green">owned</Badge>
        ),
    },
    {
      accessor: "binders",
      title: "Binders",
      ellipsis: true,
      render: (r) => binderSummary(r.binders),
    },
    {
      accessor: "actions",
      title: "",
      width: 136,
      render: (r) => (
        <Group gap={4} wrap="nowrap">
          {r.cardmarket_id != null ? (
            <ActionIcon
              variant="subtle"
              component="a"
              href={`https://www.cardmarket.com/Magic/Products?idProduct=${encodeURIComponent(String(r.cardmarket_id))}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open on Cardmarket"
              title="Cardmarket"
              fz={11}
              fw={700}
              w={30}
              h={30}
            >
              CM
            </ActionIcon>
          ) : null}
          <ActionIcon variant="subtle" onClick={() => setEdit({ ...r })}>
            <IconEdit size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" onClick={() => void deleteRow(r)}>
            <IconTrash size={18} />
          </ActionIcon>
        </Group>
      ),
    },
  ];

  const resultCount = searchFiltered.length;
  const totalAfterType = typeFiltered.length;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Title order={2}>Collection</Title>
        <Button.Group>
          <Button variant={filter === "all" ? "filled" : "default"} onClick={() => setFilter("all")}>
            All
          </Button>
          <Button
            variant={filter === "owned" ? "filled" : "default"}
            onClick={() => setFilter("owned")}
          >
            Owned
          </Button>
          <Button
            variant={filter === "wishlist" ? "filled" : "default"}
            onClick={() => setFilter("wishlist")}
          >
            Wishlist
          </Button>
        </Button.Group>
      </Group>

      <Paper withBorder radius="md" p="sm" shadow="xs">
        <Stack gap="sm">
          <Group align="flex-end" gap="sm" wrap="wrap">
            <TextInput
              label="Search"
              placeholder="Name, set, #, note — separate words all match"
              flex={1}
              miw={200}
              value={searchText}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setSearchText(e.currentTarget.value)
              }
            />
            <MultiSelect
              label="Sets"
              placeholder="All sets"
              clearable
              searchable
              w={260}
              data={setOptions}
              value={limitSets}
              onChange={setLimitSets}
            />
            <Select
              label="Group by"
              allowDeselect={false}
              w={160}
              data={[
                { value: "none", label: "None (flat)" },
                { value: "set", label: "Set" },
              ]}
              value={groupBy}
              onChange={(v) => {
                const next = (v ?? "none") as "none" | "set";
                setGroupBy(next);
                if (next !== "set") setExpandedSets([]);
              }}
            />
          </Group>
          {groupBy === "set" && groupedBySet.length > 0 ? (
            <Group gap="xs">
              <Button size="xs" variant="light" onClick={() => setExpandedSets(groupKeys)}>
                Expand all sets
              </Button>
              <Button size="xs" variant="light" onClick={() => setExpandedSets([])}>
                Collapse all sets
              </Button>
            </Group>
          ) : null}
          <Text size="sm" c="dimmed">
            Showing {resultCount} of {totalAfterType} prints after type filter
            {limitSets.length ? ` · ${limitSets.length} set(s) selected` : ""}.
          </Text>
        </Stack>
      </Paper>

      {groupBy === "none" ? (
        <DataTable
          fetching={loading}
          records={sortedFlat}
          idAccessor="id"
          columns={columns}
        />
      ) : groupedBySet.length === 0 ? (
        <Text size="sm" c="dimmed">
          No prints match the current filters.
        </Text>
      ) : (
        <Accordion multiple value={expandedSets} onChange={setExpandedSets} variant="contained">
          {groupedBySet.map(([setCode, prints]) => (
            <Accordion.Item key={setCode} value={setCode}>
              <Accordion.Control>
                <Group justify="space-between" pr="sm">
                  <Group gap="xs" wrap="nowrap" align="center">
                    <SetIcon code={setCode} />
                    <Text fw={600}>{setCode.toUpperCase()}</Text>
                  </Group>
                  <Badge variant="light">{prints.length} prints</Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <DataTable
                  fetching={loading}
                  records={prints}
                  idAccessor="id"
                  columns={columns}
                  minHeight={120}
                />
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
      <Modal opened={!!edit} onClose={() => setEdit(null)} title="Edit print" size="xl">
        {edit && (
          <Stack>
            <EditModalCatalogPreview key={edit.id} print={edit} />
            <Group grow>
              <NumberInput
                label="Storage nonfoil"
                min={0}
                value={edit.storage.nonfoil}
                onChange={(v) =>
                  setEdit({
                    ...edit,
                    storage: { ...edit.storage, nonfoil: Number(v) || 0 },
                  })
                }
              />
              <NumberInput
                label="Storage foil"
                min={0}
                value={edit.storage.foil}
                onChange={(v) =>
                  setEdit({
                    ...edit,
                    storage: { ...edit.storage, foil: Number(v) || 0 },
                  })
                }
              />
            </Group>
            <Textarea
              label="Note"
              value={edit.note}
              onChange={(e) => setEdit({ ...edit, note: e.currentTarget.value })}
            />
            <Group>
              <Text size="sm" fw={600}>
                Binder slots
              </Text>
              <Button size="xs" leftSection={<IconPlaylistAdd size={14} />} onClick={addSlot}>
                Add slot
              </Button>
            </Group>
            {edit.binders.map((slot, i) => (
              <Group key={`${slot.binder}-${i}`} align="flex-end" grow>
                <Select
                  label="Binder"
                  data={binderIds}
                  value={slot.binder}
                  onChange={(v) => v && updateSlot(i, { binder: v })}
                />
                <NumberInput
                  label="NF"
                  min={0}
                  value={slot.nonfoil}
                  onChange={(v) => updateSlot(i, { nonfoil: Number(v) || 0 })}
                />
                <NumberInput
                  label="Foil"
                  min={0}
                  value={slot.foil}
                  onChange={(v) => updateSlot(i, { foil: Number(v) || 0 })}
                />
                <ActionIcon color="red" variant="light" onClick={() => removeSlot(i)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
            <Button onClick={() => void saveEdit()}>Save</Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
