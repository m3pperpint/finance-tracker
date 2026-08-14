<script lang="ts">
    interface BarItem {
        label: string
        value: number
    }

    export let items: BarItem[] = []
    export let formatValue: (value: number) => string = (value) => String(value)

    $: maxValue = Math.max(...items.map((item) => Math.abs(item.value)), 1)
</script>

<div class="space-y-5">
    {#each items as item}
        <div class="space-y-2">
            <div class="flex items-center justify-between gap-3 text-sm">
                <span class="truncate font-medium text-foreground">{item.label}</span>
                <span class:item-positive={item.value >= 0} class:item-negative={item.value < 0} class="shrink-0 font-semibold">
                    {formatValue(item.value)}
                </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-muted">
                <div
                    class:item-positive-bg={item.value >= 0}
                    class:item-negative-bg={item.value < 0}
                    class="h-full rounded-full transition-all"
                    style={`width: ${Math.max(5, (Math.abs(item.value) / maxValue) * 100)}%`}
                ></div>
            </div>
        </div>
    {:else}
        <p class="text-sm text-muted-foreground">No data for this selection.</p>
    {/each}
</div>

<style>
    .item-positive {
        color: var(--success);
    }

    .item-negative {
        color: var(--danger);
    }

    .item-positive-bg {
        background: var(--success);
    }

    .item-negative-bg {
        background: var(--danger);
    }
</style>
