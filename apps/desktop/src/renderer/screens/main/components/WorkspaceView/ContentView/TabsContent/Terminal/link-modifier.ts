/**
 * Tracks whether the link-activation modifier (⌘) is currently held.
 *
 * Link providers only surface links while it's down, matching the ⌘-hover
 * convention of iTerm2: without it, the terminal paints its blue hover
 * underline under any path/URL-looking text the mouse happens to rest on —
 * including the text being typed into an agent's input box — and a plain
 * click can accidentally open links.
 *
 * The mousemove listener (capture phase, so it runs before the terminal's own
 * hover handler) keeps the state honest even when focus is elsewhere, since
 * every MouseEvent carries the live metaKey state.
 */
let modifierHeld = false;

export function isLinkModifierHeld(): boolean {
	return modifierHeld;
}

// Guard on addEventListener too: the test environment defines a bare `window`.
if (
	typeof window !== "undefined" &&
	typeof window.addEventListener === "function"
) {
	// Ctrl counts too: the providers' activation handlers accept Ctrl-click as
	// well as Cmd-click, and the hover gate must agree with them.
	const readModifier = (event: KeyboardEvent | MouseEvent) => {
		modifierHeld = event.metaKey || event.ctrlKey;
	};
	window.addEventListener("keydown", readModifier, true);
	// On the release of the modifier itself, the event already reports the
	// post-release state (metaKey/ctrlKey false), so a plain read is correct.
	window.addEventListener("keyup", readModifier, true);
	window.addEventListener("mousemove", readModifier, true);
	// Cmd+Tab away leaves keyup unseen; reset on window blur.
	window.addEventListener("blur", () => {
		modifierHeld = false;
	});
}
