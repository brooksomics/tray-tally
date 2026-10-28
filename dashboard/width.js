// Charts draw at a fixed pixel width, so a phone turned sideways keeps the
// narrow charts until they're redrawn at the new width.

/** The reading column (phones included), up to 1000 px; read at draw time. */
export const width = () =>
  Math.max(320, Math.min(1000, document.body.clientWidth - 32));

/**
 * Calls `redraw` once a resize settles, and only if the width changed: a
 * phone's address bar hiding resizes the height, not the charts.
 */
export function onWidthChange(redraw) {
  let drawn = width();
  let timer;
  addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (width() === drawn) return;
      drawn = width();
      redraw();
    }, 200);
  });
}
