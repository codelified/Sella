/**
 * Resolve a CMS image field to a usable URL.
 *
 * Locally uploaded media has no `src` — it carries `meta.storageKey` and is
 * served from the internal file route. Remote media may already have `url`
 * or `src`. Mirrors EmDash's own resolver so order lines, admin and
 * transactional emails all show product photos.
 */
export function mediaUrl(image: any): string {
	if (!image) return "";
	if (typeof image === "string") return image;
	const direct = image.url ?? image.src;
	if (typeof direct === "string" && direct) return direct;
	const key = image.meta?.storageKey ?? image.storageKey;
	if (typeof key === "string" && key) {
		const segments = key.split("/");
		// Encode per segment unless a segment would collapse the path.
		const encoded = segments.some((s) => s === "" || s === "." || s === "..")
			? encodeURIComponent(key)
			: segments.map(encodeURIComponent).join("/");
		return `/_emdash/api/media/file/${encoded}`;
	}
	return "";
}