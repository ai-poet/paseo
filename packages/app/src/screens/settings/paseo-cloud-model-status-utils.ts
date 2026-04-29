import type { Sub2APIGroupStatusItem } from "@/lib/sub2api-client";

export function resolveGroupStatusDisplayName(
  item: Sub2APIGroupStatusItem,
  groupNameById: ReadonlyMap<number, string>,
): string {
  const statusName = item.group_name.trim();
  if (statusName) {
    return statusName;
  }
  const availableGroupName = groupNameById.get(item.group_id)?.trim();
  if (availableGroupName) {
    return availableGroupName;
  }
  return `Group #${item.group_id}`;
}
