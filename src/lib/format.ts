export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-"

  // YYYY-MM-DD (due_date) → DD/MM/YYYY (parse manually, no timezone issues)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-")
    return `${d}/${m}/${y}`
  }

  // ISO timestamp string (paid_date)
  const date = new Date(dateStr)
  // Old localMidnightISO stored midnight UTC → shows previous day in negative UTC offsets
  // Shift to noon UTC so the date is correct regardless of viewer's timezone
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0) {
    date.setUTCHours(12)
  }
  return date.toLocaleDateString("pt-BR")
}
