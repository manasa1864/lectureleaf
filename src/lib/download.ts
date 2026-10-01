/** Save a Blob as a file through the browser's download flow. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A file name based on the lecture title, safe for any operating system. */
export function pdfFilename(title: string | null | undefined): string {
  const base = (title || 'LectureLeaf notes').replace(/[\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 80);
  return `${base || 'LectureLeaf notes'}.pdf`;
}
