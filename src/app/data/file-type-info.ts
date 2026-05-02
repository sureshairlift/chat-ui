/**
 * File-type registry — mirrors React FILE_TYPE_INFO 1:1.
 * Each entry: { color, label }. The label is rendered on the document-shape
 * SVG icon. Colors follow common conventions (red for PDF, blue for Word, etc).
 */

export interface FileTypeMeta { color: string; label: string; }

export const FILE_TYPE_INFO: Record<string, FileTypeMeta> = {
  // Documents
  pdf:    { color: "#dc2626", label: "PDF" },
  doc:    { color: "#2563eb", label: "DOC" },
  docx:   { color: "#2563eb", label: "DOC" },
  txt:    { color: "#6b7280", label: "TXT" },
  rtf:    { color: "#6b7280", label: "RTF" },
  md:     { color: "#374151", label: "MD" },
  pages:  { color: "#fb923c", label: "PAGES" },
  // Spreadsheets
  xls:    { color: "#16a34a", label: "XLS" },
  xlsx:   { color: "#16a34a", label: "XLS" },
  csv:    { color: "#15803d", label: "CSV" },
  numbers:{ color: "#22c55e", label: "NUM" },
  // Presentations
  ppt:    { color: "#ea580c", label: "PPT" },
  pptx:   { color: "#ea580c", label: "PPT" },
  key:    { color: "#0891b2", label: "KEY" },
  // Archives
  zip:    { color: "#d97706", label: "ZIP" },
  rar:    { color: "#b45309", label: "RAR" },
  "7z":   { color: "#a16207", label: "7Z" },
  tar:    { color: "#92400e", label: "TAR" },
  gz:     { color: "#92400e", label: "GZ" },
  // Code
  js:     { color: "#eab308", label: "JS" },
  ts:     { color: "#3178c6", label: "TS" },
  jsx:    { color: "#06b6d4", label: "JSX" },
  tsx:    { color: "#06b6d4", label: "TSX" },
  py:     { color: "#3776ab", label: "PY" },
  java:   { color: "#b07219", label: "JAVA" },
  cpp:    { color: "#00599c", label: "C++" },
  c:      { color: "#283593", label: "C" },
  go:     { color: "#00add8", label: "GO" },
  rb:     { color: "#cc342d", label: "RB" },
  rs:     { color: "#a06236", label: "RS" },
  swift:  { color: "#fa7343", label: "SWIFT" },
  kt:     { color: "#7f52ff", label: "KT" },
  php:    { color: "#777bb4", label: "PHP" },
  sh:     { color: "#4d5d53", label: "SH" },
  // Web / config
  html:   { color: "#e34c26", label: "HTML" },
  css:    { color: "#264de4", label: "CSS" },
  scss:   { color: "#cf649a", label: "SCSS" },
  json:   { color: "#3b82f6", label: "JSON" },
  xml:    { color: "#0284c7", label: "XML" },
  yaml:   { color: "#0c7596", label: "YAML" },
  yml:    { color: "#0c7596", label: "YML" },
  env:    { color: "#525252", label: "ENV" },
  // Design
  fig:    { color: "#a855f7", label: "FIG" },
  sketch: { color: "#f59e0b", label: "SKETCH" },
  psd:    { color: "#001e36", label: "PSD" },
  ai:     { color: "#ff7c00", label: "AI" },
  xd:     { color: "#ff61f6", label: "XD" },
  svg:    { color: "#ff9a00", label: "SVG" },
  // Data / DB
  sql:    { color: "#4479a1", label: "SQL" },
  db:     { color: "#0a3d62", label: "DB" },
  log:    { color: "#525252", label: "LOG" },
  // Installers / executables
  exe:    { color: "#1e293b", label: "EXE" },
  dmg:    { color: "#9ca3af", label: "DMG" },
  apk:    { color: "#3ddc84", label: "APK" },
  iso:    { color: "#475569", label: "ISO" },
  pkg:    { color: "#64748b", label: "PKG" },
  // E-books
  epub:   { color: "#84cc16", label: "EPUB" },
  mobi:   { color: "#65a30d", label: "MOBI" },
  // Fallback
  default:{ color: "#6b7280", label: "FILE" },
};
