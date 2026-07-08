"use client";

import { useEffect, useRef } from "react";

/**
 * CSS selector matching all natively focusable, non-disabled elements.
 * Matches the same set the browser uses for sequential focus navigation.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Returns all focusable descendants of `container` as a flat, ordered list.
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Traps Tab / Shift+Tab focus cycling within a dialog container while open.
 *
 * - Stores `document.activeElement` (the trigger button) on open.
 * - Restores focus to the trigger when the dialog closes or unmounts.
 * - Marks all siblings of the dialog wrapper `aria-hidden` while open
 *   so assistive technology cannot reach background content.
 * - Cycles Tab from the last focusable element back to the first, and
 *   Shift+Tab from the first back to the last.
 */
export function useFocusTrap(
  open: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
) {
  const triggerRef = useRef<HTMLElement | null>(null);

  // ------------------------------------------------------------------
  // Store / restore trigger focus  +  aria-hidden on background siblings
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    const container = containerRef.current;
    if (!container) return;

    // Store the element that had focus before the dialog opened.
    triggerRef.current = document.activeElement as HTMLElement;

    // Mark siblings of the dialog wrapper aria-hidden so screen readers
    // cannot reach background content while the modal is open.
    const siblings: HTMLElement[] = [];
    if (container.parentElement) {
      const parent = container.parentElement;
      for (const child of Array.from(parent.children) as HTMLElement[]) {
        if (child !== container) {
          if (!child.hasAttribute("aria-hidden")) {
            child.setAttribute("aria-hidden", "true");
            siblings.push(child);
          }
        }
      }
    }

    return () => {
      // Restore focus when the dialog closes or unmounts.
      const trigger = triggerRef.current;
      if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
      }
      triggerRef.current = null;

      // Remove aria-hidden from siblings we marked.
      for (const sibling of siblings) {
        sibling.removeAttribute("aria-hidden");
      }
    };
  }, [open, containerRef]);

  // ------------------------------------------------------------------
  // Tab-cycle keyboard handler
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!open || !containerRef.current) return;

    const container = containerRef.current;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;

      const focusable = getFocusableElements(container);
      if (focusable.length < 2) return; // nothing meaningful to cycle

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, containerRef]);
}
