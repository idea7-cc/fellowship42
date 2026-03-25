import { Doc, Id, TableNames } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

type ChurchScopedTable =
  | "attendanceRecords"
  | "contributions"
  | "courseEnrollments"
  | "courses"
  | "events"
  | "facilities"
  | "groupMemberships"
  | "groupSessions"
  | "groups"
  | "landingPages"
  | "ministries"
  | "people"
  | "sermons";

type ChurchScopedDoc<TableName extends ChurchScopedTable> = Doc<TableName> & {
  churchId: Id<"churches">;
};

export async function requireDocument<TableName extends TableNames>(
  ctx: Ctx,
  id: Id<TableName>,
  label: string
): Promise<Doc<TableName>> {
  const doc = await ctx.db.get(id);
  if (!doc) {
    throw new Error(`${label} not found`);
  }

  return doc;
}

export async function requireChurchScopedDocument<
  TableName extends ChurchScopedTable
>(
  ctx: Ctx,
  id: Id<TableName>,
  churchId: Id<"churches">,
  label: string
): Promise<ChurchScopedDoc<TableName>> {
  const doc = (await requireDocument(ctx, id, label)) as ChurchScopedDoc<TableName>;

  if (doc.churchId !== churchId) {
    throw new Error(`${label} does not belong to this church`);
  }

  return doc;
}
