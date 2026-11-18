import { createContext, useContext } from 'react'

/**
 * The level a card or panel title takes where it is rendered. Staff pages
 * have one `h1` (the page header); a titled `Section` is an `h2` and moves
 * its contents to level 3. Titles outside any titled section are `h2`, so
 * headings never skip a level.
 */
export const HeadingLevel = createContext<2 | 3 | 4>(2)

export function useHeadingLevel() {
  return useContext(HeadingLevel)
}
