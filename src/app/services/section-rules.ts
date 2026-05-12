/**
 * Cross-type validation for the "move conv to section" feature.
 *
 * Mirrors backend `services/channels.go:sectionAllowedForType`. Keep
 * the two in sync — backend is the source of truth (it rejects invalid
 * combinations with ErrInvalidInput); this client-side copy just hides
 * impossible targets from menus and rejects bad drop-targets so the
 * user doesn't see a UI affordance that the server would refuse.
 *
 * Rules:
 *   - Built-in section ids accept only their own type bucket.
 *   - Any other id (custom sections — Mongo ObjectID hex) accepts any
 *     channel type.
 */
export function sectionAllowedForType(sectionId: string, channelType: string): boolean {
  switch (sectionId) {
    case "direct":
      return channelType === "direct" || channelType === "group_dm" || channelType === "dm";
    case "spaces":
      return channelType === "space" || channelType === "bot_channel";
    case "ai":
      return channelType === "ai_direct" || channelType === "ai_assisted" || channelType === "ai";
    case "customers":
      return channelType === "support_direct" || channelType === "external" || channelType === "external-group";
    default:
      return true;
  }
}
