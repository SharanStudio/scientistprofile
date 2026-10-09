// Loads ExcelJS only when it is needed (Template or Upload). The library is bundled in /vendor,
// so it comes from this site itself and never from a third-party server.
let loading = null;

export function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/exceljs.min.js', import.meta.url).href;
    s.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : (loading = null, reject(new Error('The spreadsheet library did not start.'))));
    s.onerror = () => { loading = null; reject(new Error('Could not load the spreadsheet library. Check your connection and try again.')); };
    document.head.append(s);
  });
  return loading;
}
