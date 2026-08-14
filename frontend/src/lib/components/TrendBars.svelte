<script lang="ts">
    interface TrendPoint {
        key: string
        label: string
        value: number
    }

    export let points: TrendPoint[] = []
    export let formatValue: (value: number) => string = (value) => String(value)
    export let tone: 'primary' | 'danger' = 'primary'

    $: maxValue = Math.max(...points.map((point) => Math.abs(point.value)), 1)
    $: labelEvery = Math.max(1, Math.ceil(points.length / 8))
</script>

<div class="space-y-3">
    <div class="flex h-48 items-end gap-1.5 rounded-xl bg-slate-50/80 px-3 pb-3 pt-5 sm:gap-2">
        {#each points as point, index}
            <div class="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
                <div class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block">
                    <p class="font-semibold">{point.label}</p>
                    <p class="text-slate-300">{formatValue(point.value)}</p>
                </div>
                <div
                    class:bar-primary={tone === 'primary'}
                    class:bar-danger={tone === 'danger'}
                    class="w-full rounded-t-md transition-all duration-300 group-hover:opacity-75"
                    style={`height: ${Math.max(3, (Math.abs(point.value) / maxValue) * 100)}%`}
                    title={`${point.label}: ${formatValue(point.value)}`}
                ></div>
            </div>
        {:else}
            <p class="m-auto text-sm text-muted-foreground">No trend data available.</p>
        {/each}
    </div>
    {#if points.length}
        <div class="flex gap-1.5 px-3 sm:gap-2">
            {#each points as point, index}
                <span class="min-w-0 flex-1 truncate text-center text-[10px] text-slate-400">
                    {index % labelEvery === 0 || index === points.length - 1 ? point.label : ''}
                </span>
            {/each}
        </div>
    {/if}
</div>

<style>
    .bar-primary {
        background: linear-gradient(180deg, var(--primary), oklch(0.67 0.15 258));
    }

    .bar-danger {
        background: linear-gradient(180deg, var(--danger), oklch(0.72 0.15 25));
    }
</style>
