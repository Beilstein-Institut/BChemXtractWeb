/**
 * searchFocus — shared mutable ref to the header SearchInput's input element.
 *
 * Why: BrowseToolbar's "Search within" button needs to focus the header
 * search input after updating the URL. We refuse to `document.querySelector`
 * by aria-label (brittle across copy changes, accessibility audits, i18n).
 * Instead, SearchInput.tsx writes its `<input ref>` here on mount (via a
 * useEffect), and the "Search within" handler (BrowseToolbar or
 * App.handleSearchWithin) reads it to call `.focus()` directly.
 */
export const searchInputRef: { current: HTMLInputElement | null } = {
  current: null,
};
