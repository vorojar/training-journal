export type Note = {
  id: string;
  space_id: string | null;
  kind: string;
  title: string;
  href: string;
  created_at: string;
  read_at: string | null;
};
export function notificationGroups(notes: Note[]) {
  const groups = new Map<
    string,
    { note: Note; unreadIds: string[]; count: number }
  >();
  for (const note of notes) {
    const key =
      note.kind === "change"
        ? JSON.stringify([note.kind, note.space_id, note.href, note.title])
        : note.id;
    const group = groups.get(key);
    if (group) {
      group.count++;
      if (!note.read_at) group.unreadIds.push(note.id);
      if (note.created_at > group.note.created_at) group.note = note;
    } else {
      groups.set(key, {
        note,
        unreadIds: note.read_at ? [] : [note.id],
        count: 1,
      });
    }
  }
  return [...groups.values()].sort((a, b) =>
    b.note.created_at.localeCompare(a.note.created_at),
  );
}
