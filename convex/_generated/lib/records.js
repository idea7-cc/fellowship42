export async function requireDocument(ctx, id, label) {
    const doc = await ctx.db.get(id);
    if (!doc) {
        throw new Error(`${label} not found`);
    }
    return doc;
}
export async function requireChurchScopedDocument(ctx, id, churchId, label) {
    const doc = (await requireDocument(ctx, id, label));
    if (doc.churchId !== churchId) {
        throw new Error(`${label} does not belong to this church`);
    }
    return doc;
}
