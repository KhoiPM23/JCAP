/** Capture the full result, including content below the visible viewport. */
export async function exportResultImage(element: HTMLElement): Promise<Blob> {
  // Load the renderer only when the learner requests an image.
  const { toBlob } = await import('html-to-image');
  await document.fonts.ready;

  if (!element.isConnected) throw new Error('Result is no longer displayed.');

  // Give the image a readable width even when the app's sidebar narrows the
  // mobile viewport. Render an offscreen copy without resizing the live page.
  const width = Math.max(720, Math.ceil(element.getBoundingClientRect().width));
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  Object.assign(host.style, {
    position: 'fixed', left: '-100000px', top: '0', width: `${width}px`,
    pointerEvents: 'none', fontFamily: getComputedStyle(element).fontFamily,
  });
  const copy = element.cloneNode(true) as HTMLElement;
  copy.style.width = `${width}px`;
  host.appendChild(copy);
  document.body.appendChild(host);
  try {
    const height = Math.ceil(copy.scrollHeight);
    if (height <= 0) throw new Error('Result has no visible content.');
    // Bound canvas memory on results with long feedback/mission lists.
    const pixelRatio = Math.min(2, 8192 / width, 8192 / height, Math.sqrt(16_000_000 / (width * height)));
    const image = await toBlob(copy, {
      backgroundColor: '#F4F9FE',
      width,
      height,
      pixelRatio,
      preferredFontFormat: 'woff2',
    });
    if (!image || image.size === 0) throw new Error('Could not create the result image.');
    return image;
  } finally {
    host.remove();
  }
}

export function downloadResultImage(image: Blob, resultId: number): void {
  const url = URL.createObjectURL(image);
  const link = document.createElement('a');
  link.href = url;
  link.download = `JCAP-ket-qua-hoi-thoai-${resultId}.png`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Leave the URL alive long enough for the browser to start the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
