/**
 * searchFocus — shared mutable ref to the header SearchInput's input element.
 *
 * Why: Plan 07's BrowseToolbar has a "Search within" button that needs to
 * focus the header search input after updating the URL. We refuse to
 * `document.querySelector` by aria-label (brittle across copy changes,
 * accessibility audits, i18n). Instead, SearchInput.tsx writes its
 * `<input ref>` here on mount, and Plan 07's handler reads it to call
 * `.focus()` directly.
 *
 * Plan 06 creates + populates this ref (via SearchInput's useEffect).
 * Plan 07 consumes it (from BrowseToolbar or App.handleSearchWithin).
 */
export const searchInputRef: { current: HTMLInputElement | null } = {
  current: null,
};
