"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Image,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronDown } from "@tabler/icons-react";

import { SetIcon } from "@/components/SetIcon";
import type { PrintRow } from "@/lib/mtg/schemas";
import { isWishlistRow } from "@/lib/mtg/totals";

type ScCard = {
  id: string;
  name: string;
  set: string;
  collector_number: string;
  /** Present on Scryfall API card objects; opens the canonical card page. */
  scryfall_uri?: string;
  image_uris?: { small?: string };
  card_faces?: { image_uris?: { small?: string } }[];
};

type SearchPayload = {
  data?: ScCard[];
  next_page?: string;
};

const SEARCH_SORT_OPTIONS = [
  { value: "released", label: "Release Date" },
  { value: "name", label: "Name" },
  { value: "set", label: "Set/Number" },
] as const;

function thumb(c: ScCard): string | undefined {
  return (
    c.image_uris?.small ?? c.card_faces?.[0]?.image_uris?.small ?? undefined
  );
}

function scryfallPageUrl(c: ScCard): string {
  const direct = c.scryfall_uri?.trim();
  if (direct) return direct;
  return `https://scryfall.com/card/${c.set.toLowerCase()}/${encodeURIComponent(c.collector_number)}`;
}

const metaBadgeR = "var(--mantine-radius-sm)";
const metaBadgePad = {
  paddingBlock: "var(--mantine-spacing-sm)",
  paddingInline: "var(--mantine-spacing-xs)",
} as const;

