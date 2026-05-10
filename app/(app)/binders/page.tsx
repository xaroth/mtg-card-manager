"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DataTable } from "mantine-datatable";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconTrash } from "@tabler/icons-react";

import type { BinderEntry } from "@/lib/mtg/schemas";

export default function BindersPage() {
  const [rows, setRows] = useState<BinderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<BinderEntry | null>(null);
  const [blockOpen, setBlockOpen] = useState<{ refs: { set: string; printId: string; name: string }[] } | null>(null);

  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newNote, setNewNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/binders");
      const body = (await res.json()) as { error?: string; binders?: BinderEntry[] };
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setRows(body.binders ?? []);
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

  async function createBinder() {
    try {
      const res = await fetch("/api/binders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newId.trim(), name: newName, note: newNote }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      notifications.show({
        title: "Binder created",
        message: newName.trim() || "Add a name from the Binders page anytime.",
        color: "teal",
      });
      setCreateOpen(false);
      setNewId("");
      setNewName("");
      setNewNote("");
      await load();
    } catch (e) {
      notifications.show({
        title: "Create failed",
        message: e instanceof Error ? e.message : String(e),
        color: "red",
      });
    }
  }

  async function saveEdit() {
    if (!editOpen) return;
    try {
      const res = await fetch(`/api/binders/${encodeURIComponent(editOpen.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editOpen.name, note: editOpen.note }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      notifications.show({ title: "Saved", message: editOpen.name, color: "teal" });
      setEditOpen(null);
      await load();
    } catch (e) {
      notifications.show({
        title: "Save failed",
        message: e instanceof Error ? e.message : String(e),
        color: "red",
      });
    }
  }

  async function deleteBinder(row: BinderEntry) {
    try {
      const res = await fetch(`/api/binders/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      if (res.status === 409) {
        const body = (await res.json()) as {
          references?: { set: string; printId: string; name: string }[];
        };
        setBlockOpen({ refs: body.references ?? [] });
        return;
      }
      if (res.status === 204) {
        notifications.show({
          title: "Deleted",
          message: row.name.trim() || "Binder removed",
          color: "gray",
        });
        await load();
        return;
      }
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    } catch (e) {
      notifications.show({
        title: "Delete failed",
        message: e instanceof Error ? e.message : String(e),
        color: "red",
      });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Binders</Title>
        <Button onClick={() => setCreateOpen(true)}>New binder</Button>
      </Group>

      <DataTable
        fetching={loading}
        records={rows}
        idAccessor="id"
        columns={[
          { accessor: "name", title: "Name", ellipsis: true },
          { accessor: "note", title: "Note", ellipsis: true },
          {
            accessor: "actions",
            title: "",
            width: 100,
            render: (r) => (
              <Group gap={4}>
                <ActionIcon variant="subtle" onClick={() => setEditOpen({ ...r })}>
                  <IconEdit size={18} />
                </ActionIcon>
                <ActionIcon variant="subtle" color="red" onClick={() => void deleteBinder(r)}>
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
            ),
          },
        ]}
      />

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New binder">
        <Stack>
          <TextInput label="Id (immutable)" value={newId} onChange={(e) => setNewId(e.currentTarget.value)} required />
          <TextInput label="Name" value={newName} onChange={(e) => setNewName(e.currentTarget.value)} />
          <TextInput label="Note" value={newNote} onChange={(e) => setNewNote(e.currentTarget.value)} />
          <Button onClick={() => void createBinder()}>Create</Button>
        </Stack>
      </Modal>

      <Modal opened={!!editOpen} onClose={() => setEditOpen(null)} title="Edit binder">
        {editOpen && (
          <Stack>
            <TextInput
              label="Name"
              value={editOpen.name}
              onChange={(e) => setEditOpen({ ...editOpen, name: e.currentTarget.value })}
            />
            <TextInput
              label="Note"
              value={editOpen.note}
              onChange={(e) => setEditOpen({ ...editOpen, note: e.currentTarget.value })}
            />
            <Button onClick={() => void saveEdit()}>Save</Button>
          </Stack>
        )}
      </Modal>

      <Modal opened={!!blockOpen} onClose={() => setBlockOpen(null)} title="Cannot delete binder">
        <Stack gap="xs">
          <Text size="sm">Clear or reassign these prints first:</Text>
          {(blockOpen?.refs ?? []).map((ref) => (
            <Text key={`${ref.set}-${ref.printId}`} size="sm">
              <strong>{ref.set}</strong> — {ref.name}{" "}
              <Text span c="dimmed">
                ({ref.printId})
              </Text>
            </Text>
          ))}
        </Stack>
      </Modal>
    </Stack>
  );
}
