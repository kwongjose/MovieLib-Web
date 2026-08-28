// Validation rules for renaming a movie file in place. Pure functions, no
// Electron and no DB, so they are unit-testable like parseFilename/matchAudit.
//
// Windows is the only target (including Windows 7), so the rules are Win32's:
// its reserved characters and device names, its silent stripping of trailing
// dots/spaces, and its 260-character path ceiling (no long-path support on 7).

// < > : " / \ | ? * and control characters. Rejecting the slashes also
// enforces that a rename stays in the same directory.
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g

// Reserved against the stem before the first dot, so "CON.mkv" is caught.
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

// MAX_PATH minus the terminating NUL.
export const MAX_PATH = 259

// Returns a user-facing error string, or null when the base name is usable.
// Callers should trim first; the trailing-space rule then only fires for a
// name the caller deliberately left untouched.
export function validateBaseName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    return 'Enter a file name.'
  }
  const illegal = name.match(ILLEGAL_CHARS)
  if (illegal) {
    const shown = [...new Set(illegal.map((ch) => (ch < ' ' ? 'control characters' : ch)))]
    return `File names cannot contain ${shown.join(' ')}`
  }
  // Win32 silently strips trailing dots and spaces, which would leave the
  // DB path and the on-disk name disagreeing.
  if (name.endsWith('.') || name.endsWith(' ')) {
    return 'File names cannot end with a dot or a space.'
  }
  if (RESERVED_NAMES.test(name.split('.')[0])) {
    return `"${name.split('.')[0]}" is a name reserved by Windows.`
  }
  return null
}

// Windows filenames are case-insensitive, so a case-only rename is legal but
// existsSync(target) would see the file itself; callers skip the disk
// collision check for these (NTFS renames the casing in a single call).
export function isCaseOnlyRename(oldName, newName) {
  return oldName !== newName && oldName.toLowerCase() === newName.toLowerCase()
}

export function pathTooLong(fullPath) {
  return fullPath.length > MAX_PATH
}
