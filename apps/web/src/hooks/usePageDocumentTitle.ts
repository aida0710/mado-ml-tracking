import { useEffect, type RefObject } from 'react';
import { composeDocumentTitle, getProductName } from '../lib/documentTitle';

/**
 * Names the browser tab after the text of the given elements (a screen's heading, then the line
 * above it), so a heading built from elements, such as a Run name with links around it, names the
 * tab as it reads. Leaving the screen puts back the product name until the next one names itself.
 */
export function usePageDocumentTitle(parts: readonly RefObject<HTMLElement | null>[]) {
  // Runs after every render: the heading's text is the page's props, which change with them.
  useEffect(() => {
    document.title = composeDocumentTitle(parts.map((part) => part.current?.textContent));
  });
  useEffect(
    () => () => {
      document.title = getProductName();
    },
    [],
  );
}
