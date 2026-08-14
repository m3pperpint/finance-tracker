<script lang="ts">
    import { cn } from '$lib/utils'

    export let tone: 'neutral' | 'success' | 'danger' | 'warning' = 'neutral'
    export let className = ''

    const tones = {
        neutral: 'bg-muted text-muted-foreground',
        success: 'bg-emerald-50 text-emerald-700',
        danger: 'bg-red-50 text-red-700',
        warning: 'bg-amber-50 text-amber-700',
    }
</script>

<span class={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone], className)}>
    <slot />
</span>