function scCardToWishlistRow(c: ScCard): PrintRow {
  return {
    id: c.id,
    set: c.set.toLowerCase(),
    collector_number: c.collector_number,
    name: c.name,
    storage: { nonfoil: 0, foil: 0 },
    binders: [],
    note: "",
  };
}

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [defaultSearchQuery, setDefaultSearchQuery] = useState("");
  const [defaultQueryResolved, setDefaultQueryResolved] = useState(false);
  const userEditedQueryRef = useRef(false);
  const [cards, setCards] = useState<ScCard[]>([]);
  const [nextPage, setNextPage] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [hideOwned, setHideOwned] = useState(true);
  const [hideWishlist, setHideWishlist] = useState(true);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  /** Any print row (wishlist or owned), for UI that reflects “already in collection”. */
  const [collectionIds, setCollectionIds] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [pick, setPick] = useState<ScCard | null>(null);
  const [nf, setNf] = useState(1);
  const [foil, setFoil] = useState(0);
  const [sortOrder, setSortOrder] = useState<string>("released");

  const loadOwned = useCallback(async () => {
    const res = await fetch("/api/prints");
    if (!res.ok) return;
    const data = (await res.json()) as { prints: PrintRow[] };
    const owned = new Set<string>();
    const wishlist = new Set<string>();
    const all = new Set<string>();
    for (const row of data.prints) {
      all.add(row.id);
      if (isWishlistRow(row)) wishlist.add(row.id);
      else owned.add(row.id);
    }
    setOwnedIds(owned);
    setWishlistIds(wishlist);
    setCollectionIds(all);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void loadOwned(), 0);
    return () => window.clearTimeout(t);
  }, [loadOwned]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/config")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((cfg: { defaultSearchQuery?: string }) => {
        if (cancelled || typeof cfg.defaultSearchQuery !== "string") return;
        setDefaultSearchQuery(cfg.defaultSearchQuery);
        if (!userEditedQueryRef.current) {
          setQ(cfg.defaultSearchQuery);
        }
      })
      .catch(() => {
        /* keep q as-is; search route still applies server default when empty */
      })
      .finally(() => {
        if (!cancelled) setDefaultQueryResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runSearch = useCallback(
    async (opts?: { append?: boolean; next?: string; sort?: string }) => {
      setLoading(true);
      try {
        const sort = opts?.sort ?? sortOrder;
        let url: string;
        if (opts?.next != null) {
          url = `/api/search?next=${encodeURIComponent(opts.next)}`;
        } else {
          const params = new URLSearchParams();
          if (q.trim()) params.set("q", q.trim());
          params.set("sort", sort);
          url = `/api/search?${params.toString()}`;
        }
        const res = await fetch(url);
        const body = (await res.json()) as SearchPayload & { error?: string };
        if (!res.ok) {
          throw new Error((body as { error?: string }).error ?? res.statusText);
        }
        const data = body.data ?? [];
        setCards((prev) => (opts?.append ? [...prev, ...data] : data));
        setNextPage(body.next_page);
      } catch (e) {
        notifications.show({
          title: "Search failed",
          message: e instanceof Error ? e.message : String(e),
          color: "red",
        });
      } finally {
        setLoading(false);
      }
    },
    [q, sortOrder],
  );

  // Initial load uses default config query; q updates trigger manual Search only.
  useEffect(() => {
    const t = window.setTimeout(() => void runSearch(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  const visible = useMemo(() => {
    let v = cards;
    if (hideOwned) {
      v = v.filter((c) => !ownedIds.has(c.id));
    }
    if (hideWishlist) {
      v = v.filter((c) => !wishlistIds.has(c.id));
    }
    return v;
  }, [cards, hideOwned, hideWishlist, ownedIds, wishlistIds]);

  const visibleCountBySet = useMemo(() => {
    const m = new Map<string, number>();
    for (const card of visible) {
      const k = card.set.toLowerCase();
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [visible]);

  const ownedRemovedFromView = useMemo(
    () => cards.filter((c) => ownedIds.has(c.id)).length,
    [cards, ownedIds],
  );
  const wishlistRemovedFromView = useMemo(
    () => cards.filter((c) => wishlistIds.has(c.id)).length,
    [cards, wishlistIds],
  );

  async function postPrint(row: PrintRow) {
    const res = await fetch("/api/prints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      throw new Error(err.error ?? res.statusText);
    }
  }

  async function upsertRow(row: PrintRow) {
    await postPrint(row);
    await loadOwned();
  }

  async function addWishlist(c: ScCard) {
    try {
      await upsertRow(scCardToWishlistRow(c));
      notifications.show({ title: "Added", message: `${c.name} · wishlist`, color: "teal" });
    } catch (e) {
      notifications.show({
        title: "Could not add",
        message: e instanceof Error ? e.message : String(e),
        color: "red",
      });
    }
  }

  async function addWishlistForVisibleSet(setCode: string) {
    const code = setCode.toLowerCase();
    const targets = visible.filter((x) => x.set.toLowerCase() === code);
    if (targets.length < 2) return;

    let ok = 0;
    const failures: { name: string; err: string }[] = [];
    for (const card of targets) {
      try {
        await postPrint(scCardToWishlistRow(card));
        ok++;
      } catch (e) {
        failures.push({
          name: card.name,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }
    await loadOwned();

    if (failures.length === 0) {
      notifications.show({
        title: "Added",
        message: `${ok} cards from ${code.toUpperCase()} · wishlist`,
        color: "teal",
      });
    } else if (ok === 0) {
      notifications.show({
        title: "Could not add set",
        message: failures.map((f) => `${f.name}: ${f.err}`).join("; "),
        color: "red",
      });
    } else {
      notifications.show({
        title: "Partially added",
        message: `${ok} added, ${failures.length} failed (${failures[0].name}: ${failures[0].err})`,
        color: "yellow",
      });
    }
  }

  async function confirmAddToCollection() {
    if (!pick) return;
    const row: PrintRow = {
      id: pick.id,
      set: pick.set.toLowerCase(),
      collector_number: pick.collector_number,
      name: pick.name,
      storage: { nonfoil: nf, foil },
      binders: [],
      note: "",
    };
    try {
      await upsertRow(row);
      setAddOpen(false);
      notifications.show({
        title: "Collection",
        message: pick.name,
        color: "teal",
      });
    } catch (e) {
      notifications.show({
        title: "Could not add",
        message: e instanceof Error ? e.message : String(e),
        color: "red",
      });
    }
  }

  return (
    <Stack gap="md">
      <Title order={2}>Search</Title>
      <Paper withBorder radius="md" p="sm" shadow="xs">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <TextInput
            label="Scryfall query"
            flex={1}
            miw={0}
            value={q}
            onChange={(e) => {
              userEditedQueryRef.current = true;
              setQ(e.currentTarget.value);
            }}
            placeholder={
              defaultSearchQuery ||
              (defaultQueryResolved
                ? "Empty uses default from config.json"
                : "Loading default query from config…")
            }
          />
          <Select
            label="Sort"
            w={160}
            flex="0 0 auto"
            data={[...SEARCH_SORT_OPTIONS]}
            value={sortOrder}
            allowDeselect={false}
            onChange={(v) => {
              const next = v ?? "released";
              setSortOrder(next);
              void runSearch({ sort: next });
            }}
          />
          <Button loading={loading} onClick={() => void runSearch()}>
            Search
          </Button>
        </Group>
      </Paper>
      <Stack gap="xs">
        <Checkbox
          label={
            <>
              Hide owned
              {hideOwned ? (
                <Text component="span" size="sm" c="dimmed" ml="xs">
                  ({ownedRemovedFromView} removed from view)
                </Text>
              ) : null}
            </>
          }
          checked={hideOwned}
          disabled={hideWishlist}
          onChange={(e) => setHideOwned(e.currentTarget.checked)}
        />
        <Checkbox
          label={
            <>
              Hide wishlist
              {hideWishlist ? (
                <Text component="span" size="sm" c="dimmed" ml="xs">
                  ({wishlistRemovedFromView} removed from view)
                </Text>
              ) : null}
            </>
          }
          checked={hideWishlist}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            setHideWishlist(on);
            if (on) setHideOwned(true);
          }}
        />
      </Stack>

      <SimpleGrid
        cols={{ base: 1, xs: 2, sm: 2, md: 3, lg: 4, xl: 5 }}
        spacing="md"
      >
        {visible.map((c) => (
          <Card key={c.id} withBorder padding="sm" radius="md">
            <Card.Section>
              {thumb(c) ? (
                <Anchor
                  href={scryfallPageUrl(c)}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="never"
                  display="block"
                  aria-label={`View ${c.name} on Scryfall (opens in new tab)`}
                >
                  <Image src={thumb(c)} alt={c.name} height={220} fit="contain" />
                </Anchor>
              ) : (
                <Text size="sm" p="sm">
                  No image
                </Text>
              )}
            </Card.Section>
            <Stack gap={6} mt="sm">
              <Text fw={600} lineClamp={2}>
                {c.name}
              </Text>
              <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
                <Group gap={0} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                  <Badge
                    variant="filled"
                    color="indigo"
                    radius={0}
                    leftSection={<SetIcon code={c.set} />}
                    styles={{
                      root: {
                        ...metaBadgePad,
                        display: "inline-flex",
                        alignItems: "center",
                        borderTopLeftRadius: metaBadgeR,
                        borderBottomLeftRadius: metaBadgeR,
                        borderTopRightRadius: 0,
                        borderBottomRightRadius: 0,
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
                    {c.set.toUpperCase()}
                  </Badge>
                  <Badge
                    variant="light"
                    color="indigo"
                    radius={0}
                    styles={{
                      root: {
                        ...metaBadgePad,
                        display: "inline-flex",
                        alignItems: "center",
                        borderTopRightRadius: metaBadgeR,
                        borderBottomRightRadius: metaBadgeR,
                        borderTopLeftRadius: 0,
                        borderBottomLeftRadius: 0,
                        marginLeft: -1,
                        borderLeft:
                          "1px solid color-mix(in srgb, var(--mantine-color-indigo-filled) 40%, transparent)",
                      },
                      label: {
                        display: "flex",
                        alignItems: "center",
                        lineHeight: 1,
                      },
                    }}
                  >
                    #{c.collector_number}
                  </Badge>
                </Group>
                <Button.Group style={{ flexShrink: 0 }}>
                  <Button
                    size="xs"
                    variant={collectionIds.has(c.id) ? "outline" : "filled"}
                    color={collectionIds.has(c.id) ? "green" : undefined}
                    onClick={() => void addWishlist(c)}
                  >
                    Add
                  </Button>
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <Button
                        size="xs"
                        variant="default"
                        px={2}
                        aria-label="More ways to add"
                      >
                        <IconChevronDown size={14} />
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {(() => {
                        const nInSet = visibleCountBySet.get(c.set.toLowerCase()) ?? 0;
                        return nInSet >= 2 ? (
                          <Menu.Item onClick={() => void addWishlistForVisibleSet(c.set)}>
                            Add Set ({nInSet} cards)
                          </Menu.Item>
                        ) : null;
                      })()}
                      <Menu.Item
                        onClick={() => {
                          setPick(c);
                          setNf(1);
                          setFoil(0);
                          setAddOpen(true);
                        }}
                      >
                        Add with inventory
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Button.Group>
              </Group>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>

      {nextPage && (
        <Button
          variant="default"
          loading={loading}
          onClick={() => void runSearch({ append: true, next: nextPage })}
        >
          Load more
        </Button>
      )}

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add with inventory">
        <Stack>
          <Text size="sm">{pick?.name}</Text>
          <NumberInput label="Storage nonfoil" value={nf} onChange={(v) => setNf(Number(v) || 0)} min={0} />
          <NumberInput label="Storage foil" value={foil} onChange={(v) => setFoil(Number(v) || 0)} min={0} />
          <Text size="xs" c="dimmed">
            Binder splits can be edited from the Collection page.
          </Text>
          <Button onClick={() => void confirmAddToCollection()}>Save</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
