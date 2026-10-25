import type React from "react";

/**
 * Creates an organic liquid water ripple effect on click/touch
 * expanding from the exact cursor/finger contact point.
 */
export function handleWaterRipple(e: React.MouseEvent<HTMLButtonElement>) {
  const button = e.currentTarget;
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2.2;
  const x = e.clientX - rect.left - size / 2;
  const y = e.clientY - rect.top - size / 2;

  const ripple = document.createElement("span");
  ripple.className = "water-drop-ripple";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  button.appendChild(ripple);
  setTimeout(() => {
    if (ripple.parentNode === button) {
      button.removeChild(ripple);
    }
  }, 750);
}
