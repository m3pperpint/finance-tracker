export function isValidDate(value: Date): boolean {
    const date = new Date(value)
    return !isNaN(date.getTime())
}

export function parseDate(value: string): Date | undefined {
    const germanDate = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim())
    if (germanDate) {
        const [, day, month, year] = germanDate
        const parsed = new Date(Number(year), Number(month) - 1, Number(day))
        return parsed.getFullYear() === Number(year) &&
            parsed.getMonth() === Number(month) - 1 &&
            parsed.getDate() === Number(day)
            ? parsed
            : undefined
    }

    const parsed = new Date(value)
    return isValidDate(parsed) ? parsed : undefined
}
